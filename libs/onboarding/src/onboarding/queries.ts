import { prisma } from "@hmcts/postgres-prisma";
import type { OnboardingSubmission } from "./validation.js";
export async function createOnboardingSubmission(data: OnboardingSubmission) {
  return prisma.onboardingSubmission.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth: data.dateOfBirth,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      town: data.town,
      postcode: data.postcode,
      roleType: data.roleType,
      roleOther: data.roleOther
    }
  });
}
export async function getSubmissionById(id: string) {
  return prisma.onboardingSubmission.findUnique({ where: { id } });
}
