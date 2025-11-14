# VIBE-229: Implementation Tasks

## Database & Module Setup

- [ ] Create Prisma schema for media_application table with ApplicationStatus and RejectionReason enums
- [ ] Create database migration script
- [ ] Create module structure `libs/media-account-management/`
- [ ] Register module in root tsconfig.json and app.ts

## Business Logic

- [ ] Implement application-service.ts with rejectApplication() function
- [ ] Implement application-queries.ts for database operations
- [ ] Implement application-validation.ts for input validation
- [ ] Implement email-service.ts for rejection notifications
- [ ] Create email templates (rejection-en.njk, rejection-cy.njk)
- [ ] Write unit tests for service layer

## Admin UI

- [ ] Create i18n translations (locales/en.ts, locales/cy.ts)
- [ ] Implement applications-list page (controller + template)
- [ ] Implement reject-application form (controller + template)
- [ ] Implement reject-confirm page (controller + template)
- [ ] Implement reject-success page (controller + template)
- [ ] Add admin styles in assets/css/admin.scss

## Testing

- [ ] Write unit tests for all service functions
- [ ] Write E2E tests for complete rejection workflow
- [ ] Perform accessibility testing with Playwright axe
- [ ] Test Welsh language version
- [ ] Cross-browser testing

## Deployment

- [ ] Configure email service provider
- [ ] Test database migration in preview environment
- [ ] Deploy to production
- [ ] Monitor error logs and email delivery
