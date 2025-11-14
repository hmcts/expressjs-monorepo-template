# VIBE-192: Implementation Tasks

## Database Schema

- [ ] Create Prisma schema for Subscription table
- [ ] Create Prisma schema for Court table (if not exists)
- [ ] Add unique constraint for userId + courtId
- [ ] Create database migration script
- [ ] Create seed data for courts
- [ ] Test migration in local environment

## Module Setup

- [ ] Create module structure `libs/subscription-management/`
- [ ] Register module in root tsconfig.json
- [ ] Create package.json with dependencies
- [ ] Register page routes in apps/web/src/app.ts

## Service Layer

- [ ] Implement subscription-service.ts
  - [ ] getUserSubscriptions() function
  - [ ] createSubscriptions() function
  - [ ] isDuplicateSubscription() function
  - [ ] getSubscriptionCount() function
- [ ] Implement subscription-queries.ts for database operations
- [ ] Implement subscription-validation.ts
- [ ] Implement court-search.ts
  - [ ] searchCourts() function
  - [ ] getAllActiveCourts() function
  - [ ] getCourtById() function
- [ ] Write unit tests for service layer

## UI Pages

- [ ] Create i18n translations (locales/en.ts, locales/cy.ts)
- [ ] Implement subscriptions-list page
  - [ ] GET handler to display subscriptions
  - [ ] Handle empty state
  - [ ] Display table for existing subscriptions
- [ ] Create subscriptions-list.njk template
  - [ ] Use govukButton for "Add email subscription"
  - [ ] Use govukTable for subscriptions list
  - [ ] Display empty message when no subscriptions
- [ ] Implement add-subscription page
  - [ ] GET handler to display court search/selection
  - [ ] POST handler to store selections in session
  - [ ] Validate at least one court selected
- [ ] Create add-subscription.njk template
  - [ ] Use govukCheckboxes for court selection
  - [ ] Or implement autocomplete search
  - [ ] Use govukButton for Continue
- [ ] Implement confirm-subscriptions page
  - [ ] GET handler to display selected subscriptions
  - [ ] Handle remove action
  - [ ] POST handler to save subscriptions
  - [ ] Validate at least one subscription
- [ ] Create confirm-subscriptions.njk template
  - [ ] Display selected subscriptions with Remove links
  - [ ] "Add another subscription" link
  - [ ] Error handling for empty selections
- [ ] Implement subscription-success page
  - [ ] GET handler with success message
- [ ] Create subscription-success.njk template
  - [ ] Use govukPanel for success message
  - [ ] Display helpful navigation links

## Testing

- [ ] Write unit tests for subscription service
- [ ] Write unit tests for court search
- [ ] Write E2E tests for complete subscription workflow
  - [ ] Test empty state
  - [ ] Test adding subscriptions
  - [ ] Test multiple court selection
  - [ ] Test removing selections
  - [ ] Test validation (at least one required)
  - [ ] Test duplicate prevention
  - [ ] Test success page
- [ ] Perform accessibility testing with Playwright axe
- [ ] Test Welsh language version
- [ ] Cross-browser testing

## Integration

- [ ] Verify subscriptions trigger notifications (VIBE-221)
- [ ] Test with court reference data
- [ ] Verify duplicate prevention works

## Configuration

- [ ] Add session configuration for storing selections
- [ ] Document configuration in README

## Deployment

- [ ] Run database migration in preview
- [ ] Seed court reference data
- [ ] Test in preview environment
- [ ] Deploy to production
- [ ] Monitor subscription creation
- [ ] Verify subscriptions working correctly
