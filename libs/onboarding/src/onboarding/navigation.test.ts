import { describe, it, expect } from "vitest";
import { getPreviousPage, getChangePageRoute, formatDateForDisplay, formatAddressForDisplay, formatRoleForDisplay } from "./navigation.js";

describe("navigation helpers", () => {
  describe("getPreviousPage", () => {
    it("should return previous page in flow", () => {
      expect(getPreviousPage("name")).toBe("/onboarding/start");
      expect(getPreviousPage("date-of-birth")).toBe("/onboarding/name");
      expect(getPreviousPage("address")).toBe("/onboarding/date-of-birth");
      expect(getPreviousPage("role")).toBe("/onboarding/address");
      expect(getPreviousPage("summary")).toBe("/onboarding/role");
    });

    it("should return null for start page", () => {
      expect(getPreviousPage("start")).toBeNull();
    });
  });

  describe("getChangePageRoute", () => {
    it("should return correct change page routes", () => {
      expect(getChangePageRoute("name")).toBe("/onboarding/name");
      expect(getChangePageRoute("dateOfBirth")).toBe("/onboarding/date-of-birth");
      expect(getChangePageRoute("address")).toBe("/onboarding/address");
      expect(getChangePageRoute("role")).toBe("/onboarding/role");
    });

    it("should return start page for unknown field", () => {
      expect(getChangePageRoute("unknown")).toBe("/onboarding/start");
    });
  });

  describe("formatDateForDisplay", () => {
    it("should format date correctly", () => {
      const dateData = { day: 15, month: 6, year: 1990 };
      expect(formatDateForDisplay(dateData)).toBe("15 June 1990");
    });

    it("should handle single digit day and month", () => {
      const dateData = { day: 1, month: 1, year: 2000 };
      expect(formatDateForDisplay(dateData)).toBe("1 January 2000");
    });

    it("should use the month name for December", () => {
      const dateData = { day: 31, month: 12, year: 1999 };
      expect(formatDateForDisplay(dateData)).toBe("31 December 1999");
    });
  });

  describe("formatAddressForDisplay", () => {
    it("should format complete address", () => {
      const address = {
        addressLine1: "123 Main Street",
        addressLine2: "Flat 2",
        town: "London",
        postcode: "SW1A 1AA"
      };

      const result = formatAddressForDisplay(address);
      expect(result).toEqual(["123 Main Street", "Flat 2", "London", "SW1A 1AA"]);
    });

    it("should format address without line 2", () => {
      const address = {
        addressLine1: "123 Main Street",
        town: "London",
        postcode: "SW1A 1AA"
      };

      const result = formatAddressForDisplay(address);
      expect(result).toEqual(["123 Main Street", "London", "SW1A 1AA"]);
    });
  });

  describe("formatRoleForDisplay", () => {
    it("should format predefined roles", () => {
      expect(formatRoleForDisplay({ roleType: "frontend-developer" })).toBe("Frontend Developer");
      expect(formatRoleForDisplay({ roleType: "backend-developer" })).toBe("Backend Developer");
      expect(formatRoleForDisplay({ roleType: "test-engineer" })).toBe("Test Engineer");
    });

    it("should format other role", () => {
      const role = { roleType: "other", roleOther: "Product Manager" };
      expect(formatRoleForDisplay(role)).toBe("Product Manager");
    });

    it("should handle other role without specification", () => {
      const role = { roleType: "other" };
      expect(formatRoleForDisplay(role)).toBe("Other");
    });

    it("should fall back to roleType for unknown role", () => {
      const role = { roleType: "unknown-role" };
      expect(formatRoleForDisplay(role as any)).toBe("unknown-role");
    });
  });
});
