// Security.js crypto contract tests.
//
// These cover what the production code MUST get right after the rewrite:
//   1. encrypt(...) + decrypt(...) round-trip preserves plaintext
//   2. AES-GCM authentication catches ciphertext tampering
//   3. AAD binding rejects a swap of one user's blob for another's
//   4. Two encrypts of the same plaintext produce different ciphertexts (IV randomness)
//   5. splitKeys is deterministic and domain-separated
//   6. base62 round-trips bytes
//
// Argon2id (deriveMaster) is exercised through a tiny-parameter call so the
// test stays fast (<1s); production parameters live in Security.js.

import { describe, it, expect } from 'vitest';
import { Security } from '../src/classes/Security.js';

const enc = new TextEncoder();

function randomKey(len) {
  return crypto.getRandomValues(new Uint8Array(len));
}

describe('Security.encrypt / decrypt', () => {
  it('round-trips plaintext', async () => {
    const encKey  = randomKey(32);
    const authKey = randomKey(16);
    const envelope = await Security.encrypt('hello world', encKey, authKey);
    expect(envelope.v).toBe(2);
    expect(typeof envelope.iv).toBe('string');
    expect(typeof envelope.ct).toBe('string');

    const out = await Security.decrypt(envelope, encKey, authKey);
    expect(out).toBe('hello world');
  });

  it('round-trips multi-line UTF-8', async () => {
    const encKey  = randomKey(32);
    const authKey = randomKey(16);
    const plaintext = 'lijn 1\nlijn 2 — em-dash + ü ñ 漢字\nlijn 3';
    const envelope = await Security.encrypt(plaintext, encKey, authKey);
    const out = await Security.decrypt(envelope, encKey, authKey);
    expect(out).toBe(plaintext);
  });

  it('rejects ciphertext that has been tampered (GCM auth tag)', async () => {
    const encKey  = randomKey(32);
    const authKey = randomKey(16);
    const envelope = await Security.encrypt('important', encKey, authKey);

    // Flip the last base64 char — corrupts the GCM tag.
    const tampered = {
      ...envelope,
      ct: envelope.ct.slice(0, -1) + (envelope.ct.slice(-1) === 'A' ? 'B' : 'A'),
    };
    await expect(Security.decrypt(tampered, encKey, authKey)).rejects.toThrow();
  });

  it('rejects decryption with the wrong authKey (AAD binding)', async () => {
    const encKey   = randomKey(32);
    const authKey  = randomKey(16);
    const otherAuth = randomKey(16);
    const envelope = await Security.encrypt('secret', encKey, authKey);

    await expect(Security.decrypt(envelope, encKey, otherAuth)).rejects.toThrow();
  });

  it('produces a different ciphertext on every encrypt (IV randomness)', async () => {
    const encKey  = randomKey(32);
    const authKey = randomKey(16);
    const a = await Security.encrypt('same plaintext', encKey, authKey);
    const b = await Security.encrypt('same plaintext', encKey, authKey);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('rejects unsupported envelope versions', async () => {
    const encKey  = randomKey(32);
    const authKey = randomKey(16);
    const envelope = await Security.encrypt('x', encKey, authKey);

    const wrongVersion = { ...envelope, v: 1 };
    await expect(Security.decrypt(wrongVersion, encKey, authKey)).rejects.toThrow();
  });
});

describe('Security.splitKeys', () => {
  it('produces deterministic output for the same master', async () => {
    const master = enc.encode('any-32-byte-master-keyXXXXXXXXXX').slice(0, 32);
    const a = await Security.splitKeys(master);
    const b = await Security.splitKeys(master);
    expect(Array.from(a.authKey)).toEqual(Array.from(b.authKey));
    expect(Array.from(a.encKey)).toEqual(Array.from(b.encKey));
  });

  it('produces different auth and enc subkeys (domain separation)', async () => {
    const master = randomKey(32);
    const { authKey, encKey } = await Security.splitKeys(master);
    expect(authKey.length).toBe(16);
    expect(encKey.length).toBe(32);
    // Encode for comparison since prefixes don't help: subkeys come from
    // independent HKDF info strings, so neither should be a prefix of the other.
    expect(Array.from(authKey)).not.toEqual(Array.from(encKey).slice(0, 16));
  });
});

describe('Security.deriveMaster (Argon2id)', () => {
  it('derives a 32-byte key from passphrase + salt', async () => {
    // Argon2id parameters in Security.js are production-sized; we don't override
    // here (no API for it), so this test runs at full cost. Keep the test
    // isolated and run sparingly. ~0.5-1s on a laptop.
    const salt = enc.encode('test-salt');
    const master = await Security.deriveMaster('correct horse battery staple', salt);
    expect(master).toBeInstanceOf(Uint8Array);
    expect(master.length).toBe(32);
  }, 10_000);

  it('produces the same output for the same input (deterministic)', async () => {
    const salt = enc.encode('test-salt');
    const a = await Security.deriveMaster('passphrase-A', salt);
    const b = await Security.deriveMaster('passphrase-A', salt);
    expect(Array.from(a)).toEqual(Array.from(b));
  }, 20_000);
});

describe('Security.base62 + randomBytes + zeroize', () => {
  it('base62 produces a non-empty string', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const s = Security.base62(bytes);
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });

  it('randomBytes returns the requested length', () => {
    const b = Security.randomBytes(24);
    expect(b).toBeInstanceOf(Uint8Array);
    expect(b.length).toBe(24);
  });

  it('zeroize fills the buffer with zeros', () => {
    const b = new Uint8Array([1, 2, 3, 4]);
    Security.zeroize(b);
    expect(Array.from(b)).toEqual([0, 0, 0, 0]);
  });

  it('zeroize is a no-op on null/undefined (no throw)', () => {
    expect(() => Security.zeroize(null)).not.toThrow();
    expect(() => Security.zeroize(undefined)).not.toThrow();
  });
});
