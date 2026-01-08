import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Default to local PostgreSQL if DATABASE_URL is not set
process.env.DATABASE_URL ??= "postgresql://hmcts@localhost:5432/postgres";

export default defineConfig({
  schema: path.join("dist", "schema.prisma"),
  datasource: {
    url: env("DATABASE_URL")
  }
});
