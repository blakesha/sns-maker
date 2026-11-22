FROM docker.io/node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM docker.io/node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data ASSETS_DIR=/local-assets
COPY --from=build /app/dist ./dist
COPY server.mjs .
EXPOSE 8080
CMD ["node", "server.mjs"]
