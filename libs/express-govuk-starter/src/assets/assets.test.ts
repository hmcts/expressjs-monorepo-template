import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock modules before any imports
vi.mock("node:fs");
vi.mock("node:path");

describe("assets", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    // Important: Reset modules to clear the manifest cache between tests
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe("createAssetHelpers", () => {
    describe("development mode", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "development";
      });

      it("should return development paths for asset entries", async () => {
        const { createAssetHelpers } = await import("./assets.js");
        const entries = {
          mainJs: "js/main.ts",
          mainCss: "css/main.scss"
        };
        const distPath = "/dist";

        const helpers = createAssetHelpers(entries, distPath);

        expect(helpers.mainJs).toBe("/js/main.ts");
        expect(helpers.mainCss).toBe("/css/main.scss");
      });

      it("should handle empty entries", async () => {
        const { createAssetHelpers } = await import("./assets.js");
        const entries = {};
        const distPath = "/dist";

        const helpers = createAssetHelpers(entries, distPath);

        expect(helpers).toEqual({});
      });

      it("should handle nested paths", async () => {
        const { createAssetHelpers } = await import("./assets.js");
        const entries = {
          component: "components/header/index.ts"
        };
        const distPath = "/dist";

        const helpers = createAssetHelpers(entries, distPath);

        expect(helpers.component).toBe("/components/header/index.ts");
      });
    });

    describe("production mode", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "production";
      });

      it("should load manifest and return hashed filenames", async () => {
        const manifestContent = JSON.stringify({
          "src/assets/js/main.ts": {
            file: "js/main-abc123.js",
            isEntry: true
          },
          "src/assets/css/main.scss": {
            file: "css/main-def456.css",
            isEntry: true
          }
        });

        vi.mocked(path.join).mockReturnValue("/dist/assets/.vite/manifest.json");
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(manifestContent);

        const { createAssetHelpers } = await import("./assets.js");
        const entries = {
          mainJs: "js/main.ts",
          mainCss: "css/main.scss"
        };
        const distPath = "/dist";

        const helpers = createAssetHelpers(entries, distPath);

        expect(helpers.mainJs).toBe("/assets/js/main-abc123.js");
        expect(helpers.mainCss).toBe("/assets/css/main-def456.css");
      });

      it("should fallback to entry path if not in manifest", async () => {
        const manifestContent = JSON.stringify({
          "src/assets/js/other.ts": {
            file: "js/other-xyz789.js"
          }
        });

        vi.mocked(path.join).mockReturnValue("/dist/assets/.vite/manifest.json");
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(manifestContent);

        const { createAssetHelpers } = await import("./assets.js");
        const entries = {
          mainJs: "js/main.ts"
        };
        const distPath = "/dist";

        const helpers = createAssetHelpers(entries, distPath);

        expect(helpers.mainJs).toBe("/assets/js/main.ts");
      });

      it("should handle missing manifest file", async () => {
        vi.mocked(path.join).mockReturnValue("/dist/assets/.vite/manifest.json");
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const { createAssetHelpers } = await import("./assets.js");
        const entries = {
          mainJs: "js/main.ts"
        };
        const distPath = "/dist";

        const helpers = createAssetHelpers(entries, distPath);

        expect(helpers.mainJs).toBe("/assets/js/main.ts");
      });

      it("should handle corrupt manifest file", async () => {
        const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        vi.mocked(path.join).mockReturnValue("/dist/assets/.vite/manifest.json");
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue("not valid json");

        const { createAssetHelpers } = await import("./assets.js");
        const entries = {
          mainJs: "js/main.ts"
        };
        const distPath = "/dist";

        const helpers = createAssetHelpers(entries, distPath);

        expect(helpers.mainJs).toBe("/assets/js/main.ts");
        expect(consoleWarnSpy).toHaveBeenCalledWith("Failed to load Vite manifest:", expect.any(Error));

        consoleWarnSpy.mockRestore();
      });

      it("should cache manifest across multiple calls", async () => {
        const manifestContent = JSON.stringify({
          "src/assets/js/main.ts": {
            file: "js/main-abc123.js"
          }
        });

        vi.mocked(path.join).mockReturnValue("/dist/assets/.vite/manifest.json");
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(manifestContent);

        const { createAssetHelpers } = await import("./assets.js");
        const entries1 = { mainJs: "js/main.ts" };
        const entries2 = { otherJs: "js/other.ts" };
        const distPath = "/dist";

        // First call should read the manifest
        createAssetHelpers(entries1, distPath);
        expect(fs.readFileSync).toHaveBeenCalledTimes(1);

        // Second call should use cached manifest
        createAssetHelpers(entries2, distPath);
        expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      });

      it("should handle filesystem errors", async () => {
        const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        vi.mocked(path.join).mockReturnValue("/dist/assets/.vite/manifest.json");
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation(() => {
          throw new Error("Permission denied");
        });

        const { createAssetHelpers } = await import("./assets.js");
        const entries = {
          mainJs: "js/main.ts"
        };
        const distPath = "/dist";

        const helpers = createAssetHelpers(entries, distPath);

        expect(helpers.mainJs).toBe("/assets/js/main.ts");
        expect(consoleWarnSpy).toHaveBeenCalledWith("Failed to load Vite manifest:", expect.objectContaining({ message: "Permission denied" }));

        consoleWarnSpy.mockRestore();
      });
    });

    describe("edge cases", () => {
      it("should handle entries with special characters", async () => {
        process.env.NODE_ENV = "development";

        const { createAssetHelpers } = await import("./assets.js");
        const entries = {
          "entry-with-dash": "js/entry-with-dash.ts",
          entry_with_underscore: "js/entry_with_underscore.ts"
        };
        const distPath = "/dist";

        const helpers = createAssetHelpers(entries, distPath);

        expect(helpers["entry-with-dash"]).toBe("/js/entry-with-dash.ts");
        expect(helpers.entry_with_underscore).toBe("/js/entry_with_underscore.ts");
      });

      it("should handle absolute paths in entries", async () => {
        process.env.NODE_ENV = "development";

        const { createAssetHelpers } = await import("./assets.js");
        const entries = {
          absolute: "/absolute/path/to/file.ts"
        };
        const distPath = "/dist";

        const helpers = createAssetHelpers(entries, distPath);

        expect(helpers.absolute).toBe("//absolute/path/to/file.ts");
      });

      it("should handle entries without file extensions", async () => {
        process.env.NODE_ENV = "development";

        const { createAssetHelpers } = await import("./assets.js");
        const entries = {
          noExt: "js/main"
        };
        const distPath = "/dist";

        const helpers = createAssetHelpers(entries, distPath);

        expect(helpers.noExt).toBe("/js/main");
      });
    });
  });
});
