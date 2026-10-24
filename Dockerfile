FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY src ./src
COPY public ./public

EXPOSE 8080

CMD ["node", "src/server.js"]
