import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configurePropertiesVolume as setupPropertiesVolume } from "./properties.js";

// Mock file system modules
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe("configurePropertiesVolume", () => {
  let config: Record<string, any>;
  let consoleWarnSpy: any;

  beforeEach(() => {
    config = { existing: "value" };
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.clearAllMocks();
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
      secret2: "value2",
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
      "custom-secret": "custom-value",
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
      secret1: "value1",
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
      existing: "new-value", // Should overwrite existing value
    });
  });

  it("should trim whitespace from file contents", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["secret"]);
    mockReadFileSync.mockReturnValue("  value with spaces  \n");

    await setupPropertiesVolume(config);

    expect(config).toEqual({
      existing: "value",
      secret: "value with spaces",
    });
  });
});
