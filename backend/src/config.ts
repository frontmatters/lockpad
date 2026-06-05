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

// 64 KiB ≈ 40000 plaintext chars after AES-GCM + base64 envelope worst-case
// ratio (see Server.ts comment). Tunable per-instance via MAX_BLOB_SIZE.
const DEFAULT_MAX_BLOB_BYTES = 64 * 1024;

// Accepts: human units ("1mb", "750kb", "64kib"), raw bytes ("65536"), the
// sentinel "DEFAULT" (also "" / unset). Fail-fast on garbage — a bad limit
// here would silently break Express body-parser at runtime.
function parseBlobSize(raw: string): number {
    const t = raw.trim().toLowerCase();
    if (t === '' || t === 'default') return DEFAULT_MAX_BLOB_BYTES;

    const m = t.match(/^(\d+(?:\.\d+)?)\s*(b|k|kb|kib|m|mb|mib|g|gb|gib)?$/);
    if (!m) {
        console.error(`[fatal] MAX_BLOB_SIZE: invalid value "${raw}". Use bytes (65536), units (1mb, 750kb, 64kib), or "DEFAULT".`);
        process.exit(1);
    }
    const n = parseFloat(m[1]);
    const unit = m[2] || 'b';
    const mults: Record<string, number> = {
        b: 1,
        k: 1024, kb: 1024, kib: 1024,
        m: 1024 ** 2, mb: 1024 ** 2, mib: 1024 ** 2,
        g: 1024 ** 3, gb: 1024 ** 3, gib: 1024 ** 3,
    };
    const bytes = Math.floor(n * mults[unit]);
    if (bytes <= 0) {
        console.error(`[fatal] MAX_BLOB_SIZE: "${raw}" resolves to ${bytes} bytes. Must be positive.`);
        process.exit(1);
    }
    return bytes;
}

export const Config: ConfigType = {
    port: process.env['PORT'] ? +process.env['PORT'] : 3000,
    environment: process.env['NODE_ENV'] || 'development',
    serverSecret: loadServerSecret(),
    storageDir: process.env['STORAGE_DIR'] || path.join(__dirname, '..', 'storage'),
    // Single source of truth for both the Express body parser and the
    // Database.save defense-in-depth check — they cannot drift.
    maxBlobBytes: parseBlobSize(process.env['MAX_BLOB_SIZE'] ?? ''),
};
