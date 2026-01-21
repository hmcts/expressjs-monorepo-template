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
- [ ] Run `yarn db:migrate:dev` to generate and apply migration
- [ ] Verify schema in database via `yarn db:studio`

### Validation Layer
- [ ] Create `libs/civil-claim/src/civil-claim/validation.ts`
- [ ] Implement `offenderSchema` with name and contact validation
- [ ] Implement `victimSchema` with name and contact validation
- [ ] Implement `insultSchema` with description length validation (10-5000 chars)
- [ ] Implement `evidenceSchema` with file validation (type, size)
- [ ] Implement `formatZodErrors()` helper for GOV.UK error format
- [ ] Implement `createErrorSummary()` helper
- [ ] Create `libs/civil-claim/src/civil-claim/validation.test.ts` with full coverage

### Session Management
- [ ] Create `libs/civil-claim/src/civil-claim/session.ts`
- [ ] Implement `CivilClaimSession` interface
- [ ] Implement `getCivilClaimSession()` function
- [ ] Implement `setSessionData()` function
- [ ] Implement `getAllSessionData()` function
- [ ] Implement `isSessionComplete()` function
- [ ] Implement `clearSession()` function
- [ ] Create `libs/civil-claim/src/civil-claim/session.test.ts`

### Navigation Logic
- [ ] Create `libs/civil-claim/src/civil-claim/navigation.ts`
- [ ] Implement page flow constants (page order)
- [ ] Implement `getNextPage()` function
- [ ] Implement `getPreviousPage()` function
- [ ] Create `libs/civil-claim/src/civil-claim/navigation.test.ts`

### Database Queries
- [ ] Create `libs/civil-claim/src/civil-claim/queries.ts`
- [ ] Implement `createCivilClaimSubmission()` function
- [ ] Implement `findCivilClaimById()` function (for confirmation page)
- [ ] Create `libs/civil-claim/src/civil-claim/queries.test.ts` with Prisma mocks

### Service Layer
- [ ] Create `libs/civil-claim/src/civil-claim/service.ts`
- [ ] Implement `processOffenderSubmission()` function
- [ ] Implement `processVictimSubmission()` function
- [ ] Implement `processInsultSubmission()` function
- [ ] Implement `processEvidenceSubmission()` function
- [ ] Implement `prepareSubmissionData()` function
- [ ] Implement `submitCivilClaim()` function
- [ ] Implement `getSessionDataForPage()` function
- [ ] Create `libs/civil-claim/src/civil-claim/service.test.ts`

### Page Controllers - Start
- [ ] Create `libs/civil-claim/src/pages/civil-claim/start.ts` with GET handler
- [ ] Create `libs/civil-claim/src/pages/civil-claim/start.njk` template
- [ ] Add bilingual content (en/cy) to start controller
- [ ] Create `libs/civil-claim/src/pages/civil-claim/start.test.ts`

### Page Controllers - Offender
- [ ] Create `libs/civil-claim/src/pages/civil-claim/offender.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/offender.njk` template
- [ ] Implement form with text inputs for name and contact info
- [ ] Add validation error handling in POST
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/offender.test.ts`

### Page Controllers - Victim
- [ ] Create `libs/civil-claim/src/pages/civil-claim/victim.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/victim.njk` template
- [ ] Implement form with text inputs for name and contact info
- [ ] Add validation error handling in POST
- [ ] Add back link to offender page
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/victim.test.ts`

### Page Controllers - Insult
- [ ] Create `libs/civil-claim/src/pages/civil-claim/insult.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/insult.njk` template
- [ ] Implement textarea with character count (5000 limit)
- [ ] Add validation error handling in POST
- [ ] Add back link to victim page
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/insult.test.ts`

### Page Controllers - Evidence
- [ ] Create `libs/civil-claim/src/pages/civil-claim/evidence.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/evidence.njk` template
- [ ] Implement file upload component
- [ ] Add file validation (PDF/JPG/PNG, max 10MB)
- [ ] Handle optional file upload (skip allowed)
- [ ] Add back link to insult page
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/evidence.test.ts`

### Page Controllers - Review
- [ ] Create `libs/civil-claim/src/pages/civil-claim/review.ts` with GET/POST
- [ ] Create `libs/civil-claim/src/pages/civil-claim/review.njk` template
- [ ] Implement summary list showing all entered data
- [ ] Add change links to each section (with `?return=review` param)
- [ ] Implement POST handler for final submission
- [ ] Add back link to evidence page
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/review.test.ts`

### Page Controllers - Confirmation
- [ ] Create `libs/civil-claim/src/pages/civil-claim/confirmation/[confirmationId].ts`
- [ ] Create `libs/civil-claim/src/pages/civil-claim/confirmation/[confirmationId].njk`
- [ ] Implement panel component with claim reference
- [ ] Add "What happens next" section
- [ ] Handle invalid confirmation ID (404)
- [ ] Add bilingual content (en/cy)
- [ ] Create `libs/civil-claim/src/pages/civil-claim/confirmation/[confirmationId].test.ts`

### Module Registration
- [ ] Import civil-claim config in `apps/web/src/app.ts`
- [ ] Register page routes with `createSimpleRouter`
- [ ] Register assets with Vite config if needed
- [ ] Test dev server startup with new module

### E2E Tests
- [ ] Create `e2e-tests/tests/civil-claim.spec.ts`
- [ ] Test happy path: complete submission from start to confirmation
- [ ] Test validation errors: empty fields, invalid data
- [ ] Test change links: modify data from review page
- [ ] Test file upload: optional evidence submission
- [ ] Test back navigation throughout journey

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
- [ ] Manual test complete user journey
- [ ] Verify database record created correctly
- [ ] Check all acceptance criteria satisfied
