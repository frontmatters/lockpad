# Changelog

All security-relevant changes vs. upstream Athlon1600/notepad.

## [1.0.0] — Lockpad

First release under the Lockpad name. Marks the transition from
"hardened fork of Athlon1600/notepad" (the 0.x line) into an
independently-named product. From here, semver applies: 1.x updates
preserve backward compatibility, 2.x reserved for breaking changes.

The crypto contract, on-disk format, and HTTP API remain identical to
0.2.0. Only the deployment-level identifiers change.

### Breaking
- Argon2id salt (APP_KEY): `notepad-secure/v2` → `lockpad/v2`. Every existing
  on-disk blob becomes unreadable because the derived authKey changes, hence
  the HMAC storage path changes, hence the file is no longer addressed by
  the new derivation. Re-create notes after upgrade.
- HKDF info strings: `notepad-secure/{auth,enc}/v2` → `lockpad/{auth,enc}/v2`.
- localStorage key for theme preference: `notepad-secure/theme` → `lockpad/theme`.
  Theme defaults to OS preference until the user toggles it once.
- Docker image: `notepad-secure:latest` → `lockpad:latest`. Container name:
  `notepad` → `lockpad`. Caddy DOMAIN default: `notepad.local` → `lockpad.local`.
  Volume name follows the project (directory) name and stays
  `<project>_storage`.

### Other
- README rewritten as a Lockpad-first document instead of an
  upstream-template-with-fork-notice.

## [0.2.0] — security-rewrite

First release of the hardened fork. See [SECURITY.md](./SECURITY.md) for the
full threat model and [README.md](./README.md) for deployment instructions.

**Breaking:** blobs encrypted by upstream `Athlon1600/notepad` are NOT readable
by this version. Re-create notes on first run.

### Highlights

- Modern crypto: Argon2id + AES-256-GCM + HKDF, all via `window.crypto.subtle`
  + `hash-wasm`. CSPRNG-sourced IVs, AEAD with AAD binding, server-side HMAC
  on the storage path.
- Backend: auth_key moves from URL path to `Authorization: Bearer` header.
  Rate-limited (60 req/min, 10 writes/min per IP). Helmet security headers.
  Express 4.21.2. Unused `ws` dependency removed.
- Container: non-root (uid 10001), pinned base image, `cap_drop: ALL`,
  `read_only`, `no-new-privileges`, named volume for storage, healthcheck.
- Frontend: redesigned UI (Ableton-aesthetic, OKLCH tokens, native View
  Transitions). prerender-spa-plugin and tailwindcss dropped.
- Tests: 14 vitest cases verify the crypto contract empirically.



### Breaking
- **Envelope format incompatible with upstream.** Blobs encrypted by upstream cannot be read by this fork.
  Upstream used AES-256-CBC with `Math.random()`-derived IVs and unauthenticated ciphertext; we use AES-256-GCM
  with `crypto.getRandomValues()` IVs and AEAD over a versioned envelope.

### Security — Critical fixes
- **C3** `Math.random()` replaced with `crypto.getRandomValues()` everywhere
- **C4** AES-CBC replaced with AES-GCM (authenticated encryption)
- **C5** scrypt N=2¹⁴ replaced with Argon2id (m=64 MiB, t=3, p=1)
- **C6** Hardcoded global salt removed — passphrase-as-salt-input via Argon2 derivation
- **C7** UTF-16LE passphrase encoding bug fixed — now uses TextEncoder (UTF-8)
- **C8** Container no longer runs as root (USER 10001:10001)
- **C9** Base image pinned to digest; `:latest` tag removed
- **C1, C2** Storage path no longer derived from auth_key alone; backup route under `public/` removed

### Security — High fixes
- auth_key moved from URL path to `Authorization: Bearer` header
- Rate limiting (`express-rate-limit`) on all routes
- `helmet()` security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy)
- Delete and write endpoints now require proof-of-knowledge (HMAC over existing ciphertext)
- HKDF key splitting instead of byte-slicing scrypt output
- Existence oracle on `GET` removed — uniform response shape
- Encryption key kept only in-memory (JS closure), removed `sessionStorage`
- `console.log(hash)` of master key removed
- Express updated 4.19.2 → 4.21.2 (CVE-2024-43796, CVE-2024-45296)
- Unused `ws` dependency removed
- Body size limit aligned with frontend `TEXT_MAX_LEN`
- Generic error responses (no internal path leakage)

### Other
- Frontend redesigned (Ableton-aesthetic, OKLCH tokens, View Transitions for theme switch)
- Multi-stage Docker build with non-root user, `cap_drop ALL`, `read_only`, `no-new-privileges`
- Healthcheck endpoint
- Resource limits and log rotation in compose
- Caddyfile templated via `${DOMAIN}` env var, HSTS enabled, rate-limit enabled, `file_server browse` removed
