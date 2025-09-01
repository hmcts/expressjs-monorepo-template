import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Express } from "express";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureGovuk } from "./configure-govuk.js";

describe("configureGovuk", () => {
  let app: Express;
  let testDir: string;

  beforeEach(() => {
    app = express();
    // Create a temporary test directory for views and assets
    testDir = join(tmpdir(), `test-govuk-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up the test directory
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("should configure nunjucks environment", async () => {
    const env = await configureGovuk(app);

    expect(env).toBeDefined();
    expect(env.addFilter).toBeDefined();
    expect(env.addGlobal).toBeDefined();
    expect(app.get("view engine")).toBe("njk");
  });

  it("should add custom view paths", async () => {
    const customViewPath = join(testDir, "views");
    mkdirSync(customViewPath, { recursive: true });

    const env = await configureGovuk(app, {
      viewPaths: [customViewPath]
    });

    expect(env).toBeDefined();
    // The environment should be configured with the custom view path
    expect(env.loaders).toBeDefined();
  });

  it("should add filters to nunjucks environment", async () => {
    const env = await configureGovuk(app);

    // Check that filters are added
    expect(env.getFilter("date")).toBeDefined();
    expect(env.getFilter("time")).toBeDefined();
    expect(env.getFilter("currency")).toBeDefined();
    expect(env.getFilter("kebabCase")).toBeDefined();
    expect(env.getFilter("govukErrorSummary")).toBeDefined();
  });

  it("should add globals to nunjucks environment", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const env = await configureGovuk(app);

    expect(env.getGlobal("isProduction")).toBe(true);

    process.env.NODE_ENV = originalNodeEnv;
  });

  it("should set up i18n middleware when i18nContentPath is provided", async () => {
    // Create test translation files
    const localesPath = join(testDir, "locales");
    mkdirSync(localesPath, { recursive: true });

    const enContent = `export const content = { welcome: "Welcome" };`;
    const cyContent = `export const content = { welcome: "Croeso" };`;

    writeFileSync(join(localesPath, "en.js"), enContent);
    writeFileSync(join(localesPath, "cy.js"), cyContent);

    const useSpy = vi.spyOn(app, "use");

    await configureGovuk(app, {
      i18nContentPath: localesPath
    });

    // Check that middleware was added
    expect(useSpy).toHaveBeenCalled();
    // Should add locale middleware, render interceptor, and translation middleware
    const middlewareCalls = useSpy.mock.calls;
    expect(middlewareCalls.length).toBeGreaterThanOrEqual(4); // 3 i18n middlewares + pageUrl middleware
  });

  it("should not set up i18n middleware when i18nContentPath is not provided", async () => {
    const useSpy = vi.spyOn(app, "use");

    await configureGovuk(app);

    // Should only add the pageUrl middleware
    const middlewareCalls = useSpy.mock.calls;
    expect(middlewareCalls.length).toBe(1);
  });

  it("should configure assets when assets option is provided", async () => {
    const manifestPath = join(testDir, "manifest.json");
    const manifest = {
      "src/index.js": {
        file: "assets/index-abc123.js",
        css: ["assets/index-def456.css"]
      }
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const assetsPath = join(testDir, "assets");
    mkdirSync(assetsPath, { recursive: true });

    // Create images directory to avoid errors
    const imagesPath = join(testDir, "images");
    mkdirSync(imagesPath, { recursive: true });

    await configureGovuk(app, {
      assets: {
        manifestPath,
        srcPath: testDir,
        publicPath: "/assets/",
        viteRoot: testDir,
        entries: {
          main: "src/index.js" // Add required entries property
        }
      }
    });

    // The assets should be configured (checking that no error was thrown)
    expect(app.get("view engine")).toBe("njk");
  });

  it("should add pageUrl and serviceUrl to res.locals", async () => {
    const useSpy = vi.spyOn(app, "use");

    await configureGovuk(app);

    // Get the last middleware added (pageUrl middleware)
    const lastMiddleware = useSpy.mock.calls[useSpy.mock.calls.length - 1][0] as any;

    // Create mock request and response
    const req = {
      path: "/test/path",
      protocol: "https",
      get: vi.fn((header: string) => {
        if (header === "host") return "example.com";
        return undefined;
      })
    };
    const res = { locals: {} };
    const next = vi.fn();

    // Call the middleware
    lastMiddleware(req, res, next);

    expect(res.locals.pageUrl).toBe("/test/path");
    expect(res.locals.serviceUrl).toBe("https://example.com");
    expect(next).toHaveBeenCalled();
  });

  it("should handle development mode settings", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const env = await configureGovuk(app);

    expect(env.getGlobal("isProduction")).toBe(false);
    // In development, nunjucks should have watch and noCache enabled
    // These are internal to nunjucks configuration

    process.env.NODE_ENV = originalNodeEnv;
  });

  it("should return nunjucks environment", async () => {
    const env = await configureGovuk(app);

    // Verify it's a nunjucks environment
    expect(env).toBeDefined();
    expect(env.addFilter).toBeDefined();
    expect(env.addGlobal).toBeDefined();
    // These are the methods we know exist on the Nunjucks Environment
    expect(env.getFilter).toBeDefined();
    expect(env.getGlobal).toBeDefined();
  });

  it("should handle empty options gracefully", async () => {
    const env = await configureGovuk(app, {});

    expect(env).toBeDefined();
    expect(app.get("view engine")).toBe("njk");
  });

  it("should handle multiple view paths", async () => {
    const viewPath1 = join(testDir, "views1");
    const viewPath2 = join(testDir, "views2");
    mkdirSync(viewPath1, { recursive: true });
    mkdirSync(viewPath2, { recursive: true });

    const env = await configureGovuk(app, {
      viewPaths: [viewPath1, viewPath2]
    });

    expect(env).toBeDefined();
    // Both view paths should be added to the environment
    expect(env.loaders).toBeDefined();
  });
});
