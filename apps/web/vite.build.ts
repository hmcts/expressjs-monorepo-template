import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBaseViteConfig } from "@hmcts/express-govuk-starter/src/assets/vite-config.js";
import { assets as footerPagesAssets } from "@hmcts/footer-pages/config";
import { assets as onboardingAssets } from "@hmcts/onboarding/config";
import { defineConfig, mergeConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseConfig = createBaseViteConfig([path.join(__dirname, "src", "assets"), onboardingAssets, footerPagesAssets]);

export default defineConfig(
  mergeConfig(baseConfig, {
    plugins: [
      viteStaticCopy({
        targets: [
          {
            src: "src/pages/**/*.{njk,html}",
            dest: "../pages",
            rename: (_fileName, _fileExtension, fullPath) => {
              // Preserve directory structure by extracting path after 'src/pages/'
              const relativePath = fullPath.split("src/pages/")[1];
              return relativePath;
            }
          },
          {
            // Copy app-specific images
            src: "src/assets/images/**/*",
            dest: "images"
          }
        ]
      })
    ]
  })
);
