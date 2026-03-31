FROM node:20-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  python3-pip \
  make \
  g++ \
  pkg-config \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  pkg-config \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=10000

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  python3-pip \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/app ./app
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/lint ./lint
COPY --from=builder /app/prompts ./prompts
COPY --from=builder /app/data ./data
COPY --from=builder /app/ingestion ./ingestion
COPY --from=builder /app/requirements.txt ./requirements.txt
COPY --from=builder /app/next.config.mjs ./next.config.mjs

RUN pip3 install --no-cache-dir -r requirements.txt \
  && mkdir -p /app/data \
  && chown -R node:node /app/data

USER node
EXPOSE 10000

CMD ["npm", "run", "start"]
