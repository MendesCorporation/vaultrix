#!/bin/sh
set -e

# Se estamos rodando como root, inicia o scheduler e muda para nextjs
if [ "$(id -u)" = "0" ]; then
  # Inicia o loop do scheduler em background
  sh /app/scripts/backup-scheduler-loop.sh &
  
  echo "Switching to nextjs user..."
  exec su-exec nextjs "$0" "$@"
fi

# Daqui para baixo roda como nextjs
echo "Running database setup..."

PRISMA_CLI="node /app/node_modules/prisma/build/index.js"

echo "Applying migrations with prisma migrate deploy..."
if ! $PRISMA_CLI migrate deploy 2>&1; then
  echo "Migration failed, trying to baseline..."
  LATEST_MIGRATION=$(ls -t ./prisma/migrations 2>/dev/null | head -n 1)
  if [ -n "$LATEST_MIGRATION" ]; then
    echo "Baselining with migration: $LATEST_MIGRATION"
    $PRISMA_CLI migrate resolve --applied "$LATEST_MIGRATION"
    $PRISMA_CLI migrate deploy
  fi
fi

echo "Seeding database..."
node /app/scripts/seed.js

echo "Starting application..."
exec node server.js
