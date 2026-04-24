FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:24-alpine AS production

RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV PORT=1306

WORKDIR /app

COPY --chown=node:node package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node --from=builder /app/build ./build

COPY --chown=node:node --from=builder /app/src/swagger ./src/swagger

USER node

EXPOSE 1306

CMD ["dumb-init", "node", "build/src/server.js"]