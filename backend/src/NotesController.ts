import { Request, Response } from "express";
import { Database } from "./Database";

// All three endpoints rely on the requireAuthKey middleware (see Auth.ts) to
// populate req.authKey before reaching here. The authKey is the 32-hex output
// of the client's HKDF-Expand("notepad-secure/auth/v2") on their Argon2id
// master. The server treats it as an opaque identifier and never inspects the
// blob it indexes.
//
// Response shape is identical for "no note exists" and "note exists but is empty":
//   GET  → 200 text/plain with the stored ciphertext-JSON, or 200 with "" body
//   POST → 204 no content
//   DEL  → 204 no content (even if there was nothing to delete)
//
// Mitigates the existence-oracle from the audit: status codes no longer
// distinguish hit/miss, and Content-Length is still observable but rate-limiting
// (Phase 2.4) caps how fast it can be enumerated.

export class NotesController {

    static read(req: Request, res: Response): void {
        const contents = Database.get(req.authKey!) || "";
        res.setHeader('content-type', 'text/plain').status(200).send(contents);
    }

    static write(req: Request, res: Response): void {

        if (typeof req.body !== 'string' || req.body.length === 0) {
            res.status(400).json({ error: 'invalid payload' });
            return;
        }

        try {
            Database.save(req.authKey!, req.body);
        } catch (err: any) {
            if (err && err.message === 'content exceeds maxBlobBytes') {
                res.status(413).json({ error: 'payload too large' });
                return;
            }
            throw err;
        }

        res.status(204).end();
    }

    static delete(req: Request, res: Response): void {
        Database.remove(req.authKey!);
        res.status(204).end();
    }
}
