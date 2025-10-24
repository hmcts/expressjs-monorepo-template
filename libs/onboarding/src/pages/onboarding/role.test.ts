import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { GET, POST } from "./role.js";
import { ZodError } from "zod";

vi.mock("../../onboarding/service.js", () => ({
  processRoleSubmission: vi.fn(),
  getSessionDataForPage: vi.fn()
}));

vi.mock("../../onboarding/validation.js", () => ({
  formatZodErrors: vi.fn(),
  createErrorSummary: vi.fn()
}));

vi.mock("../../onboarding/navigation.js", () => ({
  getPreviousPage: vi.fn(() => "/onboarding/date-of-birth")
}));

import { processRoleSubmission, getSessionDataForPage } from "../../onboarding/service.js";
import { formatZodErrors, createErrorSummary } from "../../onboarding/validation.js";

describe("role page", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      session: {},
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
      getSessionDataForPage.mockReturnValue(undefined);
      await GET(mockReq as Request, mockRes as Response);

      expect(mockRes.render).toHaveBeenCalledWith(
        "onboarding/role",
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

      (processRoleSubmission as any).mockImplementation(() => {});

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
        role: { text: "Select a role" }
      };

      const errorSummary = [{ text: "Select a role", href: "#role" }];

      (processRoleSubmission as any).mockImplementation(() => {
        throw mockZodError;
      });
      (formatZodErrors as any).mockReturnValue(errors);
      (createErrorSummary as any).mockReturnValue(errorSummary);

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.redirect).not.toHaveBeenCalled();
      expect(mockRes.render).toHaveBeenCalledWith("onboarding/role", {
        errors,
        errorSummary,
        data: mockReq.body,
        backLink: "/onboarding/date-of-birth",
        en: expect.anything(),
        cy: expect.anything()
      });
    });

    it("should handle other role options", async () => {
      mockReq.body = {
        role: "other"
      };

      (processRoleSubmission as any).mockImplementation(() => {});

      await POST(mockReq as Request, mockRes as Response);

      expect(processRoleSubmission).toHaveBeenCalledWith(mockReq.session, mockReq.body);
      expect(mockRes.redirect).toHaveBeenCalledWith("/onboarding/summary");
    });
  });
});
