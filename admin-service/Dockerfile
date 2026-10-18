ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY auth.mjs server.mjs preflight.mjs access.mjs ./
USER 1000:1000
EXPOSE 3012
CMD ["node", "server.mjs"]
