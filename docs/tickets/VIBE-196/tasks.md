# VIBE-196: Implementation Tasks

## Service Layer

- [ ] Extend subscription-service.ts with unsubscribe functionality
  - [ ] getUserSubscriptions() function
  - [ ] getSubscriptionById() function
  - [ ] removeSubscription() function
  - [ ] canUserRemoveSubscription() authorization check
- [ ] Extend subscription-validation.ts
  - [ ] validateSubscriptionOwnership() function
- [ ] Write unit tests for service functions

## UI Pages

- [ ] Extend subscriptions-list page to include Unsubscribe links
  - [ ] Update controller to pass subscription data
  - [ ] Update template to display Unsubscribe link in Actions column
- [ ] Create unsubscribe-confirm page
  - [ ] Implement GET handler to display confirmation
  - [ ] Implement POST handler to process Yes/No selection
  - [ ] Add validation for radio selection
  - [ ] Add authorization check
- [ ] Create unsubscribe-confirm.njk template
  - [ ] Use govukRadios for Yes/No options
  - [ ] Use govukButton for Continue
  - [ ] Use govukErrorSummary for validation errors
- [ ] Create unsubscribe-success page
  - [ ] Implement GET handler
  - [ ] Pass navigation links to template
- [ ] Create unsubscribe-success.njk template
  - [ ] Use govukPanel for success message
  - [ ] Display helpful next step links

## i18n

- [ ] Extend locales/en.ts with unsubscribe content
  - [ ] Page titles and headings
  - [ ] Form labels and buttons
  - [ ] Error messages
  - [ ] Success messages
  - [ ] Table headers and links
- [ ] Extend locales/cy.ts with Welsh translations

## Testing

- [ ] Write unit tests for unsubscribe service functions
- [ ] Write E2E tests for unsubscribe workflow
  - [ ] Test viewing subscriptions list
  - [ ] Test clicking Unsubscribe link
  - [ ] Test selecting "No" returns to list
  - [ ] Test selecting "Yes" removes subscription
  - [ ] Test success page displays
  - [ ] Test authorization (cannot remove other user's subscription)
- [ ] Perform accessibility testing with Playwright axe
- [ ] Test Welsh language version
- [ ] Cross-browser testing

## Integration

- [ ] Verify subscription removal prevents future email notifications
- [ ] Test with notification system (VIBE-221)
- [ ] Verify database updates correctly

## Deployment

- [ ] Test in preview environment
- [ ] Deploy to production
- [ ] Monitor unsubscribe actions
- [ ] Verify authorization checks working
