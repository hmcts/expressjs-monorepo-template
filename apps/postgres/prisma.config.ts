import path from "node:path";
import { defineConfig } from "prisma/config";

// Construct DATABASE_URL from individual env vars if available
if (process.env.POSTGRES_HOST && process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD && process.env.POSTGRES_PORT && process.env.POSTGRES_DATABASE) {
  const { POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_PORT, POSTGRES_DATABASE } = process.env;
  process.env.DATABASE_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}`;
}

// Default to local PostgreSQL if DATABASE_URL is not set
process.env.DATABASE_URL ??= "postgresql://hmcts@localhost:5432/postgres";

console.log(`DATABASE_URL: ${process.env.DATABASE_URL}`);

export default defineConfig({
  schema: path.join("dist", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations")
  }
});
