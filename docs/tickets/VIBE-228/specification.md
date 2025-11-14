# VIBE-228: Manage Media Account Requests - Approve Application

## Overview

This specification outlines the implementation of the approve application functionality for the media account request management system. Administrators need the ability to review media account applications and approve them when applications meet eligibility criteria and contain complete/valid information.

## Problem Statement

Media users are expected to create accounts in CaTH by filling and submitting the account creation form. When this happens, the CTSC Admin user is expected to verify the application and either approve or reject it. This ticket focuses on implementing the approval workflow.

## User Stories

**As a CTSC Admin user**, I need to:
- Review pending media account applications
- Verify applicant information and documentation
- Approve an application that meets criteria
- Trigger account creation for approved applicants

**As a media applicant**, I need to:
- Receive notification when my application has been approved
- Receive account credentials or login instructions
- Access the system after approval

## Acceptance Criteria

### Functional Requirements

- [ ] Admin can view list of pending media account applications
- [ ] Admin can select an application to review
- [ ] Admin can view all application details before approving
- [ ] Admin can approve an application
- [ ] System updates application status to "APPROVED"
- [ ] System creates user account for approved applicant
- [ ] System records approval timestamp and admin user ID
- [ ] Email notification is sent to the applicant with login instructions
- [ ] Approved application is removed from pending queue
- [ ] Audit log is created for the approval action

### Non-Functional Requirements

- [ ] WCAG 2.2 AA compliance for all pages
- [ ] Welsh language support for all content
- [ ] Page load times < 2 seconds
- [ ] Email sent within 5 minutes
- [ ] Secure authentication and authorization

## Technical Approach

### Module Structure

Builds on the `libs/media-account-management/` module created for VIBE-229:

```
libs/media-account-management/
├── src/
│   ├── pages/
│   │   ├── applications-list.ts (existing)
│   │   ├── applications-list.njk (existing)
│   │   ├── approve-application.ts (new)
│   │   ├── approve-application.njk (new)
│   │   ├── approve-confirm.ts (new)
│   │   ├── approve-confirm.njk (new)
│   │   ├── approve-success.ts (new)
│   │   └── approve-success.njk (new)
│   ├── application/
│   │   ├── application-service.ts (extend)
│   │   ├── user-account-service.ts (new)
│   │   └── application-validation.ts (extend)
│   ├── notification/
│   │   ├── email-service.ts (extend)
│   │   └── templates/
│   │       ├── approval-en.njk (new)
│   │       └── approval-cy.njk (new)
│   └── locales/
│       ├── en.ts (extend)
│       └── cy.ts (extend)
```

### Database Schema

Uses the existing schema from VIBE-229, leveraging the APPROVED status:

```prisma
enum ApplicationStatus {
  PENDING
  APPROVED
  REJECTED
  WITHDRAWN
}

model MediaApplication {
  id                String             @id @default(cuid())
  referenceNumber   String             @unique @map("reference_number")
  organizationName  String             @map("organization_name")
  contactName       String             @map("contact_name")
  contactEmail      String             @map("contact_email")
  contactPhone      String?            @map("contact_phone")
  language          String             @default("en")
  applicationData   Json               @map("application_data")
  status            ApplicationStatus  @default(PENDING)
  submittedAt       DateTime           @default(now()) @map("submitted_at")
  processedAt       DateTime?          @map("processed_at")
  processedBy       String?            @map("processed_by")
  approvedAt        DateTime?          @map("approved_at")
  approvedBy        String?            @map("approved_by")
  userId            String?            @map("user_id") // Created user account ID
  createdAt         DateTime           @default(now()) @map("created_at")
  updatedAt         DateTime           @updatedAt @map("updated_at")

  @@map("media_application")
  @@index([status])
  @@index([submittedAt])
  @@index([approvedAt])
}

model User {
  id              String    @id @default(cuid())
  email           String    @unique
  name            String
  organization    String
  role            String    @default("media")
  isActive        Boolean   @default(true) @map("is_active")
  lastLogin       DateTime? @map("last_login")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  @@map("user")
  @@index([email])
  @@index([role])
}
```

### Approval Workflow

1. Admin views pending applications list (`GET /admin/applications`)
2. Admin clicks "Approve" link for an application
3. System displays approval confirmation page (`GET /admin/applications/:id/approve`)
   - Shows application details for verification
   - Shows what will happen (account creation, email notification)
4. Admin confirms approval (`POST /admin/applications/:id/approve`)
5. System:
   - Updates application status to APPROVED
   - Creates user account with media role
   - Records approval timestamp and admin ID
   - Links application to created user account
   - Creates audit log entry
   - Queues welcome email notification
6. System displays success page (`GET /admin/applications/:id/approved`)
7. Background job sends welcome email with login instructions to applicant

## Security Considerations

- Admin authentication required for all endpoints
- Role-based access control (admin role only)
- CSRF protection on all POST forms
- Input validation and sanitization
- Secure password generation or SSO integration
- Email verification before account activation
- Audit logging for all approval actions

## Testing Strategy

- Unit tests for service layer, user account creation, email generation
- Integration tests for complete approval workflow
- E2E tests with Playwright covering admin journey
- Accessibility tests with axe-core
- Test account creation and email delivery
- Cross-browser testing

## Dependencies

- Authentication/authorization middleware
- User account management system
- Email service provider (GOV.UK Notify or similar)
- PostgreSQL database
- Prisma ORM
- Password generation library or SSO integration

## Monitoring

- Log approval actions with application ID, admin ID, timestamp
- Monitor email delivery success/failure
- Track approval metrics
- Monitor user account creation
- Alert on failed email deliveries or account creation failures
