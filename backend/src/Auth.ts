import { NextFunction, Request, Response } from "express";

// Augment Express Request to carry the authenticated key in a single, typed slot.
declare global {
    namespace Express {
        interface Request {
            authKey?: string;
        }
    }
}

// HTTP scheme tokens are case-insensitive per RFC 7235 §2.1.
// Hex digits are accepted in both cases; we normalize to lower-case below.
const BEARER_RE = /^Bearer\s+([0-9a-fA-F]{32})$/i;

// Extracts and validates a 32-hex auth_key from the Authorization: Bearer header.
//
// Why a header, not the URL path:
//   - URL paths are logged by reverse proxies and CDNs, end up in browser history,
//     and leak via the Referer header on any outbound link inside the (decrypted)
//     note. The Authorization header is not logged by sane defaults.
//
// On failure: 401 + uniform JSON body (no hint about what was wrong).
export function requireAuthKey(req: Request, res: Response, next: NextFunction): void {

    const header = req.headers.authorization || '';
    const m = header.match(BEARER_RE);

    if (!m) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }

    req.authKey = m[1].toLowerCase();
    next();
}
