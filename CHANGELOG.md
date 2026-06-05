# Changelog

All security-relevant changes vs. upstream Athlon1600/notepad.

## [1.3.0] — plain-HTTP mode for LAN deploys

### Added

- `LOCKPAD_PLAIN_HTTP` env var. When set to `true`, the server emits its
  CSP **without** the `upgrade-insecure-requests` directive and disables
  HSTS. This is required for `LOCKPAD_BIND=0.0.0.0` (or any LAN-exposure)
  deploys that do **not** have a TLS-terminating reverse proxy in front.
  Without it, browsers auto-upgrade asset requests to HTTPS, fail to reach
  any TLS server, and the UI does not load (favicon + bundle blocked,
  surface symptoms include "CORS error" and "certificate error").
  Defaults to `false` — the safe choice for production behind a proxy.

### Behavioural notes

- Other `isProd`-gated behaviour (error message hiding in 5xx responses,
  etc.) remains tied to `NODE_ENV=production` and is unchanged. The new
  flag scopes narrowly to the HTTPS-only response headers.
- `LOCKPAD_PLAIN_HTTP=true` paired with a reverse proxy is a misconfig —
  the proxy already terminates TLS and `upgrade-insecure-requests` is
  helpful in that setup. Set this flag only when you genuinely intend to
  serve over plain HTTP.

## [1.2.0] — configurable host binding

### Added

- `LOCKPAD_BIND` env var (default `127.0.0.1`) controls the host address
  Docker maps the published port to. Set `LOCKPAD_BIND=0.0.0.0` to expose
  Lockpad on the LAN, or a specific NIC IP to bind to one interface only.
  Backwards-compatible: deployments without the variable keep the safe
  loopback-only default exactly as before.

### Notes

- LAN-exposed deployments still need a reverse proxy (Caddy/Traefik/nginx)
  for TLS and any meaningful access policy. Lockpad performs no
  network-layer authentication — the passphrase encrypts note content
  client-side, but anyone reaching the service can hit the API.
- `docker-compose.override.yml` is now explicitly gitignored. It was
  always meant for per-host port choices that shouldn't ship with the
  project; the gitignore makes that contract explicit.

## [1.1.1] — CI housekeeping

No runtime or image-behaviour change. The 1.1.1 image is byte-for-byte
equivalent in functionality to 1.1.0; only the build pipeline upstream
tooling moved.

### CI
- Bumped GitHub Actions to Node 24-compatible majors ahead of the
  2026-09-16 Node 20 removal: `checkout@v4 → v6`,
  `setup-qemu-action@v3 → v4`, `setup-buildx-action@v3 → v4`,
  `login-action@v3 → v4`, `build-push-action@v5 → v7`,
  `action-gh-release@v2 → v3`. `cosign-installer@v3` left as-is
  (already Node 24-ready). Floating major tags retained to match
  the repo's existing pinning style.

## [1.1.0] — tunable blob size

Backwards-compatible: deployments without the new env var keep the
existing 64 KiB ceiling exactly as before.

### Added
- `MAX_BLOB_SIZE` env var (optional). Accepts human units (`1mb`,
  `750kb`, `64kib`), raw bytes (`65536`), or the sentinel `DEFAULT`
  (also matches empty / unset). Single source of truth for both the
  Express body-parser limit and the `Database.save` defense-in-depth
  check, so the two layers cannot drift.
- Startup memory-headroom check: on boot, the backend reads the
  container's cgroup memory limit and warns loudly if the configured
  `MAX_BLOB_SIZE` is large enough to risk OOM under concurrent writes.
  Replaces the need to manually pre-tune `mem_limit` ahead of time.

### Changed
- `Server.ts` no longer hardcodes `BODY_LIMIT = "64kb"`; it sources the
  byte count from `Config.maxBlobBytes`.

### Build
- Base image swapped from `node:20-alpine3.22` to `node:22-bookworm-slim`.
  QEMU-emulated arm64 builds of the Alpine variant SIGILL'd inside
  `npm ci` (V8 pointer-tagging on emulated arm64 + musl), aborting
  multi-arch CI releases. Debian-slim + Node 22 sidesteps that. Image
  grows from ~140 MB to ~280 MB — acceptable cost for reliable publishing.
- Image digest is re-pinned; security-conscious operators verifying with
  `cosign verify` or pinning consumers by digest should refresh.

### Notes for existing self-hosters
- Default behaviour is unchanged. To start using `MAX_BLOB_SIZE`, add
  `MAX_BLOB_SIZE: ${MAX_BLOB_SIZE:-}` to the `environment:` section of
  your `docker-compose.yml` (already present in the repo's compose file
  for fresh installs), then set the value in `.env`.

## [1.0.1] — multi-arch + CI release pipeline

First release built by the GitHub Actions release workflow. The v1.0.0
manual push was linux/arm64-only (built on an Apple Silicon Mac) and
crashed with `exec format error` on amd64 hosts (Synology, most cloud VMs).
This release ships a real multi-arch manifest.

### Added
- `.github/workflows/release.yml` — multi-arch buildx + Docker Hub push
  + cosign keyless signing via GitHub OIDC, triggered on tag push.
- OCI image labels carry version + revision + source URL automatically.

### Changed
- Image manifest is now multi-arch (`linux/amd64` + `linux/arm64`).
- Cosign signature identity moves from email-based (`hello@frontmatters.dev`
  device flow) to workflow-based (the release workflow path + tag, via
  GitHub Actions OIDC) — stronger binding, no human-in-the-loop.

### Removed
- `etc/Caddyfile-local`: leftover upstream local-dev config with
  `notepad.test` domain and the same `file_server` corpus-leak vector
  removed from the production Caddyfile.
- `.github/workflows/docker-image.yml`: upstream CI that pushed to
  `athlon1600/notepad:latest` — never tested in this fork.
- `.dockerignore`: dropped `notepad-redesign` reference (folder outside repo).

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
