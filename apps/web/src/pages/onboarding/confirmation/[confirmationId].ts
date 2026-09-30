import type { Request, Response } from "express";

// OnboardingSubmission ids are Prisma cuid() values; this is the check cuid itself uses in isCuid.
const CONFIRMATION_ID_PATTERN = /^c[a-z0-9]{20,32}$/;

const en = {
  title: "Onboarding complete",
  heading: "Onboarding complete",
  panelTitle: "Onboarding complete",
  referenceLabel: "Your reference number",
  whatHappensNext: "What happens next",
  nextSteps: "We will process your information and you will be able to access the service.",
  returnButton: "Return to homepage"
};

const cy = {
  title: "Ymgymryd wedi'i gwblhau",
  heading: "Ymgymrwd wedi'i gwblhau",
  panelTitle: "Ymgymrwd wedi'i gwblhau",
  referenceLabel: "Eich rhif cyfeirnod",
  whatHappensNext: "Beth sy'n digwydd nesaf",
  nextSteps: "Byddwn yn prosesu eich gwybodaeth a byddwch yn gallu cael mynediad at y gwasanaeth.",
  returnButton: "Dychwelyd i'r hafan"
};

export const GET = async (req: Request, res: Response) => {
  const confirmationId = req.params?.confirmationId;

  if (!confirmationId) {
    return res.redirect("/onboarding/start");
  }

  if (!CONFIRMATION_ID_PATTERN.test(confirmationId)) {
    return res.status(404).render("errors/404");
  }

  res.render("[confirmationId]", {
    confirmationId,
    en,
    cy
  });
};
