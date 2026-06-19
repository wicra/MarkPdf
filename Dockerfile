FROM node:20-slim
 
# Install Chromium AND all the shared libraries it needs to actually launch
# (--no-install-recommends skips these by default, which breaks headless Chrome on Railway/Debian slim)
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-dejavu \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    ca-certificates \
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
 
