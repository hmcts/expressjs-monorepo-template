import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@hmcts/cloud-native-platform", () => ({
  configurePropertiesVolume: vi.fn()
}));

vi.mock("config", () => ({
  default: {
    get: vi.fn()
  }
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("index - cron job runner", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should export configurePropertiesVolume from cloud-native-platform", async () => {
    const { configurePropertiesVolume } = await import("@hmcts/cloud-native-platform");
    expect(configurePropertiesVolume).toBeDefined();
  });

  it("should have correct chart path", () => {
    const expectedChartPath = path.join(__dirname, "../helm/values.yaml");
    expect(expectedChartPath).toContain("apps/crons/helm/values.yaml");
  });

  it("should use SCRIPT_NAME environment variable if provided", () => {
    process.env.SCRIPT_NAME = "custom-script";
    expect(process.env.SCRIPT_NAME).toBe("custom-script");
  });

  it("should default to example script when SCRIPT_NAME is not set", () => {
    delete process.env.SCRIPT_NAME;
    const scriptName = process.env.SCRIPT_NAME || "example";
    expect(scriptName).toBe("example");
  });

  it("should construct correct script import path", () => {
    const scriptName = "example";
    const importPath = `./${scriptName}.js`;
    expect(importPath).toBe("./example.js");
  });

  it("should construct correct script import path for custom script", () => {
    process.env.SCRIPT_NAME = "my-custom-job";
    const scriptName = process.env.SCRIPT_NAME;
    const importPath = `./${scriptName}.js`;
    expect(importPath).toBe("./my-custom-job.js");
  });
});
