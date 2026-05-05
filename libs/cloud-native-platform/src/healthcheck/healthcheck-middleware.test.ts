import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configure } from "./healthcheck-middleware.js";

describe("healthcheck middleware", () => {
  let res: Partial<Response>;
  let next: NextFunction;

  const makeReq = (path: string): Request => ({ path }) as unknown as Request;

  beforeEach(() => {
    vi.clearAllMocks();

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  describe("configure", () => {
    it("should create middleware function", () => {
      const middleware = configure({});
      expect(middleware).toBeInstanceOf(Function);
    });
  });

  describe("/health/liveness endpoint", () => {
    it("should return UP when all checks pass", async () => {
      const req = makeReq("/health/liveness");

      const middleware = configure({
        checks: {
          database: async () => "UP",
          api: async () => "UP"
        }
      });

      await middleware(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith({
        status: "UP",
        services: {
          database: "UP",
          api: "UP"
        }
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return DOWN when any check fails", async () => {
      const req = makeReq("/health/liveness");

      const middleware = configure({
        checks: {
          database: async () => "UP",
          api: async () => "DOWN"
        }
      });

      await middleware(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith({
        status: "DOWN",
        services: {
          database: "UP",
          api: "DOWN"
        }
      });
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should handle check errors", async () => {
      const req = makeReq("/liveness");

      const middleware = configure({
        checks: {
          database: async () => {
            throw new Error("Connection failed");
          }
        }
      });

      await middleware(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith({
        status: "DOWN",
        services: {
          database: "DOWN"
        }
      });
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return UP with empty checks", async () => {
      const req = makeReq("/liveness");

      const middleware = configure({});
      await middleware(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith({
        status: "UP",
        services: {}
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("/health and /health/readiness endpoints", () => {
    it("should use readinessChecks when provided", async () => {
      const req = makeReq("/health/readiness");

      const middleware = configure({
        checks: {
          database: async () => "UP",
          api: async () => "UP"
        },
        readinessChecks: {
          database: async () => "DOWN"
        }
      });

      await middleware(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith({
        status: "DOWN",
        services: {
          database: "DOWN"
        }
      });
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should use checks when readinessChecks not provided", async () => {
      const req = makeReq("/health");

      const middleware = configure({
        checks: {
          database: async () => "UP"
        }
      });

      await middleware(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith({
        status: "UP",
        services: {
          database: "UP"
        }
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should handle /readiness path", async () => {
      const req = makeReq("/readiness");

      const middleware = configure({
        checks: {
          test: async () => "UP"
        }
      });

      await middleware(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith({
        status: "UP",
        services: {
          test: "UP"
        }
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("non-health endpoints", () => {
    it("should call next for other paths", async () => {
      const req = makeReq("/api/users");

      const middleware = configure({});
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
