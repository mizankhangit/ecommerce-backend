# ==========================================
# Stage 1: Development
# ==========================================
FROM node:20-alpine AS development

WORKDIR /app

# Install all dependencies (including devDependencies)
COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:dev"]

# ==========================================
# Stage 2: Builder (for production build)
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ==========================================
# Stage 3: Production
# ==========================================
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main"]