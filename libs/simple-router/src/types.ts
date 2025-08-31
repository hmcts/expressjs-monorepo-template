import type { ErrorRequestHandler, RequestHandler } from "express";

export type Handler = RequestHandler;
export type HandlerExport = Handler | Handler[];

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "del" | "head" | "options" | "trace" | "connect" | "all";

export interface MountSpec {
  pagesDir: string;
  prefix?: string;
  trailingSlash?: "off" | "enforce" | "redirect";
}

export interface RouteModule {
  [key: string]: unknown;
  onError?: ErrorRequestHandler;
}

export interface RouteEntry {
  path: string;
  method: string;
  handlers: Handler[];
  sourcePath: string;
  mountSpec: MountSpec;
}

export interface DiscoveredRoute {
  relativePath: string;
  urlPath: string;
  absolutePath: string;
}
