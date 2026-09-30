import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ErrorRequestHandler, RequestHandler, Router } from "express";
import { Router as expressRouter } from "express";
import { discoverRoutes, sortRoutes } from "./route-discovery.js";
import { extractHandlers, loadRouteModule, normalizeHandlers } from "./route-loader.js";

export async function createSimpleRouter(...mounts: MountSpec[]): Promise<Router> {
  const router = expressRouter();

  if (mounts.length === 0) {
    throw new Error("At least one mount specification is required");
  }

  const allRoutes = await discoverAndLoadRoutes(mounts);
  validateRoutes(allRoutes);
  mountRoutes(router, allRoutes);

  return router;
}

async function discoverAndLoadRoutes(mounts: MountSpec[]): Promise<RouteEntry[]> {
  const allRoutes: RouteEntry[] = [];

  for (const mountSpec of mounts) {
    const mountRoutes = await processMountSpec(mountSpec);
    allRoutes.push(...mountRoutes);
  }

  return allRoutes;
}

async function processMountSpec(mountSpec: MountSpec): Promise<RouteEntry[]> {
  const dir = process.env.NODE_ENV === "production" ? mountSpec.path.replace("/src/", "/dist/") : mountSpec.path;
  const routesDir = resolve(dir);

  if (!existsSync(routesDir)) {
    throw new Error(`Routes directory does not exist: ${routesDir}`);
  }

  const prefix = normalizePrefix(mountSpec.prefix || "");
  const routes = sortRoutes(discoverRoutes(routesDir));

  const routeEntries: RouteEntry[] = [];

  for (const route of routes) {
    const moduleRoutes = await loadModuleRoutes(route, prefix, mountSpec);
    routeEntries.push(...moduleRoutes);
  }

  return routeEntries;
}

async function loadModuleRoutes(route: DiscoveredRoute, prefix: string, mountSpec: MountSpec): Promise<RouteEntry[]> {
  const module = await loadRouteModule(route.absolutePath);
  const handlers = extractHandlers(module);

  return getRoutePaths(module, route.urlPath, route.absolutePath)
    .map((urlPath) => buildFullPath(prefix, urlPath))
    .flatMap((fullPath) => buildRouteEntries(fullPath, handlers, module, route.absolutePath, mountSpec));
}

// ROUTES arrives from a dynamically imported module, so its shape is validated at runtime.
// Opting in and getting it wrong is fatal rather than silently falling back, since a typo would
// otherwise leave the module serving on its file-derived path while the intended URLs 404.
function getRoutePaths(module: RouteModule, defaultPath: string, sourcePath: string): string[] {
  if (module.ROUTES === undefined) {
    return [defaultPath];
  }

  if (!Array.isArray(module.ROUTES) || module.ROUTES.length === 0) {
    throw new Error(`Invalid ROUTES in ${sourcePath}: expected a non-empty array of paths starting with "/"`);
  }

  for (const routePath of module.ROUTES) {
    if (typeof routePath !== "string" || !routePath.startsWith("/")) {
      throw new Error(`Invalid ROUTES entry in ${sourcePath}: ${JSON.stringify(routePath)} is not a path starting with "/"`);
    }
  }

  return module.ROUTES;
}

function buildRouteEntries(
  fullPath: string,
  handlers: Map<RouteMethod, HandlerExport>,
  module: RouteModule,
  sourcePath: string,
  mountSpec: MountSpec
): RouteEntry[] {
  // onError sits in the same route stack as the method handlers: Express passes an error along a route's own
  // stack but skips every other route while an error is pending, so this scopes onError to this module's routes.
  const errorHandlers = module.onError ? [module.onError] : [];

  return [...handlers].map(([method, handlerExport]) => ({
    path: fullPath,
    method,
    handlers: [...normalizeHandlers(handlerExport), ...errorHandlers],
    sourcePath,
    mountSpec
  }));
}

function buildFullPath(prefix: string, urlPath: string): string {
  if (prefix === "/") {
    return urlPath;
  }
  return `${prefix}${urlPath === "/" ? "" : urlPath}`;
}

function normalizePrefix(prefix: string): string {
  if (!prefix || prefix === "/") {
    return "/";
  }

  let normalized = prefix;

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  if (normalized.endsWith("/") && normalized !== "/") {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function validateRoutes(routes: RouteEntry[]): void {
  const routeMap = new Map<string, RouteEntry>();

  for (const route of routes) {
    const key = `${route.method.toUpperCase()} ${route.path}`;

    if (routeMap.has(key)) {
      const existing = routeMap.get(key)!;
      throw new Error(
        `Route conflict detected:\n` +
          `  ${key}\n` +
          `  Defined in:\n` +
          `    1. ${existing.sourcePath} (mount: ${existing.mountSpec.path})\n` +
          `    2. ${route.sourcePath} (mount: ${route.mountSpec.path})`
      );
    }

    routeMap.set(key, route);
  }
}

function mountRoutes(router: Router, routes: RouteEntry[]): void {
  for (const { path, method, handlers } of routes) {
    router[method](path, ...handlers);
  }
}

export type Handler = RequestHandler;
export type HandlerExport = Handler | Handler[];
export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "del" | "head" | "options" | "trace" | "connect" | "all";
export type RouteMethod = Exclude<HttpMethod, "del">;

export interface MountSpec {
  path: string;
  prefix?: string;
  trailingSlash?: "off" | "enforce" | "redirect";
}

export interface RouteModule {
  [key: string]: unknown;
  onError?: ErrorRequestHandler;
  ROUTES?: string[];
}

export interface RouteEntry {
  path: string;
  method: RouteMethod;
  handlers: (Handler | ErrorRequestHandler)[];
  sourcePath: string;
  mountSpec: MountSpec;
}

export interface DiscoveredRoute {
  relativePath: string;
  urlPath: string;
  absolutePath: string;
}
