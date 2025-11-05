import path from "node:path";
import { defineConfig } from "prisma/config";

console.log(`DATABASE_URL: ${process.env.DATABASE_URL}`);

// Default to local PostgreSQL if DATABASE_URL is not set
process.env.DATABASE_URL ??= "postgresql://hmcts@localhost:5432/postgres";

export default defineConfig({
  schema: path.join("dist", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations")
  }
});
