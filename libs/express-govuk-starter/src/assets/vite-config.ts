import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "glob";
import type { UserConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

/**
 * Base Vite configuration for HMCTS applications
 * Provides sensible defaults for building assets with GOV.UK Frontend
 */
export function createBaseViteConfig(modulesPaths: string[]): UserConfig {
  const entries = getEntries(modulesPaths);
  return {
    build: {
      outDir: "dist/assets",
      emptyOutDir: true,
      rollupOptions: {
        input: entries,
        output: {
          entryFileNames: "js/[name]-[hash].js",
          chunkFileNames: "js/[name]-[hash].js",
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith(".css")) {
              return "css/[name]-[hash][extname]";
            }
            return "assets/[name]-[hash][extname]";
          }
        }
      },
      sourcemap: process.env.NODE_ENV !== "production",
      minify: process.env.NODE_ENV === "production",
      manifest: true
    },
    css: {
      preprocessorOptions: {
        scss: {
          quietDeps: true,
          loadPaths: ["node_modules"]
        }
      },
      devSourcemap: true
    },
    resolve: {
      extensions: [".ts", ".js", ".scss", ".css"],
      preserveSymlinks: true
    },
    publicDir: false,
    plugins: [
      viteStaticCopy({
        targets: [
          {
            // Copy GOV.UK Frontend fonts
            src: "../../node_modules/govuk-frontend/dist/govuk/assets/fonts/*",
            dest: "fonts"
          },
          {
            // Copy GOV.UK Frontend images
            src: "../../node_modules/govuk-frontend/dist/govuk/assets/images/*",
            dest: "images"
          },
          {
            // Copy GOV.UK Frontend manifest.json
            src: "../../node_modules/govuk-frontend/dist/govuk/assets/manifest.json",
            dest: "."
          }
        ]
      })
    ]
  };
}

function getEntries(modulePaths: string[]): Record<string, string> {
  // Build entries for all modules that have assets
  const entries: Record<string, string> = {};
  for (const modulePath of modulePaths) {
    const assetsPath = resolve(modulePath);

    if (existsSync(assetsPath)) {
      const jsFiles = glob.sync(resolve(assetsPath, "js/*.ts")).filter((f) => !f.endsWith(".d.ts"));
      const cssFiles = glob.sync(resolve(assetsPath, "css/*.scss"));
      const moduleAssets = [...jsFiles, ...cssFiles];

      for (const asset of moduleAssets) {
        const fileName = asset.split("/").pop()!;
        const baseName = fileName.replace(/\.(ts|scss)$/, "");
        const fileType = fileName.endsWith(".ts") ? "js" : "css";

        entries[`${baseName}_${fileType}`] = asset;
      }
    }
  }

  return entries;
}
