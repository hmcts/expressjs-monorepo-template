import fs, { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addFromAzureVault } from "./azure-vault.js";
import { deepMerge } from "./utils.js";

export interface AddToOptions {
  mountPoint?: string;
  failOnError?: boolean;
  chartPath?: string;
}

export interface Config {
  [key: string]: any;
}

const DEFAULT_MOUNT_POINT = "/mnt/secrets";

/**
 * Adds properties from mounted volume to configuration object
 * Matches the API of @hmcts/properties-volume addTo function
 */
export async function configurePropertiesVolume(config: Config, options: AddToOptions = {}): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";
  const { mountPoint = DEFAULT_MOUNT_POINT, failOnError = isProd, chartPath } = options;

  try {
    if (chartPath && !isProd && fs.existsSync(chartPath)) {
      return await addFromAzureVault(config, { pathToHelmChart: chartPath });
    }

    if (!existsSync(mountPoint)) {
      const message = `Mount point ${mountPoint} does not exist`;
      if (failOnError) {
        throw new Error(message);
      }
      console.warn(`Warning: ${message}`);
      return;
    }

    const files = readdirSync(mountPoint);
    const properties: Config = {};

    for (const file of files) {
      const filePath = join(mountPoint, file);

      try {
        const content = readFileSync(filePath, "utf8").trim();

        // Use filename as property key, content as value
        properties[file] = content;
      } catch (error) {
        const message = `Failed to read property file ${filePath}: ${error}`;
        if (failOnError) {
          throw new Error(message);
        }
        console.warn(`Warning: ${message}`);
      }
    }

    // Merge properties into the configuration object
    Object.assign(config, deepMerge(config, properties));
  } catch (error: any) {
    // Extract cleaner error message
    const errorMessage = error.message || error;
    const cleanMessage = errorMessage.includes("Azure Key Vault:") ? errorMessage : `Failed to load properties from ${mountPoint}: ${errorMessage}`;

    if (failOnError) {
      throw new Error(cleanMessage);
    }
    console.warn(`Warning: ${cleanMessage}`);
  }
}
