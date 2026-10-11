FROM node:22-slim
WORKDIR /app
COPY package*.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/sdk/package.json packages/sdk/
COPY apps/demo/package.json apps/demo/
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build:web
ENV PORT=8080 STATE_FILE=/data/mint.json DEMO_API_URL=http://localhost:4020
EXPOSE 8080
CMD ["sh", "scripts/start.sh"]
