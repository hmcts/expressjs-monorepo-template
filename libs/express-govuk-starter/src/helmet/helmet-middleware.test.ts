import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureGovuk } from "../govuk-frontend/configure-govuk.js";
import { notFoundHandler } from "../govuk-frontend/error-handler.js";
import { configureHelmet, configureNonce, type SecurityOptions } from "./helmet-middleware.js";

describe("configureNonce", () => {
  it("should expose a fresh base64 nonce on res.locals for each request", async () => {
    const app = express();
    app.use(configureNonce());
    app.get("/", (_req, res) => {
      res.send(res.locals.cspNonce);
    });

    const first = await request(app).get("/");
    const second = await request(app).get("/");

    expect(Buffer.from(first.text, "base64")).toHaveLength(16);
    expect(first.text).not.toBe(second.text);
  });
});

describe("configureHelmet", () => {
  it("should send the default GOV.UK CSP", async () => {
    const csp = await getCsp({ isDevelopment: false });

    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("script-src")).toEqual(["'self'", expect.stringMatching(/^'nonce-.+'$/), "https://*.googletagmanager.com"]);
    expect(csp.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp.get("img-src")).toEqual(["'self'", "data:", "https://*.google-analytics.com", "https://*.googletagmanager.com"]);
    expect(csp.get("font-src")).toEqual(["'self'", "data:"]);
    expect(csp.get("connect-src")).toEqual(["'self'", "https://*.google-analytics.com", "https://*.googletagmanager.com"]);
    expect(csp.get("frame-src")).toEqual(["https://*.googletagmanager.com"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'self'"]);
  });

  it("should put the request nonce in script-src", async () => {
    const app = express();
    app.use((_req, res, next) => {
      res.locals.cspNonce = "abc123";
      next();
    });
    app.use(configureHelmet());
    app.get("/", (_req, res) => {
      res.send("ok");
    });

    const response = await request(app).get("/");

    expect(parseCsp(response.headers["content-security-policy"]).get("script-src")).toContain("'nonce-abc123'");
  });

  it("should omit Google Tag Manager sources and frame-src when disabled", async () => {
    const csp = await getCsp({ enableGoogleTagManager: false, isDevelopment: false });

    expect(csp.get("script-src")).toEqual(["'self'", expect.stringMatching(/^'nonce-.+'$/)]);
    expect(csp.get("img-src")).toEqual(["'self'", "data:"]);
    expect(csp.get("connect-src")).toEqual(["'self'"]);
    expect(csp.has("frame-src")).toBe(false);
  });

  it("should allow Vite HMR websockets in connect-src only in development", async () => {
    const dev = await getCsp({ isDevelopment: true });
    const prod = await getCsp({ isDevelopment: false });

    expect(dev.get("connect-src")).toEqual(expect.arrayContaining(["ws://localhost:5173", "ws://localhost:24678"]));
    expect(dev.get("script-src")).not.toContain("ws://localhost:5173");
    expect(prod.get("connect-src")).not.toContain("ws://localhost:5173");
  });

  it("should allow the Dynatrace script origin when a Dynatrace URL is configured", async () => {
    const csp = await getCsp({ dynatraceUrl: "https://js-cdn.dynatrace.com/jstag/abc/def/ghi_complete.js" });

    expect(csp.get("script-src")).toContain("https://js-cdn.dynatrace.com");
  });

  it("should append extra sources to existing directives, including helmet defaults", async () => {
    const csp = await getCsp({
      isDevelopment: false,
      extraDirectives: {
        formAction: ["https://idam-web-public.aat.platform.hmcts.net"],
        "connect-src": ["https://bf.example.com", "'self'"]
      }
    });

    expect(csp.get("form-action")).toEqual(["'self'", "https://idam-web-public.aat.platform.hmcts.net"]);
    expect(csp.get("connect-src")).toEqual(["'self'", "https://*.google-analytics.com", "https://*.googletagmanager.com", "https://bf.example.com"]);
  });

  it("should add directives that are not set by default", async () => {
    const csp = await getCsp({ extraDirectives: { workerSrc: ["'self'"] } });

    expect(csp.get("worker-src")).toEqual(["'self'"]);
  });

  it("should replace 'none' when sources are appended to a directive", async () => {
    const csp = await getCsp({ extraDirectives: { objectSrc: ["https://example.com"] } });

    expect(csp.get("object-src")).toEqual(["https://example.com"]);
  });
});

describe("rendered pages", () => {
  let viewsDir: string;

  beforeEach(() => {
    viewsDir = join(tmpdir(), `test-helmet-${Date.now()}`);
    mkdirSync(join(viewsDir, "pages"), { recursive: true });
  });

  afterEach(() => {
    rmSync(viewsDir, { recursive: true, force: true });
  });

  it("should give every inline script the nonce sent in the CSP header", async () => {
    const app = express();
    app.use(configureNonce());
    app.use(configureHelmet({ dynatraceUrl: "https://js-cdn.dynatrace.com/jstag/abc/def/ghi_complete.js" }));
    await configureGovuk(app, [viewsDir], {
      assetOptions: { distPath: viewsDir },
      nunjucksGlobals: {
        gtm: { containerId: "GTM-TEST" },
        dynatrace: { dynatraceUrl: "https://js-cdn.dynatrace.com/jstag/abc/def/ghi_complete.js" }
      }
    });
    app.use(notFoundHandler());

    const response = await request(app).get("/missing-page");

    const nonce = parseCsp(response.headers["content-security-policy"])
      .get("script-src")
      ?.find((source) => source.startsWith("'nonce-"))
      ?.slice("'nonce-".length, -1);
    const inlineScripts = [...response.text.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>/g)].map((match) => match[1]);

    expect(response.text).toContain("GTM-TEST");
    expect(inlineScripts.length).toBeGreaterThanOrEqual(2);
    expect(inlineScripts.every((attributes) => attributes.includes(`nonce="${nonce}"`))).toBe(true);
  });
});

async function getCsp(options: SecurityOptions): Promise<Map<string, string[]>> {
  const app = express();
  app.use(configureNonce());
  app.use(configureHelmet(options));
  app.get("/", (_req, res) => {
    res.send("ok");
  });

  const response = await request(app).get("/");
  return parseCsp(response.headers["content-security-policy"]);
}

function parseCsp(header: string): Map<string, string[]> {
  return new Map(
    header.split(";").map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    })
  );
}
