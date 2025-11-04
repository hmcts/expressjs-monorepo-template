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
RUN yarn build

# ---- Runtime image ----
FROM base AS runtime
COPY --from=build /opt/app/apps/web/dist ./apps/web/dist
COPY --from=build /opt/app/libs ./libs

RUN yarn workspaces focus @hmcts/web --production
ENV NODE_ENV=production
ENV NODE_OPTIONS='--conditions=production'

EXPOSE 3000
CMD ["node", "apps/web/dist/server.js"]
