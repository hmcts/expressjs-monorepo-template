import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPropertiesVolumeSecrets } from "./properties.js";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn()
}));

vi.mock("./azure-vault.js", () => ({
  addFromAzureVault: vi.fn()
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);

// Import after mocking
const { addFromAzureVault } = await import("./azure-vault.js");
const mockAddFromAzureVault = vi.mocked(addFromAzureVault);

describe("getPropertiesVolumeSecrets", () => {
  let consoleWarnSpy: any;
  let originalProcessEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockClear();
    mockReaddirSync.mockClear();
    mockReadFileSync.mockClear();
    mockAddFromAzureVault.mockClear();
    originalProcessEnv = { ...process.env };
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    process.env = originalProcessEnv;
  });

  it("should read secrets from vault subdirectories with prefixed keys", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValueOnce([{ name: "dtsse", isDirectory: () => true, isFile: () => false }] as any);
    mockReaddirSync.mockReturnValueOnce([
      { name: "DATABASE_URL", isFile: () => true },
      { name: "APPLICATION_INSIGHTS_CONNECTION_STRING", isFile: () => true }
    ] as any);
    mockReadFileSync.mockReturnValueOnce("postgresql://localhost:5432/db").mockReturnValueOnce("InstrumentationKey=abc123");

    const secrets = await getPropertiesVolumeSecrets({ injectEnvVars: false });

    expect(secrets).toEqual({
      "dtsse.DATABASE_URL": "postgresql://localhost:5432/db",
      "dtsse.APPLICATION_INSIGHTS_CONNECTION_STRING": "InstrumentationKey=abc123"
    });
  });

  it("should inject secrets into process.env when injectEnvVars is true", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValueOnce([{ name: "dtsse", isDirectory: () => true, isFile: () => false }] as any);
    mockReaddirSync.mockReturnValueOnce([
      { name: "DATABASE_URL", isFile: () => true },
      { name: "API_KEY", isFile: () => true }
    ] as any);
    mockReadFileSync.mockReturnValueOnce("postgresql://localhost:5432/db").mockReturnValueOnce("secret-key");

    const secrets = await getPropertiesVolumeSecrets({ injectEnvVars: true });

    expect(secrets).toEqual({
      "dtsse.DATABASE_URL": "postgresql://localhost:5432/db",
      "dtsse.API_KEY": "secret-key"
    });
    expect(process.env.DATABASE_URL).toBe("postgresql://localhost:5432/db");
    expect(process.env.API_KEY).toBe("secret-key");
  });

  it("should not inject into process.env when injectEnvVars is false", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValueOnce([{ name: "dtsse", isDirectory: () => true, isFile: () => false }] as any);
    mockReaddirSync.mockReturnValueOnce([{ name: "SECRET_KEY", isFile: () => true }] as any);
    mockReadFileSync.mockReturnValueOnce("my-secret");

    delete process.env.SECRET_KEY;
    const secrets = await getPropertiesVolumeSecrets({ injectEnvVars: false });

    expect(secrets).toEqual({
      "dtsse.SECRET_KEY": "my-secret"
    });
    expect(process.env.SECRET_KEY).toBeUndefined();
  });

  it("should handle direct files without vault subdirectories", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValueOnce([{ name: "direct-secret", isDirectory: () => false, isFile: () => true }] as any);
    mockReadFileSync.mockReturnValueOnce("direct-value");

    const secrets = await getPropertiesVolumeSecrets({ injectEnvVars: false });

    expect(secrets).toEqual({
      "direct-secret": "direct-value"
    });
  });

  it("should handle mixed vault directories and direct files", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValueOnce([
      { name: "vault1", isDirectory: () => true, isFile: () => false },
      { name: "direct-file", isDirectory: () => false, isFile: () => true }
    ] as any);
    mockReaddirSync.mockReturnValueOnce([{ name: "secret1", isFile: () => true }] as any);
    mockReadFileSync.mockReturnValueOnce("vault-value").mockReturnValueOnce("direct-value");

    const secrets = await getPropertiesVolumeSecrets({ injectEnvVars: false });

    expect(secrets).toEqual({
      "vault1.secret1": "vault-value",
      "direct-file": "direct-value"
    });
  });

  it("should return empty object when mount point does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const secrets = await getPropertiesVolumeSecrets({ failOnError: false });

    expect(secrets).toEqual({});
    expect(consoleWarnSpy).toHaveBeenCalledWith("Warning: Mount point /mnt/secrets does not exist");
  });

  it("should throw error when mount point does not exist and failOnError is true", async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(getPropertiesVolumeSecrets({ failOnError: true })).rejects.toThrow("Mount point /mnt/secrets does not exist");
  });

  it("should handle file read errors when failOnError is false", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValueOnce([{ name: "dtsse", isDirectory: () => true, isFile: () => false }] as any);
    mockReaddirSync.mockReturnValueOnce([
      { name: "good-secret", isFile: () => true },
      { name: "bad-secret", isFile: () => true }
    ] as any);
    mockReadFileSync.mockReturnValueOnce("good-value").mockImplementationOnce(() => {
      throw new Error("Permission denied");
    });

    const secrets = await getPropertiesVolumeSecrets({ failOnError: false });

    expect(secrets).toEqual({
      "dtsse.good-secret": "good-value"
    });
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Warning: Failed to read"));
  });

  it("should throw error when file read fails and failOnError is true", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValueOnce([{ name: "dtsse", isDirectory: () => true, isFile: () => false }] as any);
    mockReaddirSync.mockReturnValueOnce([{ name: "bad-secret", isFile: () => true }] as any);
    mockReadFileSync.mockImplementation(() => {
      throw new Error("Permission denied");
    });

    await expect(getPropertiesVolumeSecrets({ failOnError: true })).rejects.toThrow();
  });

  it("should trim whitespace from file contents", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValueOnce([{ name: "dtsse", isDirectory: () => true, isFile: () => false }] as any);
    mockReaddirSync.mockReturnValueOnce([{ name: "SECRET", isFile: () => true }] as any);
    mockReadFileSync.mockReturnValueOnce("  secret value  \n");

    const secrets = await getPropertiesVolumeSecrets({ injectEnvVars: false });

    expect(secrets).toEqual({
      "dtsse.SECRET": "secret value"
    });
  });

  it("should skip non-file entries within vault directories", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValueOnce([{ name: "dtsse", isDirectory: () => true, isFile: () => false }] as any);
    mockReaddirSync.mockReturnValueOnce([
      { name: "secret", isFile: () => true },
      { name: "subdirectory", isFile: () => false }
    ] as any);
    mockReadFileSync.mockReturnValueOnce("secret-value");

    const secrets = await getPropertiesVolumeSecrets({ injectEnvVars: false });

    expect(secrets).toEqual({
      "dtsse.secret": "secret-value"
    });
  });

  it("should use custom mount point", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValueOnce([{ name: "vault", isDirectory: () => true, isFile: () => false }] as any);
    mockReaddirSync.mockReturnValueOnce([{ name: "SECRET", isFile: () => true }] as any);
    mockReadFileSync.mockReturnValueOnce("value");

    const secrets = await getPropertiesVolumeSecrets({ mountPoint: "/custom/path", injectEnvVars: false });

    expect(mockExistsSync).toHaveBeenCalledWith("/custom/path");
    expect(secrets).toEqual({
      "vault.SECRET": "value"
    });
  });

  it("should default failOnError to true in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    mockExistsSync.mockReturnValue(false);

    await expect(getPropertiesVolumeSecrets()).rejects.toThrow("Mount point /mnt/secrets does not exist");

    process.env.NODE_ENV = originalEnv;
  });

  it("should default injectEnvVars to true", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValueOnce([{ name: "dtsse", isDirectory: () => true, isFile: () => false }] as any);
    mockReaddirSync.mockReturnValueOnce([{ name: "TEST_VAR", isFile: () => true }] as any);
    mockReadFileSync.mockReturnValueOnce("test-value");

    delete process.env.TEST_VAR;
    await getPropertiesVolumeSecrets();

    expect(process.env.TEST_VAR).toBe("test-value");
  });

  describe("Azure Vault integration", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it("should load secrets from Azure Vault when chartPath is provided in non-production", async () => {
      process.env.NODE_ENV = "development";
      mockExistsSync.mockReturnValue(true);
      mockAddFromAzureVault.mockImplementation(async (config) => {
        config.DATABASE_URL = "postgresql://azure:5432/db";
        config.API_KEY = "azure-api-key";
      });

      const secrets = await getPropertiesVolumeSecrets({
        chartPath: "/path/to/chart.yaml",
        injectEnvVars: false
      });

      expect(mockAddFromAzureVault).toHaveBeenCalledWith(expect.any(Object), {
        pathToHelmChart: "/path/to/chart.yaml"
      });
      expect(secrets).toEqual({
        DATABASE_URL: "postgresql://azure:5432/db",
        API_KEY: "azure-api-key"
      });
    });

    it("should inject env vars from Azure Vault when injectEnvVars is true", async () => {
      process.env.NODE_ENV = "development";
      mockExistsSync.mockReturnValue(true);
      mockAddFromAzureVault.mockImplementation(async (config) => {
        config.AZURE_SECRET = "azure-value";
      });

      delete process.env.AZURE_SECRET;
      const secrets = await getPropertiesVolumeSecrets({
        chartPath: "/path/to/chart.yaml",
        injectEnvVars: true
      });

      expect(secrets).toEqual({
        AZURE_SECRET: "azure-value"
      });
      expect(process.env.AZURE_SECRET).toBe("azure-value");
    });

    it("should not inject env vars from Azure Vault when injectEnvVars is false", async () => {
      process.env.NODE_ENV = "development";
      mockExistsSync.mockReturnValue(true);
      mockAddFromAzureVault.mockImplementation(async (config) => {
        config.AZURE_SECRET = "azure-value";
      });

      delete process.env.AZURE_SECRET;
      const secrets = await getPropertiesVolumeSecrets({
        chartPath: "/path/to/chart.yaml",
        injectEnvVars: false
      });

      expect(secrets).toEqual({
        AZURE_SECRET: "azure-value"
      });
      expect(process.env.AZURE_SECRET).toBeUndefined();
    });

    it("should skip omitted secrets from Azure Vault", async () => {
      process.env.NODE_ENV = "development";
      mockExistsSync.mockReturnValue(true);
      mockAddFromAzureVault.mockImplementation(async (config) => {
        config.DATABASE_URL = "postgresql://azure:5432/db";
        config.OMIT_ME = "should-not-appear";
        config.API_KEY = "azure-api-key";
      });

      const secrets = await getPropertiesVolumeSecrets({
        chartPath: "/path/to/chart.yaml",
        injectEnvVars: false,
        omit: ["OMIT_ME"]
      });

      expect(secrets).toEqual({
        DATABASE_URL: "postgresql://azure:5432/db",
        API_KEY: "azure-api-key"
      });
    });

    it("should not use Azure Vault in production even with chartPath", async () => {
      process.env.NODE_ENV = "production";
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValueOnce([{ name: "vault", isDirectory: () => true, isFile: () => false }] as any);
      mockReaddirSync.mockReturnValueOnce([{ name: "SECRET", isFile: () => true }] as any);
      mockReadFileSync.mockReturnValueOnce("mount-point-value");

      const secrets = await getPropertiesVolumeSecrets({
        chartPath: "/path/to/chart.yaml",
        injectEnvVars: false
      });

      expect(mockAddFromAzureVault).not.toHaveBeenCalled();
      expect(secrets).toEqual({
        "vault.SECRET": "mount-point-value"
      });
    });

    it("should not use Azure Vault when chartPath does not exist", async () => {
      process.env.NODE_ENV = "development";
      mockExistsSync.mockReturnValueOnce(false); // chartPath does not exist
      mockExistsSync.mockReturnValueOnce(true); // mount point exists
      mockReaddirSync.mockReturnValueOnce([{ name: "vault", isDirectory: () => true, isFile: () => false }] as any);
      mockReaddirSync.mockReturnValueOnce([{ name: "SECRET", isFile: () => true }] as any);
      mockReadFileSync.mockReturnValueOnce("mount-point-value");

      const secrets = await getPropertiesVolumeSecrets({
        chartPath: "/path/to/nonexistent.yaml",
        injectEnvVars: false
      });

      expect(mockAddFromAzureVault).not.toHaveBeenCalled();
      expect(secrets).toEqual({
        "vault.SECRET": "mount-point-value"
      });
    });
  });

  describe("omit parameter", () => {
    it("should omit direct file by exact name", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValueOnce([
        { name: "keep-this", isDirectory: () => false, isFile: () => true },
        { name: "omit-this", isDirectory: () => false, isFile: () => true }
      ] as any);
      // Only keep-this is read since omit-this is omitted
      mockReadFileSync.mockReturnValueOnce("keep-value");

      const secrets = await getPropertiesVolumeSecrets({
        injectEnvVars: false,
        omit: ["omit-this"]
      });

      expect(secrets).toEqual({
        "keep-this": "keep-value"
      });
    });

    it("should omit vault secret by full key", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValueOnce([{ name: "vault", isDirectory: () => true, isFile: () => false }] as any);
      mockReaddirSync.mockReturnValueOnce([
        { name: "SECRET1", isFile: () => true },
        { name: "SECRET2", isFile: () => true }
      ] as any);
      // Only SECRET2 is read since SECRET1 is omitted
      mockReadFileSync.mockReturnValueOnce("value2");

      const secrets = await getPropertiesVolumeSecrets({
        injectEnvVars: false,
        omit: ["vault.SECRET1"]
      });

      expect(secrets).toEqual({
        "vault.SECRET2": "value2"
      });
    });

    it("should omit vault secret by last segment", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValueOnce([{ name: "vault", isDirectory: () => true, isFile: () => false }] as any);
      mockReaddirSync.mockReturnValueOnce([
        { name: "DATABASE_URL", isFile: () => true },
        { name: "API_KEY", isFile: () => true }
      ] as any);
      // Only API_KEY is read since DATABASE_URL is omitted
      mockReadFileSync.mockReturnValueOnce("api-value");

      const secrets = await getPropertiesVolumeSecrets({
        injectEnvVars: false,
        omit: ["DATABASE_URL"]
      });

      expect(secrets).toEqual({
        "vault.API_KEY": "api-value"
      });
    });

    it("should omit multiple secrets", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValueOnce([{ name: "vault", isDirectory: () => true, isFile: () => false }] as any);
      mockReaddirSync.mockReturnValueOnce([
        { name: "SECRET1", isFile: () => true },
        { name: "SECRET2", isFile: () => true },
        { name: "SECRET3", isFile: () => true }
      ] as any);
      // Only SECRET2 is read since SECRET1 and SECRET3 are omitted
      mockReadFileSync.mockReturnValueOnce("value2");

      const secrets = await getPropertiesVolumeSecrets({
        injectEnvVars: false,
        omit: ["SECRET1", "vault.SECRET3"]
      });

      expect(secrets).toEqual({
        "vault.SECRET2": "value2"
      });
    });

    it("should not omit when omit array is empty", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValueOnce([{ name: "vault", isDirectory: () => true, isFile: () => false }] as any);
      mockReaddirSync.mockReturnValueOnce([
        { name: "SECRET1", isFile: () => true },
        { name: "SECRET2", isFile: () => true }
      ] as any);
      mockReadFileSync.mockReturnValueOnce("value1").mockReturnValueOnce("value2");

      const secrets = await getPropertiesVolumeSecrets({
        injectEnvVars: false,
        omit: []
      });

      expect(secrets).toEqual({
        "vault.SECRET1": "value1",
        "vault.SECRET2": "value2"
      });
    });
  });

  describe("top-level error handling", () => {
    it("should handle errors when processing top-level entries with failOnError=false", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValueOnce([
        { name: "good-file", isDirectory: () => false, isFile: () => true },
        {
          name: "bad-entry",
          isDirectory: () => {
            throw new Error("Cannot determine if directory");
          },
          isFile: () => false
        }
      ] as any);
      mockReadFileSync.mockReturnValueOnce("good-value");

      const secrets = await getPropertiesVolumeSecrets({ failOnError: false });

      expect(secrets).toEqual({
        "good-file": "good-value"
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Warning: Failed to process"));
    });

    it("should throw error when processing top-level entries with failOnError=true", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValueOnce([
        {
          name: "bad-entry",
          isDirectory: () => {
            throw new Error("Cannot determine if directory");
          },
          isFile: () => false
        }
      ] as any);

      await expect(getPropertiesVolumeSecrets({ failOnError: true })).rejects.toThrow(
        "Failed to load secrets from /mnt/secrets"
      );
    });
  });
});
