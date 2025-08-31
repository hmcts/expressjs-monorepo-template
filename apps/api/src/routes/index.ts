import type { Request, Response } from "express";

export const GET = async (_req: Request, res: Response) => {
  res.json({
    message: "Welcome to HMCTS API",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      liveness: "/health/liveness",
      readiness: "/health/readiness",
    },
  });
};
