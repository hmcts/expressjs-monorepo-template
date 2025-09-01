import path from "node:path";
import { fileURLToPath } from "node:url";
import { configurePropertiesVolume, healthcheck, monitoringMiddleware } from "@hmcts/cloud-native-platform";
import {
  configureCookieManager,
  configureGovuk,
  configureHelmet,
  configureNonce,
  errorHandler,
  expressSessionRedis,
  notFoundHandler
} from "@hmcts/express-govuk-starter";
import { createSimpleRouter } from "@hmcts/simple-router";
import compression from "compression";
import config from "config";
import cookieParser from "cookie-parser";
import type { Express } from "express";
import express from "express";
import { createClient } from "redis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp(): Promise<Express> {
  await configurePropertiesVolume(config, { chartPath: path.join(__dirname, "../helm/values.yaml") });

  const app = express();

  app.use(compression());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(healthcheck());
  app.use(monitoringMiddleware(config.get("applicationInsights")));
  app.use(configureNonce());
  app.use(configureHelmet());
  app.use(expressSessionRedis({ redisConnection: await getRedisClient() }));

  await configureGovuk(app, {
    i18nContentPath: path.join(__dirname, "locales"),
    viewPaths: [path.join(__dirname, "pages/")],
    assets: {
      viteRoot: path.join(__dirname, "assets"),
      distPath: path.join(__dirname, "../dist"),
      entries: {
        jsEntry: "js/index.ts",
        cssEntry: "css/index.scss"
      }
    },
    nunjucksGlobals: {
      gtm: config.get("gtm"),
      dynatrace: config.get("dynatrace")
    }
  });

  await configureCookieManager(app, {
    categories: {
      essential: ["connect.sid"],
      analytics: ["_ga", "_gid", "dtCookie", "dtSa", "rxVisitor", "rxvt"],
      preferences: ["language"]
    }
  });

  app.use(await createSimpleRouter({ pagesDir: path.join(__dirname, "/pages") }));
  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}

const getRedisClient = async () => {
  const redisClient = createClient({ url: config.get("redis.url") });
  redisClient.on("error", (err) => console.error("Redis Client Error", err));

  await redisClient.connect();
  return redisClient;
};
