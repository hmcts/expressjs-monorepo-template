import type { Request, Response } from "express";
import { getAllSessionData, isSessionComplete, clearOnboardingSession } from "../../onboarding/session.js";
import { submitOnboarding } from "../../onboarding/service.js";
import { formatDateForDisplay, formatAddressForDisplay, formatRoleForDisplay, getPreviousPage, getChangePageRoute } from "../../onboarding/navigation.js";

const en = {
  title: "Check your answers",
  heading: "Check your answers",
  rows: {
    name: "Name",
    dateOfBirth: "Date of birth",
    address: "Address",
    role: "Role"
  },
  submitButton: "Accept and submit",
  back: "Back",
  change: "Change"
};

const cy = {
  title: "Gwiriwch eich atebion",
  heading: "Gwiriwch eich atebion",
  rows: {
    name: "Enw",
    dateOfBirth: "Dyddiad geni",
    address: "Cyfeiriad",
    role: "Rôl"
  },
  submitButton: "Derbyn a chyflwyno",
  back: "Yn ôl",
  change: "Newid"
};

export const GET = async (req: Request, res: Response) => {
  if (!isSessionComplete(req.session)) {
    return res.redirect("/onboarding/start");
  }

  const sessionData = getAllSessionData(req.session);
  const backLink = getPreviousPage("summary");

  // Prepare summary data for display
  const summaryData = {
    name: `${sessionData.name?.firstName} ${sessionData.name?.lastName}`,
    dateOfBirth: sessionData.dateOfBirth ? formatDateForDisplay(sessionData.dateOfBirth) : "",
    address: sessionData.address ? formatAddressForDisplay(sessionData.address) : [],
    role: sessionData.role ? formatRoleForDisplay(sessionData.role) : ""
  };

  const changeLinks = {
    name: `${getChangePageRoute("name")}?return=summary`,
    dateOfBirth: `${getChangePageRoute("dateOfBirth")}?return=summary`,
    address: `${getChangePageRoute("address")}?return=summary`,
    role: `${getChangePageRoute("role")}?return=summary`
  };

  res.render("onboarding/summary", {
    summaryData,
    changeLinks,
    backLink,
    en,
    cy
  });
};

export const POST = async (req: Request, res: Response) => {
  if (!isSessionComplete(req.session)) {
    return res.redirect("/onboarding/start");
  }

  try {
    const confirmationId = await submitOnboarding(req.session);
    clearOnboardingSession(req.session);
    res.redirect(`/onboarding/confirmation/${confirmationId}`);
  } catch (error) {
    console.error("Error submitting onboarding:", error);
    res.status(500).render("errors/500");
  }
};
