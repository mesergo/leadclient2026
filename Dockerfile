# LeadClient — single-image deploy (Node server serves API + built React client).
# Used by Coolify (Docker build). Multi-stage: build the client, then run the server.

# ---- build stage ----
FROM node:20-slim AS build
WORKDIR /app
# install all deps (workspaces: server + client)
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci
# copy source and build the client (-> client/dist)
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
# bring the built app over, then drop dev-only deps to slim the image
COPY --from=build /app ./
RUN npm prune --omit=dev && mkdir -p /app/uploads
EXPOSE 4000
# the server reads config from environment variables (see .env.production.example)
CMD ["node", "server/src/index.js"]
