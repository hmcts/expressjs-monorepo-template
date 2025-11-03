# ---- Base image ----
FROM hmctspublic.azurecr.io/base/node:22-alpine AS base
USER root
RUN npm install -g corepack
RUN corepack enable
COPY --chown=hmcts:hmcts . .
USER hmcts

# ---- Build image ----
FROM base AS build
RUN yarn install
ENV NODE_ENV=production
RUN yarn build

# ---- Runtime image ----
FROM base AS runtime
COPY --from=build /opt/app/apps/crons/dist ./apps/crons/dist
COPY --from=build /opt/app/libs/*/dist ./libs/

RUN yarn workspaces focus @hmcts/crons --production

CMD ["node", "apps/crons/dist/index.js"]
