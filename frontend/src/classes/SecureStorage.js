// SecureStorage.js — wraps the api with crypto.
//
// Public surface:
//   SecureStorage.read(authKey, encKey)             -> Promise<string>  (plaintext, or '' if no note)
//   SecureStorage.write(authKey, encKey, plaintext) -> Promise<void>
//   SecureStorage.remove(authKey)                   -> Promise<void>
//
// Both keys are Uint8Array (authKey=16, encKey=32). See Security.splitKeys().
//
// Envelope migration: v1 (upstream AES-CBC) is NOT supported. If a v1 blob is
// returned from the server, we throw — surfacing the breaking change instead of
// silently losing data. The fork's CHANGELOG documents this.

import api from "../api";
import { Security } from "./Security";

// Hex-encode for the wire (until Phase 2 moves auth_key into Authorization header).
function toHex(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, '0');
  return s;
}

export class SecureStorage {

  static async read(authKey, encKey) {
    const wireId = toHex(authKey);
    const httpResponse = await api.get(wireId);

    if (!httpResponse) return '';

    let envelope;
    try {
      envelope = JSON.parse(httpResponse);
    } catch {
      // Not JSON — server returned an empty or text-mode body. Treat as empty.
      return '';
    }

    if (envelope.alg === 'AES-256-CBC' || envelope.v === undefined) {
      throw new Error(
        'This note was encrypted with the upstream (insecure) format. ' +
        'Migration is not supported by design — re-create the note in this version.'
      );
    }

    return Security.decrypt(envelope, encKey, authKey);
  }

  static async write(authKey, encKey, plaintext) {
    const envelope = await Security.encrypt(plaintext, encKey, authKey);
    const wireId = toHex(authKey);
    return api.save(wireId, JSON.stringify(envelope));
  }

  static async remove(authKey) {
    const wireId = toHex(authKey);
    return api.delete(wireId);
  }
}
