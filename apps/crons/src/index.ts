import path from "node:path";
import { fileURLToPath } from "node:url";
import { configurePropertiesVolume } from "@hmcts/cloud-native-platform";
import config from "config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chartPath = path.join(__dirname, "../helm/values.yaml");

const main = async () => {
  await configurePropertiesVolume(config, { chartPath });

  const scriptName = process.env.SCRIPT_NAME || "example";
  const script = await import(`./${scriptName}.js`);

  if (script && typeof script.default === "function") {
    await script.default();
  } else {
    throw new Error(`The script "${scriptName}" does not export a default function.`);
  }
};

main().catch((error) => {
  console.error("Cron job failed:", error);
  process.exit(1);
});
