# #477: Civil Money Claim Submission feature

**State:** OPEN
**Assignees:** None
**Author:** SarahLittlejohn
**Labels:** New feature
**Created:** 2026-01-26T13:27:04Z
**Updated:** 2026-01-26T13:30:33Z

## Description

## 1. User Story
**As a** claimant
**I want to** submit a civil money claim online
**So that** I can recover money owed to me without attending court in person.

## 2. Background
The homepage currently displays information about the expressjs-monorepo-template. We need to add a link to demonstrate the money claims process using an example claim submission form. When claimants go through the money claim process, we should collect:
- Claim amount
- Reason for the claim (Unpaid invoice, Damage to property, Personal loan, Rental deposit, Other + free text)
- Details of the defendant (name and address)
- Brief description of the claim
- Whether the claimant has attempted to resolve the matter before court
After collection, users see a summary page before submitting and a confirmation page with a claim reference number. All URLs should be under `/money-claim/`.

## 3. Acceptance Criteria
* **Scenario:** Money claim journey
    * **Given** that I go to the homepage
    * **When** I click "Make a money claim"
    * **Then** I should be taken to a page where I can enter the claim amount
    * **When** I click continue I should be taken to a page where I can enter the defendant's full name
    * **When** I click continue I should be taken to a page where I can enter the defendant's address
    * **When** I click continue I should be taken to a page where I can select the reason for my claim
    * **When** I select "Other" as my reason, I should be able to provide a custom reason
    * **When** I click continue I should be taken to a page where I can provide a brief description of what happened
    * **When** I click continue I should be taken to a page where I can confirm whether I have attempted mediation or contacted the defendant first
    * **When** I click continue I should be taken to a summary page where I can review all my answers and go back to change them
    * **When** I click "Submit claim" I should see a confirmation page with my claim reference number and information about what happens next.

## 4. User Journey Flow
1. Homepage with "Make a money claim" link (`/money-claim/`)
2. Enter claim amount (`/money-claim/amount`)
3. Enter defendant's full name (`/money-claim/defendant-name`)
4. Enter address (`/money-claim/defendant-address`)
5. Select claim reason (`/money-claim/reason`)
6. Specify custom reason if "Other" selected (`/money-claim/reason-other`)
7. Provide claim description (`/money-claim/description`)
8. Confirm attempted resolution (`/money-claim/attempted-resolution`)
9. Review summary (`/money-claim/summary`)
10. Confirmation (`/money-claim/confirmation`)

## 5. Low Fidelity Wireframe

**1. Homepage** (`/`)
- [Button] "Make a money claim" → `/money-claim/`

**2. Claim Amount** (`/money-claim/amount`)
```
┌─────────────────────────────────────────┐
| [GOV.UK service header]                 |
|                                         |
| How much are you claiming?              |
| [Number input: claim amount (£)]        |
| [Hint: Enter the amount in pounds (£)]  |
| [Error summary, if present]             |
| [Continue button]                       |
└─────────────────────────────────────────┘
```

**3. Defendant's Full Name** (`/money-claim/defendant-name`)
```
| What is the defendant's full name?      |
| [Text input: full name]                 |
| [Error message if blank]                |
| [Continue button]                       |
```

**4. Defendant's Address** (`/money-claim/defendant-address`)
```
| What is the defendant's address?        |
| [Textarea: address lines]               |
| [Error message if blank]                |
| [Continue button]                       |
```

**5. Reason for Claim** (`/money-claim/reason`)
```
| What is the reason for your claim?      |
| [Radio buttons]:                        |
|   • Unpaid invoice                      |
|   • Damage to property                  |
|   • Personal loan                       |
|   • Rental deposit                      |
|   • Other, please specify               |
| [Conditional input: appears if "Other"] |
| [Error if nothing selected]             |
| [Continue button]                       |
```

**6. Other Reason (if selected)** (`/money-claim/reason-other`)
```
| Please specify the reason for your claim|
| [Text input: custom reason]             |
| [Continue button]                       |
```

**7. Description** (`/money-claim/description`)
```
| Briefly describe what happened          |
| [Textarea: description]                 |
| [Error if blank]                        |
| [Continue button]                       |
```

**8. Attempted Resolution** (`/money-claim/attempted-resolution`)
```
| Have you tried to resolve this matter   |
| with the defendant before coming to court?|
| [Radio buttons]:                        |
|   • Yes                                 |
|   • No                                  |
| [Error if not answered]                 |
| [Continue button]                       |
```

**9. Summary** (`/money-claim/summary`)
```
| Check your answers                      |
| [Summary list: all fields entered above]|
| [Back/change links for each answer]     |
| [Submit claim button]                   |
```

**10. Confirmation** (`/money-claim/confirmation`)
```
| Claim submitted                         |
| Your claim reference number: [ABC123]   |
| [Info: what happens next]               |
```

## 6. Page Specifications
- Each page follows "one question per page" using GOV.UK components
- Standard GOV.UK error summary and inline errors on validation failure
- Number/amount input uses GOV.UK number input (with £)
- Text inputs for names, address, and details
- Radios for claim reason and attempted resolution
- Summary page lists all entered data, with per-field edit links
- Confirmation page restates summary and reference number

## 7. Content
- All labels in plain English (reading age 9)
- Hints only where needed, e.g., on amounts and address
- "Continue" on all buttons, "Submit claim" for final submission
- Err on side of brevity and clarity
- Error messages as per GDS examples

## 8. URL
All pages must be under `/money-claim/`

## 9. Validation
- Amount must be numeric and > £0
- Name/address/description required
- Custom reason required if "Other" is selected
- Attempted resolution is mandatory
- Standard HTML5 validation in addition to server-side validation

## 10. Error Messages
- "Enter the amount you want to claim"
- "Enter the defendant's full name"
- "Enter the defendant's address"
- "Select a reason for your claim"
- "Describe what happened"
- "Confirm whether you have attempted to resolve the matter first"

## 11. Navigation
- Back and continue buttons on each page (except the first)
- Edit links on summary page
- After claim submission, user remains on confirmation page

## 12. Accessibility
- GOV.UK Design System for all components (WCAG 2.2 AA)
- All form fields have descriptive labels, ARIA error messages
- Logical heading levels, tabindex order, focus states
- Supports keyboard navigation and screen reader users
- Min. touch/click target 44x44px

## 13. Test Scenarios
* Happy path: user completes a claim from start to finish
* All validation errors appear as expected for each input
* Page is usable entirely by keyboard
* Screen reader correctly announces field, error, and navigation structure

## 14. Assumptions & Open Questions
* Example form is for demonstration only
* Confirmation/claim reference number is for demo (no real backend)
* Any additional user research or complex branching to be considered later

## Comments

### Comment by linusnorton on 2026-01-26T13:29:45Z
Save the submissions to the postgres database

### Comment by SarahLittlejohn on 2026-01-26T13:29:55Z
Answers to assumptions & open questions:
- The claim number should be 16 digits
- We want to integrate with Gov notify to send an email confirmation once the submission has been completed.

### Comment by linusnorton on 2026-01-26T13:30:14Z
The submission ID should be 16 digits in the format NNNN-NNNN-NNNN-NNNN

### Comment by SarahLittlejohn on 2026-01-26T13:30:33Z
@plan
