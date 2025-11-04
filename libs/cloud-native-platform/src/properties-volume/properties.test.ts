import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPropertiesVolumeSecrets } from "./properties.js";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn()
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe("getPropertiesVolumeSecrets", () => {
  let consoleWarnSpy: any;
  let originalProcessEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
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
});
