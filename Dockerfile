FROM node:22-alpine AS build

WORKDIR /app

RUN echo "strict-ssl=false" > /root/.npmrc && \
    npm install -g pnpm@10.28.1

COPY package.json pnpm-lock.yaml ./
RUN echo "strict-ssl=false" > .npmrc && \
    NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm install --frozen-lockfile && \
    rm .npmrc

COPY . .
RUN pnpm build

# ---

FROM node:22-alpine AS runtime

RUN addgroup -S hashit && adduser -S hashit -G hashit

WORKDIR /app

COPY --from=build --chown=hashit:hashit /app/.output .output
COPY --from=build --chown=hashit:hashit /app/drizzle ./drizzle

USER hashit

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
