# ---- Base image ----
FROM hmctspublic.azurecr.io/base/node:22-alpine AS base
USER root
RUN corepack enable
COPY --chown=hmcts:hmcts . .
USER hmcts

# ---- Build image ----
FROM base AS build
RUN yarn --version && yarn install
RUN yarn build:prod

# ---- Runtime image ----
FROM build AS runtime
COPY --from=build $WORKDIR/src/main ./src/main
RUN yarn build
