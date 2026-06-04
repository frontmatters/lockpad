import { NextFunction, Request, RequestHandler, Response, Router } from "express";
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

const apiRouter = Router();

apiRouter.get('/', function (req: Request, res: Response) {
    res.json({ message: 'notepad-secure api' });
});

apiRouter.get('/health', function (req: Request, res: Response) {
    res.status(200).json({ status: 'ok' });
});

server.app.use('/api', apiRouter);

const notesRouter = Router();

// Every notes route is gated on a valid Authorization: Bearer <hex32>.
// No id-in-URL — the auth_key lives in the header.
notesRouter.use(requireAuthKey);
notesRouter.get('/',    safeHandler(NotesController.read));
notesRouter.post('/',   safeHandler(NotesController.write));
notesRouter.delete('/', safeHandler(NotesController.delete));

server.app.use('/api/notes', notesRouter);

// Removed the upstream server-rendered `GET /notes/:id` route. The SPA fetches
// /api/notes itself and renders the (decrypted) note in the browser.

server.start(Config.port);
