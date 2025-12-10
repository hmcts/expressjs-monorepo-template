---
paths: libs/**/src/pages/**/*.ts, libs/**/src/pages/**/*.njk, apps/web/**/*.ts
---

# Frontend Development Rules

## GOV.UK Frontend Reference

Read @.claude/gds/govuk-frontend.md for available components and patterns.

## Page Controller Pattern

Controllers live in the `src/pages/` folder of modules in `libs/` with `GET` and `POST` exports. Routes are auto-generated from file names.

### Controller Structure

```typescript
// libs/[module]/src/pages/[page-name].ts
import type { Request, Response } from "express";

const en = {
  title: "Page Title",
  // Page-specific content only
};

const cy = {
  title: "Teitl y Dudalen",
  // Welsh translation with identical structure
};

export const GET = async (_req: Request, res: Response) => {
  res.render("page-name", { en, cy });
};

export const POST = async (req: Request, res: Response) => {
  // Validate → Service call → Redirect or Re-render with errors
};
```

### Controller Rules

- **No business logic in controllers** - delegate to service functions
- **Always provide both `en` and `cy`** - every page must support Welsh
- **Preserve user data on errors** - pass `data: req.body` back to template
- **Use redirects after successful POST** - prevent duplicate submissions
- **Template name must match file name** - `my-page.ts` renders `my-page.njk`

## Nunjucks Template Pattern

### Template Structure

```njk
{% extends "layouts/default.njk" %}
{% from "govuk/components/button/macro.njk" import govukButton %}
{% from "govuk/components/input/macro.njk" import govukInput %}
{% from "govuk/components/error-summary/macro.njk" import govukErrorSummary %}

{% block page_content %}
<div class="govuk-grid-row">
  <div class="govuk-grid-column-two-thirds">

    {% if errors %}
      {{ govukErrorSummary({
        titleText: errorSummaryTitle,
        errorList: errors
      }) }}
    {% endif %}

    <h1 class="govuk-heading-xl">{{ title }}</h1>

    <form method="post" novalidate>
      {{ govukInput({
        id: "email",
        name: "email",
        type: "email",
        autocomplete: "email",
        label: { text: emailLabel },
        errorMessage: errors.email,
        value: data.email
      }) }}

      {{ govukButton({ text: continueButtonText }) }}
    </form>

  </div>
</div>
{% endblock %}
```

### Template Rules

- **Use `page_content` block** - not `content` (layout-specific)
- **Import macros at top** - use `{% from %}` for GOV.UK components
- **Error summary before h1** - when validation errors exist
- **Add `novalidate` to forms** - server-side validation handles all cases
- **Use `autocomplete` attributes** - for all personal data inputs
- **Never use inline styles** - use GOV.UK classes only

## Bilingual Content

### Content Location

| Content Type | Location |
|--------------|----------|
| Page titles, headings, body text | Controller `en`/`cy` objects |
| Shared buttons, labels, errors | `libs/[module]/src/locales/en.ts` and `cy.ts` |

### Welsh Translation Rules

- **Identical structure** - `cy` object must mirror `en` exactly
- **Test with `?lng=cy`** - verify all text translates correctly
- **No hardcoded English** - all visible text must come from content objects

## Form Handling

### Error Display Pattern

```typescript
export const POST = async (req: Request, res: Response) => {
  const errors = validateForm(req.body);

  if (errors.length > 0) {
    return res.render("form-page", {
      en, cy,
      errors,
      data: req.body // Preserve user input
    });
  }

  await myService.process(req.body);
  res.redirect("/success");
};
```

### Error Message Format

```typescript
// Error summary format (array)
const errors = [
  { text: "Enter your email address", href: "#email" }
];

// Field error format (object keyed by field)
const fieldErrors = {
  email: { text: "Enter a valid email address" }
};
```

### Validation Rules

- **Server-side only** - no client-side validation as primary mechanism
- **Specific messages** - "Enter your email" not "This field is required"
- **Include format hints** - "Enter a date like 31 3 1980"
- **Link to field** - `href: "#field-id"` in error summary

## GOV.UK Component Usage

### Input Components

```njk
{# Text input #}
{{ govukInput({
  id: "name",
  name: "name",
  label: { text: nameLabel, isPageHeading: true, classes: "govuk-label--l" },
  value: data.name,
  errorMessage: errors.name
}) }}

{# Email with autocomplete #}
{{ govukInput({
  id: "email",
  name: "email",
  type: "email",
  autocomplete: "email",
  spellcheck: false,
  label: { text: emailLabel },
  value: data.email,
  errorMessage: errors.email
}) }}
```

### Selection Components

```njk
{# Radios - single selection #}
{{ govukRadios({
  name: "contact-preference",
  fieldset: { legend: { text: contactPreferenceLabel, isPageHeading: true, classes: "govuk-fieldset__legend--l" } },
  items: [
    { value: "email", text: emailOptionText },
    { value: "phone", text: phoneOptionText }
  ],
  errorMessage: errors["contact-preference"]
}) }}

{# Checkboxes - multiple selection #}
{{ govukCheckboxes({
  name: "notifications",
  fieldset: { legend: { text: notificationsLabel } },
  items: notificationItems,
  errorMessage: errors.notifications
}) }}
```

### Date Input

```njk
{{ govukDateInput({
  id: "date-of-birth",
  namePrefix: "date-of-birth",
  fieldset: { legend: { text: dateOfBirthLabel, isPageHeading: true, classes: "govuk-fieldset__legend--l" } },
  hint: { text: dateHintText },
  items: [
    { name: "day", classes: "govuk-input--width-2", value: data["date-of-birth-day"] },
    { name: "month", classes: "govuk-input--width-2", value: data["date-of-birth-month"] },
    { name: "year", classes: "govuk-input--width-4", value: data["date-of-birth-year"] }
  ],
  errorMessage: errors["date-of-birth"]
}) }}
```

## Accessibility Requirements

### Mandatory Checklist

- [ ] Page title matches h1
- [ ] Heading hierarchy logical (h1 → h2 → h3)
- [ ] All form inputs have labels
- [ ] Error summary links to fields
- [ ] Color is not sole information carrier
- [ ] Focus states visible on all interactive elements

### Keyboard Navigation

- All interactive elements must be keyboard accessible
- Tab order follows visual reading order
- No keyboard traps
- Form submission via Enter key works

### Screen Reader Support

- Use semantic HTML elements
- Provide `aria-describedby` for hint text connections
- Error messages announced with `aria-invalid="true"`

## CSS and Styling

### Use GOV.UK Classes Only

```njk
{# Correct - using GOV.UK typography classes #}
<p class="govuk-body">Paragraph text</p>
<p class="govuk-body-l">Large paragraph</p>
<h2 class="govuk-heading-m">Medium heading</h2>

{# Correct - using GOV.UK spacing #}
<div class="govuk-!-margin-bottom-6">Content</div>

{# Wrong - custom styles #}
<p style="font-size: 18px;">Text</p>
```

### Custom Styles (When Necessary)

```scss
// Use BEM naming with app- prefix
.app-custom-component { }
.app-custom-component__element { }
.app-custom-component--modifier { }

// Use GOV.UK variables
@import "govuk-frontend/govuk/all";

.app-custom {
  @include govuk-font($size: 19);
  @include govuk-responsive-margin(6, "bottom");
  color: govuk-colour("blue");
}
```

## Progressive Enhancement

- Core functionality must work without JavaScript
- Use native HTML form elements
- JS enhances but doesn't replace functionality
- No JS frameworks - vanilla JavaScript only

## Session Data

### Namespaced Storage

```typescript
interface MyModuleSession extends Session {
  myModule?: {
    formData?: FormData;
    currentStep?: string;
  };
}

// Access in controller
const sessionData = (req.session as MyModuleSession).myModule;
```

## File Organization

```
libs/my-module/src/pages/
├── form-step-one.ts       # Controller
├── form-step-one.njk      # Template
├── form-step-one.test.ts  # Tests
├── form-step-two.ts
├── form-step-two.njk
└── admin/                 # Nested route: /admin/*
    ├── dashboard.ts
    └── dashboard.njk
```

## Anti-Patterns to Avoid

### Controller Anti-Patterns

- ❌ Business logic in controllers
- ❌ Missing Welsh translations
- ❌ Hardcoded strings in templates
- ❌ Not preserving form data on errors
- ❌ Multiple form fields asking different questions per page

### Template Anti-Patterns

- ❌ Inline styles
- ❌ Custom classes instead of GOV.UK classes
- ❌ Client-side validation as primary mechanism
- ❌ JavaScript-dependent core functionality
- ❌ Using `content` block instead of `page_content`

### Accessibility Anti-Patterns

- ❌ Missing form labels
- ❌ Error summary without field links
- ❌ Skipping heading levels
- ❌ Color-only information
- ❌ Non-keyboard-accessible elements
