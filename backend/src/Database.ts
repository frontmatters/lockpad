import { storageKey } from "./Security";
import { Config } from "./config";

const fs = require('fs');
const path = require('path');

function pathFromAuthKey(authKey: string): string {
    // storageKey is HMAC-SHA256 hex (64 chars) — no path separators, no dots,
    // no null bytes. Safe to concatenate.
    return path.join(Config.storageDir, storageKey(authKey));
}

function ensureDir(): void {
    if (!fs.existsSync(Config.storageDir)) {
        fs.mkdirSync(Config.storageDir, { recursive: true, mode: 0o700 });
    }
}

// Opaque blob storage. Database never inspects the blob's structure — that's
// the client's job. Server only enforces size + storage-key namespacing.
export class Database {

    static get(authKey: string): string | null {
        try {
            return fs.readFileSync(pathFromAuthKey(authKey), 'utf8');
        } catch {
            return null;
        }
    }

    static save(authKey: string, contents: string): void {
        if (typeof contents !== 'string' || contents.length === 0) {
            throw new Error('empty content');
        }
        if (Buffer.byteLength(contents, 'utf8') > Config.maxBlobBytes) {
            throw new Error('content exceeds maxBlobBytes');
        }
        ensureDir();
        // 0600: only the process owner can read the stored ciphertext on disk.
        // This is belt-and-suspenders alongside the dropped-root container user.
        fs.writeFileSync(pathFromAuthKey(authKey), contents, { mode: 0o600 });
    }

    static remove(authKey: string): void {
        try {
            fs.unlinkSync(pathFromAuthKey(authKey));
        } catch {
            // Removal is idempotent. Don't surface "not found" — that's an
            // existence oracle (see audit HIGH #6).
        }
    }
}
