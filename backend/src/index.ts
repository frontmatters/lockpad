import { NextFunction, Request, RequestHandler, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { Server } from "./Server";
import { Config } from "./config";
import { NotesController } from "./NotesController";
import { requireAuthKey } from "./Auth";

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

server.start(Config.port);
