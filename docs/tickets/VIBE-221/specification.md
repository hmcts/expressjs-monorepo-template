# VIBE-221: Backend - Subscription Fulfilment (Email Notifications)

## Overview

This specification outlines the implementation of the email notification system for CaTH (Court and Tribunal Hearings). When a new hearing list is published, the system must automatically send email notifications to all verified users who have subscribed to receive updates for that specific venue.

## Problem Statement

Verified users can subscribe to email notifications from CaTH for specific court and tribunal hearing lists. When a new hearing list is published, the system needs to automatically identify all subscribed users and send them email notifications through GOV.UK Notify, ensuring reliable delivery, proper error handling, and compliance with data protection requirements.

## User Story

**As a** System
**I want to** send out email notifications to users who are subscribed to receive publication notifications from CaTH
**So that** they can be informed whenever a new list they subscribed to is published

## Pre-conditions

- User has an approved and verified CaTH account
- User has subscribed to receive notifications for one or more specific venues
- A Subscriptions table exists linking user IDs to court or tribunal venues
- A new hearing list publication event occurs for a venue with active subscribers

## Acceptance Criteria

### Functional Requirements

- [ ] When a new hearing list is published, a trigger is raised automatically in the CaTH backend
- [ ] The trigger retrieves all active subscriptions matching the publication's venue
- [ ] For email channel subscriptions, send notifications via GOV.UK Notify
- [ ] For API channel subscriptions, send notification payload to registered endpoint
- [ ] Only one email notification per user per publication (deduplication)
- [ ] All subscription channel details are validated before sending
- [ ] Email sent to subscribed users successfully
- [ ] Audit log created for each notification attempt

### Data Validation

- [ ] Email addresses validated for format and existence
- [ ] API endpoints validated for active connection
- [ ] Invalid or missing user IDs handled gracefully

### Error Handling

- [ ] GOV.UK Notify delivery failures are handled
- [ ] Invalid or missing user IDs are logged
- [ ] Invalid channel configurations are detected
- [ ] API channel failures are logged
- [ ] Duplicate notifications prevented
- [ ] Failed notifications logged and retried once

### Non-Functional Requirements

- [ ] Notifications sent within 5 minutes of publication
- [ ] System handles concurrent publications
- [ ] Audit trail for all notification attempts
- [ ] GDPR and DPA 2018 compliance
- [ ] Welsh language support for email templates

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│           Notification Trigger Flow                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Hearing List Published                                  │
│     ↓                                                       │
│  2. Publication Event Raised                                │
│     ↓                                                       │
│  3. Notification Service Triggered                          │
│     ↓                                                       │
│  4. Query Subscriptions (by venue)                          │
│     ↓                                                       │
│  5. For Each Subscription:                                  │
│     • Validate channel and details                          │
│     • Check deduplication                                   │
│     • Send via GOV.UK Notify (email)                        │
│     • Or send to API endpoint                               │
│     • Log result to audit table                             │
│     ↓                                                       │
│  6. Complete and Return Summary                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Module Structure

```
libs/subscription-notifications/
├── src/
│   ├── notification/
│   │   ├── notification-service.ts
│   │   ├── notification-trigger.ts
│   │   ├── email-sender.ts
│   │   ├── api-sender.ts
│   │   └── deduplication.ts
│   ├── subscription/
│   │   ├── subscription-queries.ts
│   │   └── subscription-validation.ts
│   ├── audit/
│   │   ├── notification-audit.ts
│   │   └── audit-queries.ts
│   ├── templates/
│   │   ├── notification-en.njk
│   │   └── notification-cy.njk
│   └── routes/
│       ├── trigger-notification.ts
│       └── audit-log.ts
```

## Database Schema

### Subscription Table

```prisma
enum SubscriptionChannel {
  EMAIL
  API
}

enum SubscriptionStatus {
  ACTIVE
  UNSUBSCRIBED
  ERROR
}

model Subscription {
  id            String              @id @default(cuid())
  userId        String              @map("user_id")
  courtId       String              @map("court_id")
  channel       SubscriptionChannel
  email         String?
  apiEndpoint   String?             @map("api_endpoint")
  status        SubscriptionStatus  @default(ACTIVE)
  createdAt     DateTime            @default(now()) @map("created_at")
  lastNotified  DateTime?           @map("last_notified")
  updatedAt     DateTime            @updatedAt @map("updated_at")

  @@map("subscription")
  @@index([courtId, status])
  @@index([userId])
}
```

### Notification Audit Table

```prisma
enum NotificationStatus {
  SENT
  FAILED
  SKIPPED
  DUPLICATE_FILTERED
}

model NotificationAudit {
  id              String              @id @default(cuid())
  subscriptionId  String              @map("subscription_id")
  userId          String              @map("user_id")
  publicationId   String              @map("publication_id")
  channel         SubscriptionChannel
  status          NotificationStatus
  errorMessage    String?             @map("error_message")
  createdAt       DateTime            @default(now()) @map("created_at")
  sentAt          DateTime?           @map("sent_at")

  @@map("notification_audit")
  @@index([publicationId])
  @@index([userId])
  @@index([status])
  @@unique([subscriptionId, publicationId])
}
```

## Email Template Structure

### GOV.UK Notify Template

**Template Variables:**
- `{user_name}`
- `{hearing_list_name}`
- `{publication_date}`
- `{court_name}`
- `{manage_link}`

**Email Content:**

```
GOV.UK Banner

---

Note this email contains Special Category Data as defined by Data Protection Act 2018,
formally known as Sensitive Personal Data, and should be handled appropriately.

This email contains information intended to assist the accurate reporting of court
proceedings. It is vital you ensure that you safeguard the Special Category Data
included and abide by reporting restrictions (for example on victims and children).
HMCTS will stop sending the data if there is concern about how it will be used.

---

Your subscription to get updates about the below has been triggered based on a
{hearing_list_name} being published for the {publication_date}.

---

Manage your subscriptions, view lists and additional case information within the
Court and tribunal hearings service.

[Link: {manage_link}]
```

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/publications/trigger` | POST | System | Trigger notification when list published |
| `/api/notifications/send` | POST | System | Process notifications for subscribed users |
| `/api/notifications/audit` | GET | Admin | View notification delivery audit log |

## Notification Service Logic

### Key Functions

**notification-service.ts:**

```typescript
export async function triggerNotificationsForPublication(
  publicationId: string,
  courtId: string,
  hearingListName: string,
  publicationDate: string
): Promise<NotificationSummary>

export async function sendNotificationToSubscriber(
  subscription: Subscription,
  publicationDetails: PublicationDetails
): Promise<NotificationResult>
```

**deduplication.ts:**

```typescript
export async function isDuplicateNotification(
  subscriptionId: string,
  publicationId: string
): Promise<boolean>

export async function markNotificationSent(
  subscriptionId: string,
  publicationId: string
): Promise<void>
```

**email-sender.ts:**

```typescript
export async function sendEmailViaGovNotify(
  email: string,
  templateId: string,
  templateParams: Record<string, string>
): Promise<SendResult>
```

## Validation Rules

### Email Channel
- Email format validation (RFC2822)
- Email must exist in user profile
- GOV.UK Notify template ID must be configured
- User language preference determines template (EN/CY)

### API Channel
- API endpoint must return HTTP 200 on health check
- Payload includes: `publication_id`, `court_id`, `timestamp`, `hearing_list_name`
- API authentication configured

### Deduplication
- Prevent duplicate notifications for same `user_id + publication_id`
- Use unique constraint in notification_audit table
- Check before sending each notification

## Error Handling

| Scenario | System Behaviour |
|----------|------------------|
| GOV.UK Notify send fails | Retry once → log error → mark as "FAILED" |
| Invalid user ID | Log error, skip notification, continue processing |
| Invalid email format | Mark record "SKIPPED", log reason |
| API endpoint unreachable | Log warning, mark as "FAILED", no retry |
| Duplicate trigger | Deduplicate by subscription + publication ID |
| Partial success | Log per-user success/failure |

## Security Considerations

- Notifications contain Special Category Data (DPA 2018)
- Email content warns recipients about data handling
- Audit log tracks all notification attempts
- API endpoints require system authentication
- Rate limiting on notification triggers
- GOV.UK Notify API key securely stored

## Testing Strategy

### Unit Tests
- Test subscription query logic
- Test email validation
- Test deduplication logic
- Test GOV.UK Notify integration (mocked)
- Test error handling paths

### Integration Tests
- Test complete notification flow
- Test concurrent publication handling
- Test retry logic
- Test audit logging

### E2E Tests
- Publish hearing list and verify notifications sent
- Verify deduplication works
- Test both English and Welsh templates
- Verify audit log entries created

## Monitoring & Logging

### Metrics
- Number of notifications sent per publication
- Success/failure rates
- Average notification delivery time
- GOV.UK Notify API response times

### Alerts
- GOV.UK Notify API failures
- High failure rate (>10%)
- Notification delays (>5 minutes)
- Subscription validation errors

### Audit Logs
- Every notification attempt logged
- Status: SENT, FAILED, SKIPPED, DUPLICATE_FILTERED
- Include error messages for failures
- Track timestamps for performance monitoring

## Dependencies

- GOV.UK Notify service and API key
- Subscription management system (VIBE-192)
- Publication system (triggers notifications)
- PostgreSQL database
- Prisma ORM

## Scope Exclusions (MVP)

- PDF attachments to emails (future iteration)
- Email summaries (future iteration)
- SMS notifications (future iteration)
- In-app notifications (future iteration)

## Deployment Considerations

- Configure GOV.UK Notify template IDs (EN and CY)
- Set environment variables for GOV.UK Notify API key
- Run database migrations for new tables
- Test notification flow in preview environment
- Monitor error rates after deployment
- Implement feature flag for gradual rollout
