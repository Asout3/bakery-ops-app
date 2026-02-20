# Build stage for client
FROM node:20-alpine AS client-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci --only=production

COPY client/ ./
RUN npm run build

# Production stage
FROM node:20-alpine AS production

LABEL maintainer="Bakery Ops Team"
LABEL version="1.0.0"
LABEL description="Bakery Operations Management Application"

RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV PORT=5000

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY server/ ./server/
COPY scripts/ ./scripts/
COPY database/ ./database/

COPY --from=client-builder /app/client/dist ./client/dist

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]

# Development stage
FROM node:20-alpine AS development

WORKDIR /app

RUN apk add --no-cache tini

ENV NODE_ENV=development

COPY package*.json ./
RUN npm install

COPY client/package*.json ./client/
RUN cd client && npm install

COPY . .

EXPOSE 5000 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "dev"]
