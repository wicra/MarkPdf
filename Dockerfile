# Utiliser une image Node.js plus légère et compatible
FROM node:20-slim

# Installer les dépendances système nécessaires pour Chromium et Puppeteer
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

# Configurer Puppeteer pour utiliser Chromium système
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# Créer un répertoire pour l'application
WORKDIR /app

# Copier les fichiers de configuration et installer les dépendances
COPY package*.json ./
RUN npm ci --only=production

# Copier le reste de l'application
COPY . .

# Exposer le port de l'application
EXPOSE 3000

# Lancer l'application
CMD ["node", "server.js"]
