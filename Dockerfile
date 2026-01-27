# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for argon2 and prisma
RUN apk add --no-cache python3 make g++ openssl go

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .
RUN mkdir -p /app/public/agent \
  && cd /app/agent \
  && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /app/public/agent/vaultrix-agent-linux-amd64

# Build application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install runtime dependencies
RUN apk add --no-cache openssl postgresql-client curl su-exec tzdata

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/argon2 ./node_modules/argon2
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/ssh2 ./node_modules/ssh2
COPY --from=builder /app/node_modules/asn1 ./node_modules/asn1
COPY --from=builder /app/node_modules/bcrypt-pbkdf ./node_modules/bcrypt-pbkdf
COPY --from=builder /app/scripts ./scripts

# Set correct permissions
RUN mkdir -p /app/storage
RUN chown -R nextjs:nodejs /app
RUN chmod +x /app/scripts/entrypoint.sh
RUN chmod +x /app/scripts/backup-scheduler-loop.sh

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run entrypoint as root (will start cron and switch to nextjs)
CMD ["sh", "/app/scripts/entrypoint.sh"]
