# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

ARG NPM_TOKEN
COPY package.json ./
RUN echo "@hoelk-f:registry=https://npm.pkg.github.com/" > .npmrc \
    && echo "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}" >> .npmrc \
    && npm install \
    && npm uninstall @hoelk-f/solid-data-manager --no-save \
    && npm install @hoelk-f/solid-data-manager@latest --save-exact \
    && npm install @hoelk-f/semantic-data-catalog@latest --no-save \
    && npm install @hoelk-f/solid-chatbot@latest --no-save \
    && rm -f .npmrc

COPY . .

RUN npm run build \
    && npm install -g serve

ENV PORT=3001
EXPOSE 3001

CMD ["sh", "-c", "node scripts/write-runtime-config.js && serve -s build -l ${PORT:-3001}"]
