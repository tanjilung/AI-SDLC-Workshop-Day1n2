# ===== Build stage =====
FROM node:22-alpine AS builder

# Install dependencies only when needed
RUN apk add --no-cache libc6-compat git

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

RUN npm ci

# Copy all source code
COPY . .

# Build the Next.js app
RUN npm run build

# ===== Production stage =====
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Install minimal dependencies for running the built app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/middleware.ts ./middleware.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 8080

CMD ["npm", "start"]
