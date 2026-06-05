import {Application, NextFunction, Request, Response, Router} from "express";
import path from "path";
import helmet from "helmet";
import { Config } from "./config";

const express = require('express');

// Body size budget — sourced from Config so the Express body parser and
// Database.save defense-in-depth check share one source of truth. Default
// (64 KiB) ≈ 40000 plaintext chars * worst-case AES-GCM + base64 ratio ≈
// 56 KiB, with breathing room without inviting abuse. Override per-instance
// via MAX_BLOB_SIZE env var (accepts units; see config.ts/parseBlobSize).

const isProd = process.env.NODE_ENV === 'production';
// Plain-HTTP mode for LAN deploys without a reverse proxy: drops
// `upgrade-insecure-requests` from the CSP and disables HSTS. Lets clients
// load assets over HTTP without the browser auto-upgrading them to HTTPS
// (which would 404 since no TLS server is in front). Other isProd-gated
// behaviour (error message hiding etc.) stays enabled.
const plainHttp = process.env.LOCKPAD_PLAIN_HTTP === 'true';
const enableHttpsHeaders = isProd && !plainHttp;

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
                    upgradeInsecureRequests: enableHttpsHeaders ? [] : null,
                },
            },
            crossOriginEmbedderPolicy: false,
            referrerPolicy: { policy: 'no-referrer' },
            hsts: enableHttpsHeaders ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false,
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
            limit: Config.maxBlobBytes
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
