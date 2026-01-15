---
description: Fetch GitHub issue and start working on it
argument-hint: <issue-number>
allowed-tools:
  - Bash
  - Read
  - Write
  - TodoWrite
---

# Quick Start: $ARGUMENT

## Initialize Progress Tracking
Use TodoWrite to create this checklist:
```
- [ ] Create docs folder structure
- [ ] Fetch GitHub issue details and parse attachments (parallel)
```

## PHASE 1: Setup Documentation Folder
*Mark "Create docs folder structure" as in_progress*

### Step 1.1: Create Folder Structure
```
EXECUTE:
1. Create directory: docs/tickets/$ARGUMENT

```
*Mark "Create docs folder structure" as completed*

## PHASE 2: Fetch GitHub Issue Data
*Mark "Fetch GitHub issue details and parse attachments (parallel)" as in_progress*

### Step 2.1: Fetch Issue Details and Parse Attachments

```
EXECUTE:

TASK 1: Fetch GitHub Issue Details
- Use gh CLI to fetch issue: gh issue view $ARGUMENT --json number,title,body,state,assignees,author,labels,createdAt,updatedAt
- Extract fields using jq or parse JSON directly
- Write to docs/tickets/$ARGUMENT/ticket.md with format:

---
# #$ARGUMENT: [Title]

**State:** [State]
**Assignees:** [Assignees as comma-separated list]
**Author:** [Author]
**Labels:** [Labels as comma-separated list]
**Created:** [Created Date]
**Updated:** [Updated Date]

## Description

[Body content - markdown formatted]
---

TASK 2: Parse and Download Attachments from Issue Body
- Get issue body: gh issue view $ARGUMENT --json body -q .body
- Parse markdown for:
  - Images: ![alt](url) pattern
  - File links: [filename.ext](url) pattern
- Download any attachments found using curl to docs/tickets/$ARGUMENT/attachments/
- Create attachments directory if files found

Example bash:
```bash
# Create attachments directory if needed
mkdir -p docs/tickets/$ARGUMENT/attachments

# Get issue body
BODY=$(gh issue view $ARGUMENT --json body -q .body)

# Extract and download image URLs: ![alt](url)
echo "$BODY" | grep -oP '!\[.*?\]\(\K[^)]+' | while read url; do
  filename=$(basename "$url" | cut -d'?' -f1)
  curl -sL "$url" -o "docs/tickets/$ARGUMENT/attachments/$filename"
done

# Extract and download file links: [filename.ext](url) for common file types
echo "$BODY" | grep -oP '\[([^]]+\.(pdf|docx?|xlsx?|pptx?|txt|md|zip|tar|gz))\]\(\K[^)]+' | while read url; do
  filename=$(basename "$url" | cut -d'?' -f1)
  curl -sL "$url" -o "docs/tickets/$ARGUMENT/attachments/$filename"
done
```

WAIT FOR BOTH TASKS TO COMPLETE
```
*Mark "Fetch GitHub issue details and parse attachments (parallel)" as completed*

## Output to User

Display the following message:

```
GitHub issue #$ARGUMENT has been retrieved and saved to: docs/tickets/$ARGUMENT/

## Issue Summary

[Display the issue summary including:
- Title
- State
- Description (first 3-4 lines or key points)
- Number of attachments downloaded (if any)]

---

Would you like to create a technical specification for this issue?

Run: /qk-plan $ARGUMENT
```
