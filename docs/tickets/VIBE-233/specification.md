# VIBE-233: Automated JIRA Ticket Planning Pipeline

## Overview

This specification outlines the implementation of an automated GitHub Actions workflow that monitors JIRA for tickets in the "prioritized backlog" status, creates feature branches for tickets without existing branches, generates technical plans using Claude Code, and posts summaries back to JIRA. The automation runs hourly to ensure timely planning for new prioritized work.

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    JIRA Ticket Planning Automation Flow                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────┐          │
│  │ 1. TRIGGER: Hourly Cron (0 * * * *)                            │          │
│  └────────────────────┬───────────────────────────────────────────┘          │
│                       ↓                                                      │
│  ┌────────────────────────────────────────────────────────────────┐          │
│  │ 2. INVOKE CLAUDE CODE (via anthropics/claude-code-action@v1)   │          │
│  │                                                                │          │
│  │    Claude orchestrates entire workflow using MCP tools:        │          │
│  │    • jira_search: Query prioritized backlog tickets            │          │
│  │    • jira_get_issue: Fetch ticket details                      │          │
│  │    • Git commands: Check/create branches                       │          │
│  │    • /expressjs-monorepo:wf-plan: Generate technical plans     │          │
│  │      (from hmcts/.claude marketplace)                          │          │
│  │    • jira_add_comment: Post summaries back to JIRA             │          │
│  │                                                                │          │
│  └────────────────────┬───────────────────────────────────────────┘          │
│                       ↓                                                      │
│  ┌────────────────────────────────────────────────────────────────┐          │
│  │ 3. CLAUDE CODE WORKFLOW (Autonomous)                           │          │
│  │                                                                │          │
│  │  For each ticket without a branch:                             │          │
│  │    a. Create feature/VIBE-[num]-[slug] branch                  │          │
│  │    b. Generate planning docs via /expressjs-monorepo:wf-plan   │          │
│  │       - docs/tickets/VIBE-[num]/specification.md               │          │
│  │       - docs/tickets/VIBE-[num]/tasks.md                       │          │
│  │    c. Commit and push changes                                  │          │
│  │    d. Extract summary from specification.md                    │          │
│  │    e. Post summary to JIRA ticket via jira_add_comment         │          │
│  │                                                                │          │
│  └────────────────────────────────────────────────────────────────┘          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                              Integration Architecture                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────┐                     │
│  │             GitHub Actions Workflow                 │                     │
│  │               (jira-ticket-sync.yml)                │                     │
│  └────────────────────────┬────────────────────────────┘                     │
│                           │                                                  │
│                           │ Invokes                                          │
│                           ↓                                                  │
│  ┌─────────────────────────────────────────────────────┐                     │
│  │       anthropics/claude-code-action@v1              │                     │
│  │                                                     │                     │
│  │  ┌───────────────────────────────────────────────┐  │                     │
│  │  │         Claude Code Agent                     │  │                     │
│  │  │                                               │  │                     │
│  │  │  Uses MCP Tools:                              │  │                     │
│  │  │  ┌─────────────────────────────────────────┐ │  │                     │
│  │  │  │  JIRA MCP Server                        │ │  │                     │
│  │  │  │  • jira_search                          │ │  │                     │
│  │  │  │  • jira_get_issue                       │ │  │                     │
│  │  │  │  • jira_add_comment (NEW)               │ │  │                     │
│  │  │  └──────────┬──────────────────────────────┘ │  │                     │
│  │  │             │                                 │  │                     │
│  │  └─────────────┼─────────────────────────────────┘  │                     │
│  └────────────────┼────────────────────────────────────┘                     │
│                   │                                                          │
│                   │ HTTPS                                                    │
│                   ↓                                                          │
│  ┌─────────────────────────────────────────────────────┐                     │
│  │          JIRA REST API                              │                     │
│  │          (tools.hmcts.net/jira)                     │                     │
│  │                                                     │                     │
│  │  • Search endpoint (JQL queries)                    │                     │
│  │  • Get issue endpoint (ticket details)              │                     │
│  │  • Add comment endpoint (post summaries)            │                     │
│  └─────────────────────────────────────────────────────┘                     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 2. GitHub Actions Workflow Structure

### 2.1 Main Workflow

**File**: `.github/workflows/jira-ticket-sync.yml`

The workflow consists of a single job that invokes Claude Code to autonomously handle all JIRA interactions, branch management, planning, and comment posting.

**Simplified Architecture**: Instead of multiple jobs with complex matrix strategies and separate Node.js scripts, Claude Code orchestrates the entire process using MCP tools for JIRA integration.

### 2.2 Workflow Configuration

#### Trigger Configuration
```yaml
on:
  schedule:
    - cron: '0 * * * *'  # Hourly
  workflow_dispatch:      # Manual trigger for testing
```

#### Permissions
```yaml
permissions:
  contents: write          # Create branches, commit files
  pull-requests: write     # Create PRs if needed
  issues: write            # GitHub issues integration
  id-token: write          # OIDC token for Azure (if needed)
```

#### Environment Variables

The workflow provides JIRA credentials to Claude Code via environment variables:
- `JIRA_URL`: JIRA instance URL (from GitHub secrets)
- `JIRA_PERSONAL_TOKEN`: Authentication token (from GitHub secrets)
- `CLAUDE_API_KEY`: Claude API key (from GitHub secrets)

These are configured in the MCP server via `.claude/.mcp.env` (loaded by claude-code-action).

### 2.3 Workflow Structure

#### Single Job: JIRA Ticket Planning

**Purpose**: Invoke Claude Code to handle the entire workflow autonomously

**Steps**:
1. **Checkout repository** with full history
2. **Setup Node.js environment** (using `.nvmrc`)
3. **Enable Corepack** for Yarn Berry
4. **Cache Yarn dependencies**
5. **Install dependencies** (`yarn install --immutable`)
6. **Generate Prisma client** (`yarn db:generate`)
7. **Invoke Claude Code** with planning prompt

**Example Workflow** (`.github/workflows/jira-ticket-sync.yml`):
```yaml
name: JIRA Ticket Planning Automation

on:
  schedule:
    - cron: '0 * * * *'  # Hourly
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  plan-tickets:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for branch operations

      - name: Read .nvmrc
        id: nvm
        run: echo "NODE_VERSION=$(cat .nvmrc)" >> $GITHUB_OUTPUT

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ steps.nvm.outputs.NODE_VERSION }}

      - name: Enable Corepack
        run: corepack enable

      - name: Get Yarn cache directory
        id: yarn-cache-dir
        run: echo "dir=$(yarn config get cacheFolder)" >> $GITHUB_OUTPUT

      - name: Cache Yarn
        uses: actions/cache@v4
        with:
          path: ${{ steps.yarn-cache-dir.outputs.dir }}
          key: ${{ runner.os }}-yarn-${{ hashFiles('**/yarn.lock') }}
          restore-keys: |
            ${{ runner.os }}-yarn-

      - name: Install dependencies
        run: yarn install --immutable

      - name: Generate Prisma client
        run: yarn db:generate

      - name: Run Claude Code for JIRA Planning
        uses: anthropics/claude-code-action@v1
        with:
          claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          marketplace_config: |
            extraKnownMarketplaces:
              team-tools:
                source:
                  source: github
                  repo: hmcts/.claude
            enabledPlugins:
              expressjs-monorepo: true
          prompt: |
            Automate JIRA ticket planning for prioritized backlog items.

            Task:
            1. Use jira_search to find all VIBE tickets with status "Prioritized Backlog"
            2. For each ticket, check if a branch feature/VIBE-[num]-[slug] exists
            3. For tickets without branches:
               a. Create the branch with appropriate slug from ticket title
               b. Run /expressjs-monorepo:wf-plan VIBE-[num] to generate technical planning
               c. Commit generated docs to the branch
               d. Push the branch to remote
               e. Extract a 2-3 sentence summary from the specification.md
               f. Use jira_add_comment to post the summary with links to:
                  - Branch URL
                  - Specification doc URL
                  - Tasks doc URL

            Important:
            - Process all tickets sequentially (not in parallel)
            - If a ticket fails, log the error and continue with next ticket
            - Include error handling for JIRA API failures
            - Format JIRA comments clearly with headings and links
          allow_tools: |
            Bash(git:*)
            Bash(yarn:*)
            Read(**)
            Write(**)
            Edit(**)
            Glob(**)
          system_prompt_append: |
            You are running in a GitHub Action for automated JIRA ticket planning.
            The environment has been set up and dependencies installed.
            You have access to JIRA via MCP tools (jira_search, jira_get_issue, jira_add_comment).
            You have access to the /expressjs-monorepo:wf-plan command from the hmcts/.claude marketplace.
            Process all tickets systematically and provide clear logging.
```

### 2.4 Key Simplifications

**Compared to Original Design**:
- ✅ No separate Node.js scripts needed (`.github/scripts/sync-jira-tickets.js`, `post-jira-comment.js`)
- ✅ No matrix strategy complexity
- ✅ No JSON output parsing between jobs
- ✅ Claude handles all JIRA interaction via MCP
- ✅ Single workflow file, single job
- ✅ Claude intelligently handles edge cases and retries

## 3. MCP Tool Implementation: jira_add_comment

### 3.1 Overview

This section specifies a new MCP tool to be added to the `hmcts/.claude` repository at `expressjs-monorepo/mcp/jira/tools/add-comment.js`. This tool enables Claude Code to post comments to JIRA tickets, completing the automation workflow.

**Location**: `expressjs-monorepo/mcp/jira/tools/add-comment.js`

**Purpose**: Post formatted comments to JIRA issues via the JIRA REST API

### 3.2 Tool Implementation

Following the pattern established by `search.js` and `get-issue.js`, the add-comment tool provides a simple interface for posting comments to JIRA tickets.

**File**: `expressjs-monorepo/mcp/jira/tools/add-comment.js`

```javascript
/**
 * Tool: jira_add_comment
 * Add a comment to a JIRA issue
 */

export async function addComment(jiraClient, args) {
  const {
    issueKey,
    body
  } = args;

  if (!issueKey) {
    throw new Error('issueKey is required');
  }

  if (!body) {
    throw new Error('comment body is required');
  }

  try {
    // Call JIRA REST API to add comment
    const result = await jiraClient.request(
      'POST',
      `/rest/api/2/issue/${issueKey}/comment`,
      {
        body
      }
    );

    return {
      success: true,
      commentId: result.id,
      issueKey,
      self: result.self,
      created: result.created,
      author: {
        displayName: result.author.displayName,
        accountId: result.author.accountId
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      issueKey
    };
  }
}
```

### 3.3 JIRA Client Extension

The existing JIRA client in `client/jira.js` already has a generic `request()` method that supports all HTTP methods. No changes needed to the client - it already supports POST requests.

**Existing Client Method** (already implemented):
```javascript
// In client/jira.js
async request(method, path, body, extraHeaders) {
  // Handles POST, GET, PUT, DELETE
  // Manages authentication with Bearer token
  // Parses JSON responses
  // Handles error status codes
}
```

### 3.4 Server Registration

The tool must be registered in the MCP server configuration.

**File**: `expressjs-monorepo/mcp/jira/server.js`

**Add import**:
```javascript
import { addComment } from './tools/add-comment.js';
```

**Add tool definition** to the tools array:
```javascript
{
  name: 'jira_add_comment',
  description: 'Add a comment to a JIRA issue',
  inputSchema: {
    type: 'object',
    properties: {
      issueKey: {
        type: 'string',
        description: 'The JIRA issue key (e.g., VIBE-209)'
      },
      body: {
        type: 'string',
        description: 'The comment text (plain text or Atlassian Document Format)'
      }
    },
    required: ['issueKey', 'body']
  }
}
```

**Add tool handler** in the request handler:
```javascript
case 'jira_add_comment':
  return await addComment(jiraClient, args);
```

### 3.5 Comment Format Recommendations

Claude Code will format comments with clear structure. Recommended format:

```
🤖 Technical Planning Complete

A technical plan has been automatically generated for this ticket.

Summary:
[2-3 sentence overview extracted from specification.md]

Documentation:
• Branch: [link]
• Technical Specification: [link]
• Implementation Tasks: [link]

Next Steps:
1. Review the technical specification
2. Refine requirements if needed
3. Assign to developer for implementation
```

### 3.6 Usage Example

Once implemented, Claude Code can use the tool like this:

```javascript
// Claude Code usage via MCP
const result = await mcp.jira_add_comment({
  issueKey: 'VIBE-209',
  body: `🤖 Technical Planning Complete

A technical plan has been automatically generated for this ticket.

Summary:
This ticket implements automated preview environment deployment for pull requests...

Documentation:
• Branch: https://github.com/hmcts/repo/tree/feature/VIBE-209
• Technical Specification: [link]
• Implementation Tasks: [link]

Next Steps:
1. Review the technical specification
2. Refine requirements if needed
3. Assign to developer for implementation`
});

if (result.success) {
  console.log(`Comment posted to ${result.issueKey}: ${result.commentId}`);
} else {
  console.error(`Failed to post comment: ${result.error}`);
}
```

### 3.7 Testing the Tool

**Manual Testing**:
1. Add the tool to `hmcts/.claude` repository
2. Update `.claude/settings.json` to enable the JIRA MCP server
3. Test with Claude Code CLI:
   ```bash
   claude-code "Use jira_add_comment to post a test comment to VIBE-999"
   ```

**Integration Testing**:
1. Create a test JIRA ticket (e.g., VIBE-999)
2. Run the GitHub Action with `workflow_dispatch`
3. Verify comment appears on JIRA ticket
4. Check comment formatting and links

### 3.8 Error Handling

The tool handles common JIRA API errors:

| Error | HTTP Status | Handling |
|-------|-------------|----------|
| Issue not found | 404 | Return `success: false` with error message |
| Authentication failure | 401 | Return error, Claude can log and continue |
| Permission denied | 403 | Return error, Claude can log and skip |
| Rate limit | 429 | Return error, Claude should implement retry |
| Invalid request | 400 | Return error with validation details |

Claude Code will handle retries and error recovery intelligently based on the error response.

## 4. Claude Code Workflow Logic

### 4.1 MCP Tool Usage

Claude Code uses three JIRA MCP tools to orchestrate the entire workflow:

1. **jira_search**: Query for tickets in prioritized backlog
2. **jira_get_issue**: Fetch detailed ticket information (if needed)
3. **jira_add_comment**: Post planning summary back to JIRA

### 4.2 Workflow Execution Flow

When invoked by the GitHub Action, Claude Code follows this autonomous workflow:

#### Step 1: Query JIRA for Tickets

```javascript
// Claude uses jira_search MCP tool
const result = await mcp.jira_search({
  jql: 'project = VIBE AND status = "Prioritized Backlog"',
  fields: ['summary', 'description', 'status', 'created'],
  maxResults: 50
});

// Result contains list of tickets
const tickets = result.issues; // Array of VIBE tickets
```

#### Step 2: Check for Existing Branches

For each ticket, Claude checks if a feature branch already exists:

```bash
# Claude runs git command to check branches
git ls-remote --heads origin | grep "feature/VIBE-${ticketNumber}"
```

#### Step 3: Process Tickets Without Branches

For each ticket that doesn't have a branch:

**a. Create Feature Branch**
```bash
# Generate slug from ticket title
slug=$(echo "${ticketTitle}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | cut -c1-50)

# Create and checkout branch
git checkout -b "feature/VIBE-${ticketNumber}-${slug}"
```

**b. Generate Technical Plan**
```bash
# Claude invokes the /expressjs-monorepo:wf-plan command from hmcts/.claude marketplace
/expressjs-monorepo:wf-plan VIBE-${ticketNumber}
```

This command:
- Fetches ticket details from JIRA
- Analyzes requirements
- Generates comprehensive documentation in `docs/tickets/VIBE-${ticketNumber}/`

**c. Commit and Push Changes**
```bash
git add docs/tickets/VIBE-${ticketNumber}/
git commit -m "Add technical planning for VIBE-${ticketNumber}

Generated via automated JIRA planning workflow"
git push -u origin "feature/VIBE-${ticketNumber}-${slug}"
```

**d. Extract Summary and Post to JIRA**
```javascript
// Read generated specification
const spec = await readFile(`docs/tickets/VIBE-${ticketNumber}/specification.md`);

// Extract Overview section (first 2-3 paragraphs after ## Overview)
const summary = extractOverview(spec);

// Format JIRA comment
const branchUrl = `https://github.com/${owner}/${repo}/tree/feature/VIBE-${ticketNumber}-${slug}`;
const specUrl = `${branchUrl}/docs/tickets/VIBE-${ticketNumber}/specification.md`;
const tasksUrl = `${branchUrl}/docs/tickets/VIBE-${ticketNumber}/tasks.md`;

const comment = `🤖 Technical Planning Complete

A technical plan has been automatically generated for this ticket.

Summary:
${summary}

Documentation:
• Branch: ${branchUrl}
• Technical Specification: ${specUrl}
• Implementation Tasks: ${tasksUrl}

Next Steps:
1. Review the technical specification
2. Refine requirements if needed
3. Assign to developer for implementation`;

// Post comment to JIRA using MCP tool
await mcp.jira_add_comment({
  issueKey: `VIBE-${ticketNumber}`,
  body: comment
});
```

### 4.3 Error Handling

Claude Code implements intelligent error handling:

**Scenario 1: JIRA Search Fails**
- Log error details
- Retry once after 5 seconds
- If still failing, exit with error message

**Scenario 2: Branch Already Exists**
- Log: "Branch feature/VIBE-${ticketNumber} already exists, skipping"
- Continue to next ticket

**Scenario 3: /expressjs-monorepo:wf-plan Command Fails**
- Log error details
- Post error comment to JIRA ticket:
  ```
  ⚠️  Automated Planning Failed

  The automated planning workflow encountered an error for this ticket.
  Please review manually.

  Error: [error message]
  ```
- Continue to next ticket

**Scenario 4: Comment Posting Fails**
- Log error
- Continue to next ticket (plan still exists in branch)

### 4.4 Expected Output

**Generated Files per Ticket**:
- `docs/tickets/VIBE-{number}/specification.md`: Detailed technical specification
- `docs/tickets/VIBE-{number}/tasks.md`: Task breakdown with implementation steps

**Documentation Structure** (follows existing pattern from VIBE-119):
1. Overview
2. Architecture diagrams
3. Technical implementation details
4. File changes required
5. Testing strategy
6. Deployment considerations

**Git Artifacts**:
- New branch: `feature/VIBE-{number}-{slug}`
- Commit with planning docs
- Pushed to remote

**JIRA Artifacts**:
- Comment on ticket with summary and links

### 4.5 Configuration Details

The workflow configuration (shown in Section 2.3) provides Claude with:

- **JIRA Credentials**: Via `.claude/.mcp.env` (loaded by claude-code-action)
- **Allowed Tools**: Git, Yarn, file operations, and MCP tools
- **Task Prompt**: Clear instructions for the entire workflow
- **System Context**: GitHub Action environment details

## 5. Dependencies

### 5.1 External Services

| Service | Purpose | Endpoint |
|---------|---------|----------|
| JIRA REST API | Issue tracking and management | `https://tools.hmcts.net/jira/rest/api/2/` |
| Claude API | AI-powered code generation | `https://api.anthropic.com` |
| GitHub Actions | CI/CD automation | Built-in |
| GitHub Repository | Source code hosting | `github.com/hmcts/expressjs-monorepo-template` |

### 5.2 Internal Dependencies

| Component | Location | Purpose |
|-----------|----------|---------|
| JIRA MCP Server | `hmcts/.claude/expressjs-monorepo/mcp/jira/` | JIRA integration via Model Context Protocol |
| `/expressjs-monorepo:wf-plan` Command | `hmcts/.claude/expressjs-monorepo/commands/wf-plan.md` | Technical planning slash command from marketplace |
| HMCTS Marketplace | `github.com/hmcts/.claude` | Claude Code marketplace repository (team-tools) |
| `.claude/.mcp.env` | Project root | MCP server configuration (for local development) |
| Claude Code Action | `anthropics/claude-code-action@v1` | GitHub Action for Claude integration |

### 5.3 New Dependencies (This Ticket)

This implementation adds the following new components:

**MCP Tool**:
- **File**: `hmcts/.claude/expressjs-monorepo/mcp/jira/tools/add-comment.js`
- **Purpose**: Enable Claude to post comments to JIRA tickets
- **Dependencies**: Uses existing `jiraClient.request()` method

**GitHub Workflow**:
- **File**: `.github/workflows/jira-ticket-sync.yml`
- **Purpose**: Hourly automation for JIRA ticket planning
- **Dependencies**:
  - Node.js (version from `.nvmrc`)
  - Yarn Berry (via Corepack)
  - Prisma (for database schema generation)
  - Git (for branch operations)

**GitHub Secrets**:
- `JIRA_URL`: JIRA instance URL
- `JIRA_PERSONAL_TOKEN`: JIRA API authentication
- `CLAUDE_API_KEY`: Claude API key (already exists)

### 5.4 No Additional npm Packages Required

Unlike the original design which required separate Node.js scripts with dependencies like `node-fetch`, the MCP-based approach requires **no new npm packages**. All JIRA interaction is handled through MCP tools.

**Original Design** (not used):
```json
{
  "devDependencies": {
    "node-fetch": "^3.3.2",  // Not needed with MCP
    "vitest": "^2.0.0"        // Not needed (no scripts to test)
  }
}
```

**Current Design**:
- No new npm packages
- MCP handles all JIRA communication
- Claude Code action handles orchestration
- Existing Git and Yarn tools sufficient

### 5.5 Infrastructure Requirements

| Resource | Requirement | Notes |
|----------|-------------|-------|
| GitHub Actions Runner | Ubuntu Latest | Standard runner sufficient |
| Node.js Version | From `.nvmrc` | Currently using Node 20.x |
| Yarn Version | Berry/Modern | Managed via Corepack |
| Git Access | Full repository access | For branch creation and pushing |
| JIRA API Access | Read tickets, write comments | Via personal access token |
| Claude API Access | Standard API access | Existing organizational account |

### 5.6 Integration Dependencies

**Existing Infrastructure** (must be in place):
1. `hmcts/.claude` marketplace repository accessible at `github.com/hmcts/.claude`
2. JIRA MCP server at `hmcts/.claude/expressjs-monorepo/mcp/jira/`
3. `/expressjs-monorepo:wf-plan` command at `hmcts/.claude/expressjs-monorepo/commands/wf-plan.md`
4. GitHub secrets configured for JIRA and Claude:
   - `JIRA_URL`: JIRA instance URL
   - `JIRA_PERSONAL_TOKEN`: JIRA API authentication token
   - `CLAUDE_API_KEY`: Claude API key

**Marketplace Configuration** (required in GitHub Action):
The `claude-code-action` must be configured with marketplace access:
```yaml
marketplace_config: |
  extraKnownMarketplaces:
    team-tools:
      source:
        source: github
        repo: hmcts/.claude
  enabledPlugins:
    expressjs-monorepo: true
```

**New Infrastructure** (this ticket adds):
1. `jira_add_comment` MCP tool in `hmcts/.claude` repo at `expressjs-monorepo/mcp/jira/tools/add-comment.js`
2. Hourly GitHub Actions workflow at `.github/workflows/jira-ticket-sync.yml`
3. Git branch naming convention enforcement

## 6. Appendix

### A. JIRA JQL Reference

**Query for Prioritized Backlog**:
```jql
project = VIBE AND status = "Prioritized Backlog" ORDER BY priority DESC, created ASC
```

**Alternative Queries**:
```jql
// Include specific components
project = VIBE AND status = "Prioritized Backlog" AND component = "Backend"

// Exclude specific labels
project = VIBE AND status = "Prioritized Backlog" AND labels NOT IN (blocked)

// Include tickets assigned to specific sprint
project = VIBE AND status = "Prioritized Backlog" AND sprint = "Sprint 23"
```

### B. Branch Naming Convention

**Pattern**: `feature/VIBE-{number}-{slug}`

**Examples**:
- `feature/VIBE-209-implement-authentication`
- `feature/VIBE-233-some-new-feature`
- `feature/VIBE-1024-fix-bug-with-database`

### C. JIRA REST API Examples

**Authentication**:
```bash
curl -u email@example.com:api_token \
  https://tools.hmcts.net/jira/rest/api/2/search
```

**Search Query**:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -u email:token \
  -d '{"jql":"project=VIBE AND status=\"Prioritized Backlog\"","maxResults":50}' \
  https://tools.hmcts.net/jira/rest/api/2/search
```

**Add Comment**:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -u email:token \
  -d '{"body":"Technical planning complete"}' \
  https://tools.hmcts.net/jira/rest/api/2/issue/VIBE-209/comment
```

### D. GitHub CLI Commands

**List Branches**:
```bash
git ls-remote --heads origin | grep 'feature/VIBE-'
```

**Create Branch**:
```bash
git checkout -b feature/VIBE-233
git push -u origin feature/VIBE-233
```

**Check Branch Exists**:
```bash
git ls-remote --exit-code --heads origin feature/VIBE-233
```
