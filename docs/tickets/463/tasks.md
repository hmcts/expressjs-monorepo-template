# Implementation Tasks: Civil Money Claim Service

## Implementation Tasks

### Module Setup
- [ ] Create `libs/civil-claim/` directory structure
- [ ] Create `libs/civil-claim/package.json` with scripts (build, test, lint)
- [ ] Create `libs/civil-claim/tsconfig.json` extending root config
- [ ] Create `libs/civil-claim/src/config.ts` for module exports
- [ ] Create `libs/civil-claim/src/index.ts` for business logic exports
- [ ] Add `@hmcts/civil-claim` to root `tsconfig.json` paths
- [ ] Install dependencies: `@hmcts/postgres-prisma`, `zod`

### Database Schema
- [ ] Create `libs/civil-claim/prisma/schema.prisma` with `CivilClaimSubmission` model
- [ ] Include offender fields: name, email, phone
- [ ] Include victims JSON array field
- [ ] Include insult description field
- [ ] Run `yarn db:migrate:dev` to generate and apply migration
- [ ] Verify schema in database via `yarn db:studio`

### Validation Layer
- [ ] Create `libs/civil-claim/src/civil-claim/validation.ts`
- [ ] Implement `nameSchema` (reusable for offender and victim)
- [ ] Implement `emailSchema` with email validation
- [ ] Implement `phoneSchema` with phone number regex
- [ ] Implement `insultSchema` with description length validation (10-5000 chars)
- [ ] Implement `addAnotherVictimSchema` with yes/no enum
- [ ] Implement `formatZodErrors()` helper for GOV.UK error format
- [ ] Implement `createErrorSummary()` helper
- [ ] Create `libs/civil-claim/src/civil-claim/validation.test.ts` with full coverage

### Session Management
- [ ] Create `libs/civil-claim/src/civil-claim/session.ts`
- [ ] Implement `Victim` interface (name, email, phone)
- [ ] Implement `CivilClaimSession` interface with victims array
- [ ] Implement `getCivilClaimSession()` function
- [ ] Implement `setSessionData()` function
- [ ] Implement `getAllSessionData()` function
- [ ] Implement `addVictimToSession()` function
- [ ] Implement `getCurrentVictim()` function
- [ ] Implement `clearCurrentVictim()` function
- [ ] Implement `isSessionComplete()` function
- [ ] Implement `clearSession()` function
- [ ] Create `libs/civil-claim/src/civil-claim/session.test.ts`

### Navigation Logic
- [ ] Create `libs/civil-claim/src/civil-claim/navigation.ts`
- [ ] Implement page flow constants (page order with victim loop)
- [ ] Implement `getNextPage()` function (handles victim loop)
- [ ] Implement `getPreviousPage()` function
- [ ] Create `libs/civil-claim/src/civil-claim/navigation.test.ts`

### Database Queries
- [ ] Create `libs/civil-claim/src/civil-claim/queries.ts`
- [ ] Implement `createCivilClaimSubmission()` function (accepts victims JSON)
- [ ] Implement `findCivilClaimById()` function (for confirmation page)
- [ ] Create `libs/civil-claim/src/civil-claim/queries.test.ts` with Prisma mocks

### Service Layer
- [ ] Create `libs/civil-claim/src/civil-claim/service.ts`
- [ ] Implement `processNameSubmission()` function (reusable)
- [ ] Implement `processEmailSubmission()` function (reusable)
- [ ] Implement `processPhoneSubmission()` function (reusable)
- [ ] Implement `processAddAnotherVictim()` function
- [ ] Implement `processInsultSubmission()` function
- [ ] Implement `prepareSubmissionData()` function (formats victims array)
- [ ] Implement `submitCivilClaim()` function
- [ ] Implement `getSessionDataForPage()` function
- [ ] Create `libs/civil-claim/src/civil-claim/service.test.ts`

### Page Controllers - Start
- [ ] Create `libs/civil-claim/src/pages/civil-claim/start.ts` with GET handler
- [ ] Create `libs/civil-claim/src/pages/civil-claim/start.njk` template
- [ ] Add bilingual content (en/cy) to start controller
- [ ] Create `libs/civil-claim/src/pages/civil-claim/start.test.ts`

### Page Controllers - Offender Name
- [ ] Create `libs/civil-claim/src/pages/civil-claim/offender-name.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/offender-name.njk` template
- [ ] Implement text input for name
- [ ] Add validation error handling in POST
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/offender-name.test.ts`

### Page Controllers - Offender Email
- [ ] Create `libs/civil-claim/src/pages/civil-claim/offender-email.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/offender-email.njk` template
- [ ] Implement text input for email
- [ ] Add validation error handling in POST
- [ ] Add back link to offender-name
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/offender-email.test.ts`

### Page Controllers - Offender Phone
- [ ] Create `libs/civil-claim/src/pages/civil-claim/offender-phone.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/offender-phone.njk` template
- [ ] Implement text input for phone
- [ ] Add validation error handling in POST
- [ ] Add back link to offender-email
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/offender-phone.test.ts`

### Page Controllers - Victim Name
- [ ] Create `libs/civil-claim/src/pages/civil-claim/victim-name.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/victim-name.njk` template
- [ ] Implement text input for victim name
- [ ] Add validation error handling in POST
- [ ] Handle both first victim and additional victims
- [ ] Add back link (to offender-phone or add-another-victim)
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/victim-name.test.ts`

### Page Controllers - Victim Email
- [ ] Create `libs/civil-claim/src/pages/civil-claim/victim-email.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/victim-email.njk` template
- [ ] Implement text input for victim email
- [ ] Add validation error handling in POST
- [ ] Add back link to victim-name
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/victim-email.test.ts`

### Page Controllers - Victim Phone
- [ ] Create `libs/civil-claim/src/pages/civil-claim/victim-phone.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/victim-phone.njk` template
- [ ] Implement text input for victim phone
- [ ] Add validation error handling in POST
- [ ] Save complete victim to victims array in session
- [ ] Clear currentVictim from session after saving
- [ ] Add back link to victim-email
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/victim-phone.test.ts`

### Page Controllers - Add Another Victim
- [ ] Create `libs/civil-claim/src/pages/civil-claim/add-another-victim.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/add-another-victim.njk` template
- [ ] Implement radios component (yes/no)
- [ ] Handle POST: if yes, redirect to victim-name
- [ ] Handle POST: if no, redirect to insult
- [ ] Add validation error handling in POST
- [ ] Add back link to victim-phone
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/add-another-victim.test.ts`

### Page Controllers - Insult
- [ ] Create `libs/civil-claim/src/pages/civil-claim/insult.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/insult.njk` template
- [ ] Implement textarea with character count (5000 limit)
- [ ] Add validation error handling in POST
- [ ] Add back link to add-another-victim
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/insult.test.ts`

### Page Controllers - Review
- [ ] Create `libs/civil-claim/src/pages/civil-claim/review.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/review.njk` template
- [ ] Implement summary list showing offender details
- [ ] Implement summary list showing all victims
- [ ] Implement summary list showing insult description
- [ ] Add change links to each section (with `?return=review` param)
- [ ] Implement POST handler for final submission
- [ ] Add back link to insult page
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/review.test.ts`

### Page Controllers - Confirmation
- [ ] Create `libs/civil-claim/src/pages/civil-claim/confirmation/[confirmationId].ts`
- [ ] Create `libs/civil-claim/src/pages/civil-claim/confirmation/[confirmationId].njk`
- [ ] Implement panel component with claim reference
- [ ] Add "What happens next" section with placeholder text
- [ ] Handle invalid confirmation ID (404)
- [ ] Clear session after showing confirmation
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/confirmation/[confirmationId].test.ts`

### Module Registration
- [ ] Import civil-claim config in `apps/web/src/app.ts`
- [ ] Register page routes with `createSimpleRouter`
- [ ] Register assets with Vite config if needed
- [ ] Test dev server startup with new module

### E2E Tests
- [ ] Create `e2e-tests/tests/civil-claim.spec.ts`
- [ ] Test happy path (single victim): complete submission from start to confirmation
- [ ] Test happy path (multiple victims): add 3 victims and complete submission
- [ ] Test validation errors: empty fields, invalid email, invalid phone
- [ ] Test change links: modify offender data from review page
- [ ] Test change links: modify victim data from review page
- [ ] Test back navigation throughout journey
- [ ] Test victim loop: add, then choose not to add another

### Documentation
- [ ] Add Welsh translations for all page content
- [ ] Review accessibility with keyboard-only navigation
- [ ] Test with screen reader (if available)
- [ ] Manual test on mobile viewport
- [ ] Verify all error messages are clear and specific

### Final Verification
- [ ] Run `yarn lint:fix` and fix any issues
- [ ] Run `yarn test` and ensure all tests pass
- [ ] Run `yarn test:e2e` and ensure E2E tests pass
- [ ] Run `yarn build` and ensure clean build
- [ ] Manual test complete user journey (single victim)
- [ ] Manual test complete user journey (multiple victims)
- [ ] Verify database record created correctly with victims JSON
- [ ] Check all acceptance criteria satisfied
