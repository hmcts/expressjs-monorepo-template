import type { NextFunction, Request, Response } from "express";
import { startApplicationInsights } from "./application-insights.js";

export function monitoringMiddleware(config: MonitoringMiddlewareConfig): (req: Request, res: Response, next: NextFunction) => void {
  const { serviceName, connectionString, enabled = true } = config;

  if (enabled) {
    // Requests are reported by Application Insights auto-collection, so the middleware only needs to start the client.
    startApplicationInsights(connectionString, serviceName);
  }

  return (_req: Request, _res: Response, next: NextFunction) => next();
}

export type MonitoringMiddlewareConfig = {
  serviceName: string;
  connectionString: string;
  enabled?: boolean;
};
