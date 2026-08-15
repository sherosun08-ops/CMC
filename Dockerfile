FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY admin ./admin
COPY plugins ./plugins
COPY scripts ./scripts
RUN npx tsx scripts/build-admin.ts

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY package.json tsconfig.json ./
COPY src ./src
COPY plugins ./plugins
COPY scripts ./scripts
VOLUME /app/data
EXPOSE 4000
# CMC_SECRET must be provided at runtime
CMD ["npx", "tsx", "src/index.ts"]
