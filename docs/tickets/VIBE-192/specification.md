# VIBE-192: Verified User – Email Subscriptions

## Overview

This specification outlines the implementation of email subscription functionality for verified media users in CaTH. Users can subscribe to receive email notifications when new hearing lists are published for specific courts and tribunals.

## Problem Statement

Verified users (media) create accounts in CaTH to access restricted hearing information. Once approved, they need the ability to subscribe to email notifications when new hearing lists are published for specific venues, allowing them to stay informed about publications they're interested in.

## User Story

**As a** Verified Media User
**I want to** subscribe to hearing lists in CaTH
**So that** I can receive email notifications whenever a new list I subscribed to is published

## Pre-conditions

- User has a verified and approved account in CaTH
- User is signed in
- Courts and tribunals (venues) exist in the system

## Acceptance Criteria

### Functional Requirements

- [ ] Verified user can access Email subscriptions section from top navigation
- [ ] User can view list of existing subscriptions (if any)
- [ ] User without subscriptions sees "You do not have any active subscriptions" message
- [ ] User with subscriptions sees table with Court name, Date added, Actions
- [ ] User can click "Add email subscription" button
- [ ] User can search for and select courts/tribunals to subscribe to
- [ ] User can select multiple venues
- [ ] User can confirm selected subscriptions before saving
- [ ] User can remove subscriptions from confirmation page
- [ ] User cannot proceed with zero subscriptions (validation error)
- [ ] System saves subscriptions to database
- [ ] User sees success confirmation after adding subscriptions
- [ ] Success page provides helpful navigation links

### Data Management

- [ ] Subscriptions stored in database with unique ID
- [ ] Link user ID to court ID
- [ ] Store subscription channel (email for media users)
- [ ] Record date added
- [ ] Support subscription modifications (add, update, delete)
- [ ] Prevent duplicate subscriptions for same user + court

### Non-Functional Requirements

- [ ] WCAG 2.2 AA compliance
- [ ] Welsh language support
- [ ] Keyboard navigation functional
- [ ] Screen reader compatible
- [ ] Back link on all pages

## Technical Approach

### Page Flow

```
┌──────────────────────────────────────────────────────────┐
│         Email Subscription Workflow                       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Your email subscriptions                             │
│     GET /subscriptions                                   │
│     • Display existing subscriptions or empty message    │
│     • "Add email subscription" button                    │
│     ↓                                                    │
│  2. Subscribe by court or tribunal name                  │
│     GET /subscriptions/add                               │
│     • Search and select venues                           │
│     • Support multiple selections                        │
│     POST /subscriptions/add                              │
│     ↓                                                    │
│  3. Confirm your email subscriptions                     │
│     GET /subscriptions/confirm                           │
│     • Display selected subscriptions                     │
│     • Allow removing individual selections               │
│     • "Add another subscription" link                    │
│     • Validate at least one subscription                 │
│     POST /subscriptions/confirm                          │
│     ↓                                                    │
│  4. Subscription confirmation (success)                  │
│     GET /subscriptions/success                           │
│     • Display success message                            │
│     • Provide navigation links                           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Module Structure

```
libs/subscription-management/
├── src/
│   ├── pages/
│   │   ├── subscriptions-list.ts
│   │   ├── subscriptions-list.njk
│   │   ├── add-subscription.ts
│   │   ├── add-subscription.njk
│   │   ├── confirm-subscriptions.ts
│   │   ├── confirm-subscriptions.njk
│   │   ├── subscription-success.ts
│   │   └── subscription-success.njk
│   ├── subscription/
│   │   ├── subscription-service.ts
│   │   ├── subscription-queries.ts
│   │   └── subscription-validation.ts
│   ├── court/
│   │   ├── court-search.ts
│   │   └── court-queries.ts
│   └── locales/
│       ├── en.ts
│       └── cy.ts
```

## Database Schema

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
  channel       SubscriptionChannel @default(EMAIL)
  status        SubscriptionStatus  @default(ACTIVE)
  createdAt     DateTime            @default(now()) @map("created_at")
  lastNotified  DateTime?           @map("last_notified")
  updatedAt     DateTime            @updatedAt @map("updated_at")

  @@map("subscription")
  @@unique([userId, courtId])
  @@index([userId, status])
  @@index([courtId])
}

model Court {
  id        String   @id @default(cuid())
  courtId   String   @unique @map("court_id")
  courtName String   @map("court_name")
  venue     String
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("court")
  @@index([courtName])
}
```

## Page Specifications

### Page 1: Your Email Subscriptions

**Route**: `GET /subscriptions`

**Content**:
- Page title: "Your email subscriptions"
- "Add email subscription" button (green)
- If no subscriptions: "You do not have any active subscriptions"
- If subscriptions exist: table with columns:
  - Court or tribunal name
  - Date added
  - Actions (Remove link)

### Page 2: Subscribe by Court or Tribunal Name

**Route**: `GET /subscriptions/add`

**Content**:
- Page title: "Subscribe by court or tribunal name"
- Search field for court/tribunal
- Autocomplete or list of courts
- Checkboxes or multi-select
- "Continue" button

**Route**: `POST /subscriptions/add`

**Validation**:
- At least one court must be selected
- Store selections in session for confirmation

### Page 3: Confirm Your Email Subscriptions

**Route**: `GET /subscriptions/confirm`

**Content**:
- Page title: "Confirm your email subscriptions"
- List of selected subscriptions
- "Remove" link for each
- "Add another subscription" link
- "Continue" button

**Validation**:
- Must have at least one subscription
- If user removes all: show error "There is a problem. At least one subscription is needed."
- Display "Add subscription" button

**Route**: `POST /subscriptions/confirm`

**Controller logic**:
- Create subscriptions in database
- Prevent duplicates (unique constraint)
- Redirect to success page

### Page 4: Subscription Confirmation

**Route**: `GET /subscriptions/success`

**Content**:
- Success panel: "Subscription confirmation"
- Message: "To continue, you can go to your account in order to:"
- Links:
  - "add a new email subscription" → /subscriptions/add
  - "manage your current email subscriptions" → /subscriptions
  - "find a court or tribunal" → /courts/search

## Service Layer

### subscription-service.ts

```typescript
export async function getUserSubscriptions(userId: string): Promise<Subscription[]>

export async function createSubscriptions(
  userId: string,
  courtIds: string[]
): Promise<void>

export async function isDuplicateSubscription(
  userId: string,
  courtId: string
): Promise<boolean>

export async function getSubscriptionCount(userId: string): Promise<number>
```

### court-search.ts

```typescript
export async function searchCourts(query: string): Promise<Court[]>

export async function getAllActiveCourts(): Promise<Court[]>

export async function getCourtById(courtId: string): Promise<Court | null>
```

## Validation Rules

- At least one court must be selected
- Cannot create duplicate subscription (user + court unique)
- Only verified users can create subscriptions
- Court must exist and be active

## Error Messages

| Scenario | English | Welsh |
|----------|---------|-------|
| No courts selected | Please select at least one court or tribunal | Dewiswch o leiaf un llys neu dribiwnlys |
| All subscriptions removed | There is a problem. At least one subscription is needed. | Mae problem. Mae angen o leiaf un tanysgrifiad. |
| Duplicate subscription | You are already subscribed to this court | Rydych eisoes wedi tanysgrifio i'r llys hwn |

## Security Considerations

- Only authenticated verified users can create subscriptions
- Users can only view/manage their own subscriptions
- CSRF protection on POST endpoints
- Input validation on court selections
- Prevent subscription bombing (rate limiting)

## Testing Strategy

### Unit Tests
- Test getUserSubscriptions()
- Test createSubscriptions()
- Test duplicate detection
- Test validation rules

### E2E Tests
- User with no subscriptions sees empty message
- User can add subscriptions
- User can select multiple courts
- User can remove selections on confirmation page
- Cannot proceed with zero subscriptions
- Success page displays after saving
- Subscriptions appear in list after creation
- Cannot create duplicate subscriptions

### Accessibility Tests
- Keyboard navigation works
- Screen reader announces content correctly
- Focus management after form submission
- Error messages accessible
- Table headers announced

## Dependencies

- User authentication system
- Court reference data
- PostgreSQL database
- Prisma ORM

## Integration with Other Features

- Subscriptions used by notification system (VIBE-221)
- Unsubscribe functionality (VIBE-196)
- Court/tribunal data from blob ingestion (VIBE-209)

## Monitoring

- Log subscription creation with user ID, court IDs, timestamp
- Track subscription counts per user
- Monitor for duplicate attempts
- Alert on unusual subscription patterns
