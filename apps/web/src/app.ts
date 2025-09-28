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
import { pageRoutes as footerPages } from "@hmcts/footer-pages";
import { pageRoutes as onboardingPages } from "@hmcts/onboarding";
import { createSimpleRouter } from "@hmcts/simple-router";
import compression from "compression";
import config from "config";
import cookieParser from "cookie-parser";
import type { Express } from "express";
import express from "express";
import { createClient } from "redis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chartPath = path.join(__dirname, "../helm/values.yaml");

export async function createApp(): Promise<Express> {
  await configurePropertiesVolume(config, { chartPath });

  const app = express();

  app.use(compression());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(healthcheck());
  app.use(monitoringMiddleware(config.get("applicationInsights")));
  app.use(configureNonce());
  app.use(configureHelmet());
  app.use(expressSessionRedis({ redisConnection: await getRedisClient() }));

  const modulePaths = [__dirname, onboardingPages.path, footerPages.path];

  await configureGovuk(app, modulePaths, {
    nunjucksGlobals: {
      gtm: config.get("gtm"),
      dynatrace: config.get("dynatrace")
    },
    assetOptions: {
      distPath: path.join(__dirname, "../dist")
    }
  });

  await configureCookieManager(app, {
    categories: {
      essential: ["connect.sid"],
      analytics: ["_ga", "_gid", "dtCookie", "dtSa", "rxVisitor", "rxvt"],
      preferences: ["language"]
    }
  });

  app.use(await createSimpleRouter({ path: `${__dirname}/pages` }, onboardingPages, footerPages));
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
