# syntax=docker/dockerfile:1
FROM node:24.13.0-bookworm-slim

WORKDIR /app

# Keep the package-manager version aligned with package.json.  The image also
# contains Prisma because Railway runs migrations as the pre-deploy command.
RUN apt-get update \
    && apt-get install --no-install-recommends --yes openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.15.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .nvmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN --mount=type=cache,id=s/da092a25-b125-4b25-8ccc-6c9c67b4e292-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages packages

RUN pnpm --filter @athleta/api prisma:generate \
    && pnpm --filter @athleta/api build

ENV NODE_ENV=production
EXPOSE 3001

CMD ["pnpm", "--filter", "@athleta/api", "start"]
