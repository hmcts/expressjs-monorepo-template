#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy --schema=./dist/schema.prisma

if [ $? -eq 0 ]; then
  echo "Migrations completed successfully"
  echo "Starting Prisma Studio on port 5555..."
  npx prisma studio --schema=./dist/schema.prisma --port 5555 --hostname 0.0.0.0 --browser none
else
  echo "Migration failed, exiting..."
  exit 1
fi
