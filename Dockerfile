# syntax=docker/dockerfile:1.7
FROM node:20-alpine

WORKDIR /app

ARG SOLID_TOURS_PACKAGE_VERSION=0.1.2
COPY package.json ./
RUN --mount=type=secret,id=npm_token \
    set -eu; \
    NPM_TOKEN="$(cat /run/secrets/npm_token)"; \
    if [ -z "$NPM_TOKEN" ]; then \
      echo "The npm_token build secret is empty." >&2; \
      exit 1; \
    fi; \
    printf '@hoelk-f:registry=https://npm.pkg.github.com/\n//npm.pkg.github.com/:_authToken=%s\n' "$NPM_TOKEN" > /tmp/npmrc; \
    export NPM_CONFIG_USERCONFIG=/tmp/npmrc; \
    npm install \
    && npm uninstall @hoelk-f/solid-data-manager --no-save \
    && npm install @hoelk-f/solid-data-manager@latest --save-exact \
    && npm install @hoelk-f/semantic-data-catalog@latest --no-save \
    && npm install @hoelk-f/solid-health-app@latest --no-save \
    && npm install "@hoelk-f/solid-tours@${SOLID_TOURS_PACKAGE_VERSION}" --no-save \
    && npm install @hoelk-f/solid-chatbot@latest --no-save \
    && node -e "const pkg = require('./node_modules/@hoelk-f/solid-tours/package.json'); if (pkg.version !== process.env.SOLID_TOURS_PACKAGE_VERSION) throw new Error('Unexpected Solid Tours version: ' + pkg.version); if (pkg.dependencies?.react || pkg.dependencies?.['react-dom']) throw new Error('Solid Tours must consume the Manager React runtime.');"; \
    rm -f /tmp/npmrc

COPY . .

RUN npm run build \
    && npm install -g serve

ENV PORT=3001
EXPOSE 3001

CMD ["sh", "-c", "node scripts/write-runtime-config.js && serve -s build -l ${PORT:-3001}"]
