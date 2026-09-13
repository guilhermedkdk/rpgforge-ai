# Build context is the REPO ROOT, not this folder:
#   docker build -f apps/api/Dockerfile -t rpgforge-api .
# The API imports @rpgforce-ai/shared through the workspace, so the build needs both packages.

FROM node:22-bookworm-slim AS build

# Puppeteer would download a second Chromium here for nothing: the runtime stage uses the distro one.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app
RUN corepack enable

# Prisma picks its query engine by sniffing the OpenSSL version at generate time. Without openssl
# here it guesses 1.1.x while the runtime stage is 3.0.x, and the client dies on the first query.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Manifests first: this layer only rebuilds when a dependency changes, not on every source edit.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @rpgforce-ai/api exec prisma generate
RUN pnpm --filter @rpgforce-ai/api run build

FROM node:22-bookworm-slim AS runtime

# The PDF export drives a real browser. Installing Chromium from the distro pulls its shared
# libraries along with it, which is the part a bare `npm i puppeteer` leaves missing in a container.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
         chromium \
         fonts-liberation \
         fonts-dejavu-core \
         ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# This is the whole reason the variable exists: it points Puppeteer at the Chromium installed above
# instead of one it downloaded itself. Verified against Chromium 152 with Puppeteer 25.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=production \
    PORT=4001

WORKDIR /app

# pnpm links workspace packages by relative symlink, so the tree is copied whole rather than
# per-package: splitting it would break the link from apps/api to packages/shared.
COPY --from=build --chown=node:node /app /app

USER node
EXPOSE 4001

# DB-free by design, so a platform health check (or a keep-alive ping) never wakes the database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "apps/api/node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma && exec node apps/api/dist/main.js"]
