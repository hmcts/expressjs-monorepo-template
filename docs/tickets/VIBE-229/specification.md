# VIBE-229: Manage Media Account Requests - Reject Application

## Overview

This specification outlines the implementation of the reject application functionality for the media account request management system. Administrators need the ability to review media account applications and reject them with appropriate reasons when applications do not meet eligibility criteria or contain incomplete/invalid information.

## Problem Statement

Media users are expected to create accounts in CaTH by filling and submitting the account creation form. When this happens, the CTSC Admin user is expected to verify the application and either approve or reject it. This ticket focuses on implementing the rejection workflow.

## User Stories

**As a CTSC Admin user**, I need to:
- Review pending media account applications
- Select an application to reject with a specific reason
- Provide additional context or notes for the rejection
- Send notification to the applicant about the rejection

**As a media applicant**, I need to:
- Receive notification when my application has been rejected
- Understand the specific reason for rejection
- Know what steps I can take next (reapply, correct issues, etc.)

## Acceptance Criteria

### Functional Requirements

- [ ] Admin can view list of pending media account applications
- [ ] Admin can select an application to review
- [ ] Admin can reject an application with a predefined rejection reason
- [ ] Admin can add optional notes (max 500 characters) explaining the rejection
- [ ] System updates application status to "REJECTED"
- [ ] System records rejection timestamp and admin user ID
- [ ] Email notification is sent to the applicant
- [ ] Rejected application is removed from pending queue
- [ ] Audit log is created for the rejection action

### Non-Functional Requirements

- [ ] WCAG 2.2 AA compliance for all pages
- [ ] Welsh language support for all content
- [ ] Page load times < 2 seconds
- [ ] Email sent within 5 minutes
- [ ] Secure authentication and authorization

## Technical Approach

### Module Structure

```
libs/media-account-management/
├── src/
│   ├── pages/
│   │   ├── applications-list.ts
│   │   ├── applications-list.njk
│   │   ├── reject-application.ts
│   │   ├── reject-application.njk
│   │   ├── reject-confirm.ts
│   │   ├── reject-confirm.njk
│   │   ├── reject-success.ts
│   │   └── reject-success.njk
│   ├── application/
│   │   ├── application-service.ts
│   │   ├── application-queries.ts
│   │   └── application-validation.ts
│   ├── notification/
│   │   ├── email-service.ts
│   │   └── templates/
│   │       ├── rejection-en.njk
│   │       └── rejection-cy.njk
│   └── locales/
│       ├── en.ts
│       └── cy.ts
```

### Database Schema

```prisma
enum ApplicationStatus {
  PENDING
  APPROVED
  REJECTED
  WITHDRAWN
}

enum RejectionReason {
  INELIGIBLE_ORGANIZATION
  INCOMPLETE_INFORMATION
  INVALID_DOCUMENTATION
  DUPLICATE_APPLICATION
  FAILED_VERIFICATION
  OTHER
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
  rejectionReason   RejectionReason?   @map("rejection_reason")
  rejectionNotes    String?            @map("rejection_notes") @db.VarChar(500)
  rejectedAt        DateTime?          @map("rejected_at")
  rejectedBy        String?            @map("rejected_by")
  createdAt         DateTime           @default(now()) @map("created_at")
  updatedAt         DateTime           @updatedAt @map("updated_at")

  @@map("media_application")
  @@index([status])
  @@index([submittedAt])
  @@index([rejectedAt])
}
```

### Rejection Workflow

1. Admin views pending applications list (`GET /admin/applications`)
2. Admin clicks "Reject" link for an application
3. System displays rejection form (`GET /admin/applications/:id/reject`)
4. Admin selects rejection reason and optionally adds notes
5. Admin submits form (`POST /admin/applications/:id/reject`)
6. System displays confirmation page (`GET /admin/applications/:id/reject/confirm`)
7. Admin confirms rejection (`POST /admin/applications/:id/reject/confirm`)
8. System:
   - Updates application status to REJECTED
   - Records rejection reason, notes, timestamp, and admin ID
   - Creates audit log entry
   - Queues email notification
9. System displays success page (`GET /admin/applications/:id/rejected`)
10. Background job sends email notification to applicant

### Rejection Reasons

| Code | English | Welsh |
|------|---------|-------|
| INELIGIBLE_ORGANIZATION | Ineligible organization | Sefydliad anghymwys |
| INCOMPLETE_INFORMATION | Incomplete information | Gwybodaeth anghyflawn |
| INVALID_DOCUMENTATION | Invalid documentation | Dogfennaeth annilys |
| DUPLICATE_APPLICATION | Duplicate application | Cais dyblyg |
| FAILED_VERIFICATION | Failed verification | Methu â gwirio |
| OTHER | Other | Arall |

## Security Considerations

- Admin authentication required for all endpoints
- Role-based access control (admin role only)
- CSRF protection on all POST forms
- Input validation and sanitization
- Parameterized database queries
- Audit logging for all rejection actions

## Testing Strategy

- Unit tests for service layer, validation, email generation
- Integration tests for complete rejection workflow
- E2E tests with Playwright covering admin journey
- Accessibility tests with axe-core
- Cross-browser testing

## Dependencies

- Authentication/authorization middleware
- Email service provider (GOV.UK Notify or similar)
- PostgreSQL database
- Prisma ORM

## Monitoring

- Log rejection actions with application ID, admin ID, timestamp
- Monitor email delivery success/failure
- Track rejection metrics by reason
- Alert on failed email deliveries
