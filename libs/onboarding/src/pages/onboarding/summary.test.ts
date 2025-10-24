import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { GET, POST } from "./summary.js";

// Mock dependencies
vi.mock("../../onboarding/session.js", () => {
  const getAllSessionData = vi.fn();
  const isSessionComplete = vi.fn();
  const clearOnboardingSession = vi.fn();
  return { getAllSessionData, isSessionComplete, clearOnboardingSession };
});

vi.mock("../../onboarding/service.js", () => {
  const submitOnboarding = vi.fn();
  return { submitOnboarding };
});

vi.mock("../../onboarding/navigation.js", () => {
  const formatDateForDisplay = vi.fn();
  const formatAddressForDisplay = vi.fn();
  const formatRoleForDisplay = vi.fn();
  const getPreviousPage = vi.fn();
  const getChangePageRoute = vi.fn();
  return { formatDateForDisplay, formatAddressForDisplay, formatRoleForDisplay, getPreviousPage, getChangePageRoute };
});

import { getAllSessionData, isSessionComplete, clearOnboardingSession } from "../../onboarding/session.js";
import { submitOnboarding } from "../../onboarding/service.js";
import { formatDateForDisplay, formatAddressForDisplay, formatRoleForDisplay, getPreviousPage, getChangePageRoute } from "../../onboarding/navigation.js";

const mockRequest = (overrides = {}) =>
  ({
    session: {},
    ...overrides
  }) as Request;

const mockResponse = () => {
  const res = {} as Response;
  res.render = vi.fn();
  res.redirect = vi.fn();
  res.status = vi.fn().mockReturnThis();
  return res;
};

describe("Summary page controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (formatDateForDisplay as any).mockReturnValue("1 January 1990");
    (formatAddressForDisplay as any).mockReturnValue(["123 Test Street", "London", "SW1A 1AA"]);
    (formatRoleForDisplay as any).mockReturnValue("Frontend Developer");
    (getPreviousPage as any).mockReturnValue("/onboarding/role");
    (getChangePageRoute as any).mockImplementation((page) => `/onboarding/${page}`);
  });

  describe("GET", () => {
    it("should redirect to start if session is incomplete", async () => {
      (isSessionComplete as any).mockReturnValue(false);
      const req = mockRequest();
      const res = mockResponse();

      await GET(req, res);

      expect(res.redirect).toHaveBeenCalledWith("/onboarding/start");
    });

    it("should render summary page with complete session data", async () => {
      (isSessionComplete as any).mockReturnValue(true);
      (getAllSessionData as any).mockReturnValue({
        name: { firstName: "John", lastName: "Doe" },
        dateOfBirth: { day: 1, month: 1, year: 1990 },
        address: { addressLine1: "123 Test Street", town: "London", postcode: "SW1A 1AA" },
        role: { roleType: "frontend-developer" }
      });

      const req = mockRequest();
      const res = mockResponse();

      await GET(req, res);

      expect(res.render).toHaveBeenCalledWith("onboarding/summary", {
        summaryData: {
          name: "John Doe",
          dateOfBirth: "1 January 1990",
          address: ["123 Test Street", "London", "SW1A 1AA"],
          role: "Frontend Developer"
        },
        changeLinks: {
          name: "/onboarding/name?return=summary",
          dateOfBirth: "/onboarding/dateOfBirth?return=summary",
          address: "/onboarding/address?return=summary",
          role: "/onboarding/role?return=summary"
        },
        backLink: "/onboarding/role",
        en: expect.any(Object),
        cy: expect.any(Object)
      });
    });
  });

  describe("POST", () => {
    it("should redirect to start if session is incomplete", async () => {
      (isSessionComplete as any).mockReturnValue(false);
      const req = mockRequest();
      const res = mockResponse();

      await POST(req, res);

      expect(res.redirect).toHaveBeenCalledWith("/onboarding/start");
    });

    it("should submit onboarding and redirect to confirmation on success", async () => {
      (isSessionComplete as any).mockReturnValue(true);
      (submitOnboarding as any).mockResolvedValue("test-confirmation-id");

      const req = mockRequest();
      const res = mockResponse();

      await POST(req, res);

      expect(submitOnboarding).toHaveBeenCalledWith(req.session);
      expect(clearOnboardingSession).toHaveBeenCalledWith(req.session);
      expect(res.redirect).toHaveBeenCalledWith("/onboarding/confirmation/test-confirmation-id");
    });

    it("should handle submission errors", async () => {
      (isSessionComplete as any).mockReturnValue(true);
      (submitOnboarding as any).mockRejectedValue(new Error("Database error"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const req = mockRequest();
      const res = mockResponse();

      await POST(req, res);

      expect(consoleSpy).toHaveBeenCalledWith("Error submitting onboarding:", expect.any(Error));
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.render).toHaveBeenCalledWith("errors/500");

      consoleSpy.mockRestore();
    });
  });
});
