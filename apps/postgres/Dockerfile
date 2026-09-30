# syntax=docker/dockerfile:1
FROM hmctsprod.azurecr.io/base/node:24-alpine
USER root
RUN corepack enable && install -d -o hmcts -g hmcts /opt/app/.yarn
USER hmcts
COPY --chown=hmcts:hmcts package.json yarn.lock .yarnrc.yml ./
COPY --chown=hmcts:hmcts --parents apps/*/package.json libs/*/package.json e2e-tests/package.json ./

ENV NODE_ENV=production
RUN --mount=type=cache,target=/opt/app/.yarn/cache,uid=100,gid=101 yarn workspaces focus @hmcts/postgres --production
COPY libs/postgres-prisma/prisma ./libs/postgres-prisma/prisma
COPY apps/postgres/prisma ./apps/postgres/prisma
COPY apps/postgres/prisma.config.ts apps/postgres/health-server.mjs ./apps/postgres/
COPY --chmod=755 apps/postgres/start.sh ./apps/postgres/start.sh

WORKDIR /opt/app/apps/postgres
CMD ["sh", "./start.sh"]
