import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startApplicationInsights } from "./application-insights.js";
import { type MonitoringMiddlewareConfig, monitoringMiddleware } from "./monitoring-middleware.js";

vi.mock("./application-insights.js", () => ({
  startApplicationInsights: vi.fn()
}));

describe("monitoringMiddleware", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let config: MonitoringMiddlewareConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    req = { method: "GET", path: "/test" };
    res = { statusCode: 200, on: vi.fn() };
    next = vi.fn();
    config = {
      serviceName: "test-service",
      connectionString: "InstrumentationKey=test",
      enabled: true
    };
  });

  it("should call next function", () => {
    const middleware = monitoringMiddleware(config);

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it("should not start Application Insights when disabled", () => {
    config.enabled = false;
    const middleware = monitoringMiddleware(config);

    middleware(req as Request, res as Response, next);

    expect(startApplicationInsights).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("should start Application Insights when enabled", () => {
    monitoringMiddleware(config);

    expect(startApplicationInsights).toHaveBeenCalledWith("InstrumentationKey=test", "test-service");
  });

  it("should leave request tracking to Application Insights auto-collection", () => {
    const middleware = monitoringMiddleware(config);

    middleware(req as Request, res as Response, next);

    expect(res.on).not.toHaveBeenCalled();
  });
});
