FROM node:20-alpine AS base

RUN npm install -g pnpm@9.1.0

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
RUN pnpm fetch

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build --filter=@cmc/admin

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/admin/.next ./.next
COPY --from=build /app/apps/admin/package.json ./package.json
COPY --from=build /app/apps/admin/next.config.js ./next.config.js
COPY --from=build /app/apps/admin/public ./public
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000
CMD ["pnpm", "start"]