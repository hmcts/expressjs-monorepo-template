# Technical Plan: Civil Money Claim Service for Emotional Distress

## 1. Technical Approach

### Architecture Overview
This feature will be implemented as a new module `@hmcts/civil-claim` in `libs/civil-claim/`, following the established monorepo patterns. The service follows GOV.UK's "one thing per page" pattern with session-based multi-page form flow.

### Key Design Decisions
- **Multi-page form flow**: Each field gets its own page following GOV.UK best practices
- **Session storage**: Form data persisted in session until final submission
- **Zod validation**: Type-safe form validation with GOV.UK-compliant error messages
- **Prisma database**: New `civil_claim_submission` table for storing completed claims
- **Multiple victims**: Support for adding multiple victims (JSON array in database)
- **No authentication**: Anonymous submission allowed
- **No file upload**: Evidence upload removed per requirements
- **Confirmation reference**: CUID-based claim reference generated on submission

### Technology Stack
- **Frontend**: Nunjucks templates with GOV.UK Design System components
- **Backend**: Express.js route handlers, Zod validation
- **Database**: PostgreSQL via Prisma ORM
- **Session**: Express session (already configured)

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
    │       ├── offender-name.ts   # /civil-claim/offender-name
    │       ├── offender-name.njk
    │       ├── offender-email.ts  # /civil-claim/offender-email
    │       ├── offender-email.njk
    │       ├── offender-phone.ts  # /civil-claim/offender-phone
    │       ├── offender-phone.njk
    │       ├── victim-name.ts     # /civil-claim/victim-name
    │       ├── victim-name.njk
    │       ├── victim-email.ts    # /civil-claim/victim-email
    │       ├── victim-email.njk
    │       ├── victim-phone.ts    # /civil-claim/victim-phone
    │       ├── victim-phone.njk
    │       ├── add-another-victim.ts  # /civil-claim/add-another-victim
    │       ├── add-another-victim.njk
    │       ├── insult.ts          # /civil-claim/insult
    │       ├── insult.njk
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
  offenderEmail         String   @map("offender_email")
  offenderPhone         String   @map("offender_phone")

  // Victim details (JSON array to support multiple victims)
  victims               Json     @map("victims")
  // Structure: [{ name: string, email: string, phone: string }, ...]

  // Insult details
  insultDescription     String   @db.Text @map("insult_description")

  submittedAt           DateTime @default(now()) @map("submitted_at")

  @@index([submittedAt])
  @@map("civil_claim_submission")
}
```

### Form Validation Schemas

Each page has its own Zod schema in `validation.ts`:

```typescript
// Name schema (reusable for offender and victim)
export const nameSchema = z.object({
  name: z.string()
    .min(1, "Enter a name")
    .max(100, "Name must be 100 characters or less")
});

// Email schema
export const emailSchema = z.object({
  email: z.string()
    .min(1, "Enter an email address")
    .email("Enter a valid email address")
    .max(200, "Email must be 200 characters or less")
});

// Phone schema
export const phoneSchema = z.object({
  phone: z.string()
    .min(1, "Enter a phone number")
    .regex(/^[0-9\s\-\+\(\)]+$/, "Enter a valid phone number")
    .max(50, "Phone number must be 50 characters or less")
});

// Insult description schema
export const insultSchema = z.object({
  insultDescription: z.string()
    .min(10, "Description must be at least 10 characters")
    .max(5000, "Description must be 5000 characters or less")
});

// Add another victim schema
export const addAnotherVictimSchema = z.object({
  addAnother: z.enum(["yes", "no"], {
    required_error: "Select yes if you want to add another victim"
  })
});
```

### Page Flow
```
/civil-claim/start (GET only)
  ↓
/civil-claim/offender-name (GET/POST)
  ↓
/civil-claim/offender-email (GET/POST)
  ↓
/civil-claim/offender-phone (GET/POST)
  ↓
/civil-claim/victim-name (GET/POST)
  ↓
/civil-claim/victim-email (GET/POST)
  ↓
/civil-claim/victim-phone (GET/POST)
  ↓
/civil-claim/add-another-victim (GET/POST) - radio: yes/no
  ↓ (if yes, loop back to victim-name)
  ↓ (if no, continue)
/civil-claim/insult (GET/POST)
  ↓
/civil-claim/review (GET/POST) - summary with change links
  ↓
/civil-claim/confirmation/:confirmationId (GET only)
```

### Session Structure
```typescript
interface Victim {
  name: string;
  email: string;
  phone: string;
}

interface CivilClaimSession extends Session {
  civilClaim?: {
    offender?: {
      name: string;
      email: string;
      phone: string;
    };
    victims?: Victim[];  // Array to support multiple victims
    currentVictim?: {    // Temporary storage for victim being added
      name?: string;
      email?: string;
      phone?: string;
    };
    insult?: {
      insultDescription: string;
    };
  };
}
```

### GOV.UK Components Used
- **Text Input**: Name, email, phone fields
- **Textarea with Character Count**: Insult description (5000 char limit)
- **Radios**: Add another victim (yes/no)
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
- **Empty required fields**: "Enter a name", "Enter an email address", "Enter a phone number"
- **Invalid email**: "Enter a valid email address"
- **Invalid phone**: "Enter a valid phone number"
- **Description too short**: "Description must be at least 10 characters"
- **Description too long**: "Description must be 5000 characters or less"

### Edge Cases
- **Session expiry**: User loses form data - acceptable as per standard session timeout behavior
- **Incomplete submission**: Review page only accessible if all required pages completed
- **Duplicate submission**: User can submit multiple claims (no deduplication logic required)
- **Back button behavior**: Session preserves data, browser back works correctly
- **Direct URL access**: Missing session data redirects to start or shows appropriate error
- **Multiple victims**: User can add unlimited victims (no maximum limit)
- **Delete victim**: No delete functionality on review page (can only change)

### Security Considerations
- **Input sanitization**: Zod validation ensures no XSS via form inputs
- **SQL injection**: Prisma parameterized queries prevent SQL injection
- **CSRF**: Express session CSRF protection (assumed already configured)
- **JSON injection**: Victims array validated before storing in JSON column

## 4. Acceptance Criteria Mapping

### AC: Submit a civil claim for emotional distress
✅ **How satisfied**:
- User can access service at `/civil-claim/start`
- Multi-page form collects all required information:
  - Offender: name, email, phone (3 pages)
  - Victim(s): name, email, phone per victim (3 pages × N victims)
  - Add another victim decision (1 page)
  - Insult description (1 page)
  - Review page (summary list with change links)
- Final submission creates database record with claim reference
- Confirmation page shows claim reference and next steps

✅ **Verification approach**:
- Manual testing: Complete full journey from start to confirmation
- Unit tests: Each page controller, validation schema, service function
- E2E test: Full user journey via Playwright (single and multiple victims)
- Database verification: Confirm record created with correct data

### Technical Requirements from Ticket

✅ **Save submissions into database**:
- Prisma schema defines `civil_claim_submission` table
- Table constraints match form validations
- Service layer handles database insertion via queries module
- Victims stored as JSON array

✅ **Page specifications followed**:
- One field per page following GOV.UK best practices
- Back/Continue/Submit navigation on all pages
- Review page displays all details before submission
- Confirmation page shows reference and next steps

✅ **Validation requirements**:
- All required fields validated before continuing
- Email validation (RFC-compliant)
- Phone number validation (flexible format)
- Textarea length checks (10-5000 chars)

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
- `service.test.ts`: Test form submission processing, victim array handling
- `session.test.ts`: Test session data management, victim array operations
- `queries.test.ts`: Test database operations (mocked Prisma)
- `navigation.test.ts`: Test page flow logic, victim loop handling
- Each page controller: Test GET/POST handlers

### E2E Tests (Playwright)
- Happy path (single victim): Complete form submission from start to confirmation
- Happy path (multiple victims): Add 3 victims and complete submission
- Validation errors: Submit with missing/invalid data, verify errors shown
- Change journey: Complete form, use change links from review page
- Back navigation: Use back links throughout journey
- Remove victim: Test editing victim list from review page

### Coverage Target
- Aim for >90% coverage on business logic (service, validation, queries)
- 100% coverage on validation schemas (critical for data integrity)

## 6. Clarifications from Stakeholders

### RESOLVED

1. **User Authentication** ✅
   - **Answer**: Don't worry about auth yet
   - **Implementation**: No authentication middleware required, anonymous submission allowed

2. **Multiple Victims** ✅
   - **Answer**: Yes
   - **Implementation**: Add "add another victim" page with yes/no radios, loop back to victim-name if yes

3. **File Storage** ✅
   - **Answer**: Remove evidence upload
   - **Implementation**: No file upload functionality, remove evidence page and database fields

4. **Claim Processing Workflow** ✅
   - **Answer**: Just store in DB
   - **Implementation**: No post-submission workflow, email notifications, or admin dashboard for this ticket

5. **Data Retention** ✅
   - **Answer**: Keep data forever
   - **Implementation**: No cleanup jobs, no GDPR deletion logic required

6. **Contact Information Format** ✅
   - **Answer**: Yes, separate pages
   - **Implementation**: Separate pages for email and phone (one field per page)

### ASSUMED

7. **Welsh Translation**
   - **Assumption**: Yes, following established pattern in other modules (en/cy objects)

8. **Next Steps Content**
   - **Assumption**: Generic placeholder text: "Your claim has been received. We will review your submission and contact you within 10 working days."

## 7. Implementation Approach

### Phase 1: Module Setup and Database
1. Create module structure in `libs/civil-claim/`
2. Define Prisma schema with victims as JSON array
3. Run migration

### Phase 2: Core Business Logic
1. Implement validation schemas for all pages
2. Implement session management with victim array handling
3. Implement navigation logic with victim loop
4. Implement database queries

### Phase 3: Page Controllers (Offender)
1. Start page
2. Offender name page
3. Offender email page
4. Offender phone page

### Phase 4: Page Controllers (Victim)
1. Victim name page
2. Victim email page
3. Victim phone page
4. Add another victim page

### Phase 5: Page Controllers (Completion)
1. Insult description page
2. Review page with victim list
3. Confirmation page

### Phase 6: Testing and Polish
1. Write unit tests for all modules
2. Write E2E tests for happy paths and errors
3. Manual testing with keyboard and screen reader
4. Welsh translations
5. Final verification
