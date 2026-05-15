import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPropertiesVolumeSecrets, hc, healthcheck, monitoringMiddleware } from "@hmcts-cft/cloud-native-platform";
import { configureCookieManager, configureGovuk, configureHelmet, configureNonce, errorHandler, notFoundHandler } from "@hmcts-cft/express-govuk-starter";
import { expressSessionRedis } from "@hmcts-cft/express-session-redis";
import { createSimpleRouter } from "@hmcts-cft/simple-router";
import cookieParser from "cookie-parser";
import type { Express } from "express";
import express from "express";
import { createClient } from "redis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chartPath = path.join(__dirname, "../helm/values.yaml");
const isDev = process.env.NODE_ENV !== "production" && process.env.VITE_MIDDLEWARE !== "false";

export async function createApp(): Promise<Express> {
  await getPropertiesVolumeSecrets({ chartPath, omit: ["DATABASE_URL", "REDIS_URL"] });

  const { default: config } = await import("config");
  const redisConnection = await getRedisClient(config);
  const app = express();

  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(monitoringMiddleware(config.get("applicationInsights")));
  app.use(configureNonce());
  app.use(configureHelmet());
  app.use(expressSessionRedis({ redisConnection }));
  app.use(
    healthcheck({
      checks: {
        redis: hc.raw(() => redisConnection.ping())
      }
    })
  );

  const assetOptions = isDev
    ? {
        entries: {
          index_js: "/src/assets/js/index.ts",
          index_css: "/src/assets/css/index.scss",
          footer_js: "/src/assets/js/footer.ts",
          footer_css: "/src/assets/css/footer.scss",
          onboarding_js: "/src/assets/js/onboarding.ts",
          onboarding_css: "/src/assets/css/onboarding.scss"
        },
        viteConfigFile: path.join(__dirname, "../vite.build.ts")
      }
    : { distPath: path.join(__dirname, "../dist") };

  await configureGovuk(app, [__dirname], {
    nunjucksGlobals: {
      gtm: config.get("gtm"),
      dynatrace: config.get("dynatrace")
    },
    assetOptions
  });

  await configureCookieManager(app, {
    categories: {
      essential: ["connect.sid"],
      analytics: ["_ga", "_gid", "dtCookie", "dtSa", "rxVisitor", "rxvt"],
      preferences: ["language"]
    }
  });

  app.use(await createSimpleRouter({ path: `${__dirname}/pages` }));
  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}

const getRedisClient = async (config: any) => {
  const redisClient = createClient({ url: config.get("redis.url") });
  redisClient.on("error", (err) => console.error("Redis Client Error", err));

  await redisClient.connect();
  return redisClient;
};
