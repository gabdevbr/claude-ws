FROM node:20-alpine
RUN apk add --no-cache python3 make g++ gcc musl-dev libstdc++ bash git && \
    corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app

# Copy everything (including src/lib/, packages/agentic-sdk/ used via relative imports)
COPY . .

# Install deps with SDK provider (no subprocess spawning)
ENV CLAUDE_PROVIDER=sdk
ENV CI=true
RUN rm -rf node_modules && pnpm install --frozen-lockfile --prod=false

# Remove build tools to reduce image size (keep bash and git — required by Claude SDK)
RUN apk del python3 make g++ gcc musl-dev

# Claude SDK requires SHELL env var pointing to a POSIX shell
ENV SHELL=/bin/bash

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 appuser
RUN mkdir -p /app/data /data/project && chown -R appuser:nodejs /app/data /data
USER appuser

EXPOSE 8556
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q --spider http://localhost:${PORT:-8556}/health || exit 1
CMD ["npx", "tsx", "packages/core/core-server.ts"]
