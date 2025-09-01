import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import express from "express";
import type nunjucks from "nunjucks";
import type { ViteDevServer } from "vite";
import type { AssetOptions } from "./assets.js";
import { createAssetHelpers } from "./assets.js";

let viteServer: ViteDevServer | null = null;

/**
 * Configure asset handling for development and production
 */
export async function configureAssets(app: Express, env: nunjucks.Environment, options: AssetOptions): Promise<void> {
  const { viteRoot, distPath, entries } = options;
  const isProduction = process.env.NODE_ENV === "production";

  if (!isProduction) {
    // Serve GOV.UK Frontend assets in development (before Vite middleware)
    // Find the GOV.UK Frontend package reliably using import.meta.url
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const govukFrontendPath = path.join(currentDir, "../../../../node_modules/govuk-frontend/dist/govuk/assets");

    app.use("/assets/fonts", express.static(path.join(govukFrontendPath, "fonts")));
    app.use("/assets/images", express.static(path.join(govukFrontendPath, "images")));
    app.use("/assets/manifest.json", express.static(govukFrontendPath));

    // Also serve app-specific images in development
    const appImagesPath = path.join(viteRoot, "images");
    app.use("/assets/images", express.static(appImagesPath));

    // Set up HMR and vite asset loading in dev mode
    const { createServer } = await import("vite");
    viteServer = await createServer({
      server: { middlewareMode: true },
      appType: "custom",
      root: viteRoot,
      css: {
        preprocessorOptions: {
          scss: {
            quietDeps: true,
            silenceDeprecations: ["mixed-decls"]
          }
        }
      }
    });

    app.use(viteServer.middlewares);
    app.locals.vite = viteServer;
  } else {
    // Serve static assets from dist/assets in production
    app.use("/assets", express.static(path.join(distPath, "assets")));
  }

  // Register asset helpers as Nunjucks globals
  const assetHelpers = createAssetHelpers(entries, distPath);
  Object.entries(assetHelpers).forEach(([name, value]) => {
    env.addGlobal(name, value);
  });

  /**
   * Clean up Vite server on process exit
   */
  process.on("SIGTERM", async () => {
    if (viteServer) {
      await viteServer.close();
    }
  });
}
