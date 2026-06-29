FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

COPY public ./public
COPY src ./src
COPY README.md ./

RUN mkdir -p /app/data/cache/photos /app/data/photos \
  && chown -R node:node /app

USER node

EXPOSE 3000

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
