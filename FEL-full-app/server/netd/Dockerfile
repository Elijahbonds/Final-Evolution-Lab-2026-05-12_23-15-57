# fel-netd on Cloud Run (2026-09-12).
# Cloud Run holds WebSockets; Cloud Functions does not, which is why the realtime layer lives
# here rather than beside the Next app on Firebase Hosting.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
# Cloud Run injects PORT; the server reads it and defaults to 8080 locally
EXPOSE 8080
CMD ["node", "dist/index.js"]
