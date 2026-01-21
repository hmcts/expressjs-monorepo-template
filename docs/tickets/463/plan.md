# Technical Plan: Civil Money Claim Service for Emotional Distress

## 1. Technical Approach

### Architecture Overview
This feature will be implemented as a new module `@hmcts/civil-claim` in `libs/civil-claim/`, following the established monorepo patterns. The service follows GOV.UK's "one thing per page" pattern with session-based multi-page form flow.

### Key Design Decisions
- **Multi-page form flow**: Each logical grouping (offender, victim, insult description, evidence) gets its own page
- **Session storage**: Form data persisted in session until final submission
- **Zod validation**: Type-safe form validation with GOV.UK-compliant error messages
- **Prisma database**: New `civil_claim_submission` table for storing completed claims
- **File upload**: Optional evidence files stored as file metadata (filename, size, mimetype) in database
- **Confirmation reference**: CUID-based claim reference generated on submission

### Technology Stack
- **Frontend**: Nunjucks templates with GOV.UK Design System components
- **Backend**: Express.js route handlers, Zod validation
- **Database**: PostgreSQL via Prisma ORM
- **Session**: Express session (already configured)
- **File handling**: Native file upload with size/type validation

## 2. Implementation Details

### Module Structure
```
libs/civil-claim/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma              # Database schema
└── src/
    ├── config.ts                  # Module configuration exports
    ├── index.ts                   # Business logic exports
    ├── pages/
    │   └── civil-claim/
    │       ├── start.ts           # /civil-claim/start
    │       ├── start.njk
    │       ├── offender.ts        # /civil-claim/offender
    │       ├── offender.njk
    │       ├── victim.ts          # /civil-claim/victim
    │       ├── victim.njk
    │       ├── insult.ts          # /civil-claim/insult
    │       ├── insult.njk
    │       ├── evidence.ts        # /civil-claim/evidence
    │       ├── evidence.njk
    │       ├── review.ts          # /civil-claim/review
    │       ├── review.njk
    │       └── confirmation/
    │           ├── [confirmationId].ts    # /civil-claim/confirmation/:confirmationId
    │           └── [confirmationId].njk
    └── civil-claim/
        ├── validation.ts          # Zod schemas for each page
        ├── validation.test.ts
        ├── service.ts             # Business logic
        ├── service.test.ts
        ├── queries.ts             # Database operations
        ├── queries.test.ts
        ├── session.ts             # Session management
        ├── session.test.ts
        ├── navigation.ts          # Page flow logic
        └── navigation.test.ts
```

### Database Schema
```prisma
model CivilClaimSubmission {
  id                    String   @id @default(cuid())

  // Offender details
  offenderName          String   @map("offender_name")
  offenderContactInfo   String   @map("offender_contact_info")

  // Victim details (can have multiple victims as JSON array)
  victimName            String   @map("victim_name")
  victimContactInfo     String   @map("victim_contact_info")

  // Insult details
  insultDescription     String   @db.Text @map("insult_description")

  // Evidence (optional)
  evidenceFilename      String?  @map("evidence_filename")
  evidenceFilesize      Int?     @map("evidence_filesize")
  evidenceMimetype      String?  @map("evidence_mimetype")

  submittedAt           DateTime @default(now()) @map("submitted_at")

  @@index([submittedAt])
  @@map("civil_claim_submission")
}
```

### Form Validation Schemas

Each page has its own Zod schema in `validation.ts`:

```typescript
// Offender details schema
export const offenderSchema = z.object({
  offenderName: z.string()
    .min(1, "Enter the offender's name")
    .max(100, "Name must be 100 characters or less"),
  offenderContactInfo: z.string()
    .min(1, "Enter contact information")
    .max(200, "Contact information must be 200 characters or less")
    .regex(EMAIL_OR_PHONE_REGEX, "Enter a valid email address or phone number")
});

// Victim details schema
export const victimSchema = z.object({
  victimName: z.string()
    .min(1, "Enter the victim's name")
    .max(100, "Name must be 100 characters or less"),
  victimContactInfo: z.string()
    .min(1, "Enter contact information")
    .max(200, "Contact information must be 200 characters or less")
    .regex(EMAIL_OR_PHONE_REGEX, "Enter a valid email address or phone number")
});

// Insult description schema
export const insultSchema = z.object({
  insultDescription: z.string()
    .min(10, "Description must be at least 10 characters")
    .max(5000, "Description must be 5000 characters or less")
});

// Evidence schema (optional file upload)
export const evidenceSchema = z.object({
  evidenceFilename: z.string().optional(),
  evidenceFilesize: z.number().max(10_000_000, "File must be less than 10MB").optional(),
  evidenceMimetype: z.enum(["application/pdf", "image/jpeg", "image/png"])
    .optional()
});
```

### Page Flow
```
/civil-claim/start (GET only)
  ↓
/civil-claim/offender (GET/POST)
  ↓
/civil-claim/victim (GET/POST)
  ↓
/civil-claim/insult (GET/POST)
  ↓
/civil-claim/evidence (GET/POST) - optional
  ↓
/civil-claim/review (GET/POST) - summary with change links
  ↓
/civil-claim/confirmation/:confirmationId (GET only)
```

### Session Structure
```typescript
interface CivilClaimSession extends Session {
  civilClaim?: {
    offender?: {
      offenderName: string;
      offenderContactInfo: string;
    };
    victim?: {
      victimName: string;
      victimContactInfo: string;
    };
    insult?: {
      insultDescription: string;
    };
    evidence?: {
      evidenceFilename?: string;
      evidenceFilesize?: number;
      evidenceMimetype?: string;
    };
  };
}
```

### GOV.UK Components Used
- **Text Input**: Offender/victim name and contact fields
- **Textarea with Character Count**: Insult description (5000 char limit)
- **File Upload**: Evidence upload (PDF/JPG/PNG, max 10MB)
- **Summary List**: Review page showing all entered data
- **Error Summary**: Validation errors on each page
- **Button**: Continue, Back, Submit buttons
- **Panel**: Confirmation page with reference number

### Navigation
- **Back link**: Present on all pages except start
- **Change links**: On review page to go back and edit specific sections
- **Return handling**: `?return=review` query parameter to redirect back to review after changes

## 3. Error Handling & Edge Cases

### Validation Errors
- **Empty required fields**: "Enter the offender's name"
- **Invalid email/phone**: "Enter a valid email address or phone number"
- **Description too short**: "Description must be at least 10 characters"
- **Description too long**: "Description must be 5000 characters or less"
- **File too large**: "File must be less than 10MB"
- **Invalid file type**: "Evidence must be a PDF, JPG or PNG file"

### Edge Cases
- **Session expiry**: User loses form data - acceptable as per standard session timeout behavior
- **Incomplete submission**: Review page only accessible if all required pages completed
- **Duplicate submission**: User can submit multiple claims (no deduplication logic required)
- **File upload failure**: Graceful handling with clear error message, evidence remains optional
- **Back button behavior**: Session preserves data, browser back works correctly
- **Direct URL access**: Missing session data redirects to start or shows appropriate error

### Security Considerations
- **Input sanitization**: Zod validation ensures no XSS via form inputs
- **File validation**: Strict mimetype and size checks before accepting uploads
- **SQL injection**: Prisma parameterized queries prevent SQL injection
- **CSRF**: Express session CSRF protection (assumed already configured)

## 4. Acceptance Criteria Mapping

### AC: Submit a civil claim for emotional distress
✅ **How satisfied**:
- User can access service at `/civil-claim/start`
- Multi-page form collects all required information:
  - Page 1: Offender details (name, contact)
  - Page 2: Victim details (name, contact)
  - Page 3: Insult description (textarea with character count)
  - Page 4: Evidence upload (optional, PDF/JPG/PNG)
  - Page 5: Review page (summary list with change links)
- Final submission creates database record with claim reference
- Confirmation page shows claim reference and next steps

✅ **Verification approach**:
- Manual testing: Complete full journey from start to confirmation
- Unit tests: Each page controller, validation schema, service function
- E2E test: Full user journey via Playwright
- Database verification: Confirm record created with correct data

### Technical Requirements from Ticket

✅ **Save submissions into database**:
- Prisma schema defines `civil_claim_submission` table
- Table constraints match form validations
- Service layer handles database insertion via queries module

✅ **Page specifications followed**:
- One logical grouping per page (offender, victim, insult, evidence)
- Back/Next/Submit navigation on all pages
- Review page displays all details before submission
- Confirmation page shows reference and next steps

✅ **Validation requirements**:
- All required fields validated before continuing
- Contact details regex validation
- Textarea min/max length checks (10-5000 chars)
- File type and size validation (PDF/JPG/PNG, max 10MB)

✅ **Error messages**:
- Specific, helpful error messages matching ticket requirements
- Error summary component at top of page
- Inline field errors below each input

✅ **Accessibility (WCAG 2.2 AA)**:
- GOV.UK components ensure accessibility
- ARIA labels on all inputs
- Keyboard-only navigation
- Screen reader tested error messages
- High contrast mode support

## 5. Testing Strategy

### Unit Tests (Vitest)
- `validation.test.ts`: Test all Zod schemas
- `service.test.ts`: Test form submission processing
- `session.test.ts`: Test session data management
- `queries.test.ts`: Test database operations (mocked Prisma)
- `navigation.test.ts`: Test page flow logic
- Each page controller: Test GET/POST handlers

### E2E Tests (Playwright)
- Happy path: Complete form submission from start to confirmation
- Validation errors: Submit with missing/invalid data, verify errors shown
- Change journey: Complete form, use change links from review page
- File upload: Upload evidence file, verify on review page
- Back navigation: Use back links throughout journey

### Coverage Target
- Aim for >90% coverage on business logic (service, validation, queries)
- 100% coverage on validation schemas (critical for data integrity)

## 6. Open Questions / Clarifications Needed

### CLARIFICATIONS NEEDED

1. **User Authentication**
   - Q: Should users be authenticated before submitting claims, or can they submit anonymously?
   - Impact: Determines if we need authentication middleware on routes
   - Assumption: Proceeding with anonymous submission (no auth required) based on ticket mention of "proceeds anonymously if policy permits"

2. **Multiple Victims**
   - Q: Ticket mentions "offended party/parties" (plural) - should users be able to add multiple victims?
   - Impact: Form design (add another victim button) and database schema (JSON array vs single record)
   - Assumption: Single victim for MVP, can extend to multiple later

3. **File Storage**
   - Q: Where should uploaded evidence files be stored? (local filesystem, S3, Azure Blob, etc.)
   - Impact: File upload implementation and infrastructure requirements
   - Assumption: Storing only file metadata in DB for MVP, actual file storage deferred

4. **Claim Processing Workflow**
   - Q: What happens after submission? Is there an admin dashboard, email notifications, case management?
   - Impact: Whether we need additional API endpoints, notification service integration
   - Assumption: Just store in database, no post-submission workflow for this ticket

5. **Data Retention**
   - Q: How long should claim data be retained? GDPR considerations?
   - Impact: Database cleanup jobs, data retention policies
   - Assumption: No automatic cleanup, admin handles via separate process

6. **Contact Information Format**
   - Q: Should contact info be split into separate email/phone fields or combined?
   - Impact: Form design and validation complexity
   - Assumption: Single text field accepting either email or phone number (flexible input)

7. **Welsh Translation**
   - Q: Are Welsh translations required for all pages?
   - Impact: Bilingual content objects needed for all pages
   - Assumption: Yes, following established pattern in other modules (en/cy objects)

8. **Next Steps Content**
   - Q: What specific text should appear in "next steps" on confirmation page?
   - Impact: Content design for confirmation page
   - Assumption: Generic placeholder text: "Your claim has been received. We will review your submission and contact you within 10 working days."
