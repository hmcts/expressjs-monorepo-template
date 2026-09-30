import type { Session } from "express-session";
import type { AddressData, DobData, NameData, RoleData } from "./validation.js";

export function getOnboardingSession(session: Session): OnboardingData {
  const onboardingSession = session as OnboardingSession;
  return onboardingSession.onboarding || {};
}

export function setSessionData<T extends keyof OnboardingData>(session: Session, key: T, data: OnboardingData[T]): void {
  const onboardingSession = session as OnboardingSession;
  onboardingSession.onboarding ??= {};
  onboardingSession.onboarding[key] = data;
}

export function clearOnboardingSession(session: Session): void {
  const onboardingSession = session as OnboardingSession;
  delete onboardingSession.onboarding;
}

export function isSessionComplete(session: Session): boolean {
  const sessionData = getOnboardingSession(session);
  return !!(sessionData.name && sessionData.dateOfBirth && sessionData.address && sessionData.role);
}

export interface OnboardingSession extends Session {
  onboarding?: OnboardingData;
}

type OnboardingData = {
  name?: NameData;
  dateOfBirth?: DobData;
  address?: AddressData;
  role?: RoleData;
};
