import type { UserConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

/**
 * Base Vite configuration for HMCTS applications
 * Provides sensible defaults for building assets with GOV.UK Frontend
 */
export function createBaseViteConfig(): UserConfig {
  return {
    build: {
      outDir: "dist/assets",
      emptyOutDir: true,
      rollupOptions: {
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
    server: {
      middlewareMode: true,
      hmr: {
        port: 5173
      }
    },
    // In dev, Vite serves from root. In production, assets are under /assets/
    base: process.env.NODE_ENV === "production" ? "/assets/" : "/",
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
