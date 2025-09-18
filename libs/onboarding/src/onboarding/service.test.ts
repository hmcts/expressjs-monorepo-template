import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Session } from "express-session";
import {
  processNameSubmission,
  processDateOfBirthSubmission,
  processAddressSubmission,
  processRoleSubmission,
  prepareSubmissionData,
  getSessionDataForPage
} from "./service.js";

// Mock the queries module
vi.mock("./queries.js", () => ({
  createOnboardingSubmission: vi.fn().mockResolvedValue({ id: "test-id" })
}));

describe("service functions", () => {
  let mockSession: Session;

  beforeEach(() => {
    mockSession = {
      id: "test-session",
      cookie: {} as any,
      regenerate: () => {},
      destroy: () => {},
      reload: () => {},
      save: () => {},
      touch: () => {}
    };
  });

  describe("processNameSubmission", () => {
    it("should process valid name data", () => {
      const formData = {
        firstName: "John",
        lastName: "Smith"
      };

      const result = processNameSubmission(mockSession, formData);
      expect(result).toEqual(formData);
      expect((mockSession as any).onboarding.name).toEqual(formData);
    });

    it("should throw error for invalid name data", () => {
      const formData = {
        firstName: "",
        lastName: "Smith"
      };

      expect(() => processNameSubmission(mockSession, formData)).toThrow();
    });
  });

  describe("processDateOfBirthSubmission", () => {
    it("should process valid date data", () => {
      const formData = {
        day: "15",
        month: "6",
        year: "1990"
      };

      const result = processDateOfBirthSubmission(mockSession, formData);
      expect(result.day).toBe(15);
      expect(result.month).toBe(6);
      expect(result.year).toBe(1990);
    });

    it("should throw error for underage user", () => {
      const currentYear = new Date().getFullYear();
      const formData = {
        day: "1",
        month: "1",
        year: (currentYear - 10).toString() // 10 years old
      };

      expect(() => processDateOfBirthSubmission(mockSession, formData)).toThrow();
    });
  });

  describe("processAddressSubmission", () => {
    it("should process valid address data", () => {
      const formData = {
        addressLine1: "123 Main Street",
        addressLine2: "Flat 2",
        town: "London",
        postcode: "SW1A 1AA"
      };

      const result = processAddressSubmission(mockSession, formData);
      expect(result).toEqual(formData);
    });

    it("should throw error for missing required fields", () => {
      const formData = {
        addressLine1: "",
        town: "London",
        postcode: "SW1A 1AA"
      };

      expect(() => processAddressSubmission(mockSession, formData)).toThrow();
    });
  });

  describe("processRoleSubmission", () => {
    it("should process predefined role", () => {
      const formData = {
        roleType: "frontend-developer"
      };

      const result = processRoleSubmission(mockSession, formData);
      expect(result.roleType).toBe("frontend-developer");
    });

    it("should process other role with specification", () => {
      const formData = {
        roleType: "other",
        roleOther: "Product Manager"
      };

      const result = processRoleSubmission(mockSession, formData);
      expect(result.roleType).toBe("other");
      expect(result.roleOther).toBe("Product Manager");
    });

    it("should throw error for other role without specification", () => {
      const formData = {
        roleType: "other"
      };

      expect(() => processRoleSubmission(mockSession, formData)).toThrow();
    });
  });

  describe("prepareSubmissionData", () => {
    it("should prepare complete submission data", () => {
      (mockSession as any).onboarding = {
        name: { firstName: "John", lastName: "Smith" },
        dateOfBirth: { day: 15, month: 6, year: 1990 },
        address: {
          addressLine1: "123 Main St",
          town: "London",
          postcode: "SW1A 1AA"
        },
        role: { roleType: "frontend-developer" }
      };

      const result = prepareSubmissionData(mockSession);
      expect(result.firstName).toBe("John");
      expect(result.lastName).toBe("Smith");
      expect(result.dateOfBirth).toEqual(new Date(1990, 5, 15)); // Month is 0-indexed
      expect(result.addressLine1).toBe("123 Main St");
      expect(result.roleType).toBe("frontend-developer");
    });

    it("should throw error for incomplete session data", () => {
      expect(() => prepareSubmissionData(mockSession)).toThrow("Session data incomplete");
    });
  });

  describe("getSessionDataForPage", () => {
    beforeEach(() => {
      (mockSession as any).onboarding = {
        name: { firstName: "John", lastName: "Smith" },
        dateOfBirth: { day: 15, month: 6, year: 1990 },
        address: {
          addressLine1: "123 Main St",
          town: "London",
          postcode: "SW1A 1AA"
        },
        role: { roleType: "frontend-developer" }
      };
    });

    it("should return correct data for each page", () => {
      expect(getSessionDataForPage(mockSession, "name")).toEqual({
        firstName: "John",
        lastName: "Smith"
      });

      expect(getSessionDataForPage(mockSession, "date-of-birth")).toEqual({
        day: 15,
        month: 6,
        year: 1990
      });

      expect(getSessionDataForPage(mockSession, "address")).toEqual({
        addressLine1: "123 Main St",
        town: "London",
        postcode: "SW1A 1AA"
      });

      expect(getSessionDataForPage(mockSession, "role")).toEqual({
        roleType: "frontend-developer"
      });
    });

    it("should return null for unknown page", () => {
      expect(getSessionDataForPage(mockSession, "unknown")).toBeNull();
    });
  });
});
