# syntax=docker/dockerfile:1.7
FROM node:22-alpine

WORKDIR /app

ARG SEMANTIC_DATA_CATALOG_PACKAGE_VERSION=0.8.89
ARG SOLID_DATA_MANAGER_PACKAGE_VERSION=0.4.24
ARG SOLID_HEALTH_APP_PACKAGE_VERSION=0.1.27
ARG CITY_TOURS_PACKAGE_VERSION=0.1.29
ARG SOLID_HEALTH_QUESTIONNAIRE_PACKAGE_VERSION=0.1.9
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npm_token \
    set -eu; \
    trap 'rm -f /tmp/npmrc' EXIT; \
    NPM_TOKEN="$(cat /run/secrets/npm_token)"; \
    if [ -z "$NPM_TOKEN" ]; then \
      echo "The npm_token build secret is empty." >&2; \
      exit 1; \
    fi; \
    printf '@hoelk-f:registry=https://npm.pkg.github.com/\n//npm.pkg.github.com/:_authToken=%s\n' "$NPM_TOKEN" > /tmp/npmrc; \
    export NPM_CONFIG_USERCONFIG=/tmp/npmrc; \
    npm ci; \
    node -e "for (const [name, expected] of [['@hoelk-f/solid-data-manager', process.env.SOLID_DATA_MANAGER_PACKAGE_VERSION], ['@hoelk-f/solid-health-app', process.env.SOLID_HEALTH_APP_PACKAGE_VERSION]]) { const actual = require('./node_modules/' + name + '/package.json').version; if (actual !== expected) throw new Error('Unexpected ' + name + ' version: ' + actual + ' (expected ' + expected + ')'); }"; \
    node -e "const catalog = require('./node_modules/@hoelk-f/semantic-data-catalog/package.json'); if (catalog.version !== process.env.SEMANTIC_DATA_CATALOG_PACKAGE_VERSION) throw new Error('Unexpected Semantic Data Catalog version: ' + catalog.version); const path = require('node:path'); const pkgPath = path.resolve('node_modules/@hoelk-f/city-tours/package.json'); const pkg = require(pkgPath); if (pkg.version !== process.env.CITY_TOURS_PACKAGE_VERSION) throw new Error('Unexpected City Tours version: ' + pkg.version); if (pkg.dependencies?.react || pkg.dependencies?.['react-dom']) throw new Error('City Tours must consume the Manager React runtime.'); const packageRoot = path.dirname(pkgPath); for (const dependency of ['react', 'react-dom']) { const managerRuntime = require.resolve(dependency); const toursRuntime = require.resolve(dependency, { paths: [packageRoot] }); if (toursRuntime !== managerRuntime) throw new Error('City Tours resolved a separate ' + dependency + ' runtime: ' + toursRuntime); }"; \
    node -e "const path = require('node:path'); const pkgPath = path.resolve('node_modules/@hoelk-f/solid-health-questionnaire/package.json'); const pkg = require(pkgPath); if (pkg.version !== process.env.SOLID_HEALTH_QUESTIONNAIRE_PACKAGE_VERSION) throw new Error('Unexpected Health Questionnaire version: ' + pkg.version); if (!pkg.exports?.['./embed'] || !pkg.exports?.['./embed.css']) throw new Error('Health Questionnaire embed exports are incomplete.'); if (pkg.dependencies?.react || pkg.dependencies?.['react-dom']) throw new Error('Health Questionnaire must consume the Manager React runtime.'); const packageRoot = path.dirname(pkgPath); for (const dependency of ['react', 'react-dom']) { const managerRuntime = require.resolve(dependency); const questionnaireRuntime = require.resolve(dependency, { paths: [packageRoot] }); if (questionnaireRuntime !== managerRuntime) throw new Error('Health Questionnaire resolved a separate ' + dependency + ' runtime: ' + questionnaireRuntime); }"

COPY . .

RUN npm run build \
    && npm install -g serve@14.2.6

ENV PORT=3001
EXPOSE 3001

CMD ["sh", "-c", "node scripts/write-runtime-config.js && serve --config serve.json -l ${PORT:-3001}"]
