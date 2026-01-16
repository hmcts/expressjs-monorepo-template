# JIRA to GitHub Issues Migration Script

Automated migration of JIRA issues (with the "CaTH" label) to GitHub Issues in `hmcts/expressjs-monorepo-template`.

## Features

- ✅ Fetches all issues with "CaTH" label from JIRA
- ✅ Creates GitHub issues with proper formatting
- ✅ Converts JIRA wiki markup to GitHub markdown
- ✅ Preserves JIRA metadata (status, priority, assignee, dates)
- ✅ Downloads and uploads attachments using Playwright browser automation
- ✅ Adds labels for status and priority
- ✅ Generates migration report with mappings

## Prerequisites

### 1. GitHub CLI Authentication

```bash
gh auth login
```

Make sure you have write access to the `hmcts/expressjs-monorepo-template` repository.

### 2. JIRA Authentication

JIRA credentials are automatically loaded from `.claude/.mcp.env`. The file should contain:

```bash
JIRA_PERSONAL_TOKEN=your-jira-token
JIRA_URL=https://tools.hmcts.net/jira
```

To get a JIRA token:
1. Go to https://tools.hmcts.net/jira/secure/ViewProfile.jspa
2. Click "Personal Access Tokens"
3. Create a new token with appropriate permissions

### 3. Install Playwright Browsers

```bash
cd e2e-tests
yarn playwright:install
cd ../..
```

## Usage

### Dry Run (Preview)

Preview what will be migrated without creating issues:

```bash
yarn migrate:jira --dry-run
```

### Test Migration (First 5 Issues)

Test with a small batch first:

```bash
yarn migrate:jira --limit 5
```

### Full Migration

Migrate all 108 issues:

```bash
yarn migrate:jira
```

### Migration Without Attachments

Create issues but skip attachment uploads:

```bash
yarn migrate:jira --skip-attachments
```

## Command Line Options

| Option | Description |
|--------|-------------|
| `--dry-run` | List issues without creating GitHub issues |
| `--skip-attachments` | Create issues but skip attachment uploads |
| `--limit N` | Migrate only the first N issues (for testing) |
| `--help`, `-h` | Show help message |

## Migration Process

### Phase 1: Initial Setup

1. Script validates JIRA and GitHub authentication
2. Fetches all issues with "CaTH" label from JIRA
3. Launches Firefox with your existing profile (preserves GitHub login session)
4. If already logged in, continues automatically
5. If not logged in, prompts you to log in and press Enter

### Phase 2: Issue Migration

For each JIRA issue:

1. **Create GitHub Issue**
   - Title: `[JIRA-KEY] Summary`
   - Body: Converted markdown description + metadata
   - Labels: `migrated-from-jira`, `status:*`, `priority:*`

2. **Upload Attachments** (if present)
   - Downloads attachments from JIRA to temp directory
   - Opens GitHub issue in browser
   - Uploads files via Playwright automation
   - Adds comment with all attachments
   - Cleans up temp files

3. **Log Progress**
   - Console output shows progress
   - Mapping stored: JIRA key → GitHub issue URL

### Phase 3: Completion

1. Browser closes automatically
2. Migration report saved to `scripts/jira-migration/migration-report.json`
3. Summary printed to console

## Migration Report

After migration, a JSON report is generated with:

```json
{
  "startedAt": "2026-01-15T10:00:00.000Z",
  "completedAt": "2026-01-15T10:30:00.000Z",
  "totalIssues": 108,
  "successfulMigrations": 106,
  "failedMigrations": 2,
  "results": [
    {
      "jiraKey": "VIBE-340",
      "jiraUrl": "https://tools.hmcts.net/jira/browse/VIBE-340",
      "githubIssue": {
        "number": 123,
        "url": "https://github.com/hmcts/expressjs-monorepo-template/issues/123",
        "htmlUrl": "https://github.com/hmcts/expressjs-monorepo-template/issues/123"
      },
      "success": true,
      "attachmentsUploaded": 2
    }
  ]
}
```

## GitHub Issue Format

Each migrated issue includes:

### Title
```
[VIBE-340] Email Notification
```

### Body
```markdown
> **Migrated from [VIBE-340](https://tools.hmcts.net/jira/browse/VIBE-340)**

{Converted JIRA description in GitHub markdown}

---

## Original JIRA Metadata

- **Status**: In Progress
- **Priority**: 3-Medium
- **Issue Type**: Story
- **Assignee**: John Doe
- **Created**: 1/12/2026
- **Updated**: 1/15/2026
- **Original Labels**: CaTH, backend

_Attachments will be added in a comment below._
```

### Labels
- `migrated-from-jira`
- `status:in-progress`
- `priority:3-medium`

### Attachments
Uploaded as a comment on the issue with the text "Attachments from JIRA:"

## Troubleshooting

### "JIRA authentication not configured"
Set `JIRA_TOKEN` or `JIRA_USERNAME`/`JIRA_PASSWORD` environment variables.

### "GitHub CLI is not authenticated"
Run `gh auth login` and ensure you have write access to the repository.

### "Failed to upload attachment"
- Check browser is still logged in to GitHub
- Check internet connection
- Check file size (GitHub has a 25MB limit)
- Try running with `--skip-attachments` and manually upload later

### Browser closes unexpectedly
The script maintains browser state. If it closes, re-run the script and it will resume where it left off (GitHub issues are already created, so it won't duplicate).

### Rate limiting
The script adds a 1-second delay between issues to avoid rate limiting. If you hit rate limits:
- Wait a few minutes
- Use `--limit` to migrate in smaller batches
- Check your GitHub API rate limit: `gh api rate_limit`

## JIRA Wiki Markup to Markdown Conversion

The script automatically converts JIRA wiki markup:

| JIRA | GitHub |
|------|--------|
| `*bold*` | `**bold**` |
| `_italic_` | `*italic*` |
| `-strikethrough-` | `~~strikethrough~~` |
| `{{code}}` | `` `code` `` |
| `{code:java}...{code}` | ` ```java...``` ` |
| `h1. Heading` | `# Heading` |
| `[text\|url]` | `[text](url)` |
| `* bullet` | `- bullet` |

## Files

```
scripts/jira-migration/
├── migrate.ts              # Main migration script
├── jira-client.ts          # JIRA REST API client
├── github-client.ts        # GitHub issue creation (gh CLI)
├── playwright-uploader.ts  # Browser automation for attachments
├── markdown-converter.ts   # JIRA wiki markup → GitHub markdown
├── types.ts                # TypeScript types
├── tsconfig.json           # TypeScript configuration
├── README.md               # This file
└── migration-report.json   # Generated after migration
```

## Known Limitations

1. **User mentions**: JIRA `[~username]` converts to `@username` but won't resolve to GitHub users
2. **JIRA-specific formatting**: Some JIRA macros (e.g., `{panel}`, `{color}`) are simplified
3. **Images in descriptions**: JIRA image syntax `!image.png!` creates broken links (images in attachments work fine)
4. **Assignees**: JIRA assignees are listed in metadata but not assigned in GitHub (would require user mapping)

## Support

For issues or questions:
- Check the troubleshooting section above
- Review the migration report JSON for error details
- Open an issue in this repository
