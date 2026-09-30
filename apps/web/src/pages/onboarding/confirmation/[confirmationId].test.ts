import type { AddressInfo } from "node:net";
import path from "node:path";
import { configureGovuk } from "@hmcts-cft/express-govuk-starter";
import type { Request, Response } from "express";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./[confirmationId].js";

const CONFIRMATION_ID = "cmg6x1k2p0000qz8h3f9d2a7b";
const WEB_SRC = path.resolve(import.meta.dirname, "../../..");

describe("confirmation page with dynamic route", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      params: {} as Record<string, string>
    };
    mockRes = {
      render: vi.fn(),
      redirect: vi.fn(),
      status: vi.fn().mockReturnThis()
    };
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("should render confirmation page with reference number from params", async () => {
      mockReq.params = {
        confirmationId: CONFIRMATION_ID
      };

      await GET(mockReq as Request, mockRes as Response);

      expect(mockRes.render).toHaveBeenCalledWith(
        "[confirmationId]",
        expect.objectContaining({
          confirmationId: CONFIRMATION_ID,
          en: expect.objectContaining({
            title: "Onboarding complete",
            heading: "Onboarding complete",
            panelTitle: "Onboarding complete",
            referenceLabel: "Your reference number",
            whatHappensNext: "What happens next"
          }),
          cy: expect.objectContaining({
            title: "Ymgymryd wedi'i gwblhau"
          })
        })
      );
    });

    it("should redirect to start when no confirmation ID in params", async () => {
      mockReq.params = {};

      await GET(mockReq as Request, mockRes as Response);

      expect(mockRes.redirect).toHaveBeenCalledWith("/onboarding/start");
      expect(mockRes.render).not.toHaveBeenCalled();
    });

    it("should redirect to start when params is undefined", async () => {
      mockReq.params = undefined;

      await GET(mockReq as Request, mockRes as Response);

      expect(mockRes.redirect).toHaveBeenCalledWith("/onboarding/start");
      expect(mockRes.render).not.toHaveBeenCalled();
    });

    it.each(["test-id-123", "<img src=x>", `${CONFIRMATION_ID}<b>`, CONFIRMATION_ID.toUpperCase()])(
      "should render the 404 page when the confirmation ID %s is not a cuid",
      async (confirmationId) => {
        mockReq.params = { confirmationId };

        await GET(mockReq as Request, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.render).toHaveBeenCalledWith("errors/404");
      }
    );
  });

  describe("template", () => {
    it("should show the confirmation ID in the panel", async () => {
      const { status, body } = await request(`/onboarding/confirmation/${CONFIRMATION_ID}`);

      expect(status).toBe(200);
      expect(body).toContain(`<strong>${CONFIRMATION_ID}</strong>`);
    });

    it("should serve the 404 page rather than render a malformed confirmation ID", async () => {
      const { status, body } = await request(`/onboarding/confirmation/${encodeURIComponent("<img src=x onerror=alert(1)>")}`);

      expect(status).toBe(404);
      expect(body).toContain("Page not found");
      expect(body).not.toContain("<img src=x");
    });

    it("should escape the confirmation ID when rendering the panel", async () => {
      const html = await renderView("[confirmationId]", { confirmationId: "<img src=x>", referenceLabel: "Your reference number" });

      expect(html).toContain("<strong>&lt;img src=x&gt;</strong>");
      expect(html).not.toContain("<img src=x>");
    });
  });
});

async function createApp() {
  const app = express();
  await configureGovuk(app, [WEB_SRC], { assetOptions: { distPath: WEB_SRC } });
  app.get("/onboarding/confirmation/:confirmationId", GET);
  return app;
}

async function request(url: string) {
  const server = (await createApp()).listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}${url}`);
    return { status: response.status, body: await response.text() };
  } finally {
    server.close();
  }
}

async function renderView(view: string, locals: Record<string, unknown>) {
  const app = await createApp();
  return new Promise<string>((resolve, reject) => app.render(view, locals, (err, html) => (err ? reject(err) : resolve(html))));
}
