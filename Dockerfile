FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    MSTUDIO_PUBLIC_MODE=1 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      dumb-init \
      fonts-dejavu-core \
      fonts-noto-core \
      fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts

COPY . .
RUN npm run build \
    && npm prune --omit=dev \
    && chown -R node:node /app

USER node
EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4321/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
