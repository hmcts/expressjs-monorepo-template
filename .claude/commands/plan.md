---
description: Create a UI/UX specification for a JIRA ticket
argument-hint: <ticket-id>
allowed-tools: 
  - Task
  - TodoWrite
  - Bash
  - mcp__jira__*
  - Write
  - MultiEdit
---

# Start Task: $ARGUMENT

## Initialize TodoWrite Progress Tracking
Use TodoWrite to create this checklist:
```
- [ ] Retrieve JIRA ticket $ARGUMENT
- [ ] Create documentation folder
- [ ] Create UI/UX specification
```

## PHASE 1: Setup
*Mark "Retrieve JIRA ticket" as in_progress*

### Step 1.1: JIRA Retrieval
```
ACTION: Use mcp__jira__jira_get_issue
INPUT: issue_key=$ARGUMENT
VERIFY: Ticket summary and acceptance criteria understood
```
*Mark "Retrieve JIRA ticket" as completed*

## PHASE 2: Specification Development
*Mark "Create UI/UX specification" as in_progress*

### Step 2.1: UI/UX Specification [ISOLATED AGENT]
```
AGENT: ui-ux-engineer
TASK: Create user-focused specification
OUTPUT: docs/tickets/$ARGUMENT/specification.md

PROMPT FOR AGENT:
"Based on ticket $ARGUMENT requirements:
1. Design the user journey with clear flow diagram, illustrated with ascii art
2. Create wireframes for every page using ascii art
3. Define form structures, including inputs, input types and validation rules
4. Write content in English and Welsh
5. If there are any ambiguities, ask the user for clarification
IMPORTANT: Focus ONLY on user experience, NOT implementation. Only focus on issues related to this ticket, do not try to solve cross-cutting concerns."

VERIFY: File created WITHOUT technical implementation details
```
*Mark "Create UI/UX specification" as completed*

## Success Output
"Task $ARGUMENT setup complete. Documentation created at docs/tickets/$ARGUMENT/"