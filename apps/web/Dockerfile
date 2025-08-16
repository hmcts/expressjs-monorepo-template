# Multi-stage build for Express + Nunjucks web app
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY apps/web/package.json apps/web/
COPY libs/*/package.json libs/*/
RUN yarn workspaces focus @hmcts/web --production

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY . .
RUN yarn install --immutable
RUN yarn workspace @hmcts/web build
# Compile SCSS to CSS
RUN yarn workspace @hmcts/web sass

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init

# Non-root user
RUN addgroup -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nodejs

COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=dependencies --chown=nodejs:nodejs /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build --chown=nodejs:nodejs /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=nodejs:nodejs /app/apps/web/public ./apps/web/public
COPY --chown=nodejs:nodejs /app/libs/*/src/views ./libs/

# Copy GOV.UK Frontend assets
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules/govuk-frontend/dist/govuk ./apps/web/public/govuk

USER nodejs
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/dist/server.js"]