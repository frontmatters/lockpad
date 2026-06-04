# syntax=docker/dockerfile:1.7

# ============================================================================
# notepad-secure — multi-stage, non-root, production image
# ----------------------------------------------------------------------------
# Base image pinning: tags below should be replaced with @sha256:<digest> at
# release time (see Phase 5 release prep). Suggested fetch:
#   docker buildx imagetools inspect node:20.18.0-alpine3.20 --format '{{json .}}'
# ============================================================================

# ----- stage: frontend bundle -----
#
# Bullseye-slim (Debian) is required here only because the upstream frontend
# still uses prerender-spa-plugin-next, which spawns headless Chrome at build
# time. After the Phase 4 redesign drops prerender, the entire libnss/libgbm
# stack can go and this stage moves to node:20-alpine.
FROM node:20.18.0-bullseye-slim AS frontend-builder
WORKDIR /app/frontend
RUN apt-get update && apt-get install -yq --no-install-recommends \
        libnss3 libatk1.0-0 libatk-bridge2.0-0 libxkbcommon0 libgbm1 \
        libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
        libpango-1.0-0 libcairo2 libasound2 ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY frontend/package.json frontend/package-lock.json* ./
# Prefer `npm ci` when a lockfile exists (reproducible), fall back to install.
# The fallback exists only because this fork hasn't pushed a lockfile yet;
# remove the `||` branch once `npm install` was run locally and committed.
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi
COPY frontend/ ./
RUN npm run build


# ----- stage: backend compile -----
FROM node:20.18.0-alpine3.20 AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi
COPY backend/ ./
RUN npm run build


# ----- stage: runtime -----
FROM node:20.18.0-alpine3.20 AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_DIR=/data/storage

# wget for the HEALTHCHECK — Alpine's busybox wget is enough.
RUN apk add --no-cache wget tini

# Non-root user. uid 10001 to avoid colliding with common host uids (0..1000).
RUN addgroup -S app && adduser -S -u 10001 -G app app

WORKDIR /app

# Install only production dependencies; no devDeps, no TypeScript, no toolchain.
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && \
    (if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev --no-audit --no-fund; fi) && \
    npm cache clean --force

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

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/backend/dist/index.js"]
