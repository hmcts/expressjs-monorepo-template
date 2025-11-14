# VIBE-221: Implementation Tasks

## Database Schema

- [ ] Create Prisma schema for Subscription table with enums
- [ ] Create Prisma schema for NotificationAudit table
- [ ] Add unique constraint for deduplication (subscriptionId + publicationId)
- [ ] Create database migration script
- [ ] Test migration in local environment

## Module Setup

- [ ] Create module structure `libs/subscription-notifications/`
- [ ] Register module in root tsconfig.json
- [ ] Create package.json with dependencies
- [ ] Register API routes in apps/api/src/app.ts

## Notification Service

- [ ] Implement notification-service.ts
  - [ ] triggerNotificationsForPublication() function
  - [ ] sendNotificationToSubscriber() function
  - [ ] Error handling and retry logic
- [ ] Implement notification-trigger.ts for publication events
- [ ] Implement deduplication.ts
  - [ ] isDuplicateNotification() function
  - [ ] markNotificationSent() function
- [ ] Write unit tests for notification service

## Email Integration

- [ ] Implement email-sender.ts for GOV.UK Notify
- [ ] Configure GOV.UK Notify API client
- [ ] Create email template content (EN)
- [ ] Create email template content (CY)
- [ ] Register templates in GOV.UK Notify dashboard
- [ ] Implement retry logic for failed sends
- [ ] Write unit tests for email sender

## Subscription Queries

- [ ] Implement subscription-queries.ts
  - [ ] getActiveSubscriptionsByCourtId() function
  - [ ] validateSubscriptionChannel() function
- [ ] Implement subscription-validation.ts
  - [ ] validateEmail() function
  - [ ] validateApiEndpoint() function
- [ ] Write unit tests for subscription queries

## Audit Logging

- [ ] Implement notification-audit.ts
  - [ ] createAuditLogEntry() function
  - [ ] getAuditLogForPublication() function
- [ ] Implement audit-queries.ts
- [ ] Write unit tests for audit logging

## API Endpoints

- [ ] Implement trigger-notification.ts route
  - [ ] POST /api/publications/trigger
  - [ ] Request validation
  - [ ] Response with notification summary
- [ ] Implement audit-log.ts route
  - [ ] GET /api/notifications/audit (admin only)
- [ ] Add authentication middleware
- [ ] Write integration tests for API endpoints

## Testing

- [ ] Unit tests for all service functions
- [ ] Unit tests for deduplication logic
- [ ] Integration tests for complete notification flow
- [ ] Test concurrent publication handling
- [ ] Test GOV.UK Notify integration (mocked)
- [ ] Test both English and Welsh templates
- [ ] Test error handling scenarios

## Configuration

- [ ] Add environment variables
  - [ ] GOV_NOTIFY_API_KEY
  - [ ] GOV_NOTIFY_TEMPLATE_ID_EN
  - [ ] GOV_NOTIFY_TEMPLATE_ID_CY
  - [ ] NOTIFICATION_RETRY_COUNT (default: 1)
- [ ] Configure GOV.UK Notify templates
- [ ] Document configuration in README

## Monitoring & Alerts

- [ ] Add logging for notification attempts
- [ ] Add metrics for success/failure rates
- [ ] Set up alerts for high failure rates
- [ ] Set up alerts for API errors
- [ ] Document monitoring dashboards

## Deployment

- [ ] Run database migration in preview
- [ ] Test notification flow in preview
- [ ] Deploy to production
- [ ] Monitor error logs
- [ ] Verify notifications are sent successfully
- [ ] Check audit logs for completeness
