import path from "node:path";
import { fileURLToPath } from "node:url";
import { configurePropertiesVolume, healthcheck, monitoringMiddleware } from "@hmcts/cloud-native-platform";
import {
  configureCookieManager,
  configureGovuk,
  configureHelmet,
  configureNonce,
  createSimpleRouter,
  errorHandler,
  notFoundHandler,
} from "@hmcts/express-govuk-starter";
import compression from "compression";
import config from "config";
import cookieParser from "cookie-parser";
import type { Express } from "express";
import express from "express";
import session from "express-session";

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

  // TODO move to session package with redis set up
  app.use(
    session({
      secret: config.get("session.secret"),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 4,
      },
    }),
  );

  await configureGovuk(app, {
    i18nContentPath: path.join(__dirname, "locales"),
    viewPaths: [path.join(__dirname, "pages/")],
    assets: {
      viteRoot: path.join(__dirname, "assets"),
      distPath: path.join(__dirname, "../dist"),
      entries: {
        jsEntry: "js/index.ts",
        cssEntry: "css/index.scss",
      },
    },
    nunjucksGlobals: {
      gtm: config.get("gtm"),
      dynatrace: config.get("dynatrace"),
    },
  });

  await configureCookieManager(app, {
    essential: ["session", "csrf_token"],
    categories: {
      analytics: ["_ga", "_gid", "dtCookie", "dtSa", "rxVisitor", "rxvt"],
      preferences: ["language"],
    },
  });

  app.use(await createSimpleRouter({ pagesDir: path.join(__dirname, "/pages") }));
  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}
