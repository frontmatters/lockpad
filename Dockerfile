# syntax=docker/dockerfile:1.7

# ============================================================================
# Lockpad — multi-stage, non-root, production image
# ----------------------------------------------------------------------------
# Base image pinned by @sha256: digest. To refresh:
#   docker buildx imagetools inspect node:22-bookworm-slim --format '{{json .}}'
#
# Debian-slim chosen over Alpine for QEMU-emulated arm64 builds: musl + V8
# on emulated arm64 hits `qemu: uncaught target signal 4 (Illegal instruction)`
# on pointer-tagging instructions. glibc + Node 22 sidesteps that and detects
# safe ARM instruction subsets in the emulator. ~280 MiB final vs ~140 MiB
# (Alpine); acceptable cost for reliable multi-arch CI publishing.
# ============================================================================

# ----- stage: frontend bundle -----
#
# Slim variant: no headless Chrome / libnss / libgbm / X11 stack needed at
# build time (no prerender step).
FROM node:22-bookworm-slim@sha256:7af03b14a13c8cdd38e45058fd957bf00a72bbe17feac43b1c15a689c029c732 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
# Prefer `npm ci` when a lockfile exists (reproducible), fall back to install.
# Remove the `||` branch once a lockfile is committed in Phase 5.
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi
COPY frontend/ ./
RUN npm run build


# ----- stage: backend compile -----
FROM node:22-bookworm-slim@sha256:7af03b14a13c8cdd38e45058fd957bf00a72bbe17feac43b1c15a689c029c732 AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi
COPY backend/ ./
RUN npm run build


# ----- stage: runtime -----
FROM node:22-bookworm-slim@sha256:7af03b14a13c8cdd38e45058fd957bf00a72bbe17feac43b1c15a689c029c732 AS runner

LABEL org.opencontainers.image.title="Lockpad" \
      org.opencontainers.image.description="Self-hostable, zero-knowledge notepad with passphrase-only login" \
      org.opencontainers.image.vendor="Frontmatters" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="1.0.0"

ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_DIR=/data/storage

# wget for HEALTHCHECK, tini as PID-1 (reaps zombies if a child ever forks).
# `--no-install-recommends` keeps the layer small; we wipe apt lists after.
RUN apt-get update && \
    apt-get install -y --no-install-recommends wget tini && \
    rm -rf /var/lib/apt/lists/*

# Non-root user. uid 10001 to avoid colliding with common host uids (0..1000).
# `--no-create-home` + `nologin` shell — process owner has no interactive surface.
RUN groupadd --system app && \
    useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app

# Install only production dependencies; no devDeps, no TypeScript, no toolchain.
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && \
    (if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev --no-audit --no-fund; fi) && \
    npm cache clean --force && \
    rm -rf /root/.npm \
           /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/corepack
# npm + npx + corepack only exist for installation. Removing them at runtime
# also removes ~10 HIGH/CRITICAL CVEs that live inside the bundled `glob`,
# `minimatch`, and `tar` versions npm carries (trivy false-positives for our
# code, but real CVEs nonetheless and zero reason to ship them).

# Built artifacts only — no source, no tsconfig, no tests.
COPY --from=backend-builder  --chown=10001:10001 /app/backend/dist     ./backend/dist
COPY --from=frontend-builder --chown=10001:10001 /app/frontend/dist    ./backend/public

# Storage volume target. Owned by the app user so the running process can write
# even though it's not root. /data is also where we'll mount the named volume
# from compose (or a host bind-mount if the operator chowns it to 10001).
RUN mkdir -p /data/storage && \
    chown -R 10001:10001 /app /data

USER 10001:10001

EXPOSE 3000

# Health endpoint is OUTSIDE the rate-limit (see backend index.ts) so this can't
# trip the bucket. tini reaps zombies if a child ever forks (defense in depth).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/backend/dist/index.js"]
