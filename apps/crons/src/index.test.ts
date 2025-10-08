import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockConfigurePropertiesVolume = vi.fn();
const mockConfigGet = vi.fn();

vi.mock("@hmcts/cloud-native-platform", () => ({
  configurePropertiesVolume: mockConfigurePropertiesVolume
}));

vi.mock("config", () => ({
  default: {
    get: mockConfigGet
  }
}));

describe("index - cron job runner", () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should configure properties volume with correct chart path", async () => {
    process.env.SCRIPT_NAME = "example";
    const mockExampleScript = vi.fn();

    vi.doMock("./example.js", () => ({
      default: mockExampleScript
    }));

    const { main } = await import("./index.js");
    await main();

    expect(mockConfigurePropertiesVolume).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        chartPath: expect.stringContaining("helm/values.yaml")
      })
    );
  });

  it("should throw error when SCRIPT_NAME is not set", async () => {
    delete process.env.SCRIPT_NAME;

    const { main } = await import("./index.js");

    await expect(main()).rejects.toThrow("SCRIPT_NAME environment variable is required");
  });

  it("should execute custom script when SCRIPT_NAME is provided", async () => {
    process.env.SCRIPT_NAME = "custom-job";
    const mockCustomScript = vi.fn();

    vi.doMock("./custom-job.js", () => ({
      default: mockCustomScript
    }));

    const { main } = await import("./index.js");
    await main();

    expect(mockCustomScript).toHaveBeenCalled();
  });

  it("should throw error when script does not export a default function", async () => {
    process.env.SCRIPT_NAME = "invalid-script";

    vi.doMock("./invalid-script.js", () => ({
      default: null,
      somethingElse: vi.fn()
    }));

    const { main } = await import("./index.js");

    await expect(main()).rejects.toThrow('The script "invalid-script" does not export a default function.');
  });

  it("should throw error when script execution fails", async () => {
    process.env.SCRIPT_NAME = "example";
    const mockError = new Error("Script execution failed");
    const mockFailingScript = vi.fn().mockRejectedValue(mockError);

    vi.doMock("./example.js", () => ({
      default: mockFailingScript
    }));

    const { main } = await import("./index.js");

    await expect(main()).rejects.toThrow("Script execution failed");
  });

  it("should throw error when configurePropertiesVolume fails", async () => {
    process.env.SCRIPT_NAME = "example";
    const mockError = new Error("Config failed");
    mockConfigurePropertiesVolume.mockRejectedValue(mockError);

    const { main } = await import("./index.js");

    await expect(main()).rejects.toThrow("Config failed");
  });
});
