require('dotenv').config();

type ConfigType = {
    port: number,
    environment: string,
    serverSecret: Buffer,
    storageDir: string,
    maxBlobBytes: number,
}

function loadServerSecret(): Buffer {
    const env = process.env['SERVER_SECRET'];
    const isProd = process.env['NODE_ENV'] === 'production';

    if (env && env.length >= 32) {
        return Buffer.from(env, 'utf8');
    }

    if (isProd) {
        // Fail closed: in production a strong SERVER_SECRET is mandatory.
        // It is the binding between the client's auth_key and the on-disk
        // filename. Missing it means file paths reduce to the upstream
        // (audit-CRITICAL #1) shape: trivially brute-forceable.
        console.error('[fatal] SERVER_SECRET env var is required in production (>=32 chars).');
        console.error('Generate one with: openssl rand -base64 48');
        process.exit(1);
    }

    // Dev only: deterministic warning string, NOT secure. Refuses to start prod.
    console.warn('[warn] SERVER_SECRET missing — using dev placeholder. DO NOT deploy this state.');
    return Buffer.from('dev-only-placeholder-do-not-deploy-this-value', 'utf8');
}

const path = require('path');

export const Config: ConfigType = {
    port: process.env['PORT'] ? +process.env['PORT'] : 3000,
    environment: process.env['NODE_ENV'] || 'development',
    serverSecret: loadServerSecret(),
    storageDir: process.env['STORAGE_DIR'] || path.join(__dirname, '..', 'storage'),
    maxBlobBytes: 64 * 1024,
};
