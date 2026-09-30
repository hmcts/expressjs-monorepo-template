import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type MonitoringMiddlewareConfig, monitoringMiddleware } from "./monitoring-middleware.js";
import { MonitoringService } from "./monitoring-service.js";

vi.mock("./monitoring-service.js");

describe("monitoringMiddleware", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let config: MonitoringMiddlewareConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      method: "GET",
      path: "/test",
      url: "/test?query=value",
      route: { path: "/test" },
      headers: {
        "user-agent": "Mozilla/5.0"
      }
    };

    res = {
      statusCode: 200,
      on: vi.fn()
    };

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

  it("should not initialize monitoring when disabled", () => {
    config.enabled = false;
    const middleware = monitoringMiddleware(config);

    middleware(req as Request, res as Response, next);

    expect(MonitoringService).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("should initialize monitoring service when enabled", () => {
    vi.mocked(MonitoringService).mockImplementation(function (this: any) {
      return {
        trackRequest: vi.fn(),
        trackException: vi.fn(),
        trackEvent: vi.fn(),
        trackMetric: vi.fn(),
        flush: vi.fn()
      };
    } as any);

    const middleware = monitoringMiddleware(config);

    middleware(req as Request, res as Response, next);

    expect(MonitoringService).toHaveBeenCalledWith("InstrumentationKey=test", "test-service");
  });

  it("should leave request tracking to Application Insights auto-collection", () => {
    const mockTrackRequest = vi.fn();
    vi.mocked(MonitoringService).mockImplementation(function (this: any) {
      return {
        trackRequest: mockTrackRequest,
        trackException: vi.fn(),
        trackEvent: vi.fn(),
        trackMetric: vi.fn(),
        flush: vi.fn()
      };
    } as any);

    const middleware = monitoringMiddleware(config);

    middleware(req as Request, res as Response, next);

    expect(res.on).not.toHaveBeenCalled();
    expect(mockTrackRequest).not.toHaveBeenCalled();
  });
});
