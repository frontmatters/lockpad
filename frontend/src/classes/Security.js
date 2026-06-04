// Security.js — modern client-side crypto for notepad-secure.
//
// Replaces the upstream implementation (AES-CBC with Math.random IVs, scrypt N=2^14,
// hardcoded salt, UTF-16LE encoding, unauthenticated ciphertext).
//
// Fixes audit findings C3-C7 + frontend HIGHs around key handling.
//
// Public surface:
//   Security.deriveMaster(passphrase, saltBytes) -> Uint8Array(32)
//   Security.splitKeys(masterBytes)              -> { authKey: U8(16), encKey: U8(32) }
//   Security.encrypt(plaintext, encKey, authKey) -> { v, iv, ct } base64-encoded envelope
//   Security.decrypt(envelope, encKey, authKey)  -> string (plaintext)
//   Security.randomBytes(n)                      -> Uint8Array(n) via getRandomValues
//   Security.zeroize(u8)                         -> best-effort fill(0)
//   Security.base62(u8)                          -> base62 string (URL-safe identifier)
//
// Envelope format v2:
//   { v: 2, iv: <base64, 12 bytes>, ct: <base64, ciphertext || GCM-tag> }
// The 16-byte authKey is bound to the ciphertext as GCM AAD, so the server cannot
// swap one user's blob for another's even if both passphrases share KDF output.

import argon2 from 'argon2-browser';
import baseX from 'base-x';

const base62Encoder = baseX('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');

const ENVELOPE_VERSION = 2;

// OWASP 2026 Argon2id baseline for interactive auth on modest hardware.
// m=64MiB makes GPU brute-force expensive; t=3 keeps user-visible latency ~0.5-1s.
const ARGON2 = {
  type: argon2.ArgonType.Argon2id,
  hashLen: 32,
  mem: 65536,
  time: 3,
  parallelism: 1,
};

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64encode(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
function b64decode(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export class Security {

  static randomBytes(len) {
    return crypto.getRandomValues(new Uint8Array(len));
  }

  static base62(buffer) {
    return base62Encoder.encode(buffer);
  }

  // Argon2id KDF. Caller supplies the salt — see config.js for the deployment-level salt.
  // Returns the raw 32-byte master that feeds splitKeys().
  static async deriveMaster(passphrase, saltBytes) {
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      throw new Error('passphrase required');
    }
    if (!(saltBytes instanceof Uint8Array) || saltBytes.length < 8) {
      throw new Error('salt must be Uint8Array of >= 8 bytes');
    }
    const { hash } = await argon2.hash({
      pass: passphrase,
      salt: saltBytes,
      ...ARGON2,
    });
    return hash; // Uint8Array(32)
  }

  // HKDF-Expand into two domain-separated subkeys. Salt is empty because the master
  // is already a CSPRF output from Argon2id.
  static async splitKeys(masterBytes) {
    const baseKey = await crypto.subtle.importKey(
      'raw', masterBytes, 'HKDF', false, ['deriveBits']
    );
    const expand = async (info, bits) => {
      const buf = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) },
        baseKey, bits
      );
      return new Uint8Array(buf);
    };
    return {
      authKey: await expand('notepad-secure/auth/v2', 128),
      encKey:  await expand('notepad-secure/enc/v2',  256),
    };
  }

  // AES-256-GCM encrypt. encKey: 32 bytes; authKey: used as AAD to bind ciphertext to identity.
  static async encrypt(plaintext, encKey, authKey) {
    if (!(encKey instanceof Uint8Array) || encKey.length !== 32) {
      throw new Error('encKey must be 32 bytes');
    }
    if (!(authKey instanceof Uint8Array) || authKey.length !== 16) {
      throw new Error('authKey must be 16 bytes');
    }
    const key = await crypto.subtle.importKey('raw', encKey, 'AES-GCM', false, ['encrypt']);
    const iv = Security.randomBytes(12);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: authKey, tagLength: 128 },
      key, enc.encode(plaintext)
    );
    return {
      v: ENVELOPE_VERSION,
      iv: b64encode(iv),
      ct: b64encode(new Uint8Array(ct)),
    };
  }

  // Throws on tampering (GCM auth tag mismatch) or wrong key/AAD.
  static async decrypt(envelope, encKey, authKey) {
    if (!envelope || envelope.v !== ENVELOPE_VERSION) {
      throw new Error('unsupported envelope version: ' + (envelope && envelope.v));
    }
    if (!(encKey instanceof Uint8Array) || encKey.length !== 32) {
      throw new Error('encKey must be 32 bytes');
    }
    if (!(authKey instanceof Uint8Array) || authKey.length !== 16) {
      throw new Error('authKey must be 16 bytes');
    }
    const key = await crypto.subtle.importKey('raw', encKey, 'AES-GCM', false, ['decrypt']);
    const iv = b64decode(envelope.iv);
    const ct = b64decode(envelope.ct);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: authKey, tagLength: 128 },
      key, ct
    );
    return dec.decode(pt);
  }

  // Best-effort key wipe. JS strings are immutable, but Uint8Array we can clear.
  static zeroize(u8) {
    if (u8 && typeof u8.fill === 'function') u8.fill(0);
  }
}
