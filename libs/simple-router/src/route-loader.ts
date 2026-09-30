import { pathToFileURL } from "node:url";
import type { Handler, HandlerExport, HttpMethod, RouteMethod, RouteModule } from "./simple-router.js";

const VALID_METHODS: HttpMethod[] = ["get", "post", "put", "patch", "delete", "del", "head", "options", "trace", "connect", "all"];

export async function loadRouteModule(absolutePath: string): Promise<RouteModule> {
  const fileUrl = pathToFileURL(absolutePath).href;
  return import(fileUrl);
}

export function extractHandlers(module: RouteModule): Map<RouteMethod, HandlerExport> {
  const handlers = new Map<RouteMethod, HandlerExport>();

  for (const [key, value] of Object.entries(module)) {
    const methodName = key.toLowerCase() as HttpMethod;

    if (!VALID_METHODS.includes(methodName)) {
      continue;
    }

    const method = methodName === "del" ? "delete" : methodName;

    if (handlers.has(method)) {
      throw new Error(`Duplicate method export found: ${key}. Module exports ${method.toUpperCase()} more than once (check casing and del/DELETE).`);
    }

    if (!isValidHandler(value)) {
      throw new Error(
        `Invalid handler for method ${key}. Expected a function or non-empty array of functions, none declaring 4 parameters ` +
          `(Express treats a 4-parameter function as an error handler and never runs it for requests; export it as onError instead).`
      );
    }

    handlers.set(method, value);
  }

  return handlers;
}

export function normalizeHandlers(handlerExport: HandlerExport): Handler[] {
  return Array.isArray(handlerExport) ? handlerExport : [handlerExport];
}

// Express decides error-handler vs request-handler purely on fn.length === 4.
function isValidHandler(value: unknown): value is HandlerExport {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every(isRequestHandler);
  }

  return isRequestHandler(value);
}

function isRequestHandler(fn: unknown): boolean {
  return typeof fn === "function" && fn.length !== 4;
}
