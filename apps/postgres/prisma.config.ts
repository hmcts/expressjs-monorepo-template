import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPropertiesVolumeSecrets } from "@hmcts/cloud-native-platform";
import { defineConfig } from "prisma/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chartPath = path.join(__dirname, "./helm/values.yaml");

await getPropertiesVolumeSecrets({ chartPath });

console.log(`DATABASE_URL: ${process.env.DATABASE_URL}`);

// Default to local PostgreSQL if DATABASE_URL is not set
process.env.DATABASE_URL ??= "postgresql://hmcts@localhost:5432/postgres";

export default defineConfig({
  schema: path.join("dist", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations")
  }
});
