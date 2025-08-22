import { readFileSync } from "node:fs";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { load as yamlLoad } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addFromAzureVault } from "./azure-vault.js";

// Mock all external dependencies
vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: vi.fn(),
}));

vi.mock("@azure/keyvault-secrets", () => ({
  SecretClient: vi.fn(),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

vi.mock("js-yaml", () => ({
  load: vi.fn(),
}));

const mockDefaultAzureCredential = vi.mocked(DefaultAzureCredential);
const mockSecretClient = vi.mocked(SecretClient);
const mockReadFileSync = vi.mocked(readFileSync);
const mockYamlLoad = vi.mocked(yamlLoad);

describe("addFromAzureVault", () => {
  let config: Record<string, any>;
  let consoleWarnSpy: any;
  let mockClient: any;

  beforeEach(() => {
    config = { existing: "value" };
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Set up mock client
    mockClient = {
      getSecret: vi.fn(),
    };

    // Configure mocks
    mockDefaultAzureCredential.mockReturnValue({});
    mockSecretClient.mockReturnValue(mockClient);

    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("should load secrets from Azure Key Vault", async () => {
    const helmChart = {
      keyVaults: {
        "test-vault": {
          secrets: ["secret1", { name: "secret2", alias: "custom-alias" }],
        },
      },
    };

    mockReadFileSync.mockReturnValue("helm-chart-content");
    mockYamlLoad.mockReturnValue(helmChart);
    mockClient.getSecret.mockResolvedValueOnce({ value: "secret-value-1" }).mockResolvedValueOnce({ value: "secret-value-2" });

    await addFromAzureVault(config, { pathToHelmChart: "/path/to/chart.yaml" });

    expect(mockReadFileSync).toHaveBeenCalledWith("/path/to/chart.yaml", "utf8");
    expect(mockYamlLoad).toHaveBeenCalledWith("helm-chart-content");
    expect(mockSecretClient).toHaveBeenCalledWith("https://test-vault-aat.vault.azure.net/", expect.any(Object));
    expect(mockClient.getSecret).toHaveBeenCalledWith("secret1");
    expect(mockClient.getSecret).toHaveBeenCalledWith("secret2");

    expect(config).toEqual({
      existing: "value",
      secret1: "secret-value-1",
      "custom-alias": "secret-value-2",
    });
  });

  it("should handle multiple vaults", async () => {
    const helmChart = {
      keyVaults: {
        vault1: {
          secrets: ["secret1"],
        },
        vault2: {
          secrets: ["secret2"],
        },
      },
    };

    mockReadFileSync.mockReturnValue("helm-chart-content");
    mockYamlLoad.mockReturnValue(helmChart);
    mockClient.getSecret.mockResolvedValueOnce({ value: "value1" }).mockResolvedValueOnce({ value: "value2" });

    await addFromAzureVault(config, { pathToHelmChart: "/path/to/chart.yaml" });

    expect(mockSecretClient).toHaveBeenCalledWith("https://vault1-aat.vault.azure.net/", expect.any(Object));
    expect(mockSecretClient).toHaveBeenCalledWith("https://vault2-aat.vault.azure.net/", expect.any(Object));

    expect(config).toEqual({
      existing: "value",
      secret1: "value1",
      secret2: "value2",
    });
  });

  it("should warn when no keyVaults found in Helm chart", async () => {
    const helmChart = { other: "config" };

    mockReadFileSync.mockReturnValue("helm-chart-content");
    mockYamlLoad.mockReturnValue(helmChart);

    await addFromAzureVault(config, { pathToHelmChart: "/path/to/chart.yaml" });

    expect(consoleWarnSpy).toHaveBeenCalledWith("Azure Vault: No keyVaults found in Helm chart");
    expect(config).toEqual({ existing: "value" });
  });

  it("should warn for invalid vault configuration", async () => {
    const helmChart = {
      keyVaults: {
        "valid-vault": { secrets: ["secret1"] },
        "incomplete-vault": {}, // Missing secrets
      },
    };

    mockReadFileSync.mockReturnValue("helm-chart-content");
    mockYamlLoad.mockReturnValue(helmChart);
    mockClient.getSecret.mockResolvedValue({ value: "value1" });

    await addFromAzureVault(config, { pathToHelmChart: "/path/to/chart.yaml" });

    expect(consoleWarnSpy).toHaveBeenCalledWith("Azure Vault: Invalid vault configuration, missing name or secrets");
    expect(config).toEqual({
      existing: "value",
      secret1: "value1",
    });
  });

  it("should throw error when secret retrieval fails", async () => {
    const helmChart = {
      keyVaults: {
        "test-vault": {
          secrets: ["failing-secret"],
        },
      },
    };

    mockReadFileSync.mockReturnValue("helm-chart-content");
    mockYamlLoad.mockReturnValue(helmChart);
    mockClient.getSecret.mockRejectedValue(new Error("Access denied"));

    await expect(addFromAzureVault(config, { pathToHelmChart: "/path/to/chart.yaml" })).rejects.toThrow(
      "Azure Key Vault: Vault 'test-vault': Failed to retrieve secret failing-secret: Access denied",
    );
  });

  it("should provide cleaner error message for permission errors", async () => {
    const helmChart = {
      keyVaults: {
        "test-vault": {
          secrets: ["redis-access-key"],
        },
      },
    };

    mockReadFileSync.mockReturnValue("helm-chart-content");
    mockYamlLoad.mockReturnValue(helmChart);
    const permissionError: any = new Error("The user does not have secrets get permission");
    permissionError.statusCode = 403;
    mockClient.getSecret.mockRejectedValue(permissionError);

    await expect(addFromAzureVault(config, { pathToHelmChart: "/path/to/chart.yaml" })).rejects.toThrow(
      "Azure Key Vault: Vault 'test-vault': Could not load secret 'redis-access-key'. Check it exists and you have access to it.",
    );
  });

  it("should throw error when secret has no value", async () => {
    const helmChart = {
      keyVaults: {
        "test-vault": {
          secrets: ["empty-secret"],
        },
      },
    };

    mockReadFileSync.mockReturnValue("helm-chart-content");
    mockYamlLoad.mockReturnValue(helmChart);
    mockClient.getSecret.mockResolvedValue({ value: null });

    await expect(addFromAzureVault(config, { pathToHelmChart: "/path/to/chart.yaml" })).rejects.toThrow(
      "Azure Key Vault: Vault 'test-vault': Failed to retrieve secret empty-secret: Secret empty-secret has no value",
    );
  });

  it("should normalize secret names when no alias provided", async () => {
    const helmChart = {
      keyVaults: {
        "test-vault": {
          secrets: ["secret-with-dashes", "secret.with.dots"],
        },
      },
    };

    mockReadFileSync.mockReturnValue("helm-chart-content");
    mockYamlLoad.mockReturnValue(helmChart);
    mockClient.getSecret.mockResolvedValueOnce({ value: "value1" }).mockResolvedValueOnce({ value: "value2" });

    await addFromAzureVault(config, { pathToHelmChart: "/path/to/chart.yaml" });

    expect(config).toEqual({
      existing: "value",
      secret_with_dashes: "value1",
      secret_with_dots: "value2",
    });
  });
});
