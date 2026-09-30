import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";

const GTM_SOURCES = ["https://*.googletagmanager.com"];
const GA_SOURCES = ["https://*.google-analytics.com", "https://*.googletagmanager.com"];
const VITE_HMR_SOURCES = ["ws://localhost:5173", "ws://localhost:24678"];

export function configureNonce() {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
    next();
  };
}

export function configureHelmet(options: SecurityOptions = {}) {
  const { enableGoogleTagManager = true, isDevelopment = process.env.NODE_ENV !== "production", dynatraceUrl, extraDirectives = {} } = options;

  const nonceSource = (_req: IncomingMessage, res: ServerResponse) => `'nonce-${(res as Response).locals.cspNonce}'`;

  const directives: Directives = {
    "default-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "script-src": ["'self'", nonceSource, ...(enableGoogleTagManager ? GTM_SOURCES : []), ...(dynatraceUrl ? [new URL(dynatraceUrl).origin] : [])],
    "img-src": ["'self'", "data:", ...(enableGoogleTagManager ? GA_SOURCES : [])],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(enableGoogleTagManager ? GA_SOURCES : []), ...(isDevelopment ? VITE_HMR_SOURCES : [])],
    ...(enableGoogleTagManager && { "frame-src": GTM_SOURCES })
  };

  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: appendSources({ ...helmet.contentSecurityPolicy.getDefaultDirectives(), ...directives }, extraDirectives)
    }
  });
}

function appendSources(base: Directives, extra: Record<string, readonly string[]>): Directives {
  const appended = Object.entries(extra).map(([name, sources]) => {
    const key = toKebabCase(name);
    // 'none' is only valid as a directive's sole source
    const existing = [...(base[key] ?? [])].filter((source) => source !== "'none'");
    return [key, [...new Set([...existing, ...sources])]];
  });
  return { ...base, ...Object.fromEntries(appended) };
}

function toKebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

type DirectiveSource = string | ((req: IncomingMessage, res: ServerResponse) => string);

type Directives = Record<string, Iterable<DirectiveSource>>;

export interface SecurityOptions {
  enableGoogleTagManager?: boolean;
  isDevelopment?: boolean;
  /** Dynatrace RUM script URL; its origin is allowed in script-src. */
  dynatraceUrl?: string;
  /**
   * Sources appended to the CSP, per directive, on top of the defaults.
   * Keys may be camelCase (`formAction`) or kebab-case (`form-action`).
   */
  extraDirectives?: Record<string, readonly string[]>;
}
