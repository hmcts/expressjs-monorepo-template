#!/bin/sh
set -e

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
