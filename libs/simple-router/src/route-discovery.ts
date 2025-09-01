import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { DiscoveredRoute } from "./types.js";

const VALID_SEGMENT_PATTERN = /^[a-zA-Z0-9-_]+$/;
const PARAM_PATTERN = /^\[([a-zA-Z0-9_]+)\]$/;

export function discoverRoutes(pagesDir: string): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];
  scanDirectory(pagesDir, pagesDir, routes);
  return routes;
}

function scanDirectory(dir: string, rootDir: string, routes: DiscoveredRoute[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });

  // Process all .ts and .js files in the directory
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    if (entry.isFile()) {
      // Check if it's a .ts or .js file (but not test files)
      if ((entry.name.endsWith(".ts") || entry.name.endsWith(".js")) && !entry.name.includes(".test.") && !entry.name.includes(".spec.")) {
        const fullPath = join(dir, entry.name);
        const relativePath = relative(rootDir, fullPath);
        const urlPath = filePathToUrlPath(relativePath);

        // Check if we already have a route for this path (prefer .ts over .js)
        const existingRoute = routes.find((r) => r.urlPath === urlPath);
        if (existingRoute) {
          // If we have a .js route and found a .ts route, replace it
          if (existingRoute.relativePath.endsWith(".js") && entry.name.endsWith(".ts")) {
            const index = routes.indexOf(existingRoute);
            routes[index] = {
              relativePath,
              urlPath,
              absolutePath: fullPath
            };
          }
        } else {
          routes.push({
            relativePath,
            urlPath,
            absolutePath: fullPath
          });
        }
      }
    } else if (entry.isDirectory()) {
      const fullPath = join(dir, entry.name);
      scanDirectory(fullPath, rootDir, routes);
    }
  }
}

function filePathToUrlPath(filePath: string): string {
  const segments = filePath.split(sep);
  const processedSegments: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Skip index files
    if (segment === "index.ts" || segment === "index.js") {
      continue;
    }

    // For the last segment, if it's a .ts or .js file, remove the extension
    if (i === segments.length - 1 && (segment.endsWith(".ts") || segment.endsWith(".js"))) {
      const nameWithoutExt = segment.replace(/\.(ts|js)$/, "");
      // Only add if it's not 'index' (already filtered above)
      if (nameWithoutExt !== "index") {
        processedSegments.push(nameWithoutExt);
      }
      continue;
    }

    // Process directory segments
    const paramMatch = segment.match(PARAM_PATTERN);
    if (paramMatch) {
      processedSegments.push(`:${paramMatch[1]}`);
    } else if (VALID_SEGMENT_PATTERN.test(segment)) {
      processedSegments.push(segment);
    } else {
      throw new Error(`Invalid route segment: ${segment}. Must be alphanumeric with hyphens or underscores, or a parameter like [id]`);
    }
  }

  if (processedSegments.length === 0) {
    return "/";
  }

  return `/${processedSegments.join("/")}`;
}

export function sortRoutes(routes: DiscoveredRoute[]): DiscoveredRoute[] {
  return [...routes].sort((a, b) => {
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
