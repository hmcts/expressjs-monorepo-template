# VIBE-196: Verified User – Unsubscribe

## Overview

This specification outlines the implementation of the unsubscribe functionality for verified media users in CaTH. Users who have active email subscriptions for court and tribunal hearing notifications can remove individual subscriptions through a confirmation workflow.

## Problem Statement

Verified users (media) create accounts in CaTH to access restricted hearing information. They can subscribe to email notifications for publications and must also be able to unsubscribe when no longer interested in receiving notifications from specific venues.

## User Story

**As a** Verified Media User
**I want to** unsubscribe from my subscriptions in CaTH
**So that** I can stop receiving notifications for publications I'm no longer interested in

## Pre-conditions

- User has a verified and approved account in CaTH
- User is signed in
- User has one or more active subscriptions

## Acceptance Criteria

### Functional Requirements

- [ ] Verified user can view list of active email subscriptions
- [ ] Each subscription displays Court/tribunal name, Date added, and Unsubscribe action
- [ ] User can click Unsubscribe link for any subscription
- [ ] System displays confirmation page with Yes/No options
- [ ] Selecting "No" returns user to subscriptions list without changes
- [ ] Selecting "Yes" removes subscription and shows confirmation
- [ ] Subscription removed from database immediately
- [ ] Future email notifications exclude removed subscription
- [ ] Success page provides links to add new subscription, manage subscriptions, find courts
- [ ] Back link available on all pages

### Data Management

- [ ] If user has no remaining subscriptions after removal, delete relevant subscription records
- [ ] If user has other subscriptions, only remove the selected subscription
- [ ] Authorization check: users can only unsubscribe their own subscriptions

### Non-Functional Requirements

- [ ] WCAG 2.2 AA compliance
- [ ] Welsh language support
- [ ] Keyboard navigation functional
- [ ] Screen reader compatible

## Technical Approach

### Page Flow

```
┌──────────────────────────────────────────────────────────┐
│         Unsubscribe Workflow                              │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Your email subscriptions                             │
│     GET /subscriptions                                   │
│     • Display table of subscriptions                     │
│     • Unsubscribe link for each                          │
│     ↓                                                    │
│  2. Confirm unsubscribe                                  │
│     GET /subscriptions/unsubscribe/:id                   │
│     • Display subscription details                       │
│     • Yes/No radio buttons                               │
│     ↓                                                    │
│  3. Process confirmation                                 │
│     POST /subscriptions/unsubscribe/:id                  │
│     • If No → redirect to /subscriptions                 │
│     • If Yes → delete subscription                       │
│               redirect to success page                   │
│     ↓                                                    │
│  4. Success confirmation                                 │
│     GET /subscriptions/removed                           │
│     • Display success banner                             │
│     • Provide navigation links                           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Module Structure

Extends the subscription management module:

```
libs/subscription-management/
├── src/
│   ├── pages/
│   │   ├── subscriptions-list.ts (extend from VIBE-192)
│   │   ├── subscriptions-list.njk
│   │   ├── unsubscribe-confirm.ts (new)
│   │   ├── unsubscribe-confirm.njk (new)
│   │   ├── unsubscribe-success.ts (new)
│   │   └── unsubscribe-success.njk (new)
│   ├── subscription/
│   │   ├── subscription-service.ts (extend)
│   │   └── subscription-validation.ts
│   └── locales/
│       ├── en.ts (extend)
│       └── cy.ts (extend)
```

## Database Schema

Uses existing Subscription table from VIBE-192/VIBE-221:

```prisma
model Subscription {
  id            String              @id @default(cuid())
  userId        String              @map("user_id")
  courtId       String              @map("court_id")
  channel       SubscriptionChannel
  email         String?
  status        SubscriptionStatus  @default(ACTIVE)
  createdAt     DateTime            @default(now()) @map("created_at")
  lastNotified  DateTime?           @map("last_notified")
  updatedAt     DateTime            @updatedAt @map("updated_at")

  @@map("subscription")
  @@index([userId, status])
}
```

## Page Specifications

### Page 1: Your Email Subscriptions

**Route**: `GET /subscriptions`

**Content**:
- Page title: "Your email subscriptions"
- "Add email subscription" button
- Table with columns: "Court or tribunal name", "Date added", "Actions"
- Each row displays subscription with "Unsubscribe" link
- Back link to Dashboard

**Controller logic**:
- Fetch all active subscriptions for signed-in user
- Format dates for display
- Pass subscriptions and i18n content to template

### Page 2: Confirm Unsubscribe

**Route**: `GET /subscriptions/unsubscribe/:id`

**Content**:
- Page title: "Are you sure you want to remove this subscription?"
- Radio buttons: "Yes" / "No"
- "Continue" button
- Back link to subscriptions list

**Validation**:
- Radio selection required: "Select yes or no"
- Subscription ID must belong to signed-in user

**Route**: `POST /subscriptions/unsubscribe/:id`

**Controller logic**:
- Validate radio selection
- If "No" → redirect to /subscriptions
- If "Yes" → delete subscription, redirect to /subscriptions/removed

### Page 3: Subscription Removed

**Route**: `GET /subscriptions/removed`

**Content**:
- Success panel: "Subscriptions removed"
- Message: "Your subscription has been removed"
- Text: "To continue, you can go to your account in order to:"
- Links:
  - "add a new email subscription" → /subscriptions/add
  - "manage your current email subscriptions" → /subscriptions
  - "find a court or tribunal" → /courts/search

## Service Layer

### subscription-service.ts

```typescript
export async function getUserSubscriptions(userId: string): Promise<Subscription[]>

export async function getSubscriptionById(
  subscriptionId: string,
  userId: string
): Promise<Subscription | null>

export async function removeSubscription(
  subscriptionId: string,
  userId: string
): Promise<void>

export async function canUserRemoveSubscription(
  subscriptionId: string,
  userId: string
): Promise<boolean>
```

## Validation Rules

- Radio selection required on confirmation page
- Subscription ID must exist
- Subscription must belong to current user
- Cannot remove subscription with status other than ACTIVE

## Error Messages

| Scenario | English | Welsh |
|----------|---------|-------|
| No radio selected | Select yes or no | Dewiswch ie neu na |
| Subscription not found | We could not find that subscription | Ni allem ddod o hyd i'r tanysgrifiad hwnnw |
| Unauthorized | You are not authorised to update this subscription | Nid oes gennych awdurdod i ddiweddaru'r tanysgrifiad hwn |

## Security Considerations

- Authorization check: users can only unsubscribe their own subscriptions
- CSRF protection on POST endpoint
- Session-based authentication required
- Input validation on subscription ID

## Testing Strategy

### Unit Tests
- Test getUserSubscriptions()
- Test removeSubscription()
- Test authorization logic
- Test validation rules

### E2E Tests
- User views subscriptions list
- User clicks Unsubscribe
- User selects "No" and is returned to list
- User selects "Yes" and subscription is removed
- Success page displays with correct links
- Removed subscription no longer appears in list
- User cannot unsubscribe another user's subscription

### Accessibility Tests
- Keyboard navigation works
- Screen reader announces errors
- Focus management after form submission
- Back link accessible
- Table headers announced correctly

## Dependencies

- Subscription management system (VIBE-192)
- User authentication system
- PostgreSQL database
- Prisma ORM

## Monitoring

- Log unsubscribe actions with user ID, subscription ID, timestamp
- Track unsubscribe rates
- Monitor for authorization failures
- Alert on unusual unsubscribe patterns
