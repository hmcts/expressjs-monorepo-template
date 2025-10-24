import fs, { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from "vitest";
import { addFromAzureVault } from "./azure-vault.js";
import { configurePropertiesVolume as setupPropertiesVolume } from "./properties.js";

// Mock file system modules
vi.mock("node:fs", () => {
  const existsSyncMock = vi.fn();
  const readdirSyncMock = vi.fn();
  const readFileSyncMock = vi.fn();

  return {
    default: {
      existsSync: existsSyncMock
    },
    existsSync: existsSyncMock,
    readdirSync: readdirSyncMock,
    readFileSync: readFileSyncMock
  };
});

// Mock Azure vault module
vi.mock("./azure-vault.js", () => ({
  addFromAzureVault: vi.fn()
}));

const mockFs = fs as any;
const mockExistsSync = existsSync as MockedFunction<any>;
const mockReaddirSync = readdirSync as MockedFunction<any>;
const mockReadFileSync = readFileSync as MockedFunction<any>;
const mockAddFromAzureVault = addFromAzureVault as MockedFunction<any>;

describe("configurePropertiesVolume", () => {
  let config: Record<string, any>;
  let consoleWarnSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    config = { existing: "value" };
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("should add properties from default mount point", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["secret1", "secret2"]);
    mockReadFileSync.mockReturnValueOnce("value1").mockReturnValueOnce("value2  ");

    await setupPropertiesVolume(config);

    expect(mockExistsSync).toHaveBeenCalledWith("/mnt/secrets");
    expect(mockReaddirSync).toHaveBeenCalledWith("/mnt/secrets");
    expect(config).toEqual({
      existing: "value",
      secret1: "value1",
      secret2: "value2"
    });
  });

  it("should add properties from custom mount point", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["custom-secret"]);
    mockReadFileSync.mockReturnValue("custom-value");

    await setupPropertiesVolume(config, { mountPoint: "/custom/path" });

    expect(mockExistsSync).toHaveBeenCalledWith("/custom/path");
    expect(mockReaddirSync).toHaveBeenCalledWith("/custom/path");
    expect(config).toEqual({
      existing: "value",
      "custom-secret": "custom-value"
    });
  });

  it("should throw error when mount point does not exist and failOnError is true", async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(setupPropertiesVolume(config, { failOnError: true })).rejects.toThrow("Mount point /mnt/secrets does not exist");
    expect(config).toEqual({ existing: "value" });
  });

  it("should warn and continue when mount point does not exist and failOnError is false", async () => {
    mockExistsSync.mockReturnValue(false);

    await setupPropertiesVolume(config, { failOnError: false });

    expect(consoleWarnSpy).toHaveBeenCalledWith("Warning: Mount point /mnt/secrets does not exist");
    expect(config).toEqual({ existing: "value" });
  });

  it("should handle file read errors when failOnError is false", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["secret1", "bad-secret"]);
    mockReadFileSync.mockReturnValueOnce("value1").mockImplementationOnce(() => {
      throw new Error("Permission denied");
    });

    await setupPropertiesVolume(config, { failOnError: false });

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Warning: Failed to read property file"));
    expect(config).toEqual({
      existing: "value",
      secret1: "value1"
    });
  });

  it("should throw error when file read fails and failOnError is true", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["bad-secret"]);
    mockReadFileSync.mockImplementation(() => {
      throw new Error("Permission denied");
    });

    await expect(setupPropertiesVolume(config, { failOnError: true })).rejects.toThrow("Failed to read property file");
  });

  it("should merge properties with existing config", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["existing"]);
    mockReadFileSync.mockReturnValue("new-value");

    await setupPropertiesVolume(config);

    expect(config).toEqual({
      existing: "new-value" // Should overwrite existing value
    });
  });

  it("should trim whitespace from file contents", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["secret"]);
    mockReadFileSync.mockReturnValue("  value with spaces  \n");

    await setupPropertiesVolume(config);

    expect(config).toEqual({
      existing: "value",
      secret: "value with spaces"
    });
  });

  describe("Azure Vault integration", () => {
    it("should use Azure vault when chartPath is provided in non-production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      mockExistsSync.mockReturnValue(true);
      mockFs.existsSync.mockReturnValue(true);
      mockAddFromAzureVault.mockResolvedValue(undefined);

      await setupPropertiesVolume(config, { chartPath: "/path/to/chart.yaml" });

      expect(mockAddFromAzureVault).toHaveBeenCalledWith(config, { pathToHelmChart: "/path/to/chart.yaml" });
      expect(mockReaddirSync).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });

    it("should not use Azure vault in production even with chartPath", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      mockExistsSync.mockReturnValue(true);
      mockFs.existsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(["secret"]);
      mockReadFileSync.mockReturnValue("value");

      await setupPropertiesVolume(config, { chartPath: "/path/to/chart.yaml" });

      expect(mockAddFromAzureVault).not.toHaveBeenCalled();
      expect(mockReaddirSync).toHaveBeenCalledWith("/mnt/secrets");
      expect(config).toEqual({
        existing: "value",
        secret: "value"
      });

      process.env.NODE_ENV = originalEnv;
    });

    it("should not use Azure vault when chartPath does not exist", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      mockExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
      mockFs.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
      mockReaddirSync.mockReturnValue(["secret"]);
      mockReadFileSync.mockReturnValue("value");

      await setupPropertiesVolume(config, { chartPath: "/nonexistent/chart.yaml" });

      expect(mockAddFromAzureVault).not.toHaveBeenCalled();
      expect(mockReaddirSync).toHaveBeenCalledWith("/mnt/secrets");
      expect(config).toEqual({
        existing: "value",
        secret: "value"
      });

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("Error handling", () => {
    it("should default failOnError to true in production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      mockExistsSync.mockReturnValue(false);

      await expect(setupPropertiesVolume(config)).rejects.toThrow("Mount point /mnt/secrets does not exist");

      process.env.NODE_ENV = originalEnv;
    });

    it.skip("should default failOnError to false in non-production", async () => {
      // TODO: Fix this test - mocking issue with fs.existsSync
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      mockExistsSync.mockReturnValue(false);
      mockFs.existsSync.mockReturnValue(false);

      await setupPropertiesVolume(config);

      expect(consoleWarnSpy).toHaveBeenCalledWith("Warning: Mount point /mnt/secrets does not exist");
      expect(config).toEqual({ existing: "value" });

      process.env.NODE_ENV = originalEnv;
    });

    it("should handle generic error messages properly", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation(() => {
        throw new Error("Some internal error");
      });

      await expect(setupPropertiesVolume(config, { failOnError: true })).rejects.toThrow("Failed to load properties from /mnt/secrets: Some internal error");
    });

    it("should handle Azure Key Vault specific error messages", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation(() => {
        throw new Error("Azure Key Vault: Specific vault error");
      });

      await expect(setupPropertiesVolume(config, { failOnError: true })).rejects.toThrow("Azure Key Vault: Specific vault error");
    });

    it("should handle errors without message property", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation(() => {
        throw "String error";
      });

      await expect(setupPropertiesVolume(config, { failOnError: true })).rejects.toThrow("Failed to load properties from /mnt/secrets: String error");
    });

    it("should warn when error occurs and failOnError is false", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation(() => {
        throw new Error("Some error");
      });

      await setupPropertiesVolume(config, { failOnError: false });

      expect(consoleWarnSpy).toHaveBeenCalledWith("Warning: Failed to load properties from /mnt/secrets: Some error");
      expect(config).toEqual({ existing: "value" });
    });
  });

  describe("Deep merge behavior", () => {
    it("should handle nested configuration objects", async () => {
      config = {
        existing: "value",
        nested: {
          key1: "old",
          key2: "keep"
        }
      };

      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(["nested.key1", "top"]);
      mockReadFileSync.mockReturnValueOnce("new").mockReturnValueOnce("level");

      await setupPropertiesVolume(config);

      expect(config).toEqual({
        existing: "value",
        nested: {
          key1: "old",
          key2: "keep"
        },
        "nested.key1": "new",
        top: "level"
      });
    });

    it("should handle empty mount point directory", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([]);

      await setupPropertiesVolume(config);

      expect(config).toEqual({ existing: "value" });
    });

    it("should handle files with empty content", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(["empty", "normal"]);
      mockReadFileSync.mockReturnValueOnce("").mockReturnValueOnce("value");

      await setupPropertiesVolume(config);

      expect(config).toEqual({
        existing: "value",
        empty: "",
        normal: "value"
      });
    });
  });
});
