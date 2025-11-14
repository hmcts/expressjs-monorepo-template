# VIBE-209: Blob Ingestion in CaTH

## Overview

This specification outlines the implementation of a blob (JSON file) ingestion system for CaTH that receives hearing list data from source systems via API, validates the data against a schema, verifies court references, and automatically publishes hearing lists when validation passes.

## Problem Statement

To auto-publish hearing lists in CaTH, JSON blobs must be ingested and validated from source systems (XHIBIT, LIBRA, SJP) through secure API connections. The system must validate incoming data against a defined schema, verify that the referenced court exists in the Court Master Reference Data, and either publish the hearing list or block ingestion with appropriate error logging and notification.

## User Story

**As a** System
**I want to** ingest a blob from a source system
**So that** I can validate and publish a hearing list in CaTH

## Pre-conditions

- API connections between source systems and CaTH have been established and tested
- Validation schema has been implemented for incoming blobs
- Style guide defining JSON format and field requirements is documented
- Courts (venues) have been created and stored in Court Master Reference Data
- Authentication mechanism (OAuth 2.0 / API key) is configured

## Acceptance Criteria

### Functional Requirements

- [ ] Blob received in CaTH is validated against pre-established schema
- [ ] Blob must reference an existing court in Court Master Reference Data
- [ ] Only blobs for existing courts are ingested and published
- [ ] Blobs for non-existent courts are blocked
- [ ] Blocked ingestion incidents are logged in Validation Report
- [ ] Source system is notified when ingestion fails
- [ ] System admin can add missing courts to Court Master Reference Data
- [ ] Ingestion can be retried after court is added
- [ ] All ingestion attempts are auditable

### Validation Requirements

- [ ] JSON format validation
- [ ] Required fields validation
- [ ] Data type validation
- [ ] Court ID exists in reference data
- [ ] Provenance source validation
- [ ] Blob size limit enforcement

### Error Handling

- [ ] Invalid JSON format detected and blocked
- [ ] Missing required fields detected and blocked
- [ ] Unknown court ID detected and reported
- [ ] Validation errors logged with full details
- [ ] Source system receives appropriate error response

### Non-Functional Requirements

- [ ] API authentication required for all requests
- [ ] Maximum blob size limit (10MB)
- [ ] Response time < 2 seconds for validation
- [ ] Audit logs retained for minimum 90 days
- [ ] System alerts for repeated ingestion failures
- [ ] Welsh language support for admin interface

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Blob Ingestion Flow                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Source System Sends Blob (JSON)                         │
│     ↓                                                       │
│  2. CaTH API Receives Request                               │
│     ↓                                                       │
│  3. Authentication Validation                               │
│     ↓                                                       │
│  4. JSON Schema Validation                                  │
│     ↓                                                       │
│  5. Court Reference Validation                              │
│     ↓                                                       │
│  6. Decision Point:                                         │
│     ├─ Valid → Publish Hearing List                         │
│     │         Create Audit Log                              │
│     │         Return 200 OK                                 │
│     │                                                       │
│     └─ Invalid → Block Ingestion                            │
│                  Create Validation Report                   │
│                  Notify Source System                       │
│                  Return Error Response                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Module Structure

```
libs/blob-ingestion/
├── src/
│   ├── api/
│   │   ├── ingest-blob.ts
│   │   └── validation-report.ts
│   ├── validation/
│   │   ├── schema-validator.ts
│   │   ├── court-validator.ts
│   │   └── provenance-validator.ts
│   ├── publishing/
│   │   ├── hearing-list-publisher.ts
│   │   └── publication-service.ts
│   ├── reporting/
│   │   ├── validation-report-service.ts
│   │   └── incident-logger.ts
│   └── routes/
│       ├── ingest.ts
│       └── admin-reports.ts
```

## Database Schema

### Court Reference Data

```prisma
model Court {
  id              String   @id @default(cuid())
  courtId         String   @unique @map("court_id") // External court identifier
  courtName       String   @map("court_name")
  venue           String
  provenance      String   // XHIBIT, LIBRA, SJP
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@map("court")
  @@index([courtId])
  @@index([provenance])
}
```

### Validation Report

```prisma
enum IngestionStatus {
  SUCCESS
  FAILED_SCHEMA
  FAILED_COURT_NOT_FOUND
  FAILED_SIZE_LIMIT
  FAILED_AUTHENTICATION
}

model IngestionAudit {
  id              String           @id @default(cuid())
  sourceSystem    String           @map("source_system")
  courtId         String?          @map("court_id")
  blobData        Json?            @map("blob_data") // Truncated for logging
  status          IngestionStatus
  errorMessage    String?          @map("error_message")
  validationDetails Json?          @map("validation_details")
  createdAt       DateTime         @default(now()) @map("created_at")

  @@map("ingestion_audit")
  @@index([sourceSystem])
  @@index([status])
  @@index([createdAt])
}
```

### Hearing List Publication

```prisma
model HearingList {
  id              String   @id @default(cuid())
  courtId         String   @map("court_id")
  publicationDate DateTime @map("publication_date")
  hearingData     Json     @map("hearing_data")
  sourceSystem    String   @map("source_system")
  publishedAt     DateTime @default(now()) @map("published_at")
  createdAt       DateTime @default(now()) @map("created_at")

  @@map("hearing_list")
  @@index([courtId])
  @@index([publicationDate])
}
```

## API Endpoints

### Ingestion Endpoint

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/ingest-blob` | POST | API Key / OAuth 2.0 | Ingest hearing list blob from source system |
| `/api/v1/validation-report` | GET | Admin | View validation report (admin only) |
| `/api/v1/courts/reference-data` | GET | Admin | View court reference data |

### Request/Response Examples

**POST /api/v1/ingest-blob**

Request:
```json
{
  "court_id": "CATH-00123",
  "publication_date": "2025-11-15T09:00:00Z",
  "provenance": "XHIBIT",
  "hearing_list": [
    {
      "case_id": "12345",
      "case_name": "R v Smith",
      "hearing_time": "10:00",
      "judge": "Judge Jones"
    }
  ]
}
```

Success Response (200 OK):
```json
{
  "status": "success",
  "message": "Blob ingested and published successfully",
  "court_id": "CATH-00123",
  "publication_id": "pub-abc123"
}
```

Error Response (404 Not Found):
```json
{
  "status": "error",
  "message": "Court not found in CaTH reference data",
  "court_id": "EXT-98765",
  "action": "Incident logged and reported to source system"
}
```

## Validation Schema

### JSON Schema Structure

```json
{
  "type": "object",
  "required": ["court_id", "publication_date", "provenance", "hearing_list"],
  "properties": {
    "court_id": {
      "type": "string",
      "pattern": "^[A-Z0-9-]+$"
    },
    "publication_date": {
      "type": "string",
      "format": "date-time"
    },
    "provenance": {
      "type": "string",
      "enum": ["XHIBIT", "LIBRA", "SJP"]
    },
    "hearing_list": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["case_id", "case_name", "hearing_time"],
        "properties": {
          "case_id": {"type": "string"},
          "case_name": {"type": "string"},
          "hearing_time": {"type": "string"},
          "judge": {"type": "string"}
        }
      }
    }
  }
}
```

### Validation Rules

| Validation | Rule | Error Code |
|------------|------|------------|
| JSON Format | Must be valid JSON | 400 |
| Required Fields | court_id, publication_date, hearing_list | 400 |
| Court Exists | court_id must exist in Court Reference Data | 404 |
| Provenance | Must be XHIBIT, LIBRA, or SJP | 400 |
| Size Limit | Maximum 10MB | 413 |
| Authentication | Valid API key or OAuth token | 401 |

## Security Considerations

- API authentication required (OAuth 2.0 or API key)
- Rate limiting to prevent abuse
- Input sanitization to prevent injection attacks
- Audit logging for all ingestion attempts
- Encrypted API connections (HTTPS only)
- API keys rotated regularly

## Testing Strategy

### Unit Tests
- Test schema validation logic
- Test court reference validation
- Test error response generation
- Test audit log creation

### Integration Tests
- Test complete ingestion flow
- Test validation failure scenarios
- Test publication process
- Test notification to source system

### E2E Tests
- Send valid blob and verify publication
- Send invalid blob and verify rejection
- Send blob for non-existent court and verify reporting
- Verify audit logs created correctly

## Monitoring & Logging

### Metrics
- Number of blobs ingested per day
- Success/failure rates
- Validation error types
- Average processing time
- Source system breakdown

### Alerts
- Repeated validation failures from same source
- Unknown court IDs appearing frequently
- API authentication failures
- System errors during ingestion

### Audit Logs
- Every ingestion attempt logged
- Include timestamp, source system, court ID, status
- Store validation details for failures
- Retain logs for minimum 90 days

## Admin Interface

### Validation Report Page

Admin users can view:
- All ingestion attempts (success/failure)
- Filter by source system, date, status
- View detailed error messages
- Export validation report

### Court Management

System admins can:
- View court reference data
- Add new courts to reference data
- Update existing court information
- Deactivate courts

## Dependencies

- Court Master Reference Data system
- JSON schema validation library
- API authentication service
- PostgreSQL database
- Prisma ORM

## Deployment Considerations

- Configure API authentication (OAuth provider or API key management)
- Set maximum blob size limit (environment variable)
- Register source system API keys
- Create court reference data seed data
- Configure monitoring and alerting
- Test with source systems in preview environment
