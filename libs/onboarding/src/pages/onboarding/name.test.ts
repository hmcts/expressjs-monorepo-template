import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { GET, POST } from "./name.js";
import { ZodError } from "zod";

// Mock service helpers
vi.mock("../../onboarding/service.js", () => {
  const processNameSubmission = vi.fn();
  const getSessionDataForPage = vi.fn();
  return { processNameSubmission, getSessionDataForPage };
});

// Mock validation helpers
vi.mock("../../onboarding/validation.js", () => {
  const formatZodErrors = vi.fn();
  const createErrorSummary = vi.fn();
  return { formatZodErrors, createErrorSummary };
});

// Mock navigation helpers
vi.mock("../../onboarding/navigation.js", () => {
  const getPreviousPage = vi.fn(() => "/onboarding/start");
  return { getPreviousPage };
});

import { processNameSubmission, getSessionDataForPage } from "../../onboarding/service.js";
import { formatZodErrors, createErrorSummary } from "../../onboarding/validation.js";
import { getPreviousPage } from "../../onboarding/navigation.js";

const mockRequest = (overrides = {}) =>
  ({
    session: {},
    body: {},
    query: {},
    ...overrides
  }) as Request;

const mockResponse = () => {
  const res = {} as Response;
  res.render = vi.fn();
  res.redirect = vi.fn();
  return res;
};

describe("Name page controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSessionDataForPage as any).mockReturnValue(undefined);
    (getPreviousPage as any).mockReturnValue("/onboarding/start");
  });

  describe("GET", () => {
    it("should render the name page with empty form when no session data", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await GET(req, res);

      expect(res.render).toHaveBeenCalledWith("onboarding/name", {
        data: undefined,
        backLink: "/onboarding/start",
        en: expect.objectContaining({
          title: "What is your name?",
          firstNameLabel: "First name",
          lastNameLabel: "Last name",
          back: "Back",
          continue: "Continue"
        }),
        cy: expect.objectContaining({
          title: "Beth yw eich enw?",
          firstNameLabel: "Enw cyntaf"
        })
      });
    });

    it("should render with existing session data", async () => {
      const sessionData = { firstName: "John", lastName: "Doe" };
      (getSessionDataForPage as any).mockReturnValue(sessionData);

      const req = mockRequest();
      const res = mockResponse();

      await GET(req, res);

      expect(res.render).toHaveBeenCalledWith(
        "onboarding/name",
        expect.objectContaining({
          data: { firstName: "John", lastName: "Doe" }
        })
      );
    });
  });

  describe("POST", () => {
    it("should validate and save valid form data", async () => {
      const req = mockRequest({
        body: { firstName: "John", lastName: "Doe" }
      });
      const res = mockResponse();

      await POST(req, res);

      expect(processNameSubmission).toHaveBeenCalledWith(req.session, {
        firstName: "John",
        lastName: "Doe"
      });
      expect(res.redirect).toHaveBeenCalledWith("/onboarding/date-of-birth");
    });

    it("should redirect to summary when return=summary query param", async () => {
      const req = mockRequest({
        body: { firstName: "John", lastName: "Doe" },
        query: { return: "summary" }
      });
      const res = mockResponse();

      await POST(req, res);

      expect(res.redirect).toHaveBeenCalledWith("/onboarding/summary");
    });

    it("should handle validation errors and render form with errors", async () => {
      const mockZodError = new ZodError([
        {
          code: "too_small",
          minimum: 1,
          type: "string",
          inclusive: true,
          exact: false,
          message: "First name is required",
          path: ["firstName"]
        }
      ]);

      const mockErrors = {
        firstName: { text: "First name is required" }
      };

      const mockErrorSummary = [{ text: "First name is required", href: "#firstName" }];

      (processNameSubmission as any).mockImplementation(() => {
        throw mockZodError;
      });
      (formatZodErrors as any).mockReturnValue(mockErrors);
      (createErrorSummary as any).mockReturnValue(mockErrorSummary);

      const req = mockRequest({
        body: { firstName: "", lastName: "Doe" }
      });
      const res = mockResponse();

      await POST(req, res);

      expect(formatZodErrors).toHaveBeenCalledWith(mockZodError);
      expect(createErrorSummary).toHaveBeenCalledWith(mockErrors);
      expect(res.render).toHaveBeenCalledWith(
        "onboarding/name",
        expect.objectContaining({
          errors: mockErrors,
          errorSummary: mockErrorSummary,
          data: { firstName: "", lastName: "Doe" },
          backLink: "/onboarding/start"
        })
      );
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it("should re-throw non-ZodError exceptions", async () => {
      const generalError = new Error("Database connection failed");
      (processNameSubmission as any).mockImplementation(() => {
        throw generalError;
      });

      const req = mockRequest({
        body: { firstName: "John", lastName: "Doe" }
      });
      const res = mockResponse();

      await expect(POST(req, res)).rejects.toThrow("Database connection failed");
      expect(res.render).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });
});
