# Implementation Tasks: #471 - Civil Money Claim Multi-Step Form

## Implementation Tasks

### Module Setup
- [ ] Create `libs/money-claims/` directory structure
- [ ] Create `package.json` with dependencies (express, zod, notifications-node-client)
- [ ] Create `tsconfig.json` extending root config
- [ ] Create `src/config.ts` with module exports (pageRoutes, prismaSchemas)
- [ ] Create `src/index.ts` for business logic exports
- [ ] Add `@hmcts/money-claims` to root `tsconfig.json` paths
- [ ] Install GOV Notify client: `yarn workspace @hmcts/money-claims add notifications-node-client`

### Database Schema
- [ ] Create `libs/money-claims/prisma/schema.prisma` with MoneyClaim model
- [ ] Register prisma schema in `apps/postgres/src/schema-discovery.ts`
- [ ] Run `yarn db:generate` to generate Prisma client
- [ ] Run `yarn db:migrate:dev` to apply migration

### Validation Layer
- [ ] Create `src/money-claim/validation.ts` with Zod schemas for all form steps
- [ ] Add validation tests in `src/money-claim/validation.test.ts`
- [ ] Export types from validation schemas (AmountData, DefendantNameData, etc.)

### Session Management
- [ ] Create `src/money-claim/session.ts` with MoneyClaimSession interface
- [ ] Implement session helper functions (getMoneyClaimSession, setSessionData, etc.)
- [ ] Add session tests in `src/money-claim/session.test.ts`

### Reference Number Generator
- [ ] Create `src/money-claim/reference-generator.ts` with generation logic
- [ ] Implement format: XXXX-XXXX-XXXX-XXXX (16 digits with hyphens)
- [ ] Add uniqueness check against database
- [ ] Add tests in `src/money-claim/reference-generator.test.ts`

### Database Queries
- [ ] Create `src/money-claim/queries.ts` with createMoneyClaim function
- [ ] Add tests in `src/money-claim/queries.test.ts`

### GOV Notify Integration
- [ ] Create `src/money-claim/notify-service.ts` with sendClaimConfirmation function
- [ ] Add environment variable handling for API key and template ID
- [ ] Implement error handling for failed email sends
- [ ] Add tests with mocked notify client in `src/money-claim/notify-service.test.ts`

### Navigation Logic
- [ ] Create `src/money-claim/navigation.ts` with getNextPage and getPreviousPage functions
- [ ] Handle conditional routing for "other" reason flow
- [ ] Add tests in `src/money-claim/navigation.test.ts`

### Service Layer
- [ ] Create `src/money-claim/service.ts` with form processing functions
- [ ] Implement prepareSubmissionData and submitMoneyClaim functions
- [ ] Add tests in `src/money-claim/service.test.ts`

### Locales
- [ ] Create `src/locales/en.ts` with shared English translations (buttons, labels, errors)
- [ ] Create `src/locales/cy.ts` with Welsh translations

### Page: Start
- [ ] Create `src/pages/money-claim/start.ts` controller with GET handler
- [ ] Create `src/pages/money-claim/start.njk` template
- [ ] Add start button linking to `/money-claim/amount`
- [ ] Add tests in `src/pages/money-claim/start.test.ts`

### Page: Amount
- [ ] Create `src/pages/money-claim/amount.ts` controller with GET and POST handlers
- [ ] Create `src/pages/money-claim/amount.njk` template with text input
- [ ] Implement validation and error handling
- [ ] Add tests in `src/pages/money-claim/amount.test.ts`

### Page: Defendant Name
- [ ] Create `src/pages/money-claim/defendant-name.ts` controller with GET and POST handlers
- [ ] Create `src/pages/money-claim/defendant-name.njk` template with two text inputs (firstName, lastName)
- [ ] Implement validation and error handling
- [ ] Add tests in `src/pages/money-claim/defendant-name.test.ts`

### Page: Defendant Address
- [ ] Create `src/pages/money-claim/defendant-address.ts` controller with GET and POST handlers
- [ ] Create `src/pages/money-claim/defendant-address.njk` template with address fields
- [ ] Implement validation and error handling
- [ ] Add tests in `src/pages/money-claim/defendant-address.test.ts`

### Page: Reason
- [ ] Create `src/pages/money-claim/reason.ts` controller with GET and POST handlers
- [ ] Create `src/pages/money-claim/reason.njk` template with radio buttons
- [ ] Implement conditional routing (if "other", go to other-reason, else go to description)
- [ ] Add tests in `src/pages/money-claim/reason.test.ts`

### Page: Other Reason
- [ ] Create `src/pages/money-claim/other-reason.ts` controller with GET and POST handlers
- [ ] Create `src/pages/money-claim/other-reason.njk` template with textarea
- [ ] Implement validation and error handling
- [ ] Add tests in `src/pages/money-claim/other-reason.test.ts`

### Page: Description
- [ ] Create `src/pages/money-claim/description.ts` controller with GET and POST handlers
- [ ] Create `src/pages/money-claim/description.njk` template with textarea
- [ ] Implement validation and error handling
- [ ] Add tests in `src/pages/money-claim/description.test.ts`

### Page: Mediation
- [ ] Create `src/pages/money-claim/mediation.ts` controller with GET and POST handlers
- [ ] Create `src/pages/money-claim/mediation.njk` template with Yes/No radios
- [ ] Implement validation and error handling
- [ ] Add tests in `src/pages/money-claim/mediation.test.ts`

### Page: Summary
- [ ] Create `src/pages/money-claim/summary.ts` controller with GET and POST handlers
- [ ] Create `src/pages/money-claim/summary.njk` template with GOV.UK Summary List
- [ ] Implement "Change" links for each answer
- [ ] Implement submission logic (save to DB, send email, redirect to confirmation)
- [ ] Add tests in `src/pages/money-claim/summary.test.ts`

### Page: Confirmation
- [ ] Create `src/pages/money-claim/confirmation/[confirmationId].ts` controller with GET handler
- [ ] Create `src/pages/money-claim/confirmation/[confirmationId].njk` template with Panel component
- [ ] Display reference number and next steps
- [ ] Add tests in `src/pages/money-claim/confirmation/[confirmationId].test.ts`

### Module Registration
- [ ] Import money-claims config in `apps/web/src/app.ts`
- [ ] Register pageRoutes with createSimpleRouter
- [ ] Register assets path with Vite config in `apps/web/vite.build.ts`

### Homepage Integration
- [ ] Update `apps/web/src/pages/index.ts` controller with "Make a money claim" content
- [ ] Update `apps/web/src/pages/index.njk` template with new section and button
- [ ] Link button to `/money-claim/start`

### Environment Configuration
- [ ] Add GOV Notify environment variables to `apps/web/helm/values.yaml`
- [ ] Document required environment variables in README or .env.example
- [ ] Set up local development values (or use test mode)

### E2E Tests
- [ ] Create `e2e-tests/tests/money-claim.spec.ts`
- [ ] Test happy path: homepage → complete journey → confirmation
- [ ] Test validation errors on each step
- [ ] Test "Other" reason path
- [ ] Test summary page "Change" links
- [ ] Test accessibility with axe on all pages

### Documentation
- [ ] Update root README with money claims feature description
- [ ] Document claim reference format
- [ ] Document GOV Notify setup requirements
- [ ] Add architecture decision record if needed

### Manual Testing
- [ ] Test full journey in browser
- [ ] Test keyboard navigation on all pages
- [ ] Test screen reader compatibility (NVDA or JAWS)
- [ ] Test Welsh language toggle on all pages
- [ ] Test back button behavior
- [ ] Test session expiry handling
- [ ] Verify database records created correctly
- [ ] Verify email sent (or mocked in dev)
