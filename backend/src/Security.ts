import { createHmac } from "crypto";
import { Config } from "./config";

// Single purpose: derive an on-disk filename from a client-presented authKey,
// keyed to a server-side secret. This breaks the upstream chain where the
// filename was a pure function of user-known material (audit CRITICAL #1):
//
//   upstream:  filename = md5(authKey)            ← offline brute-forceable
//   here:      filename = HMAC-SHA256(SECRET, authKey)
//
// An attacker who exfiltrates the storage directory still gets HMAC outputs,
// but cannot offline-grind passphrases against them without ALSO compromising
// the server to obtain SERVER_SECRET. Two independent breaches required, not one.

export function storageKey(authKey: string): string {
    return createHmac('sha256', Config.serverSecret)
        .update(authKey, 'utf8')
        .digest('hex');
}
