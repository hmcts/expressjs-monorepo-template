import type { Request, Response } from "express";
import { processDateOfBirthSubmission, getSessionDataForPage } from "../../onboarding/service.js";
import { formatZodErrors, createErrorSummary } from "../../onboarding/validation.js";
import { getPreviousPage } from "../../onboarding/navigation.js";
import { ZodError } from "zod";

const en = {
  title: "What is your date of birth?",
  heading: "What is your date of birth?",
  hint: "For example, 27 3 1985",
  dayLabel: "Day",
  monthLabel: "Month",
  yearLabel: "Year",
  back: "Back",
  continue: "Continue"
};

const cy = {
  title: "Beth yw eich dyddiad geni?",
  heading: "Beth yw eich dyddiad geni?",
  hint: "Er enghraifft, 27 3 1985",
  dayLabel: "Diwrnod",
  monthLabel: "Mis",
  yearLabel: "Blwyddyn",
  back: "Yn ôl",
  continue: "Parhau"
};

export const GET = async (req: Request, res: Response) => {
  const data = getSessionDataForPage(req.session, "date-of-birth");
  const previousPage = getPreviousPage("date-of-birth");

  res.render("onboarding/date-of-birth", {
    data,
    previousPage,
    en,
    cy
  });
};

export const POST = async (req: Request, res: Response) => {
  try {
    processDateOfBirthSubmission(req.session, req.body);

    // Handle return parameter for change links
    const returnTo = req.query.return;
    if (returnTo === "summary") {
      res.redirect("/onboarding/summary");
    } else {
      res.redirect("/onboarding/address");
    }
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = formatZodErrors(error);
      const errorSummary = createErrorSummary(errors);
      const previousPage = getPreviousPage("date-of-birth");

      res.render("onboarding/date-of-birth", {
        errors,
        errorSummary,
        data: req.body,
        previousPage,
        en,
        cy
      });
    } else {
      throw error;
    }
  }
};
