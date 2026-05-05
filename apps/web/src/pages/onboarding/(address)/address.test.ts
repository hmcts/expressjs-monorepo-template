import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { GET, POST } from "./address.js";

vi.mock("@hmcts/onboarding", () => ({
  processAddressSubmission: vi.fn(),
  getSessionDataForPage: vi.fn(),
  formatZodErrors: vi.fn(),
  createErrorSummary: vi.fn(),
  getPreviousPage: vi.fn(() => "/onboarding/role")
}));

import { createErrorSummary, formatZodErrors, getSessionDataForPage, processAddressSubmission } from "@hmcts/onboarding";

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

      expect(mockRes.render).toHaveBeenCalledWith("address", {
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
      expect(mockRes.render).toHaveBeenCalledWith("address", {
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
