import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseVaultsFromHelmChart } from "./helm-chart.js";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn()
}));

vi.mock("js-yaml", () => ({
  load: vi.fn()
}));

const { load: yamlLoad } = await import("js-yaml");
const mockYamlLoad = vi.mocked(yamlLoad);

describe("parseVaultsFromHelmChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should find keyVaults nested inside arrays and objects", () => {
    mockYamlLoad.mockReturnValue({
      charts: [{ values: { keyVaults: { "array-vault": { secrets: ["a"] } } } }],
      java: { keyVaults: { "object-vault": { secrets: [{ name: "b", alias: "B" }] } } }
    });

    const result = parseVaultsFromHelmChart("/chart.yaml");

    expect(result).toEqual({
      vaults: [
        { name: "array-vault", secrets: [{ name: "a" }] },
        { name: "object-vault", secrets: [{ name: "b", alias: "B" }] }
      ],
      hasKeyVaultsKey: true,
      invalidVaultNames: []
    });
  });

  it("should report no keyVaults key when the chart has none", () => {
    mockYamlLoad.mockReturnValue({ java: { image: "app" } });

    const result = parseVaultsFromHelmChart("/chart.yaml");

    expect(result).toEqual({ vaults: [], hasKeyVaultsKey: false, invalidVaultNames: [] });
  });
});
