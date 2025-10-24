import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { GET, POST } from "./address.js";
import { ZodError } from "zod";

vi.mock("../../onboarding/service.js", () => {
  const processAddressSubmission = vi.fn();
  const getSessionDataForPage = vi.fn();
  return { processAddressSubmission, getSessionDataForPage };
});

vi.mock("../../onboarding/validation.js", () => {
  const formatZodErrors = vi.fn();
  const createErrorSummary = vi.fn();
  return { formatZodErrors, createErrorSummary };
});

vi.mock("../../onboarding/navigation.js", () => {
  const getPreviousPage = vi.fn(() => "/onboarding/role");
  return { getPreviousPage };
});

import { processAddressSubmission, getSessionDataForPage } from "../../onboarding/service.js";
import { formatZodErrors, createErrorSummary } from "../../onboarding/validation.js";

describe("address page", () => {
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
    it("should render the address page", async () => {
      vi.mocked(getSessionDataForPage).mockReturnValue(undefined);
      await GET(mockReq as Request, mockRes as Response);

      expect(mockRes.render).toHaveBeenCalledWith("onboarding/address", {
        data: undefined,
        backLink: "/onboarding/role",
        en: expect.objectContaining({
          title: "What is your address?",
          heading: "What is your address?"
        }),
        cy: expect.objectContaining({
          title: "Beth yw eich cyfeiriad?",
          heading: "Beth yw eich cyfeiriad?"
        })
      });
    });
  });

  describe("POST", () => {
    it("should save valid address data and redirect to next step", async () => {
      mockReq.body = {
        addressLine1: "123 Test Street",
        addressLine2: "Flat 4",
        town: "London",
        postcode: "SW1A 1AA"
      };

      (processAddressSubmission as any).mockImplementation(() => {});

      await POST(mockReq as Request, mockRes as Response);

      expect(processAddressSubmission).toHaveBeenCalledWith(mockReq.session, mockReq.body);
      expect(mockRes.redirect).toHaveBeenCalledWith("/onboarding/role");
    });

    it("should render errors for invalid address data", async () => {
      mockReq.body = {
        addressLine1: "",
        town: "",
        postcode: "INVALID"
      };

      const mockZodError = new ZodError([
        {
          code: "too_small",
          minimum: 1,
          type: "string",
          inclusive: true,
          exact: false,
          message: "Enter address line 1",
          path: ["addressLine1"]
        }
      ]);

      const errors = {
        addressLine1: { text: "Enter address line 1" },
        town: { text: "Enter town or city" },
        postcode: { text: "Enter a valid postcode" }
      };

      const errorSummary = [
        { text: "Enter address line 1", href: "#addressLine1" },
        { text: "Enter town or city", href: "#town" },
        { text: "Enter a valid postcode", href: "#postcode" }
      ];

      (processAddressSubmission as any).mockImplementation(() => {
        throw mockZodError;
      });
      (formatZodErrors as any).mockReturnValue(errors);
      (createErrorSummary as any).mockReturnValue(errorSummary);

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.redirect).not.toHaveBeenCalled();
      expect(mockRes.render).toHaveBeenCalledWith("onboarding/address", {
        errors,
        errorSummary,
        data: mockReq.body,
        backLink: "/onboarding/role",
        en: expect.anything(),
        cy: expect.anything()
      });
    });
  });
});
