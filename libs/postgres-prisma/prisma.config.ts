import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("dist", "schema.prisma")
});
