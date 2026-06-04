import {Application, NextFunction, Request, Response, Router} from "express";
import path from "path";
import helmet from "helmet";

const express = require('express');

// Body size: 40000 plaintext chars * worst-case ratio for AES-GCM + base64
// envelope JSON ≈ 56 KiB. 64 KiB gives breathing room without inviting abuse.
const BODY_LIMIT = "64kb";

const isProd = process.env.NODE_ENV === 'production';

export class Server {

    public static readonly PORT_DEFAULT: number = 3000;

    public app: Application;
    protected router: Router;

    constructor() {

        let app = express();
        app.set('json spaces', 2);
        app.set('etag', false);
        app.disable('x-powered-by');
        // Trust the X-Forwarded-For from a single reverse proxy in front (Caddy/Traefik).
        // Required so express-rate-limit and req.ip use the real client IP, not the proxy's.
        app.set('trust proxy', 1);

        this.router = Router();
        this.app = app;

        this.enableSecurityHeaders();
        this.enablePost();
        this.enableStatic();
    }

    protected getRouter() {
        return this.router;
    }

    protected enableSecurityHeaders() {

        this.app.use(helmet({
            // CSP: SPA bundle has no inline scripts and only same-origin
            // connect-src. 'unsafe-inline' for styles is required by Vue's
            // injected scoped-style CSS; can be tightened to hash-based once
            // the build emits style-hashes alongside the bundle.
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    // 'wasm-unsafe-eval' is a CSP3 directive scoped exclusively
                    // to WebAssembly compile/instantiate. It does NOT enable
                    // dynamic JS code execution paths.
                    // Required by hash-wasm for the Argon2id KDF computation.
                    scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:"],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    baseUri: ["'self'"],
                    frameAncestors: ["'none'"],
                    upgradeInsecureRequests: isProd ? [] : null,
                },
            },
            crossOriginEmbedderPolicy: false,
            referrerPolicy: { policy: 'no-referrer' },
            hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false,
        }));

        // Explicitly deny /backups/* — upstream shipped a cron that dumped
        // encrypted notes into public/backups/ where express.static served them
        // (corpus-leak vector). The script is removed in this fork; this
        // middleware is defense-in-depth against accidental reintroduction.
        this.app.use((req, res, next) => {
            if (req.path.startsWith('/backups')) {
                res.status(404).end();
                return;
            }
            next();
        });
    }

    protected enablePost() {
        // text/plain only — notes are sent as opaque envelope JSON strings.
        // No urlencoded (extra `qs` parser surface) and no JSON parser
        // (server is opaque to envelope shape).
        this.app.use(express.text({
            type: '*/*',
            limit: BODY_LIMIT
        }));
    }

    protected enableStatic() {

        const parentPublic = path.join(__dirname, '../public');

        this.app.use(express.static(parentPublic, {
            etag: true,
            // Never serve dotfiles (`.git`, `.env`, `.well-known` is opt-in elsewhere).
            dotfiles: 'deny',
            // Reject directory traversal-shaped paths early.
            redirect: false,
        }));
    }

    protected registerNotFoundHandler() {

        this.app.use((req: Request, res: Response) => {
            res.status(404).json({ error: 'not found' });
        });
    }

    protected registerErrorHandler() {

        this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {

            const msg = err && err.message ? err.message : String(err);

            if (msg.includes('PayloadTooLargeError') || msg.includes('entity too large')) {
                return res.status(413).json({ error: 'payload too large' });
            }

            // Log internally — never echo raw error to the client in production.
            // Stack traces and filesystem paths in error.toString() are fingerprinting fuel.
            console.error('[err]', msg);

            return res.status(500).json({
                error: isProd ? 'internal error' : msg,
            });
        });
    }

    public start(port: number) {

        this.app.use(this.router);

        this.registerNotFoundHandler();
        this.registerErrorHandler();

        this.app.listen(port, function () {
            console.log(`Server listening on port ${port}`);
        });
    }
}
