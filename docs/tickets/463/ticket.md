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

## Comments

**SarahLittlejohn** commented on 2026-01-21T10:16:26Z:
@plan

---

**linusnorton** commented on 2026-01-21T10:19:13Z:
@plan

---

**hmctsclaudecode** commented on 2026-01-21T10:23:53Z:
## 📋 Technical Plan Created

A comprehensive technical implementation plan has been created for this issue.

### Branch
`feature/463-civil-claim-submission`

### Plan Files
- [Technical Plan](https://github.com/hmcts/expressjs-monorepo-template/blob/feature/463-civil-claim-submission/docs/tickets/463/plan.md) - Architecture, implementation details, error handling, and acceptance criteria mapping
- [Implementation Tasks](https://github.com/hmcts/expressjs-monorepo-template/blob/feature/463-civil-claim-submission/docs/tickets/463/tasks.md) - Step-by-step checklist with 70+ tasks
- [Issue Details](https://github.com/hmcts/expressjs-monorepo-template/blob/feature/463-civil-claim-submission/docs/tickets/463/ticket.md) - Copy of the original issue for reference

### CLARIFICATIONS NEEDED

Before implementation, please clarify the following:

1. **User Authentication**
   - Q: Should users be authenticated before submitting claims, or can they submit anonymously?
   - Impact: Determines if we need authentication middleware on routes
   - Assumption: Proceeding with anonymous submission (no auth required) based on ticket mention of "proceeds anonymously if policy permits"

2. **Multiple Victims**
   - Q: Ticket mentions "offended party/parties" (plural) - should users be able to add multiple victims?
   - Impact: Form design (add another victim button) and database schema (JSON array vs single record)
   - Assumption: Single victim for MVP, can extend to multiple later

3. **File Storage**
   - Q: Where should uploaded evidence files be stored? (local filesystem, S3, Azure Blob, etc.)
   - Impact: File upload implementation and infrastructure requirements
   - Assumption: Storing only file metadata in DB for MVP, actual file storage deferred

4. **Claim Processing Workflow**
   - Q: What happens after submission? Is there an admin dashboard, email notifications, case management?
   - Impact: Whether we need additional API endpoints, notification service integration
   - Assumption: Just store in database, no post-submission workflow for this ticket

5. **Data Retention**
   - Q: How long should claim data be retained? GDPR considerations?
   - Impact: Database cleanup jobs, data retention policies
   - Assumption: No automatic cleanup, admin handles via separate process

6. **Contact Information Format**
   - Q: Should contact info be split into separate email/phone fields or combined?
   - Impact: Form design and validation complexity
   - Assumption: Single text field accepting either email or phone number (flexible input)

7. **Welsh Translation**
   - Q: Are Welsh translations required for all pages?
   - Impact: Bilingual content objects needed for all pages
   - Assumption: Yes, following established pattern in other modules (en/cy objects)

8. **Next Steps Content**
   - Q: What specific text should appear in "next steps" on confirmation page?
   - Impact: Content design for confirmation page
   - Assumption: Generic placeholder text: "Your claim has been received. We will review your submission and contact you within 10 working days."

---

**Run `/qk-implement` when ready to implement**

---

**linusnorton** commented on 2026-01-21T10:30:52Z:
5. Data Retention: Don't worry about it, we'll keep the data forever.

---

**linusnorton** commented on 2026-01-21T13:06:16Z:
1. Dont worry about auth yet
2. Yes
3. Remove evidence upload
4. Just store in DB
6. Yes, separate pages

---

**linusnorton** commented on 2026-01-21T13:06:21Z:
@ready

---

**hmctsclaudecode** commented on 2026-01-21T13:10:24Z:
## 📋 Technical Plan Updated

The technical plan has been updated based on stakeholder feedback from @linusnorton.

### Summary of Changes

**Major architectural changes:**

1. **Evidence upload removed** ✅
   - No file upload functionality
   - No evidence page
   - Database schema simplified (no file-related fields)

2. **Contact information split into separate pages** ✅
   - Separate pages for email and phone number
   - Applies to both offender and victim
   - Total of 10 pages instead of original 7

3. **Multiple victims support** ✅
   - "Add another victim" page with yes/no radios
   - Loop back to victim-name if user selects "yes"
   - Victims stored as JSON array in database

4. **No authentication required** ✅
   - Anonymous submission allowed
   - No auth middleware needed

5. **Data retention** ✅
   - Keep data forever
   - No cleanup jobs or GDPR deletion logic

### Updated Page Flow

```
/civil-claim/start
  ↓
/civil-claim/offender-name
  ↓
/civil-claim/offender-email
  ↓
/civil-claim/offender-phone
  ↓
/civil-claim/victim-name
  ↓
/civil-claim/victim-email
  ↓
/civil-claim/victim-phone
  ↓
/civil-claim/add-another-victim (yes → loop back to victim-name, no → continue)
  ↓
/civil-claim/insult
  ↓
/civil-claim/review
  ↓
/civil-claim/confirmation/:confirmationId
```

### Updated Database Schema

```prisma
model CivilClaimSubmission {
  id                    String   @id @default(cuid())
  offenderName          String   @map("offender_name")
  offenderEmail         String   @map("offender_email")
  offenderPhone         String   @map("offender_phone")
  victims               Json     @map("victims")  // [{ name, email, phone }, ...]
  insultDescription     String   @db.Text @map("insult_description")
  submittedAt           DateTime @default(now()) @map("submitted_at")

  @@index([submittedAt])
  @@map("civil_claim_submission")
}
```

### Files Updated
- `docs/tickets/463/ticket.md` - Added all GitHub comments for reference
- `docs/tickets/463/plan.md` - Updated technical approach, schema, page flow
- `docs/tickets/463/tasks.md` - Updated task breakdown (now 140+ tasks)

### Branch
All changes committed and pushed to `feature/463-civil-claim-submission`

### Next Steps
Ready for implementation using `/qk-implement` command.

---

**Note:** Issue could not be moved to "Refined Tickets" status as it's not currently tracked in a GitHub Project. If you'd like project tracking, please add the issue to the project board first.

---

**linusnorton** commented on 2026-01-21T13:59:28Z:
@ready
