import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, NextFunction, Request, Response } from "express";
import nunjucks from "nunjucks";
import type { AssetOptions } from "../assets/assets.js";
import { configureAssets } from "../assets/configure-assets.js";
import { localeMiddleware, renderInterceptorMiddleware, translationMiddleware } from "../i18n/locale-middleware.js";
import { loadTranslations } from "../i18n/translation-loader.js";
import { currencyFilter, dateFilter, govukErrorSummaryFilter, kebabCaseFilter, timeFilter } from "./filters/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function configureGovuk(app: Express, options: GovukSetupOptions = {}): Promise<nunjucks.Environment> {
  const { viewPaths = [], assets, i18nContentPath } = options;

  const govukFrontendPath = "../../node_modules/govuk-frontend/dist";
  const govukSetupViews = path.join(__dirname, "./views");
  const cookieViews = path.join(__dirname, "../cookies/views");
  const allViewPaths = [govukFrontendPath, govukSetupViews, cookieViews, ...viewPaths];

  const env = nunjucks.configure(allViewPaths, {
    autoescape: true,
    express: app,
    watch: process.env.NODE_ENV === "development",
    noCache: process.env.NODE_ENV === "development",
  });

  app.set("view engine", "njk");
  app.set("nunjucksEnv", env);

  addFilters(env);
  addGlobals(env, options.nunjucksGlobals);

  if (i18nContentPath) {
    const translations = await loadTranslations(i18nContentPath);
    app.use(localeMiddleware());
    app.use(renderInterceptorMiddleware());
    app.use(translationMiddleware(translations));
  }

  if (assets) {
    await configureAssets(app, env, assets);
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.pageUrl = req.path;
    res.locals.serviceUrl = `${req.protocol}://${req.get("host")}`;
    next();
  });

  return env;
}

function addFilters(env: nunjucks.Environment): void {
  env.addFilter("date", dateFilter);
  env.addFilter("time", timeFilter);
  env.addFilter("currency", currencyFilter);
  env.addFilter("kebabCase", kebabCaseFilter);
  env.addFilter("govukErrorSummary", govukErrorSummaryFilter);
}

function addGlobals(env: nunjucks.Environment, globals: Record<string, unknown> = {}): void {
  env.addGlobal("isProduction", process.env.NODE_ENV === "production");

  Object.entries(globals).forEach(([key, value]) => {
    env.addGlobal(key, value);
  });
}

export interface GovukSetupOptions {
  viewPaths?: string[];
  assets?: AssetOptions;
  errorPages?: boolean;
  i18nContentPath?: string;
  nunjucksGlobals?: Record<string, unknown>;
}
