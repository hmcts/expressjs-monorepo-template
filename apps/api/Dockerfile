# syntax=docker/dockerfile:1
# ---- Base image ----
FROM hmctsprod.azurecr.io/base/node:24-alpine AS base
USER root
RUN corepack enable && install -d -o hmcts -g hmcts /opt/app/.yarn
USER hmcts
COPY --chown=hmcts:hmcts package.json yarn.lock .yarnrc.yml ./
COPY --chown=hmcts:hmcts --parents apps/*/package.json libs/*/package.json e2e-tests/package.json ./

# ---- Build image ----
FROM base AS build
RUN --mount=type=cache,target=/opt/app/.yarn/cache,uid=100,gid=101 yarn install --immutable --mode=skip-build
COPY --chown=hmcts:hmcts . .
ENV NODE_ENV=production
RUN yarn turbo run build --filter=@hmcts/api...

# ---- Runtime image ----
FROM base AS runtime
ENV NODE_ENV=production
RUN --mount=type=cache,target=/opt/app/.yarn/cache,uid=100,gid=101 yarn workspaces focus @hmcts/api --production
COPY --from=build --parents /opt/app/./apps/api/dist /opt/app/./libs/*/dist /opt/app/./libs/*/generated ./
COPY apps/api/config ./apps/api/config
COPY apps/api/helm/values.yaml ./apps/api/helm/values.yaml

WORKDIR /opt/app/apps/api
EXPOSE 3001
CMD ["node", "dist/server.js"]
