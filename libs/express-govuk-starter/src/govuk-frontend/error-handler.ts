import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";

/**
 * 404 Not Found handler
 * Must be added after all other routes
 */
export function notFoundHandler() {
  return (req: Request, res: Response, next: NextFunction) => {
    // In development, don't catch potential asset paths that Vite might handle
    const looksLikeVite = req.path.startsWith("/@vite") || req.path.startsWith("/@fs") || req.path.endsWith(".ts") || req.path.endsWith(".scss");
    if (process.env.NODE_ENV !== "production" && looksLikeVite) {
      return next();
    }

    // Only handle GET/HEAD requests as 404, let others pass through
    if (req.method === "GET" || req.method === "HEAD") {
      res.status(404).render("errors/404");
    } else {
      next();
    }
  };
}

/**
 * General error handler
 * Must be added as the last middleware
 */
export function errorHandler(logger: Logger = console): ErrorRequestHandler {
  return (err: HttpError, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }

    logger.error("Error:", err.stack || err);

    const status = clientErrorStatus(err) ?? 500;
    const view = status === 404 ? "errors/404" : "errors/500";

    // Don't leak error details in production
    if (process.env.NODE_ENV === "production") {
      res.status(status).render(view);
    } else {
      res.status(status).render(view, {
        error: err.message,
        stack: err.stack
      });
    }
  };
}

function clientErrorStatus(err: HttpError): number | undefined {
  const status = err.status ?? err.statusCode;
  return typeof status === "number" && status >= 400 && status < 500 ? status : undefined;
}

type HttpError = Error & { status?: number; statusCode?: number };

type Logger = Pick<Console, "error">;
