# syntax=docker/dockerfile:1.7
#
# Single Dockerfile, four leaf targets:
#   backend , Fastify API on /v1 + /internal
#   worker  , sync runner + correlation engine (only process with the master key)
#   cli     , operator commands (migrate, seed, sync, diagnose)
#   web     , static SPA bundle served by nginx, proxies /v1 + /internal to backend
#
# Workspace packages export from src/*.ts directly (see CONTRIBUTING.md "Style"),
# so the Node services run TypeScript through tsx rather than a separate tsc
# build step. Mirrors the dev loop, keeps the image straightforward.

# -----------------------------------------------------------------------------
# base, pnpm pinned to the workspace's packageManager.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_HOME=/opt/corepack \
    CI=true
RUN corepack enable \
 && corepack prepare pnpm@10.33.3 --activate \
 && chmod -R a+rX /opt/corepack
WORKDIR /app

# -----------------------------------------------------------------------------
# deps, install dependencies. Only manifests are copied so this layer caches
# across source changes.
# -----------------------------------------------------------------------------
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json                   apps/backend/package.json
COPY apps/cli/package.json                       apps/cli/package.json
COPY apps/web/package.json                       apps/web/package.json
COPY apps/worker/package.json                    apps/worker/package.json
COPY packages/connector-crowdstrike/package.json packages/connector-crowdstrike/package.json
COPY packages/connector-defender/package.json    packages/connector-defender/package.json
COPY packages/connector-intune/package.json      packages/connector-intune/package.json
COPY packages/connector-jamf/package.json        packages/connector-jamf/package.json
COPY packages/connector-okta/package.json        packages/connector-okta/package.json
COPY packages/connector-sdk/package.json         packages/connector-sdk/package.json
COPY packages/contracts/package.json             packages/contracts/package.json
COPY packages/core/package.json                  packages/core/package.json
COPY packages/db/package.json                    packages/db/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# source, add the rest of the workspace.
# -----------------------------------------------------------------------------
FROM deps AS source
COPY tsconfig.base.json ./
COPY configs configs
COPY packages packages
COPY apps    apps

# -----------------------------------------------------------------------------
# node-runtime, common base for the Node services. Non-root user, NODE_ENV set.
# -----------------------------------------------------------------------------
FROM source AS node-runtime
ENV NODE_ENV=production HOME=/home/corastate
RUN addgroup -S corastate \
 && adduser  -S -G corastate -h /home/corastate corastate \
 && chown -R corastate:corastate /app /home/corastate
USER corastate

# -----------------------------------------------------------------------------
# backend
# -----------------------------------------------------------------------------
FROM node-runtime AS backend
WORKDIR /app/apps/backend
EXPOSE 4000
CMD ["pnpm", "exec", "tsx", "src/index.ts"]

# -----------------------------------------------------------------------------
# worker
# -----------------------------------------------------------------------------
FROM node-runtime AS worker
WORKDIR /app/apps/worker
CMD ["pnpm", "exec", "tsx", "src/index.ts"]

# -----------------------------------------------------------------------------
# cli, entrypoint is `pnpm run` against the workspace root so the image can
# invoke any root script: `migrate`, `seed`, etc.
# -----------------------------------------------------------------------------
FROM node-runtime AS cli
WORKDIR /app
ENTRYPOINT ["pnpm", "run"]
CMD ["--help"]

# -----------------------------------------------------------------------------
# web-build, produce the static SPA bundle.
# -----------------------------------------------------------------------------
FROM source AS web-build
RUN pnpm --filter @corastate/web run build

# -----------------------------------------------------------------------------
# web, nginx serves the bundle and proxies /v1 + /internal to backend.
# Runs as the nginx image's built-in non-root user.
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
