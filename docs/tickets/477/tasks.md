# Implementation Tasks: Civil Money Claim Submission

## Module Setup
- [ ] Create `libs/money-claim/` directory structure
- [ ] Create `libs/money-claim/package.json` with module configuration
- [ ] Create `libs/money-claim/tsconfig.json` with TypeScript configuration
- [ ] Add `@hmcts/money-claim` to root `tsconfig.json` paths
- [ ] Create `libs/money-claim/src/config.ts` for module exports
- [ ] Create `libs/money-claim/src/index.ts` for business logic exports

## Database Schema
- [ ] Create `libs/money-claim/prisma/schema.prisma` with MoneyClaimSubmission model
- [ ] Run `yarn db:migrate:dev` to generate and apply migration
- [ ] Verify Prisma client generation includes money claim model

## Domain Logic Implementation
- [ ] Create `libs/money-claim/src/money-claim/validation.ts` with Zod schemas for all form pages
- [ ] Create `libs/money-claim/src/money-claim/validation.test.ts` with validation tests
- [ ] Create `libs/money-claim/src/money-claim/session.ts` with session interface and helpers
- [ ] Create `libs/money-claim/src/money-claim/session.test.ts` with session tests
- [ ] Create `libs/money-claim/src/money-claim/navigation.ts` with page flow logic
- [ ] Create `libs/money-claim/src/money-claim/navigation.test.ts` with navigation tests
- [ ] Create `libs/money-claim/src/money-claim/queries.ts` with database operations
- [ ] Create `libs/money-claim/src/money-claim/queries.test.ts` with query tests
- [ ] Create `libs/money-claim/src/money-claim/service.ts` with business logic functions
- [ ] Create `libs/money-claim/src/money-claim/service.test.ts` with service tests
- [ ] Create `libs/money-claim/src/money-claim/notify.ts` with GOV.UK Notify integration
- [ ] Create `libs/money-claim/src/money-claim/notify.test.ts` with notify tests

## Page Controllers and Templates
- [ ] Create `/money-claim/` landing page controller and template
- [ ] Create `/money-claim/amount` page controller and template with tests
- [ ] Create `/money-claim/defendant-name` page controller and template with tests
- [ ] Create `/money-claim/defendant-address` page controller and template with tests
- [ ] Create `/money-claim/reason` page controller and template with tests
- [ ] Create `/money-claim/reason-other` conditional page controller and template with tests
- [ ] Create `/money-claim/description` page controller and template with tests
- [ ] Create `/money-claim/attempted-resolution` page controller and template with tests
- [ ] Create `/money-claim/email` page controller and template with tests
- [ ] Create `/money-claim/summary` page controller and template with tests
- [ ] Create `/money-claim/confirmation/[confirmationId]` dynamic route controller and template with tests

## Bilingual Content
- [ ] Add English content objects to all page controllers
- [ ] Add Welsh content objects to all page controllers
- [ ] Verify all visible text is translatable with `?lng=cy` query parameter

## Application Integration
- [ ] Import money-claim config in `apps/web/src/app.ts`
- [ ] Register page routes with simple-router
- [ ] Add money-claim assets to Vite build config if needed
- [ ] Update homepage (`apps/web/src/pages/index.ts` and `index.njk`) with "Make a money claim" button

## Environment Configuration
- [ ] Document required GOV.UK Notify environment variables
- [ ] Add environment variable validation for GOVUK_NOTIFY_API_KEY
- [ ] Add environment variable for GOVUK_NOTIFY_CLAIM_CONFIRMATION_TEMPLATE_ID
- [ ] Create GOV.UK Notify template for claim confirmation email

## Testing
- [ ] Run all unit tests and ensure they pass (`yarn test`)
- [ ] Create E2E test for happy path journey (homepage to confirmation)
- [ ] Create E2E test for validation errors on each page
- [ ] Create E2E test for "Other" reason conditional flow
- [ ] Create E2E test for summary page change links
- [ ] Add accessibility tests with axe-core for all pages
- [ ] Test Welsh language support on all pages

## Code Quality
- [ ] Run `yarn lint:fix` and resolve all linting issues
- [ ] Run `yarn format` to format all code
- [ ] Verify test coverage meets >80% threshold
- [ ] Review code against CLAUDE.md conventions

## Documentation
- [ ] Add README to `libs/money-claim/` with module overview
- [ ] Document claim reference generation logic
- [ ] Document session data structure
- [ ] Document GOV.UK Notify integration
- [ ] Update root README with money claim feature information
