# VIBE-228: Implementation Tasks

## Database Schema Updates

- [ ] Add User table to Prisma schema
- [ ] Add approvedAt and approvedBy fields to MediaApplication table
- [ ] Add userId field to link application to created user account
- [ ] Create database migration script
- [ ] Test migration in local environment

## Business Logic

- [ ] Extend application-service.ts with approveApplication() function
- [ ] Create user-account-service.ts for user account creation
- [ ] Implement createUserFromApplication() function
- [ ] Implement generateSecurePassword() or integrate with SSO
- [ ] Extend email-service.ts for approval notifications
- [ ] Create approval email templates (approval-en.njk, approval-cy.njk)
- [ ] Write unit tests for service layer

## Admin UI

- [ ] Extend i18n translations for approval workflow (locales/en.ts, locales/cy.ts)
- [ ] Update applications-list page to include "Approve" action
- [ ] Implement approve-application confirmation page (controller + template)
- [ ] Implement approve-confirm page (controller + template)
- [ ] Implement approve-success page (controller + template)

## Testing

- [ ] Write unit tests for approval service functions
- [ ] Write unit tests for user account creation
- [ ] Write E2E tests for complete approval workflow
- [ ] Test account creation and credentials generation
- [ ] Perform accessibility testing with Playwright axe
- [ ] Test Welsh language version
- [ ] Cross-browser testing

## Integration

- [ ] Integrate with user authentication system
- [ ] Configure password policy or SSO integration
- [ ] Test login with newly created accounts
- [ ] Verify email delivery with login instructions

## Deployment

- [ ] Run database migration in preview environment
- [ ] Test account creation in preview
- [ ] Deploy to production
- [ ] Monitor error logs and email delivery
- [ ] Verify user accounts are created successfully
