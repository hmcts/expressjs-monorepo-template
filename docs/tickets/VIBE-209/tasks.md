# VIBE-209: Implementation Tasks

## Database Schema

- [ ] Create Prisma schema for Court table
- [ ] Create Prisma schema for IngestionAudit table
- [ ] Create Prisma schema for HearingList table
- [ ] Create database migration script
- [ ] Create seed data for court reference data
- [ ] Test migration in local environment

## Module Setup

- [ ] Create module structure `libs/blob-ingestion/`
- [ ] Register module in root tsconfig.json
- [ ] Create package.json with dependencies
- [ ] Register API routes in apps/api/src/app.ts

## JSON Schema Validation

- [ ] Define JSON schema for hearing list blobs
- [ ] Implement schema-validator.ts
  - [ ] validateBlobSchema() function
  - [ ] validateRequiredFields() function
  - [ ] validateDataTypes() function
- [ ] Write unit tests for schema validation

## Court Reference Validation

- [ ] Implement court-validator.ts
  - [ ] courtExists() function
  - [ ] getCourtByCourtId() function
  - [ ] isCourtActive() function
- [ ] Implement provenance-validator.ts
  - [ ] validateProvenance() function
- [ ] Write unit tests for court validation

## Ingestion API

- [ ] Implement ingest-blob.ts route
  - [ ] POST /api/v1/ingest-blob endpoint
  - [ ] Authentication middleware
  - [ ] Request validation
  - [ ] Size limit check (10MB)
  - [ ] Call validation services
  - [ ] Call publishing service
  - [ ] Return appropriate responses
- [ ] Add rate limiting middleware
- [ ] Write integration tests for ingestion API

## Publishing Service

- [ ] Implement hearing-list-publisher.ts
  - [ ] publishHearingList() function
  - [ ] Store hearing list in database
  - [ ] Trigger publication event
- [ ] Implement publication-service.ts
  - [ ] Handle publication workflow
- [ ] Write unit tests for publishing service

## Validation Reporting

- [ ] Implement validation-report-service.ts
  - [ ] createValidationReport() function
  - [ ] getValidationReports() function
  - [ ] filterReports() function
- [ ] Implement incident-logger.ts
  - [ ] logIngestionAttempt() function
  - [ ] logValidationFailure() function
- [ ] Write unit tests for reporting service

## Admin Interface

- [ ] Create validation-report.ts route
  - [ ] GET /api/v1/validation-report endpoint
  - [ ] Admin authentication required
  - [ ] Filter and pagination support
- [ ] Create court reference data routes
  - [ ] GET /api/v1/courts/reference-data
  - [ ] POST /api/v1/courts (add court)
  - [ ] PUT /api/v1/courts/:id (update court)
- [ ] Write integration tests for admin routes

## Error Handling

- [ ] Implement comprehensive error responses
  - [ ] 400 Bad Request (invalid schema)
  - [ ] 401 Unauthorized (authentication failure)
  - [ ] 404 Not Found (court not found)
  - [ ] 413 Payload Too Large
  - [ ] 500 Internal Server Error
- [ ] Test all error scenarios

## Testing

- [ ] Unit tests for all validation functions
- [ ] Unit tests for publishing service
- [ ] Integration tests for complete ingestion flow
- [ ] Test with valid blob
- [ ] Test with invalid JSON
- [ ] Test with missing required fields
- [ ] Test with unknown court ID
- [ ] Test with oversized payload
- [ ] Test authentication failures

## Configuration

- [ ] Add environment variables
  - [ ] INGESTION_API_KEY
  - [ ] MAX_BLOB_SIZE_MB (default: 10)
  - [ ] AUDIT_LOG_RETENTION_DAYS (default: 90)
- [ ] Configure API authentication mechanism
- [ ] Document configuration in README

## Monitoring & Alerts

- [ ] Add logging for all ingestion attempts
- [ ] Add metrics for success/failure rates
- [ ] Set up alerts for repeated failures
- [ ] Set up alerts for unknown courts
- [ ] Document monitoring dashboards

## Deployment

- [ ] Run database migration in preview
- [ ] Seed court reference data
- [ ] Configure API keys for source systems
- [ ] Test with source systems in preview
- [ ] Deploy to production
- [ ] Monitor error logs
- [ ] Verify ingestion working correctly
