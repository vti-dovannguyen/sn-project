FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json server.mjs ./
COPY scripts ./scripts
COPY public ./public
COPY seed-data ./seed-data
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME /app/data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
