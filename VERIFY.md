# Verification checklist

Concrete commands to run before claiming the image is production-ready.
Order matters: lower steps assume the higher ones pass.

## 1. Lockfile sanity

Both lockfiles should already be committed (Phase 5.1). Confirm:

```bash
git ls-files --error-unmatch frontend/package-lock.json backend/package-lock.json
```

If either is missing, regenerate:

```bash
cd frontend && npm install --no-audit --no-fund
cd ../backend && npm install --no-audit --no-fund
git add frontend/package-lock.json backend/package-lock.json
git commit -m "chore: refresh lockfiles"
```

## 2. Frontend crypto tests

```bash
cd frontend
npm test
```

Expect: **14 passed**. Time: <2s. Argon2 KDF tests dominate at ~1s.

## 3. Frontend build

```bash
cd frontend
npm run build
```

Expect: `webpack ... compiled successfully`. Output in `frontend/dist/`,
bundle ~130 KB minified.

## 4. Backend type-check + build

```bash
cd backend
npm run build
```

Expect: `tsc` exits 0, output in `backend/dist/`.

## 5. npm audit (both directories)

```bash
cd frontend && npm audit --omit=dev --audit-level=high
cd ../backend && npm audit --omit=dev --audit-level=high
```

Expect: zero high or critical findings. Dev-only vulns are acceptable for this
release but should be tracked.

## 6. Docker image build

```bash
docker compose build
```

Expect: three stages succeed, final image ~220-300 MB (Debian-slim + node
runtime + production deps + bundle). Larger than the historical Alpine-based
image; the swap was made for reliable QEMU-emulated arm64 builds in CI.

## 7. Image CVE scan

Either of these is enough; running both gives the broadest coverage.

```bash
# Trivy — open-source, broad CVE DB
trivy image lockpad:latest --severity HIGH,CRITICAL

# Docker Scout — Docker Inc's offering, requires `docker login`
docker scout cves lockpad:latest --only-severity high,critical
```

Expect: no HIGH/CRITICAL CVEs in app dependencies. The Debian-slim base may
carry unpatched-yet CVEs in low/medium severity, which is normal — rebuild
when fixed upstream.

## 8. Pin base images to @sha256 (release time)

```bash
docker buildx imagetools inspect node:22-bookworm-slim --format '{{json .}}' | jq -r .manifest.digest
```

Replace the three `FROM node:22-bookworm-slim@sha256:...` lines in
`Dockerfile` with the new digest to lock the build to an immutable image.

## 9. SERVER_SECRET set

```bash
test -f .env && grep -q '^SERVER_SECRET=.\{32,\}' .env && echo "ok" || echo "FAIL: set SERVER_SECRET in .env"
```

Generate one:

```bash
echo "SERVER_SECRET=$(openssl rand -base64 48)" >> .env
```

## 10. First boot smoke test

```bash
docker compose up -d
# Wait for healthcheck to flip to "healthy" (~10-30s)
docker inspect lockpad --format='{{.State.Health.Status}}'

# Health endpoint
curl -fsS http://127.0.0.1:3000/api/health
# → {"status":"ok"}

# Auth required on /api/notes
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/notes
# → 401

# With a valid-shape auth_key (32 hex)
KEY=$(openssl rand -hex 16)
curl -fsS -H "Authorization: Bearer $KEY" -H "Content-Type: text/plain" -X POST \
     --data-binary '{"v":2,"iv":"AAAAAAAAAAAAAAAA","ct":"AAAA"}' \
     http://127.0.0.1:3000/api/notes
# → (empty body, 204 No Content)

curl -fsS -H "Authorization: Bearer $KEY" -o /dev/null -w '%{http_code}\n' \
     http://127.0.0.1:3000/api/notes
# → 200
```

## 11. Security headers (via reverse proxy)

```bash
curl -sSI https://$DOMAIN | grep -iE 'strict-transport-security|x-content-type|referrer-policy|x-frame-options|permissions-policy|content-security-policy'
```

Expect each header present and meaningful.

External:

- [Mozilla Observatory](https://observatory.mozilla.org/) — grade B+ or
  higher. The blocker for A+ is usually CSP `unsafe-inline` for styles
  (still required by Vue's scoped style injection).

## 12. Tag the release

```bash
git tag -s v0.2.0 -m "0.2.0 — security-hardened fork (see CHANGELOG.md)"
git push origin v0.2.0
```

Optional: also push to GitHub mirror once that remote is added.

## 13. Image signing (optional, recommended for public sharing)

```bash
# Cosign keyless signing via Sigstore (uses your GitHub/Google identity)
cosign sign --yes ghcr.io/frontmatters/lockpad:0.2.0

# Verify
cosign verify ghcr.io/frontmatters/lockpad:0.2.0 \
  --certificate-identity-regexp '.*' \
  --certificate-oidc-issuer-regexp '.*'
```

## 14. SBOM (optional)

```bash
docker buildx build --sbom=true --provenance=true \
  --output type=image,name=lockpad:0.2.0 .

# Inspect
docker buildx imagetools inspect lockpad:0.2.0 --format '{{ json .SBOM }}'
```
