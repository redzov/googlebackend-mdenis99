# Dockerfile for Google Workspace Account Registrar
# Uses Node.js 20 LTS for GoLogin SDK compatibility

FROM node:20-bookworm-slim

# Install dependencies for Puppeteer/Chromium/Orbita
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    wget \
    curl \
    unzip \
    ca-certificates \
    libcurl4 \
    libcurl3-gnutls \
    xvfb \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# GoLogin SDK paths
ENV GOLOGIN_DATA_PATH=/root/.gologin
ENV GOLOGIN_BROWSER_PATH=/root/.gologin/browser

# Create directories for GoLogin
RUN mkdir -p /root/.gologin/browser

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Install GoLogin SDK (now compatible with Node 20)
RUN npm install gologin puppeteer-core

# Patch GoLogin SDK v2.2.6 bugs:
# 1. makeRequest() crashes when called without options (options.headers is undefined)
# 2. getLatestBrowserVersion() doesn't pass {json:true} so response isn't parsed
# 3. getTimeZone() makes IP geolocation request through rotating proxy → gets random country
#    → sets wrong language/timezone. Patch: return static US data immediately (failsafe).
#    Primary fix is passing timezone to SDK constructor; this patch is belt+suspenders.
RUN sed -i 's/export const makeRequest = async (url, options, internalOptions)/export const makeRequest = async (url, options = {}, internalOptions)/' \
    /app/node_modules/gologin/src/utils/http.js && \
    sed -i "s|return makeRequest(\`\${API_URL}/gologin-global-settings/latest-browser-info?os=\${userOs}\`);|return makeRequest(\`\${API_URL}/gologin-global-settings/latest-browser-info?os=\${userOs}\`, { json: true });|" \
    /app/node_modules/gologin/src/browser/browser-checker.js && \
    sed -i 's/async getTimeZone(proxy) {/async getTimeZone(proxy) { if(!this.timezone) { this._tz = {timezone:"America\/New_York",country:"US",languages:"en",ip:"0.0.0.0",ll:[40.7128,-74.006],accuracy:100}; return this._tz.timezone; }/' \
    /app/node_modules/gologin/src/gologin.js

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 3000

# Create startup script that runs xvfb, migrations, then starts app
RUN echo '#!/bin/sh\nXvfb :99 -screen 0 1920x1080x24 &\nsleep 2\nexport DISPLAY=:99\nnpx prisma db push --skip-generate\nnode src/index.js' > /app/start.sh && chmod +x /app/start.sh

# Start the application with migrations
CMD ["/app/start.sh"]
