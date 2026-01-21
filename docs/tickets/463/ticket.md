# #463: Create service for submitting civil money claims related to emotional distress from insults

**State:** OPEN
**Assignees:** None
**Author:** SarahLittlejohn
**Labels:** type:story
**Created:** 2026-01-21T10:05:57Z
**Updated:** 2026-01-21T10:19:13Z

## Description

## 1. User Story
**As a** citizen who has experienced severe emotional distress due to rudeness or insults
**I want to** be able to submit a civil money claim online, providing details of the offender, the offended party/parties, and the nature of the insult
**So that** I can seek redress for the emotional harm caused and have my case considered formally

## 2. Background
Civil and digital routes for seeking justice often overlook non-physical trauma. There is a user need among individuals who have suffered emotional or psychological harm due to the actions or words of others, especially extreme rudeness or degradation.  Providing a digital channel for such claims aligns with GDS principle 1 (Start with user needs) and GDS principle 6 (This is for everyone).

## 3. Acceptance Criteria
* **Scenario:** Submit a civil claim for emotional distress
    * **Given** a user has suffered extreme rudeness or insults
    * **When** they access the service, complete the submission form (across all pages:  offender details, victim details, nature of insult)
    * **Then** their claim is acknowledged and tracked in the system

## 4. User Journey Flow
1. User navigates to online service
2. User authenticates (or proceeds anonymously if policy permits)
3. Page 1: User enters details of the offender
4. Page 2: User enters details of the offended party/parties
5. Page 3: User describes the nature of the insult and resulting trauma
6. Page 4: User optionally uploads supporting evidence
7. Page 5: User reviews and submits the claim
8. Confirmation page:  System issues a claim reference and outlines next steps

## 5. Low Fidelity Wireframe
### Page 1: Offender Details
```
+------------------------------------------------+
| Offender Details                               |
+------------------------------------------------+
| [Name:            ____________________________ ]|
| [Contact Info:   ____________________________ ]|
+------------------------------------------------+
| [Next]                                         |
+------------------------------------------------+
```
### Page 2: Offended Party Details
```
+------------------------------------------------+
| Offended Party Details                         |
+------------------------------------------------+
| [Name:           ____________________________ ]|
| [Contact Info:   ____________________________ ]|
+------------------------------------------------+
| [Back]   [Next]                                |
+------------------------------------------------+
```
### Page 3: Nature of Insult
```
+------------------------------------------------+
| Nature of Insult and Resulting Trauma          |
+------------------------------------------------+
| [Describe the incident:                    ]   |
| [__________________________________________]   |
| [__________________________________________]   |
+------------------------------------------------+
| [Back]   [Next]                                |
+------------------------------------------------+
```
### Page 4: Supporting Evidence (Optional)
```
+------------------------------------------------+
| Supporting Evidence (optional)                 |
+------------------------------------------------+
| [Upload evidence:  [Choose file]  [Upload]]     |
+------------------------------------------------+
| [Back]   [Next]                                |
+------------------------------------------------+
```
### Page 5: Review and Submit
```
+------------------------------------------------+
| Review Your Claim                              |
+------------------------------------------------+
| [Summary of all entered details]               |
+------------------------------------------------+
| [Back]   [Submit Claim]                        |
+------------------------------------------------+
```
### Confirmation Page
```
+------------------------------------------------+
| Confirmation                                  |
+------------------------------------------------+
| Your claim reference is XYZ123                 |
| Next steps/instructions                        |
+------------------------------------------------+
| [Go to dashboard]                              |
+------------------------------------------------+
```

## 6. Page Specifications
- Each page contains only a single logical grouping of fields to support progressive disclosure and reduce user overwhelm
- Mandatory/optional indicators clearly shown
- "Back", "Next", and "Submit" navigation on all pages except confirmation
- Review page displays all details for final confirmation before submission
- Confirmation page shows reference and next steps

## 7. Content
- Each page uses plain language to explain what information is needed and why
- Provide contextual help or example text
- Accessibility help text on each page
- Content reviewed for sensitivity to trauma/mental health

## 8. URL
- /civil-claim/start
- /civil-claim/offender
- /civil-claim/victim
- /civil-claim/insult
- /civil-claim/evidence
- /civil-claim/review
- /civil-claim/confirmation

## 9. Validation
- All required fields must be completed before continuing
- Validation for plausible contact details (regex check)
- Text area minimum/maximum length checks
- File type and size check for evidence uploads

## 10. Error Messages
- "Please enter details of the offender."
- "Please enter details of the offended party."
- "Please provide a brief description of the insult."
- "Supporting evidence must be less than 10MB and in PDF/JPG/PNG format."
- "All required fields must be filled before you can move to the next page."

## 11. Navigation
- "Back" and "Next" on form pages
- "Submit Claim" and "Cancel" on Review page
- Redirect to confirmation after submission
- Overridable routing for accessibility tools

## 12. Accessibility
- All pages WCAG 2.2 AA compliant
- ARIA labels for every input, button, error, and help text
- Keyboard-only navigation and high-contrast mode supported
- Screen reader instructions tested for each page

## 13. Test Scenarios
* User completes all pages and submits successfully, gets confirmation
* User omits a required field and receives an error, cannot proceed
* User uploads evidence, review page displays correct file details

## 14. Assumptions & Open Questions
* [Item 1] How will anonymity be handled if requested?
* [Item 2] What legal standards apply for emotional distress claims?
* [Item 3] Will third-party evidence (screenshots, emails) be accepted and stored?

## 15. Technical guidance from developers
* Save the submissions into a new table in the database, make sure the table constraints match the form validations.
