FROM node:20-slim

# Install Chromium and required system fonts/libs
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-dejavu \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell puppeteer to use the system Chromium (skip its own 300MB download)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
