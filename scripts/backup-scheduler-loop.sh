#!/bin/sh
# Script que executa o scheduler de backups a cada minuto

echo "Starting backup scheduler loop..."

# Aguarda 30 segundos para garantir que a aplicação iniciou
sleep 30

while true; do
  # Chama o endpoint do scheduler
  curl -s -X POST http://localhost:3000/api/backup/scheduler > /dev/null 2>&1
  
  # Aguarda 60 segundos antes da próxima execução
  sleep 60
done
