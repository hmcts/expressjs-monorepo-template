import type { Session } from "express-session";
import {
  nameSchema,
  dobSchema,
  addressSchema,
  roleSchema,
  type NameData,
  type DobData,
  type AddressData,
  type RoleData,
  type OnboardingSubmission
} from "./validation.js";
import { getOnboardingSession, setSessionData } from "./session.js";
import { createOnboardingSubmission } from "./queries.js";

export function processNameSubmission(session: Session, formData: unknown): NameData {
  const validatedData = nameSchema.parse(formData);
  setSessionData(session, "name", validatedData);
  return validatedData;
}

export function processDateOfBirthSubmission(session: Session, formData: unknown): DobData {
  const validatedData = dobSchema.parse(formData);
  setSessionData(session, "dateOfBirth", validatedData);
  return validatedData;
}

export function processAddressSubmission(session: Session, formData: unknown): AddressData {
  const validatedData = addressSchema.parse(formData);
  setSessionData(session, "address", validatedData);
  return validatedData;
}

export function processRoleSubmission(session: Session, formData: unknown): RoleData {
  const validatedData = roleSchema.parse(formData);
  setSessionData(session, "role", validatedData);
  return validatedData;
}

export function prepareSubmissionData(session: Session): OnboardingSubmission {
  const sessionData = getOnboardingSession(session);

  if (!sessionData.name || !sessionData.dateOfBirth || !sessionData.address || !sessionData.role) {
    throw new Error("Session data incomplete - cannot submit");
  }

  const dateOfBirth = new Date(sessionData.dateOfBirth.year, sessionData.dateOfBirth.month - 1, sessionData.dateOfBirth.day);

  return {
    firstName: sessionData.name.firstName,
    lastName: sessionData.name.lastName,
    dateOfBirth,
    addressLine1: sessionData.address.addressLine1,
    addressLine2: sessionData.address.addressLine2,
    town: sessionData.address.town,
    postcode: sessionData.address.postcode,
    roleType: sessionData.role.roleType,
    roleOther: sessionData.role.roleType === "other" ? sessionData.role.roleOther : undefined
  };
}

export async function submitOnboarding(session: Session): Promise<string> {
  const submissionData = prepareSubmissionData(session);

  const submission = await createOnboardingSubmission(submissionData);

  return submission.id;
}

export function getSessionDataForPage(session: Session, page: string) {
  const sessionData = getOnboardingSession(session);

  switch (page) {
    case "name":
      return sessionData.name;
    case "date-of-birth":
      return sessionData.dateOfBirth;
    case "address":
      return sessionData.address;
    case "role":
      return sessionData.role;
    default:
      return null;
  }
}
