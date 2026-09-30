import type { Dirent } from "node:fs";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { DiscoveredRoute } from "./simple-router.js";

export function discoverRoutes(pagesDir: string): DiscoveredRoute[] {
  const routes = readdirSync(pagesDir, { recursive: true, withFileTypes: true })
    .filter(isRouteFile)
    .map((entry) => toDiscoveredRoute(join(entry.parentPath, entry.name), pagesDir))
    .filter((route) => !route.relativePath.split(sep).some((segment) => segment.startsWith(".")));

  assertUniqueUrlPaths(routes);

  return routes;
}

export function sortRoutes(routes: DiscoveredRoute[]): DiscoveredRoute[] {
  return routes.toSorted((a, b) => {
    const aSegments = a.urlPath.split("/").filter(Boolean);
    const bSegments = b.urlPath.split("/").filter(Boolean);

    const aParams = aSegments.filter((s) => s.startsWith(":")).length;
    const bParams = bSegments.filter((s) => s.startsWith(":")).length;

    if (aParams !== bParams) {
      return aParams - bParams;
    }

    if (aSegments.length !== bSegments.length) {
      return aSegments.length - bSegments.length;
    }

    for (let i = 0; i < aSegments.length; i++) {
      const aIsParam = aSegments[i].startsWith(":");
      const bIsParam = bSegments[i].startsWith(":");

      if (aIsParam !== bIsParam) {
        return aIsParam ? 1 : -1;
      }
    }

    return a.urlPath.localeCompare(b.urlPath);
  });
}

function isRouteFile(entry: Dirent): boolean {
  return (
    entry.isFile() &&
    (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) &&
    !entry.name.includes(".test.") &&
    !entry.name.includes(".spec.") &&
    !entry.name.endsWith(".d.ts")
  );
}

function toDiscoveredRoute(absolutePath: string, rootDir: string): DiscoveredRoute {
  const relativePath = relative(rootDir, absolutePath);
  return { relativePath, urlPath: filePathToUrlPath(relativePath), absolutePath };
}

function filePathToUrlPath(filePath: string): string {
  const normalizedPath = `/${filePath}`
    .replace(/\/\([^)]+\)/g, "") // strip (group) segments from URL
    .replace(/\/index\.(ts|js)$/, "/") // remove the /index from paths
    .replace(/\.(ts|js)$/, "") // remove the .ts from the paths
    .replace(/\[([a-zA-Z0-9_]+)\]/g, ":$1"); // convert [param] to :param

  return normalizedPath !== "/" && normalizedPath.endsWith("/") ? normalizedPath.slice(0, -1) : normalizedPath;
}

// With tsc's outDir, src holds only .ts files and dist only .js files, so two files sharing a URL is always a
// mistake (foo.ts + foo/index.ts, (group)/x.ts + x.ts, index.ts + index.js) that would otherwise shadow silently.
function assertUniqueUrlPaths(routes: DiscoveredRoute[]): void {
  const seen = new Map<string, DiscoveredRoute>();

  for (const route of routes) {
    const existing = seen.get(route.urlPath);

    if (existing) {
      const [first, second] = [existing.relativePath, route.relativePath].sort();
      throw new Error(`Duplicate route file for URL ${route.urlPath}:\n    1. ${first}\n    2. ${second}\n  Keep only one file per URL.`);
    }

    seen.set(route.urlPath, route);
  }
}
