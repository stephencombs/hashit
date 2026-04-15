FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---

FROM node:22-alpine AS runtime

WORKDIR /app

RUN mkdir -p /app/data

COPY --from=build /app/.output .output

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
