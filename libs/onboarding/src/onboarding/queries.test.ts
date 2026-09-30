import { prisma } from "@hmcts/postgres-prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOnboardingSubmission } from "./queries.js";

vi.mock("@hmcts/postgres-prisma", () => ({
  prisma: {
    onboardingSubmission: {
      create: vi.fn()
    }
  }
}));

describe("queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createOnboardingSubmission", () => {
    it("should create new onboarding submission", async () => {
      const mockData = {
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: new Date("1990-06-15"),
        addressLine1: "123 Test Street",
        addressLine2: "Flat 4",
        town: "London",
        postcode: "SW1A 1AA",
        roleType: "prosecutor" as const,
        roleOther: undefined
      };

      const mockResult = {
        id: "test-id",
        ...mockData,
        sessionId: "session-123",
        submittedAt: new Date()
      };

      vi.mocked(prisma.onboardingSubmission.create).mockResolvedValue(mockResult as any);

      const result = await createOnboardingSubmission(mockData);

      expect(prisma.onboardingSubmission.create).toHaveBeenCalledWith({
        data: mockData
      });
      expect(result).toEqual(mockResult);
    });

    it("should handle database errors", async () => {
      const mockData = {
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: new Date("1990-06-15"),
        addressLine1: "123 Test Street",
        town: "London",
        postcode: "SW1A 1AA",
        roleType: "prosecutor" as const
      };

      vi.mocked(prisma.onboardingSubmission.create).mockRejectedValue(new Error("Database error"));

      await expect(createOnboardingSubmission(mockData)).rejects.toThrow("Database error");
    });

    it("should include roleOther when provided", async () => {
      const mockData = {
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: new Date("1990-06-15"),
        addressLine1: "123 Test Street",
        town: "London",
        postcode: "SW1A 1AA",
        roleType: "other" as const,
        roleOther: "Legal advisor"
      };

      const mockResult = {
        id: "test-id",
        ...mockData,
        sessionId: null,
        submittedAt: new Date()
      };

      vi.mocked(prisma.onboardingSubmission.create).mockResolvedValue(mockResult as any);

      await createOnboardingSubmission(mockData);

      expect(prisma.onboardingSubmission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          roleOther: "Legal advisor"
        })
      });
    });
  });
});
