# Multi-stage build for Express API
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY apps/api/package.json apps/api/
COPY apps/postgres/package.json apps/postgres/
COPY libs/*/package.json libs/*/
RUN yarn workspaces focus @hmcts/api --production

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY . .
RUN yarn install --immutable
RUN yarn workspace @hmcts/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init

# Non-root user
RUN addgroup -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nodejs

COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=dependencies --chown=nodejs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nodejs:nodejs /app/apps/postgres/node_modules/.prisma ./apps/postgres/node_modules/.prisma

USER nodejs
EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/server.js"]