import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSimpleRouter } from "./simple-router.js";

describe("simple-router", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-router-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("createSimpleRouter", () => {
    it("should throw if no mount specs provided", async () => {
      await expect(() => createSimpleRouter()).rejects.toThrow("At least one mount specification is required");
    });

    it("should return an Express router", async () => {
      const router = await createSimpleRouter({ path: testDir });

      expect(router).toBeDefined();
      expect(typeof router).toBe("function");
      expect(router.stack).toBeDefined();
    });

    it("should mount simple GET route", async () => {
      const routeContent = `
export const GET = (req, res) => res.send('Hello World');
`;
      writeFileSync(join(testDir, "index.ts"), routeContent);

      const app = express();
      app.use(await createSimpleRouter({ path: testDir }));

      const response = await request(app).get("/");

      expect(response.status).toBe(200);
      expect(response.text).toBe("Hello World");
    });

    it("should handle multiple HTTP methods", async () => {
      const routeContent = `
export const GET = (req, res) => res.send('GET response');
export const POST = (req, res) => res.send('POST response');
export const PUT = (req, res) => res.send('PUT response');
`;
      writeFileSync(join(testDir, "index.ts"), routeContent);

      const app = express();
      app.use(await createSimpleRouter({ path: testDir }));

      const getResponse = await request(app).get("/");
      const postResponse = await request(app).post("/");
      const putResponse = await request(app).put("/");

      expect(getResponse.text).toBe("GET response");
      expect(postResponse.text).toBe("POST response");
      expect(putResponse.text).toBe("PUT response");
    });

    it("should handle nested routes", async () => {
      mkdirSync(join(testDir, "about"), { recursive: true });
      mkdirSync(join(testDir, "posts"), { recursive: true });

      writeFileSync(join(testDir, "index.ts"), `export const GET = (req, res) => res.send('Home');`);
      writeFileSync(join(testDir, "about", "index.ts"), `export const GET = (req, res) => res.send('About');`);
      writeFileSync(join(testDir, "posts", "index.ts"), `export const GET = (req, res) => res.send('Posts');`);

      const app = express();
      app.use(await createSimpleRouter({ path: testDir }));

      const homeResponse = await request(app).get("/");
      const aboutResponse = await request(app).get("/about");
      const postsResponse = await request(app).get("/posts");

      expect(homeResponse.text).toBe("Home");
      expect(aboutResponse.text).toBe("About");
      expect(postsResponse.text).toBe("Posts");
    });

    it("should handle dynamic routes", async () => {
      mkdirSync(join(testDir, "posts", "[id]"), { recursive: true });

      writeFileSync(join(testDir, "posts", "[id]", "index.ts"), `export const GET = (req, res) => res.send('Post: ' + req.params.id);`);

      const app = express();
      app.use(await createSimpleRouter({ path: testDir }));

      const response = await request(app).get("/posts/123");

      expect(response.text).toBe("Post: 123");
    });

    it("should apply prefix to routes", async () => {
      writeFileSync(join(testDir, "index.ts"), `export const GET = (req, res) => res.send('Admin Home');`);

      const app = express();
      app.use(await createSimpleRouter({ path: testDir, prefix: "/admin" }));

      const response = await request(app).get("/admin");

      expect(response.text).toBe("Admin Home");
    });

    it("should handle multiple mount points", async () => {
      const pagesDir = join(testDir, "pages");
      const adminDir = join(testDir, "admin");

      mkdirSync(pagesDir, { recursive: true });
      mkdirSync(adminDir, { recursive: true });

      writeFileSync(join(pagesDir, "index.ts"), `export const GET = (req, res) => res.send('Main');`);
      writeFileSync(join(adminDir, "index.ts"), `export const GET = (req, res) => res.send('Admin');`);

      const app = express();
      app.use(await createSimpleRouter({ path: pagesDir }, { path: adminDir, prefix: "/admin" }));

      const mainResponse = await request(app).get("/");
      const adminResponse = await request(app).get("/admin");

      expect(mainResponse.text).toBe("Main");
      expect(adminResponse.text).toBe("Admin");
    });

    it("should handle array of middleware", async () => {
      const routeContent = `
const middleware1 = (req, res, next) => {
  req.data = 'Hello';
  next();
};

const middleware2 = (req, res, next) => {
  req.data += ' World';
  next();
};

const handler = (req, res) => res.send(req.data);

export const GET = [middleware1, middleware2, handler];
`;
      writeFileSync(join(testDir, "index.ts"), routeContent);

      const app = express();
      app.use(await createSimpleRouter({ path: testDir }));

      const response = await request(app).get("/");

      expect(response.text).toBe("Hello World");
    });

    it("should handle case-insensitive method exports", async () => {
      const routeContent = `
export const get = (req, res) => res.send('lowercase get');
export const Post = (req, res) => res.send('mixed case post');
`;
      writeFileSync(join(testDir, "index.ts"), routeContent);

      const app = express();
      app.use(await createSimpleRouter({ path: testDir }));

      const getResponse = await request(app).get("/");
      const postResponse = await request(app).post("/");

      expect(getResponse.text).toBe("lowercase get");
      expect(postResponse.text).toBe("mixed case post");
    });

    it("should strip (group) segments from url", async () => {
      mkdirSync(join(testDir, "(footer)"), { recursive: true });
      writeFileSync(join(testDir, "(footer)", "privacy-policy.ts"), `export const GET = (req, res) => res.send('Privacy');`);

      const app = express();
      app.use(await createSimpleRouter({ path: testDir }));

      const response = await request(app).get("/privacy-policy");
      const groupPath = await request(app).get("/(footer)/privacy-policy");

      expect(response.status).toBe(200);
      expect(response.text).toBe("Privacy");
      expect(groupPath.status).toBe(404);
    });

    it("should register the handler on every ROUTES entry", async () => {
      const routeContent = `
export const ROUTES = ['/summary', '/check-your-answers', '/review'];
export const GET = (req, res) => res.send('Summary');
`;
      writeFileSync(join(testDir, "summary.ts"), routeContent);

      const app = express();
      app.use(await createSimpleRouter({ path: testDir }));

      const summaryResponse = await request(app).get("/summary");
      const checkResponse = await request(app).get("/check-your-answers");
      const reviewResponse = await request(app).get("/review");

      expect(summaryResponse.text).toBe("Summary");
      expect(checkResponse.text).toBe("Summary");
      expect(reviewResponse.text).toBe("Summary");
    });

    it("should honour ROUTES for every exported method", async () => {
      const routeContent = `
export const ROUTES = ['/name', '/your-name'];
export const GET = (req, res) => res.send('GET response');
export const POST = (req, res) => res.send('POST response');
`;
      writeFileSync(join(testDir, "name.ts"), routeContent);

      const app = express();
      app.use(await createSimpleRouter({ path: testDir }));

      const aliasGetResponse = await request(app).get("/your-name");
      const aliasPostResponse = await request(app).post("/your-name");

      expect(aliasGetResponse.text).toBe("GET response");
      expect(aliasPostResponse.text).toBe("POST response");
    });

    it("should register onError for every ROUTES path", async () => {
      const routeContent = `
export const ROUTES = ['/first', '/second'];
export const GET = (req, res, next) => next(new Error('boom'));
export const onError = (err, req, res, next) => res.status(500).send('Handled: ' + err.message);
`;
      writeFileSync(join(testDir, "failing.ts"), routeContent);

      const app = express();
      app.use(await createSimpleRouter({ path: testDir }));

      const firstResponse = await request(app).get("/first");
      const secondResponse = await request(app).get("/second");

      expect(firstResponse.status).toBe(500);
      expect(firstResponse.text).toBe("Handled: boom");
      expect(secondResponse.status).toBe(500);
      expect(secondResponse.text).toBe("Handled: boom");
    });

    it("should apply the mount prefix to ROUTES paths", async () => {
      const routeContent = `
export const ROUTES = ['/', '/overview'];
export const GET = (req, res) => res.send('Admin');
`;
      writeFileSync(join(testDir, "index.ts"), routeContent);

      const app = express();
      app.use(await createSimpleRouter({ path: testDir, prefix: "/admin" }));

      const rootResponse = await request(app).get("/admin");
      const overviewResponse = await request(app).get("/admin/overview");
      const unprefixedResponse = await request(app).get("/overview");

      expect(rootResponse.text).toBe("Admin");
      expect(overviewResponse.text).toBe("Admin");
      expect(unprefixedResponse.status).toBe(404);
    });

    it("should fall back to the file-derived path when ROUTES is absent", async () => {
      writeFileSync(join(testDir, "contact.ts"), `export const GET = (req, res) => res.send('Contact');`);

      const app = express();
      app.use(await createSimpleRouter({ path: testDir }));

      const response = await request(app).get("/contact");

      expect(response.status).toBe(200);
      expect(response.text).toBe("Contact");
    });

    it("should throw when ROUTES is present but malformed", async () => {
      const variations = [
        { name: "empty", exportLine: "export const ROUTES = [];" },
        { name: "not-an-array", exportLine: "export const ROUTES = '/from-string';" },
        { name: "non-string-entry", exportLine: "export const ROUTES = ['/valid', 42];" },
        { name: "missing-leading-slash", exportLine: "export const ROUTES = ['no-leading-slash'];" },
        { name: "empty-string-entry", exportLine: "export const ROUTES = [''];" }
      ];

      for (const { name, exportLine } of variations) {
        const variationDir = join(testDir, name);
        mkdirSync(variationDir, { recursive: true });
        writeFileSync(join(variationDir, "contact.ts"), `${exportLine}\nexport const GET = (req, res) => res.send('Contact');`);

        await expect(() => createSimpleRouter({ path: variationDir })).rejects.toThrow(/Invalid ROUTES/);
      }
    });

    it("should name the offending file when ROUTES is malformed", async () => {
      writeFileSync(join(testDir, "contact.ts"), `export const ROUTES = ['no-leading-slash'];\nexport const GET = (req, res) => res.send('Contact');`);

      await expect(() => createSimpleRouter({ path: testDir })).rejects.toThrow(/contact\.ts.*"no-leading-slash"/);
    });

    it("should detect conflicts when two modules declare the same ROUTES path", async () => {
      writeFileSync(join(testDir, "first.ts"), `export const ROUTES = ['/shared'];\nexport const GET = (req, res) => res.send('First');`);
      writeFileSync(join(testDir, "second.ts"), `export const ROUTES = ['/shared'];\nexport const GET = (req, res) => res.send('Second');`);

      await expect(() => createSimpleRouter({ path: testDir })).rejects.toThrow("Route conflict detected");
    });

    it("should normalize prefix correctly", async () => {
      writeFileSync(join(testDir, "index.ts"), `export const GET = (req, res) => res.send('Test');`);

      const variations = [
        { prefix: "api", expected: "/api" },
        { prefix: "/api", expected: "/api" },
        { prefix: "/api/", expected: "/api" },
        { prefix: "", expected: "/" },
        { prefix: "/", expected: "/" }
      ];

      for (const { prefix, expected } of variations) {
        const testApp = express();
        testApp.use(await createSimpleRouter({ path: testDir, prefix }));

        const path = expected === "/" ? "/" : expected;
        const response = await request(testApp).get(path);

        expect(response.status).toBe(200);
      }
    });
  });
});
