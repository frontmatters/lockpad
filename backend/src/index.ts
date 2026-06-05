import { NextFunction, Request, RequestHandler, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { Server } from "./Server";
import { Config } from "./config";
import { NotesController } from "./NotesController";
import { requireAuthKey } from "./Auth";

const fs = require('fs');

// Sanity-check that the container has enough memory headroom for the
// configured blob size. Honest heuristic: the body parser buffers the entire
// request in V8 heap (string overhead ~3x raw bytes), and writeLimiter
// caps concurrent writes per IP at 10/min. Plus ~80 MiB Node baseline.
//
// Reads the cgroup memory cap directly — v2 first, v1 fallback. In dev
// (no cgroup files) the check is a silent no-op.
function checkMemoryHeadroom(): void {
    let containerMem: number | null = null;
    try {
        const v = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
        if (v !== 'max') containerMem = +v;
    } catch {
        try {
            const v = +fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim();
            // cgroup v1 returns ~9.22e18 when unbounded.
            if (v > 0 && v < 1e15) containerMem = v;
        } catch { /* not in a container we can introspect — skip */ }
    }
    if (containerMem === null) return;

    const NODE_BASELINE = 80 * 1024 * 1024;
    const minRecommended = Config.maxBlobBytes * 3 * 10 + NODE_BASELINE;
    if (containerMem >= minRecommended) return;

    const fmt = (b: number) => (b / (1024 ** 2)).toFixed(b < 10 * 1024 ** 2 ? 2 : 0);
    console.warn(
        `[warn] MAX_BLOB_SIZE=${fmt(Config.maxBlobBytes)}MiB but container memory limit=` +
        `${fmt(containerMem)}MiB (recommended >=${fmt(minRecommended)}MiB for this blob size). ` +
        `Container may OOM under concurrent writes — raise mem_limit in docker-compose.yml ` +
        `or lower MAX_BLOB_SIZE.`
    );
}

const server = new Server();

const safeHandler = function (fn: RequestHandler) {
    return function (req: Request, res: Response, next: NextFunction) {
        return Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// Rate limits — in-memory store. Single-instance only; for multi-instance
// behind a load balancer, swap the store for `rate-limit-redis`. Sized for a
// human user with debounced auto-save (writeLimiter) and intermittent reads
// (apiLimiter); enumeration / brute-force is cut to a useless trickle.
const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'too many requests' },
});

const writeLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'too many writes' },
});

const apiRouter = Router();

apiRouter.get('/', function (req: Request, res: Response) {
    res.json({ message: 'lockpad api' });
});

// Health endpoint stays OUTSIDE the rate limiter so the Docker HEALTHCHECK
// never trips the bucket and starts flapping the container.
apiRouter.get('/health', function (req: Request, res: Response) {
    res.status(200).json({ status: 'ok' });
});

server.app.use('/api', apiRouter);

const notesRouter = Router();

// All notes routes: rate-limited and authenticated.
notesRouter.use(apiLimiter);
notesRouter.use(requireAuthKey);
notesRouter.get('/',                  safeHandler(NotesController.read));
notesRouter.post('/',   writeLimiter, safeHandler(NotesController.write));
notesRouter.delete('/', writeLimiter, safeHandler(NotesController.delete));

server.app.use('/api/notes', notesRouter);

// Removed the upstream server-rendered `GET /notes/:id` route. The SPA fetches
// /api/notes itself and renders the (decrypted) note in the browser.

checkMemoryHeadroom();
server.start(Config.port);
