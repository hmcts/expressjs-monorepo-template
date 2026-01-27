import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addFromAzureVault } from "./azure-vault.js";

const DEFAULT_MOUNT_POINT = "/mnt/secrets";

export async function getPropertiesVolumeSecrets(options: GetSecretsOptions = {}): Promise<Secrets> {
  const isProd = process.env.NODE_ENV === "production";
  const { mountPoint = DEFAULT_MOUNT_POINT, failOnError = isProd, injectEnvVars = true, chartPath, omit = [] } = options;

  if (chartPath && !isProd && existsSync(chartPath)) {
    try {
      return await loadFromAzureVault(chartPath, injectEnvVars, omit);
    } catch (error) {
      if (failOnError) {
        throw new Error(`Failed to load secrets from Azure Vault: ${error}`);
      }
      console.warn(`Warning: Failed to load secrets from Azure Vault: ${error}`);
    }
  }

  if (!existsSync(mountPoint)) {
    const message = `Mount point ${mountPoint} does not exist`;
    if (failOnError) throw new Error(message);
    console.warn(`Warning: ${message}`);
    return {};
  }

  const secrets: Secrets = {};
  const entries = readdirSync(mountPoint, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(mountPoint, entry.name);

    try {
      if (entry.isDirectory()) {
        readSecretsFromDirectory(path, entry.name, injectEnvVars, secrets, failOnError, omit);
      } else if (entry.isFile() || entry.isSymbolicLink?.()) {
        if (!shouldOmit(entry.name, omit)) {
          const content = readSecretFile(path);
          processSecret(entry.name, content, injectEnvVars, secrets);
        }
      }
    } catch (error) {
      if (failOnError) throw new Error(`Failed to load secrets from ${mountPoint}: ${error}`);
      console.warn(`Warning: Failed to process ${path}: ${error}`);
    }
  }

  return secrets;
}

async function loadFromAzureVault(chartPath: string, injectEnvVars: boolean, omit: string[]): Promise<Secrets> {
  const config: Config = {};
  await addFromAzureVault(config, { pathToHelmChart: chartPath });

  const secrets: Secrets = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string" && !shouldOmit(key, omit)) {
      secrets[key] = value;
      if (injectEnvVars) {
        process.env[key] = value;
      }
    }
  }
  return secrets;
}

function readSecretsFromDirectory(dirPath: string, vaultName: string, injectEnvVars: boolean, secrets: Secrets, failOnError: boolean, omit: string[]): void {
  // Filter for files and symlinks, but exclude CSI driver internal entries (start with ..)
  const files = readdirSync(dirPath, { withFileTypes: true }).filter((f) => !f.name.startsWith("..") && (f.isFile() || f.isSymbolicLink?.()));

  for (const file of files) {
    const secretKey = `${vaultName}.${file.name}`;
    if (shouldOmit(secretKey, omit)) continue;

    try {
      const content = readSecretFile(join(dirPath, file.name));
      processSecret(secretKey, content, injectEnvVars, secrets);
    } catch (error) {
      if (failOnError) throw error;
      console.warn(`Warning: Failed to read ${join(dirPath, file.name)}: ${error}`);
    }
  }
}

function readSecretFile(path: string): string {
  return readFileSync(path, "utf8").trim();
}

function processSecret(key: string, value: string, injectEnvVars: boolean, secrets: Secrets): void {
  secrets[key] = value;
  if (injectEnvVars) {
    const parts = key.split(".");
    const envKey = parts[parts.length - 1];
    process.env[envKey] = value;
  }
}

function shouldOmit(key: string, omit: string[]): boolean {
  if (omit.length === 0) return false;

  for (const omitKey of omit) {
    if (key === omitKey) return true;

    const parts = key.split(".");
    const lastName = parts[parts.length - 1];
    if (lastName === omitKey) return true;
  }

  return false;
}

export interface GetSecretsOptions {
  mountPoint?: string;
  failOnError?: boolean;
  injectEnvVars?: boolean;
  chartPath?: string;
  omit?: string[];
}

export interface Secrets {
  [key: string]: string;
}

export interface Config {
  [key: string]: any;
}
