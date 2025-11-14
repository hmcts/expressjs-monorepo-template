# VIBE-233: Implementation Status

## Current State (2025-11-14)

### ✅ Completed Components

1. **JIRA MCP Tool: jira_add_comment**
   - Location: `/home/linus/Work/solirius/.claude/expressjs-monorepo/mcp/jira/tools/add-comment.js`
   - Status: Implemented and registered in MCP server
   - Functionality: Allows Claude Code to post comments to JIRA tickets

2. **GitHub Actions Workflow**
   - Location: `.github/workflows/jira-ticket-sync.yml`
   - Status: Implemented and running
   - Trigger: Hourly cron + manual dispatch + PR events
   - Dependencies: Node.js, Yarn, Prisma client generation
   - Workflow executes successfully (multiple test runs completed)

3. **Marketplace Configuration**
   - Plugin marketplace: `https://github.com/hmcts/.claude.git`
   - Plugin: `expressjs-monorepo`
   - Permission configuration: Properly configured for JIRA MCP tools

4. **Environment Setup**
   - MCP environment file created from `secrets.MCP_ENV`
   - Workflow permissions configured (contents, pull-requests, issues: write)

### 🚧 Current Blocker

**MCP Tools Not Accessible to Claude Code**

The workflow runs successfully, but Claude Code cannot actually invoke the JIRA MCP tools (`jira_search`, `jira_get_issue`, `jira_add_comment`). This is preventing the automation from functioning as designed.

#### Evidence:
- Latest workflow run: 19367052812 (30 turns, $0.17)
- Permission denials for bash commands attempting to workaround missing MCP tools
- No branches created by automation
- Claude attempts to use bash workarounds instead of direct MCP tool access

####Root Cause:
The MCP server from the plugin marketplace is not being properly loaded or made available to Claude Code in the GitHub Actions environment. The permission names are correct (`mcp__plugin_expressjs-monorepo_jira__*`), but the actual tool invocation fails.

#### Attempted Solutions:
1. ✅ Created `.mcp.json` with server path - **Removed** (plugins should handle this)
2. ✅ Added `enableAllProjectMcpServers: true` to settings - **In place**
3. ✅ Added environment variables to workflow step - **Removed** (MCP server loads from `.mcp.env`)
4. ✅ Verified MCP_ENV secret exists and is used
5. ❌ **Still investigating**: How to make plugin MCP servers available to Claude Code in GitHub Actions

### 📋 What's Working

1. Workflow triggers and runs successfully
2. Environment setup (Node, Yarn, Prisma)
3. Claude Code execution completes without errors
4. `/expressjs-monorepo:wf-plan` command is accessible
5. Git operations are permitted
6. File read/write operations work

### ❌ What's Not Working

1. **JIRA MCP Tool Access**: Claude cannot invoke `jira_search`, `jira_get_issue`, or `jira_add_comment`
2. **Automated Branch Creation**: No branches are created because Claude can't query JIRA
3. **Planning Generation**: Plans aren't generated because workflow can't proceed without JIRA access
4. **Comment Posting**: Cannot post summaries back to JIRA tickets

## Next Steps

### Investigation Required

1. **Verify MCP Server Loading**
   - Check if `claude-code-action` loads MCP servers from plugins
   - Verify marketplace `.mcp.json` is being processed
   - Confirm environment variable passing to MCP server subprocess

2. **Test MCP Server Locally**
   - Manually test the JIRA MCP server with the secrets
   - Verify it can connect to JIRA and perform operations
   - Confirm `.claude/.mcp.env` is being loaded correctly

3. **Alternative Approaches**
   - Consider using `claude-code-action`'s `claude_env` parameter to pass MCP server config
   - Investigate if plugins need additional configuration to expose MCP servers
   - Check if there's a way to explicitly enable plugin MCP servers

### Potential Solutions

#### Option 1: Project-Level MCP Configuration
Create `.mcp.json` in project root with absolute path to marketplace MCP server:
```json
{
  "mcpServers": {
    "jira": {
      "type": "stdio",
      "command": "node",
      "args": ["${HOME}/.local/share/Claude/marketplaces/hmcts/expressjs-monorepo/mcp/jira/server.js"],
      "env": {}
    }
  }
}
```

**Issue**: Path may not exist in GitHub Actions runner

#### Option 2: Inline MCP Server Configuration
Pass MCP server configuration directly via `settings`:
```yaml
settings: |
  {
    "mcpServers": {
      "jira": { ...config... }
    }
  }
```

**Issue**: Would duplicate configuration from marketplace

#### Option 3: Use Custom Action Step
Create a pre-step that manually starts the MCP server and exposes it:
```yaml
- name: Start JIRA MCP Server
  run: |
    node /home/linus/Work/solirius/.claude/expressjs-monorepo/mcp/jira/server.js &
    echo $! > /tmp/mcp-server.pid
```

**Issue**: Complex and fragile

## Test Plan

Once MCP tools are accessible:

1. **Smoke Test**
   - Manually trigger workflow via `workflow_dispatch`
   - Verify Claude can run `jira_search`
   - Confirm at least one ticket is found

2. **End-to-End Test**
   - Create a test ticket (VIBE-999) with status "Prioritized Backlog"
   - Run workflow
   - Verify:
     - Branch `feature/VIBE-999-*` is created
     - Planning docs are generated
     - Comment is posted to JIRA ticket

3. **Error Handling Test**
   - Test with invalid JIRA credentials
   - Test with non-existent ticket
   - Verify graceful error handling

## Timeline

- **Implementation Start**: 2025-11-14 11:00
- **Current Blockers Discovered**: 2025-11-14 14:10
- **Estimated Resolution**: TBD (pending investigation)

## Resources

- Workflow runs: https://github.com/hmcts/expressjs-monorepo-template/actions/workflows/jira-ticket-sync.yml
- Latest run: https://github.com/hmcts/expressjs-monorepo-template/actions/runs/19367052812
- MCP server code: `/home/linus/Work/solirius/.claude/expressjs-monorepo/mcp/jira/`
- Specification: `docs/tickets/VIBE-233/specification.md`
