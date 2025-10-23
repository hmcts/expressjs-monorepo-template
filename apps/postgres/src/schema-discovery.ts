// Schema discovery functionality for module integration
import { prismaSchemas as onboardingSchemas } from "@hmcts/onboarding/config";

export function getPrismaSchemas(): string[] {
  return [onboardingSchemas];
}
