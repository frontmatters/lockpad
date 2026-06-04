# Changelog

All security-relevant changes vs. upstream Athlon1600/notepad.

## [Unreleased] — security-rewrite branch

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
