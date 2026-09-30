import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "./error-handler.js";

const VIEWS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "views");

describe("errorHandler", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should render the 500 page for errors without a status", async () => {
    const app = createApp((_req, _res, next) => next(new Error("boom")));

    const response = await request(app).get("/");

    expect(response.status).toBe(500);
    expect(JSON.parse(response.text)).toMatchObject({ view: "500", error: "boom" });
  });

  it("should honour a 4xx status from body-parser", async () => {
    const app = express();
    app.use(express.json({ limit: "1b" }));
    app.post("/", (_req, res) => {
      res.send("ok");
    });
    useTestViews(app);
    app.use(errorHandler({ error: vi.fn() }));

    const response = await request(app).post("/").send({ too: "large" });

    expect(response.status).toBe(413);
    expect(JSON.parse(response.text)).toMatchObject({ view: "500" });
  });

  it("should honour statusCode as well as status", async () => {
    const app = createApp((_req, _res, next) => next(Object.assign(new Error("bad"), { statusCode: 400 })));

    const response = await request(app).get("/");

    expect(response.status).toBe(400);
  });

  it("should render the 404 page for a 404 error", async () => {
    const app = createApp((_req, _res, next) => next(Object.assign(new Error("gone"), { status: 404 })));

    const response = await request(app).get("/");

    expect(response.status).toBe(404);
    expect(JSON.parse(response.text)).toMatchObject({ view: "404" });
  });

  it("should treat non-4xx statuses as 500", async () => {
    const app = createApp((_req, _res, next) => next(Object.assign(new Error("redirect"), { status: 302 })));

    const response = await request(app).get("/");

    expect(response.status).toBe(500);
  });

  it("should not pass error details to the view in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const app = createApp((_req, _res, next) => next(new Error("secret")));

    const response = await request(app).get("/");

    expect(response.status).toBe(500);
    expect(response.text).not.toContain("secret");
  });

  it("should log the error with only an error method on the logger", async () => {
    const logger = { error: vi.fn() };
    const err = new Error("logged");
    const app = createApp((_req, _res, next) => next(err), logger);

    await request(app).get("/");

    expect(logger.error).toHaveBeenCalledWith("Error:", err.stack);
  });

  it("should delegate to the next error handler when headers have already been sent", async () => {
    const render = vi.fn();
    const next = vi.fn();
    const err = new Error("late");
    const res = { headersSent: true, render } as unknown as express.Response;

    errorHandler({ error: vi.fn() })(err, {} as express.Request, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(render).not.toHaveBeenCalled();
  });
});

function createApp(handler: express.RequestHandler, logger = { error: vi.fn() }) {
  const app = express();
  app.get("/", handler);
  useTestViews(app);
  app.use(errorHandler(logger));
  return app;
}

function useTestViews(app: express.Express) {
  app.set("views", VIEWS_DIR);
  app.set("view engine", "njk");
  app.engine("njk", (filePath, options, callback) => {
    const { error, stack } = options as { error?: string; stack?: string };
    callback(null, JSON.stringify({ view: path.basename(filePath, ".njk"), error, stack }));
  });
}
