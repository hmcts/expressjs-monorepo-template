#!/bin/sh
set -e

echo "Loading /mnt/secrets..."

if [ -d "/mnt/secrets" ]; then
  echo "Loading secrets from /mnt/secrets..."
  for vault_dir in /mnt/secrets/*/; do
    if [ -d "$vault_dir" ]; then
      for secret in "$vault_dir"*; do
        name=$(basename "$secret")
        # Skip CSI driver internal entries (start with ..)
        case "$name" in
          ..*) continue ;;
        esac
        # Check for regular file or symlink pointing to a file
        if [ -f "$secret" ] || [ -L "$secret" ]; then
          # Verify it's not a symlink to a directory
          if [ ! -d "$secret" ]; then
            value=$(cat "$secret")
            export "$name"="$value"
            echo "  Loaded: $name"
          fi
        fi
      done
    fi
  done
fi 

echo "Running database migrations..."
npx prisma migrate deploy --schema=./dist/schema.prisma

if [ $? -eq 0 ]; then
  echo "Migrations completed successfully"
  echo "Starting health proxy on port 5555..."
  node health-server.mjs &
  HEALTH_PID=$!

  echo "Starting Prisma Studio on port 5556..."
  npx prisma studio --schema=./dist/schema.prisma --port 5556 --hostname 127.0.0.1 --browser none &
  STUDIO_PID=$!

  # Wait for both processes
  wait $HEALTH_PID $STUDIO_PID
else
  echo "Migration failed, exiting..."
  exit 1
fi
