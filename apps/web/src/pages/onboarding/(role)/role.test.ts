import type { AddressInfo } from "node:net";
import path from "node:path";
import { configureGovuk } from "@hmcts-cft/express-govuk-starter";
import type { Request, Response } from "express";
import express from "express";
import type { Session } from "express-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { GET, POST } from "./role.js";

vi.mock("@hmcts/onboarding", () => ({
  processRoleSubmission: vi.fn(),
  getSessionDataForPage: vi.fn(),
  formatZodErrors: vi.fn(),
  createErrorSummary: vi.fn(),
  getPreviousPage: vi.fn(() => "/onboarding/date-of-birth")
}));

import { createErrorSummary, formatZodErrors, getSessionDataForPage, processRoleSubmission } from "@hmcts/onboarding";

const WEB_SRC = path.resolve(import.meta.dirname, "../../..");

describe("role page", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      session: {} as Session,
      body: {},
      query: {}
    };
    mockRes = {
      render: vi.fn(),
      redirect: vi.fn()
    };
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("should render the role page", async () => {
      vi.mocked(getSessionDataForPage).mockReturnValue(undefined);
      await GET(mockReq as Request, mockRes as Response);

      expect(mockRes.render).toHaveBeenCalledWith(
        "role",
        expect.objectContaining({
          en: expect.objectContaining({
            title: "What is your role?",
            heading: "What is your role?",
            options: expect.objectContaining({
              frontendDeveloper: "Frontend Developer",
              backendDeveloper: "Backend Developer",
              testEngineer: "Test Engineer",
              other: "Other"
            })
          }),
          cy: expect.objectContaining({
            title: "Beth yw eich rôl?",
            heading: "Beth yw eich rôl?"
          })
        })
      );
    });
  });

  describe("POST", () => {
    it("should save valid role and redirect to next step", async () => {
      mockReq.body = {
        role: "frontendDeveloper"
      };

      await POST(mockReq as Request, mockRes as Response);

      expect(processRoleSubmission).toHaveBeenCalledWith(mockReq.session, mockReq.body);
      expect(mockRes.redirect).toHaveBeenCalledWith("/onboarding/summary");
    });

    it("should render errors when no role selected", async () => {
      mockReq.body = {};

      const mockZodError = new ZodError([
        {
          code: "custom",
          message: "Select a role",
          path: ["role"]
        }
      ]);

      const errors = {
        role: { field: "role", text: "Select a role", href: "#role" }
      };

      const errorSummary = {
        titleText: "There is a problem",
        errorList: [{ field: "role", text: "Select a role", href: "#role" }]
      };

      vi.mocked(processRoleSubmission).mockImplementationOnce(() => {
        throw mockZodError;
      });
      vi.mocked(formatZodErrors).mockReturnValue(errors);
      vi.mocked(createErrorSummary).mockReturnValue(errorSummary);

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.redirect).not.toHaveBeenCalled();
      expect(mockRes.render).toHaveBeenCalledWith("role", {
        errors,
        errorSummary,
        data: mockReq.body,
        backLink: "/onboarding/date-of-birth",
        en: expect.anything(),
        cy: expect.anything()
      });
    });

    it("should rethrow non-Zod errors", async () => {
      const unexpectedError = new Error("Unexpected error");
      vi.mocked(processRoleSubmission).mockImplementationOnce(() => {
        throw unexpectedError;
      });

      await expect(POST(mockReq as Request, mockRes as Response)).rejects.toThrow("Unexpected error");
    });

    it("should handle other role options", async () => {
      mockReq.body = {
        role: "other"
      };

      await POST(mockReq as Request, mockRes as Response);

      expect(processRoleSubmission).toHaveBeenCalledWith(mockReq.session, mockReq.body);
      expect(mockRes.redirect).toHaveBeenCalledWith("/onboarding/summary");
    });
  });

  describe("template", () => {
    const hostileRole = '"><script>alert(1)</script>';

    it("should escape a stored roleOther value in the conditional input", async () => {
      vi.mocked(getSessionDataForPage).mockReturnValue({ roleType: "other", roleOther: hostileRole });

      const { body } = await request("GET", "/onboarding/role");

      expect(body).not.toContain("<script>alert(1)</script>");
      expect(body).toContain('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
    });

    it("should escape a submitted roleOther value and show its error on the roleOther input", async () => {
      vi.mocked(processRoleSubmission).mockImplementationOnce(() => {
        throw new ZodError([{ code: "custom", message: "Role must be 100 characters or less", path: ["roleOther"] }]);
      });
      vi.mocked(formatZodErrors).mockReturnValue({
        roleOther: { field: "roleOther", text: "Role must be 100 characters or less", href: "#roleOther" }
      });
      vi.mocked(createErrorSummary).mockReturnValue({
        titleText: "There is a problem",
        errorList: [{ field: "roleOther", text: "Role must be 100 characters or less", href: "#roleOther" }]
      });

      const { body } = await request("POST", "/onboarding/role", { roleType: "other", roleOther: hostileRole });

      expect(body).not.toContain("<script>alert(1)</script>");
      expect(body).toMatch(/<div class="govuk-radios__conditional" id="conditional-roleType-4">/);
      expect(body).toContain('<p id="roleOther-error" class="govuk-error-message">');
      const roleOtherInput = body.match(/<input[^>]*id="roleOther"[^>]*>/)?.[0] ?? "";
      expect(roleOtherInput).toMatch(/class="govuk-input govuk-!-width-two-thirds govuk-input--error"/);
      expect(roleOtherInput).toContain('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
      expect(roleOtherInput).toContain('aria-describedby="roleOther-error"');
      expect(body).not.toContain('id="roleType-error"');
    });

    it("should hide the conditional input when another role is selected", async () => {
      vi.mocked(getSessionDataForPage).mockReturnValue({ roleType: "frontend-developer" });

      const { body } = await request("GET", "/onboarding/role");

      expect(body).toContain('class="govuk-radios__conditional govuk-radios__conditional--hidden" id="conditional-roleType-4"');
    });

    it("should label the conditional input in Welsh when the locale is cy", async () => {
      vi.mocked(getSessionDataForPage).mockReturnValue(undefined);

      const { body } = await request("GET", "/onboarding/role?lng=cy");

      expect(body).toMatch(/<label class="govuk-label" for="roleOther">\s*Nodwch eich rôl\s*<\/label>/);
    });
  });
});

async function request(method: "GET" | "POST", url: string, form?: Record<string, string>) {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  await configureGovuk(app, [WEB_SRC], { assetOptions: { distPath: WEB_SRC } });
  app.get("/onboarding/role", GET);
  app.post("/onboarding/role", POST);

  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}${url}`, { method, body: form && new URLSearchParams(form) });
    return { status: response.status, body: await response.text() };
  } finally {
    server.close();
  }
}
