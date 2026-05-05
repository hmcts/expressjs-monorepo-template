import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "glob";
import type { UserConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

/**
 * Base Vite configuration for HMCTS applications
 * Provides sensible defaults for building assets with GOV.UK Frontend
 */
export function createBaseViteConfig(assetsPath: string): UserConfig {
  const entries = getEntries(assetsPath);
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
      devSourcemap: true,
      // GOV.UK Frontend contains legacy IE hacks (e.g. @media (min-width: 0\0)) that LightningCSS rejects
      lightningcss: {
        errorRecovery: true
      }
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

function getEntries(assetsPath: string): Record<string, string> {
  const entries: Record<string, string> = {};
  const resolved = resolve(assetsPath);

  if (existsSync(resolved)) {
    const jsFiles = glob.sync(resolve(resolved, "js/*.ts")).filter((f) => !f.endsWith(".d.ts"));
    const cssFiles = glob.sync(resolve(resolved, "css/*.scss"));

    for (const asset of [...jsFiles, ...cssFiles]) {
      const fileName = asset.split("/").pop()!;
      const baseName = fileName.replace(/\.(ts|scss)$/, "");
      const fileType = fileName.endsWith(".ts") ? "js" : "css";
      entries[`${baseName}_${fileType}`] = asset;
    }
  }

  return entries;
}
