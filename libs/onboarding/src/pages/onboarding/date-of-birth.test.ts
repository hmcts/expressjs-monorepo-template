import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { GET, POST } from "./date-of-birth.js";
import { ZodError } from "zod";

vi.mock("../../onboarding/service.js", () => {
  const processDateOfBirthSubmission = vi.fn();
  const getSessionDataForPage = vi.fn();
  return { processDateOfBirthSubmission, getSessionDataForPage };
});

vi.mock("../../onboarding/validation.js", () => {
  const formatZodErrors = vi.fn();
  const createErrorSummary = vi.fn();
  return { formatZodErrors, createErrorSummary };
});

vi.mock("../../onboarding/navigation.js", () => {
  const getPreviousPage = vi.fn(() => "/onboarding/name");
  return { getPreviousPage };
});

import { processDateOfBirthSubmission, getSessionDataForPage } from "../../onboarding/service.js";
import { formatZodErrors, createErrorSummary } from "../../onboarding/validation.js";

describe("date-of-birth page", () => {
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
    it("should render the date of birth page", async () => {
      vi.mocked(getSessionDataForPage).mockReturnValue(undefined);
      await GET(mockReq as Request, mockRes as Response);

      expect(mockRes.render).toHaveBeenCalledWith("onboarding/date-of-birth", {
        data: undefined,
        backLink: "/onboarding/name",
        en: expect.objectContaining({
          title: "What is your date of birth?",
          heading: "What is your date of birth?"
        }),
        cy: expect.objectContaining({
          title: "Beth yw eich dyddiad geni?",
          heading: "Beth yw eich dyddiad geni?"
        })
      });
    });
  });

  describe("POST", () => {
    it("should save valid date of birth and redirect to next step", async () => {
      mockReq.body = {
        dobDay: "15",
        dobMonth: "6",
        dobYear: "1990"
      };

      (processDateOfBirthSubmission as any).mockImplementation(() => {});

      await POST(mockReq as Request, mockRes as Response);

      expect(processDateOfBirthSubmission).toHaveBeenCalledWith(mockReq.session, mockReq.body);
      expect(mockRes.redirect).toHaveBeenCalledWith("/onboarding/address");
    });

    it("should render errors for invalid date", async () => {
      mockReq.body = {
        dobDay: "32",
        dobMonth: "13",
        dobYear: "2030"
      };

      const mockZodError = new ZodError([
        {
          code: "custom",
          message: "Date of birth must be a real date",
          path: ["dateOfBirth"]
        }
      ]);

      const errors = {
        dateOfBirth: { text: "Date of birth must be a real date" }
      };

      const errorSummary = [{ text: "Date of birth must be a real date", href: "#dobDay" }];

      (processDateOfBirthSubmission as any).mockImplementation(() => {
        throw mockZodError;
      });
      (formatZodErrors as any).mockReturnValue(errors);
      (createErrorSummary as any).mockReturnValue(errorSummary);

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.redirect).not.toHaveBeenCalled();
      expect(mockRes.render).toHaveBeenCalledWith("onboarding/date-of-birth", {
        errors,
        errorSummary,
        data: mockReq.body,
        backLink: "/onboarding/name",
        en: expect.anything(),
        cy: expect.anything()
      });
    });

    it("should render errors for empty date fields", async () => {
      mockReq.body = {
        dobDay: "",
        dobMonth: "",
        dobYear: ""
      };

      const mockZodError = new ZodError([
        {
          code: "custom",
          message: "Enter your date of birth",
          path: ["dateOfBirth"]
        }
      ]);

      const errors = {
        dateOfBirth: { text: "Enter your date of birth" }
      };

      const errorSummary = [{ text: "Enter your date of birth", href: "#dobDay" }];

      (processDateOfBirthSubmission as any).mockImplementation(() => {
        throw mockZodError;
      });
      (formatZodErrors as any).mockReturnValue(errors);
      (createErrorSummary as any).mockReturnValue(errorSummary);

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.redirect).not.toHaveBeenCalled();
      expect(mockRes.render).toHaveBeenCalledWith("onboarding/date-of-birth", {
        errors,
        errorSummary,
        data: mockReq.body,
        backLink: "/onboarding/name",
        en: expect.anything(),
        cy: expect.anything()
      });
    });
  });
});
