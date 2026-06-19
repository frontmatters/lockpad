# Security model — Lockpad

This document describes the threat model, cryptographic choices, and operational
guarantees of Lockpad. It assumes you read the [README](./README.md) first.

## Threat model

Lockpad is designed to be safe across three concurrent deployment shapes.

### 1. Self-host, private

Owner runs the container on their own server (Synology, Raspberry Pi, Hetzner VPS)
and reaches it via Tailscale / VPN / LAN. URL+passphrase shared via trusted
channel only.

**In scope:**
- Disk-at-rest exposure if the server is stolen
- Owner forgetting the passphrase (notes are unrecoverable by design)
- Brute-force attempts against a known weak passphrase

**Out of scope:**
- Owner's host being compromised by a separate vector

### 2. Publicly hostable by anyone

A third party pulls the image, deploys it on a public domain. The default
configuration must be safe; the operator has minimal time to learn what to harden.

**In scope:**
- Network attackers attempting to brute-force passphrases via the public API
- Disk-fill DoS by anonymous POSTs
- Resource exhaustion (memory, file handles, pids)
- Existence-oracle leakage about which notes exist
- TLS misconfiguration

**Out of scope:**
- Attacker who compromises Let's Encrypt
- Side-channel attacks on the host's RAM

### 3. Multi-tenant on one instance

Many independent users share one deployment, none of them knowing each other.

**In scope:**
- Tenant A learning anything about tenant B's existence, size, or content
- Cross-tenant collision in storage paths
- Cross-tenant brute-force amortization (one rainbow table → multiple users)

**Out of scope:**
- Quota enforcement per tenant (use rate limiting + global quotas instead)

## Cryptographic design

### Key derivation (in the browser)

```
passphrase
  ↓ Argon2id (m=64MiB, t=3, p=1, hashLen=32, salt=APP_KEY)
master (32 bytes)
  ↓ HKDF-SHA256-Expand
  ├── info = "lockpad/auth/v2"  →  authKey (16 bytes, sent to server)
  └── info = "lockpad/enc/v2"   →  encKey  (32 bytes, stays in browser)
```

- **Argon2id** with OWASP 2026 baseline parameters. m=64MiB pushes the cost into
  RAM rather than CPU, making GPU/ASIC brute-force expensive.
- **`APP_KEY`** acts as a deployment-level salt. Two instances with the same
  `APP_KEY` can theoretically share notes (mirror/backup); different values
  make instances cryptographically independent.
- **HKDF-SHA256-Expand** with domain-separated info strings derives two
  independent subkeys from the master. Compromise of `authKey` (e.g. via
  network logs) does not directly weaken `encKey`.

### Encryption (in the browser)

```
plaintext
  ↓ AES-256-GCM(encKey, iv=12 random bytes, AAD=authKey)
{ v: 2, iv: base64(iv), ct: base64(ciphertext || tag) }
```

- **AES-256-GCM** is authenticated encryption with associated data. Any
  modification to `iv`, `ct`, or `authKey` causes decryption to fail with an
  authentication-tag mismatch — there is no padding oracle (CBC's classic flaw).
- The **authKey is bound as AAD**. If a server (or a network attacker) swaps
  user A's blob into user B's storage, decryption fails — the AAD won't match.
- The **IV is a 12-byte CSPRNG output** from `crypto.getRandomValues`.

### Storage (server side)

```
storage_path = $STORAGE_DIR / HMAC-SHA256(SERVER_SECRET, authKey).hex
file contents = the JSON envelope above
file mode = 0o600 (only the container user can read)
```

- **`SERVER_SECRET`** (≥32 chars, mandatory in production) makes the on-disk
  filename a function of *both* user-known material *and* server-side material.
  An attacker who exfiltrates the storage directory cannot offline-brute-force
  passphrases without also compromising the server to learn `SERVER_SECRET`.
- The container runs as **uid 10001**. Storage files are mode 0o600 so even
  another non-root user on the same host (if any) cannot read them.

## Operational requirements

- **Set `SERVER_SECRET`** in `.env` before first boot. The backend refuses to
  start in production without it. Generate with `openssl rand -base64 48`.
- **Back up the storage volume.** Notes are encrypted blobs, but losing the
  volume = losing the notes. Recipe in `docker-compose.yml` comments.
- **Do not rotate `SERVER_SECRET`** without invalidating all existing notes.
  Every storage_path depends on it.
- **Do not change `APP_KEY`** without invalidating all existing notes. Every
  Argon2 derivation depends on it.

## Known limitations

- **Argon2id parameters are baked at build time.** Bumping cost would require
  a coordinated rebuild + invalidation of the existing blobs (because the
  authKey changes, the storage_path changes).
- **Rate limits use an in-memory store.** Single-instance only; multi-instance
  behind a load balancer needs `rate-limit-redis` or sticky sessions.
- **No constant-time response padding on `GET`.** Status codes are uniform
  (always 200) but `Content-Length` varies by note size. Rate limiting caps
  enumeration speed but does not prevent it given infinite patience.
- **`urlKey` (base62 of authKey) is logged** by the reverse proxy in
  `request_uri` paths even though authKey itself is in the header. The urlKey
  is half the auth material; an attacker with proxy log access could reconstruct
  it. Mitigation: HSTS + private logs.
- **Browser memory wipe is best-effort.** `Uint8Array.fill(0)` zeros the
  visible buffer, but V8 may have copied bytes elsewhere. Re-prompting on tab
  restore would help; not currently implemented.

## Reporting vulnerabilities

Please open an issue on this repository or email the maintainer
(`hello@frontmatters.dev`) with the `[lockpad security]` prefix.

For embargo-required findings, do **not** open a public issue. Email with
"PGP-encrypt this" if you'd like a key.

## Audit

This fork was created in response to a security audit of upstream
`Athlon1600/notepad`. The audit surfaced 9 critical and 16 high findings. The
`security-rewrite` branch commits address them in five phases (see CHANGELOG).

| Phase | Scope                                      | Critical fixes |
|-------|--------------------------------------------|----------------|
| 1     | Frontend crypto rewrite                    | C3-C7          |
| 2     | Backend hardening                          | C1, C2         |
| 3     | Docker / Caddy / .env                      | C8, C9         |
| 4     | FE redesign integration                    | —              |
| 5     | Release prep + tests                       | —              |

**Empirical verification:** `npm test` in `frontend/` runs 14 vitest cases that
check encrypt/decrypt round-trip, AES-GCM tamper detection, AAD binding, IV
randomness, envelope version rejection, HKDF determinism + domain separation,
and Argon2id deterministic output.
