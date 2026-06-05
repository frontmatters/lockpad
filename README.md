# Lockpad

A self-hostable, zero-knowledge notepad. Passphrase-only login, AES-256-GCM
end-to-end encryption, Argon2id key derivation, single file per note on disk.
Server stores opaque ciphertext keyed under HMAC of a server-side secret —
not even the server operator can read your notes.

```
┌───────────────────────────────────────────────────────────┐
│  lockpad                                            ☼     │
├───────────────────────────────────────────────────────────┤
│                                                           │
│           passphrase                                      │
│           ┌─────────────────────────────┐                 │
│           │ correct horse battery staple│                 │
│           └─────────────────────────────┘                 │
│             28 chars · 4 words · 60 bits  ━━━━━━━━━━━━    │
│                                                           │
│           argon2id · client-side derivation     [unlock]  │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

## What it is

- **Zero-knowledge**: all crypto happens in your browser. The server only
  stores encrypted blobs and cannot read them.
- **No accounts**: your passphrase IS your login. No email, no recovery,
  no admin override. Lose the passphrase, lose the note.
- **Self-hostable**: one Docker container + an optional reverse proxy.
- **Auditable**: 50+ findings from a third-party audit of the upstream
  project are documented and addressed (see [CHANGELOG.md](./CHANGELOG.md)).
  Crypto contract is empirically tested ([frontend/tests/](./frontend/tests/)).

## Quick start

```bash
# 1. Configure
cp .env.example .env
echo "SERVER_SECRET=$(openssl rand -base64 48)" >> .env
# (edit DOMAIN if not deploying on lockpad.local)

# 2. Run
docker compose up -d

# 3. Open
open http://127.0.0.1:3000/    # or your DOMAIN behind Caddy
```

By default the container binds to `127.0.0.1:3000` only (localhost). Set
`LOCKPAD_BIND=0.0.0.0` in `.env` to expose it on your LAN (HTTP, no TLS).
For anything more than that — public access, real users, multiple devices —
put [Caddy](./etc/Caddyfile) (or Traefik / nginx) in front to terminate TLS.
Lockpad performs no network-layer authentication, so reachability =
service-level access.

## Configuration

| Var | Required | Purpose |
|---|---|---|
| `SERVER_SECRET` | **yes** | 32+ char random string. HMAC key for the on-disk filename of every note. Treat as a per-instance fingerprint; never rotate without invalidating all data. |
| `LOCKPAD_BIND` | no | Host address Docker maps the port to. `127.0.0.1` (default, safest — localhost only), `0.0.0.0` (all interfaces — LAN access, HTTP only), or a specific NIC IP. |
| `DOMAIN` | no | Domain name Caddy serves on. Defaults to `lockpad.local`. Use a public domain for auto-TLS, or `localhost`/`:80` for plain HTTP behind another proxy. |
| `PORT` | no | Backend listen port inside the container. Defaults to `3000`. |
| `STORAGE_DIR` | no | Where the named volume mounts. Defaults to `/data/storage`. |
| `MAX_BLOB_SIZE` | no | Max size of an encrypted-note blob. Accepts human units (`1mb`, `750kb`, `64kib`), raw bytes (`65536`), or the sentinel `DEFAULT`. Empty/unset = default. Defaults to 64 KiB ≈ 40 000 plaintext chars. Same value backs both the Express body parser and the write-time defense-in-depth check; the app warns at startup if the chosen value outgrows the container's `mem_limit`, so you do not need to pre-tune memory by hand. |

## Verification

### Image signature

The image on Docker Hub is signed with [Sigstore cosign](https://docs.sigstore.dev/cosign/overview/)
using keyless GitHub OIDC. Anyone can verify that the image you pulled came
from this project, and not from a registry compromise or maintainer-account
takeover:

```bash
docker pull frontmatters/lockpad:1.0.0

cosign verify frontmatters/lockpad:1.0.0 \
  --certificate-identity hello@frontmatters.dev \
  --certificate-oidc-issuer https://github.com/login/oauth
```

A successful verify confirms:

- the image digest matches one we signed at publication time,
- the signature is recorded immutably in the [Sigstore Rekor](https://www.sigstore.dev/)
  transparency log (a public append-only ledger), and
- the signing certificate's `Subject Alternative Name` is `hello@frontmatters.dev`
  via GitHub OAuth.

For the `v1.0.0` image the Rekor entry is at
[search.sigstore.dev/?logIndex=1725095768](https://search.sigstore.dev/?logIndex=1725095768)
— it lives on the public log forever, regardless of what happens to this
account or repository.

### Build-time checks

See [VERIFY.md](./VERIFY.md) for the full pre-release checklist (lockfile
sanity, tests, build, `npm audit`, `trivy` CVE scan, smoke tests, security
headers, release tagging).

## Security model

See [SECURITY.md](./SECURITY.md) for the threat model, cryptographic design,
operational requirements, and known limitations.

In one sentence: **your browser does all crypto with keys that never leave
the tab; the server is an opaque blob store that, even with full disk access
plus its own `SERVER_SECRET`, still must guess your passphrase to read
anything — and each guess costs ~1s + 64MiB of RAM thanks to Argon2id.**

## Origin

Lockpad is a reimplementation inspired by
[Athlon1600/notepad](https://github.com/Athlon1600/notepad). The concept
(passphrase → KDF → AES → opaque blob store) is the same; almost no code
is shared. A third-party audit of the original surfaced nine critical and
sixteen high findings — `Math.random()`-derived AES IVs, unauthenticated
CBC, a global salt, a `/backups/` HTTP route that served the full encrypted
corpus as a tarball — and the rewrite touched every layer:

| Layer | Lockpad vs. original |
|---|---|
| Browser crypto | Argon2id + AES-GCM + HKDF via `hash-wasm` and `crypto.subtle`. Replaces scrypt-N=2¹⁴ + AES-CBC + `Math.random()` IVs. |
| Backend routes | `Authorization: Bearer` header auth, rate-limited, helmet headers, generic error responses. Replaces auth-in-URL + unauth deletes + verbose 500s. |
| Storage | Filename = HMAC-SHA256(SERVER_SECRET, authKey). Replaces filename = md5(authKey). Requires server breach + passphrase guess instead of just one. |
| Container | Non-root (uid 10001), read-only rootfs, multi-stage build, `cap_drop ALL`, pinned digests, healthcheck. Replaces root + mutable + monolithic. |
| Frontend UI | Vue 3 redesign — OKLCH tokens, View Transitions API, 14-test vitest suite. Replaces upstream Vue 3 with Tailwind cornsilk gradients + zero tests. |

Blobs encrypted by upstream `notepad.mx` are **not readable** here.

## License

MIT — same as upstream. Lockpad's own work is © 2026 Frontmatters; the
upstream copyright remains in [LICENSE](./LICENSE) as required by MIT.
