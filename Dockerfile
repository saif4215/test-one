# Amazon Reselling AI — production image.
#   docker build -t amazon-reselling-ai .
#   docker run -p 3000:3000 -v reseller-data:/data -e APP_PASSWORD=choose-a-password amazon-reselling-ai
# The SQLite database lives on the /data volume; keep that volume to keep your records.

# Override if Docker Hub rate-limits you, e.g. --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/reseller.db \
    UPLOAD_DIR=/data/files
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
