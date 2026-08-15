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
RUN pnpm build --filter=@cmc/api-server

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/db/prisma ./prisma
RUN npx prisma generate

EXPOSE 4000
CMD ["node", "dist/index.js"]