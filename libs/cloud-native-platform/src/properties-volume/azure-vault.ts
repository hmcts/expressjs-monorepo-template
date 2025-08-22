import { readFileSync } from "node:fs";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { load as yamlLoad } from "js-yaml";
import type { Config } from "./properties.js";
import { deepMerge, deepSearch, normalizeSecretName } from "./utils.js";

export interface AzureVaultOptions {
  pathToHelmChart: string;
}

export interface StructuredSecret {
  alias: string;
  name: string;
}

export type StructuredOrUnstructuredSecret = string | StructuredSecret;

/**
 * Adds secrets from Azure Key Vault to configuration object
 * Matches the API of @hmcts/properties-volume addFromAzureVault function
 */
export async function addFromAzureVault(config: Config, options: AzureVaultOptions): Promise<void> {
  const { pathToHelmChart } = options;

  try {
    // Load and parse Helm chart YAML
    const helmChartContent = readFileSync(pathToHelmChart, "utf8");
    const helmChart = yamlLoad(helmChartContent) as any;

    // Find all keyVaults in the Helm chart
    const keyVaults = deepSearch(helmChart, "keyVaults");

    if (!keyVaults.length) {
      console.warn("Azure Vault: No keyVaults found in Helm chart");
      return;
    }

    // Process each keyVaults object found
    for (const keyVaultsObj of keyVaults) {
      if (keyVaultsObj && typeof keyVaultsObj === "object") {
        // keyVaultsObj should be an object with vault names as keys
        for (const [vaultName, vaultConfig] of Object.entries(keyVaultsObj)) {
          const vault = { name: vaultName };
          if (vaultConfig && typeof vaultConfig === "object") {
            Object.assign(vault, vaultConfig);
          }
          await processVault(config, vault);
        }
      }
    }
  } catch (error: any) {
    // Provide cleaner error message
    const message = error.message || error;
    throw new Error(`Azure Key Vault: ${message}`);
  }
}

/**
 * Process a single vault configuration
 */
async function processVault(config: Config, vault: any): Promise<void> {
  const { name: vaultName, secrets } = vault;

  if (!vaultName || !secrets) {
    console.warn("Azure Vault: Invalid vault configuration, missing name or secrets");
    return;
  }

  const vaultUri = `https://${vaultName}-aat.vault.azure.net/`;
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(vaultUri, credential);
  const secretPromises = secrets.map((secret: StructuredOrUnstructuredSecret) => processSecret(client, secret));

  try {
    const secretResults = await Promise.all(secretPromises);

    // Merge all secrets into config
    const secretsConfig: Config = {};
    for (const { key, value } of secretResults) {
      secretsConfig[key] = value;
    }

    Object.assign(config, deepMerge(config, secretsConfig));
  } catch (error: any) {
    // Re-throw with vault context if not already included
    if (error.message && !error.message.includes(vaultName)) {
      throw new Error(`Vault '${vaultName}': ${error.message}`);
    }
    throw error;
  }
}

/**
 * Process a single secret from the vault
 */
async function processSecret(client: SecretClient, secret: StructuredOrUnstructuredSecret): Promise<{ key: string; value: string }> {
  let secretName: string;
  let configKey: string;

  if (typeof secret === "string") {
    secretName = secret;
    configKey = normalizeSecretName(secret);
  } else {
    secretName = secret.name;
    configKey = secret.alias || normalizeSecretName(secret.name);
  }

  try {
    const secretResponse = await client.getSecret(secretName);

    if (!secretResponse.value) {
      throw new Error(`Secret ${secretName} has no value`);
    }

    return {
      key: configKey,
      value: secretResponse.value,
    };
  } catch (error: any) {
    // Extract cleaner error message for common Azure Key Vault permission issues
    if (error?.statusCode === 403 || error?.message?.includes("does not have secrets get permission")) {
      throw new Error(`Could not load secret '${secretName}'. Check it exists and you have access to it.`);
    }
    throw new Error(`Failed to retrieve secret ${secretName}: ${error.message || error}`);
  }
}
