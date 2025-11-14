# VIBE-143: User Table Creation in Blob Storage

## Overview

This specification defines the creation of a User table in the CaTH database to store details of all users who sign into the system through various authentication routes (SSO, CFT/IDAM, Common Platform). The table supports user management, audit trails, and access control.

## Problem Statement

The details of users who sign into CaTH need to be stored securely for auditing, access control, and operational purposes. A User table is required to capture and store user details from all authentication providers while maintaining compliance with data protection and security policies.

## User Story

**As a** Service
**I want to** create a user table in the database
**So that** I can store the details of users who access CaTH

## Acceptance Criteria

### Functional Requirements

- [ ] User table created in database (PostgreSQL via Prisma)
- [ ] Table stores users from all authentication routes:
  - SSO (Single Sign-On)
  - CFT/IDAM authentication
  - Common Platform login
- [ ] New user login creates record
- [ ] Returning user login updates timestamps
- [ ] Unique identifiers prevent duplicate records
- [ ] Logical deletion support (soft delete)
- [ ] Audit logging for all write operations

### Data Management

- [ ] user_id is unique primary key
- [ ] Email is unique per user
- [ ] Store authentication provider
- [ ] Track first and last login timestamps
- [ ] Store user role and verification status
- [ ] Support account status (Active, Suspended, Deactivated)

### Security & Compliance

- [ ] Encryption at rest
- [ ] Encryption in transit (TLS)
- [ ] Access control via authentication
- [ ] Audit logging for all operations
- [ ] GDPR compliance
- [ ] Data retention policy (7 years from last activity)
- [ ] Anonymization of inactive accounts after 12 months

## Technical Approach

### Database Schema

```prisma
enum AuthProvider {
  SSO
  CFT_IDAM
  COMMON_PLATFORM
}

enum AccountStatus {
  ACTIVE
  SUSPENDED
  DEACTIVATED
}

model User {
  id                  String        @id @default(cuid())
  email               String        @unique
  fullName            String        @map("full_name")
  role                String
  authProvider        AuthProvider  @map("auth_provider")
  loginTimestamp      DateTime      @map("login_timestamp")
  firstLoginTimestamp DateTime      @map("first_login_timestamp")
  lastActivityTimestamp DateTime?   @map("last_activity_timestamp")
  accountStatus       AccountStatus @default(ACTIVE) @map("account_status")
  isVerified          Boolean       @default(false) @map("is_verified")
  sourceIp            String?       @map("source_ip")
  deviceInfo          String?       @map("device_info")
  locale              String        @default("en")
  createdAt           DateTime      @default(now()) @map("created_at")
  updatedAt           DateTime      @updatedAt @map("updated_at")
  deletedAt           DateTime?     @map("deleted_at")

  @@map("user")
  @@index([email])
  @@index([authProvider])
  @@index([accountStatus])
  @@index([deletedAt])
}
```

### Audit Logging

```prisma
enum UserEventType {
  USER_CREATED
  USER_UPDATED
  USER_DELETED
  USER_LOGIN
  USER_SUSPENDED
  USER_DEACTIVATED
}

model UserAudit {
  id            String        @id @default(cuid())
  userId        String        @map("user_id")
  eventType     UserEventType @map("event_type")
  eventTrigger  String        @map("event_trigger")
  eventActor    String?       @map("event_actor")
  changes       Json?
  createdAt     DateTime      @default(now()) @map("created_at")

  @@map("user_audit")
  @@index([userId])
  @@index([eventType])
  @@index([createdAt])
}
```

## Module Structure

```
libs/user-management/
├── src/
│   ├── user/
│   │   ├── user-service.ts
│   │   ├── user-queries.ts
│   │   └── user-validation.ts
│   ├── audit/
│   │   ├── user-audit-service.ts
│   │   └── audit-queries.ts
│   ├── middleware/
│   │   └── user-tracking-middleware.ts
│   └── routes/
│       └── user-admin.ts
```

## Service Layer

### user-service.ts

```typescript
export async function createUser(userData: CreateUserData): Promise<User>

export async function updateUserLogin(
  userId: string,
  sourceIp?: string,
  deviceInfo?: string
): Promise<void>

export async function getUserByEmail(email: string): Promise<User | null>

export async function updateAccountStatus(
  userId: string,
  status: AccountStatus
): Promise<void>

export async function softDeleteUser(userId: string): Promise<void>

export async function updateUserActivity(userId: string): Promise<void>
```

### user-audit-service.ts

```typescript
export async function logUserEvent(
  userId: string,
  eventType: UserEventType,
  eventTrigger: string,
  eventActor?: string,
  changes?: Record<string, any>
): Promise<void>

export async function getUserAuditLog(userId: string): Promise<UserAudit[]>
```

## Middleware

### user-tracking-middleware.ts

Automatically updates user login and activity timestamps:

```typescript
export function userTrackingMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.user) {
      await updateUserLogin(req.user.id, req.ip, req.headers['user-agent'])
    }
    next()
  }
}
```

## API Endpoints (Admin Only)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/admin/users` | GET | Admin | List all users |
| `/api/admin/users/:id` | GET | Admin | Get user details |
| `/api/admin/users/:id/status` | PATCH | Admin | Update account status |
| `/api/admin/users/:id` | DELETE | Admin | Soft delete user |
| `/api/admin/users/:id/audit` | GET | Admin | Get user audit log |

## User Lifecycle Events

| Event | Trigger | Action |
|-------|---------|--------|
| New user login | First authentication | Create user record, log USER_CREATED |
| Returning user login | Subsequent authentication | Update login_timestamp, log USER_LOGIN |
| User activity | Any authenticated action | Update last_activity_timestamp |
| Account suspension | Admin action | Update status to SUSPENDED, log USER_SUSPENDED |
| Account deletion | Admin action or retention policy | Set deleted_at, log USER_DELETED |

## Validation Rules

- user_id must be unique (enforced by database)
- email must be valid format and unique
- auth_provider must be one of: SSO, CFT_IDAM, COMMON_PLATFORM
- timestamps must be valid ISO 8601 dates
- account_status must be: ACTIVE, SUSPENDED, or DEACTIVATED
- Email required for all authentication routes

## Security Considerations

- Database encryption at rest (PostgreSQL native encryption)
- TLS encryption for all connections
- Access control via authentication middleware
- Audit logging for all write operations
- IP address and device info collected for security review
- Sensitive data (email, full name) handled per GDPR
- Regular security audits of user data access

## Data Retention & Privacy

- Retain user records for 7 years from last activity
- Anonymize inactive accounts after 12 months:
  - Replace email with anonymized value
  - Remove full_name, source_ip, device_info
  - Mark as anonymized in audit log
- Soft delete (deleted_at) for compliance
- Hard delete after retention period expires

## Testing Strategy

### Unit Tests
- Test createUser()
- Test updateUserLogin()
- Test getUserByEmail()
- Test audit logging
- Test validation rules

### Integration Tests
- Test user creation on first login
- Test user update on returning login
- Test activity tracking
- Test audit log creation
- Test soft delete

### E2E Tests
- User signs in via SSO → record created
- User signs in via CFT/IDAM → record created
- User signs in via Common Platform → record created
- Returning user → timestamps updated
- Admin suspends account → status updated
- Audit log entries created for all events

## Monitoring & Maintenance

### Metrics
- Number of active users
- Daily/weekly/monthly login counts
- Authentication provider breakdown
- Account status distribution
- Failed login attempts

### Alerts
- Repeated failed write operations
- Schema validation errors
- Unusual login patterns
- Access control violations

### Maintenance Tasks
- Monthly: Flag inactive users (>12 months)
- Quarterly: Review and anonymize flagged users
- Annually: Enforce 7-year retention policy

## Dependencies

- Authentication system (SSO, CFT/IDAM, Common Platform)
- PostgreSQL database
- Prisma ORM
- Session management middleware

## Deployment Considerations

- Run database migration to create user and user_audit tables
- Configure database encryption
- Set up monitoring and alerting
- Document data retention procedures
- Configure scheduled tasks for anonymization
- Test with all authentication providers
