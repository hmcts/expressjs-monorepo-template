# #471: Allow claimants to submit a civil money claim online via a multi-step form journey

**State:** OPEN
**Assignees:** None
**Author:** SarahLittlejohn
**Labels:** New feature
**Created:** 2026-01-23T14:43:41Z
**Updated:** 2026-01-23T14:50:53Z

## Description

## 1. User Story
**As a** claimant
**I want to** submit a civil money claim online
**So that** I can recover money owed to me without attending court in person.

## 2. Background
The homepage currently displays information about the expressjs-monorepo-template. We need to add a link to demonstrate the money claims process using an example claim submission form. The process should guide the user through a series of steps to collect claim details, show a summary, and provide a confirmation with a claim reference number, using the path /money-claim/.

## 3. Acceptance Criteria
* **Scenario:** Multi-step claim submission
    * **Given** that I go to the homepage
    * **When** I click "Make a money claim"
    * **Then** I should be taken to a page where I can enter the claim amount
    * **When** I click continue I can enter the defendant's full name
    * **When** I click continue I can enter the defendant's address
    * **When** I click continue I can select the reason for my claim (with options and "Other" support)
    * **When** I select "Other" I can provide a custom reason
    * **When** I click continue I can provide a brief description
    * **When** I click continue I can confirm whether I have attempted mediation/contacted the defendant
    * **When** I click continue I reach a summary page to review my answers and go back to change them
    * **When** I click "Submit claim" I see a confirmation page with a claim reference number and info about next steps

## 4. User Journey Flow
- Homepage ➡️ Make a money claim ➡️ Claim amount ➡️ Defendant name ➡️ Defendant address ➡️ Claim reason (with "Other") ➡️ Description ➡️ Mediation attempted ➡️ Summary ➡️ Confirmation

## 5. Low Fidelity Wireframe
Not applicable.

## 6. Page Specifications
- Each form step should be a separate page under /money-claim/ (one question per page)
- All screens use GOV.UK Design System patterns
- Summary page allows editing earlier answers
- Confirmation page shows reference number and next steps

## 7. Content
- Homepage CTA: "Make a money claim"
- Section/page headings and hints follow GOV.UK plain English and content principles

## 8. URL
- All pages are under /money-claim/:
    - /money-claim/amount
    - /money-claim/defendant-name
    - /money-claim/defendant-address
    - /money-claim/reason
    - /money-claim/other-reason
    - /money-claim/description
    - /money-claim/mediation
    - /money-claim/summary
    - /money-claim/confirmation

## 9. Validation
- Claim amount: Must be a positive number greater than £0
- Defendant name: Required
- Defendant address: Required
- Reason: Must select one (if "Other" is selected, require text input)
- Brief description: Required
- Mediation question: Required Yes/No

## 10. Error Messages
- Display GOV.UK error summary at top
- "Enter a valid claim amount"
- "Enter the defendant's full name"
- "Enter the defendant's address"
- "Select a reason for your claim"
- "Provide a reason for your claim"
- "Describe what happened"
- "Tell us if you have tried to resolve the matter first"

## 11. Navigation
- Homepage ➡️ money claim start
- Continue/back buttons at each step
- Edit links on summary page for each question
- Redirect to confirmation after successful submission

## 12. Accessibility
- All steps meet WCAG 2.2 AA and GOV.UK accessibility standards
- Use ARIA roles and form field labels appropriately
- All flows keyboard accessible
- High contrast text, proper tab order, error message announcements

## 13. Test Scenarios
* Submits valid claim and is given reference number
* Validation error shown if a required field is missing on any step

## 14. Assumptions & Open Questions
* The claim reference generation method needs to be defined
* No payment handling included at this stage

## Comments

### Comment by SarahLittlejohn on 2026-01-23T14:49:38Z
Tech refinement:
- Data be stored in a postgres database
- The page where you enter the name should have first and last names

### Comment by SarahLittlejohn on 2026-01-23T14:50:22Z
Answers to open questions:
- Claims should be 16 digits with a hyphen every 4 digits.
- No payments at this stage

### Comment by SarahLittlejohn on 2026-01-23T14:50:46Z
We should integrate with Gov Notify to do an email confirmation once the submission has been made.

### Comment by SarahLittlejohn on 2026-01-23T14:50:52Z
@plan
