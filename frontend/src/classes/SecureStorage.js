// SecureStorage — wraps the api with crypto.
//
// Public surface:
//   SecureStorage.read(authKey, encKey)             -> Promise<string>
//   SecureStorage.write(authKey, encKey, plaintext) -> Promise<void>
//   SecureStorage.remove(authKey)                   -> Promise<void>
//
// authKey: Uint8Array(16). encKey: Uint8Array(32). See Security.splitKeys().
//
// Envelope migration: v1 (upstream AES-CBC) is NOT supported. If a v1 blob is
// returned from the server, we throw — surfacing the breaking change instead
// of silently losing data. The fork's CHANGELOG documents this.

import api from "../api";
import { Security } from "./Security";

export class SecureStorage {

  static async read(authKey, encKey) {
    const httpResponse = await api.get(authKey);
    if (!httpResponse) return '';

    let envelope;
    try {
      envelope = JSON.parse(httpResponse);
    } catch {
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
    return api.save(authKey, JSON.stringify(envelope));
  }

  static async remove(authKey) {
    return api.delete(authKey);
  }
}
