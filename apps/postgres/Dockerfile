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
COPY --from=build /opt/app/apps/postgres/dist ./apps/postgres/dist

RUN yarn workspaces focus @hmcts/postgres
COPY --from=build /opt/app/node_modules/.prisma ./node_modules/.prisma
ENV NODE_ENV=production

WORKDIR /opt/app/apps/postgres
CMD ["npx", "prisma", "migrate", "deploy", "--schema=./dist/schema.prisma"]
