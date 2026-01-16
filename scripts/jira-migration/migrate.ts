#!/usr/bin/env node
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { addIssueToProject, checkGitHubAuth, createGitHubIssue, findExistingIssue, updateGitHubIssue } from "./github-client.js";
import { downloadIssueAttachments, getAllIssues } from "./jira-client.js";
import { closeBrowser, ensureGitHubLogin, initBrowser, uploadAttachmentsToIssue } from "./playwright-uploader.js";
import type { GitHubIssue, JiraIssue, MigrationReport, MigrationResult } from "./types.js";

const JIRA_PROJECT = "VIBE";
const JIRA_LABEL = "CaTH";
const JIRA_BASE_URL = process.env.JIRA_BASE_URL || "https://tools.hmcts.net/jira";

interface MigrationOptions {
  dryRun: boolean;
  limit?: number;
  skipAttachments: boolean;
  project?: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    dryRun: false,
    skipAttachments: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--skip-attachments":
        options.skipAttachments = true;
        break;
      case "--limit": {
        const limit = Number.parseInt(args[++i], 10);
        if (!Number.isNaN(limit) && limit > 0) {
          options.limit = limit;
        }
        break;
      }
      case "--project": {
        const project = Number.parseInt(args[++i], 10);
        if (!Number.isNaN(project) && project > 0) {
          options.project = project;
        }
        break;
      }
      case "--help":
      // biome-ignore lint/suspicious/noFallthroughSwitchClause: Intentional fallthrough for alias
      case "-h":
        console.log(`
JIRA to GitHub Issues Migration Script

Usage: yarn migrate:jira [options]

Options:
  --dry-run              List issues without creating GitHub issues
  --skip-attachments     Create issues but skip attachment uploads
  --limit N              Migrate only the first N issues (for testing)
  --project N            Add issues to GitHub Project board N (e.g., 42)
  --help, -h             Show this help message

Credentials:
  JIRA credentials are loaded from .claude/.mcp.env (JIRA_PERSONAL_TOKEN, JIRA_URL)
  GitHub credentials use the gh CLI (run 'gh auth login' if needed)

Examples:
  yarn migrate:jira --dry-run                 # Preview migration
  yarn migrate:jira --limit 5                 # Migrate first 5 issues
  yarn migrate:jira --skip-attachments        # Migrate without attachments
  yarn migrate:jira --project 42              # Migrate and add to project board
  yarn migrate:jira                           # Full migration
        `);
        process.exit(0);
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
  }

  return options;
}

/**
 * Migrate a single JIRA issue
 */
async function migrateIssue(issue: JiraIssue, options: MigrationOptions, browserPage: any): Promise<MigrationResult> {
  const jiraUrl = `${JIRA_BASE_URL}/browse/${issue.key}`;

  console.log(`\nMigrating ${issue.key}: ${issue.fields.summary.substring(0, 60)}...`);

  const result: MigrationResult = {
    jiraKey: issue.key,
    jiraUrl,
    githubIssue: null,
    success: false,
    attachmentsUploaded: 0,
    updated: false
  };

  try {
    // Check if issue already exists (for idempotent sync)
    const existingIssue = await findExistingIssue(issue.key);

    let githubIssue: GitHubIssue;
    if (existingIssue) {
      console.log(`  Found existing issue #${existingIssue.number}, updating...`);
      githubIssue = await updateGitHubIssue(existingIssue.number, issue, options.dryRun);
      result.updated = true;

      if (!options.dryRun) {
        console.log(`  ✓ Updated: ${githubIssue.htmlUrl}`);
      }
    } else {
      console.log("  Creating new GitHub issue...");
      githubIssue = await createGitHubIssue(issue, options.dryRun);
      result.updated = false;

      if (!options.dryRun) {
        console.log(`  ✓ Created: ${githubIssue.htmlUrl}`);
      }
    }

    result.githubIssue = githubIssue;

    // Add to project board if specified
    if (options.project) {
      const jiraStatus = issue.fields.status?.name || "new";
      await addIssueToProject(githubIssue.htmlUrl, jiraStatus, options.project, options.dryRun);
    }

    // Handle attachments
    if (!options.skipAttachments && !options.dryRun && issue.fields.attachment && issue.fields.attachment.length > 0) {
      console.log(`  Downloading ${issue.fields.attachment.length} attachment(s)...`);

      // Download attachments to temp directory
      const tempDir = path.join(os.tmpdir(), `jira-migration-${issue.key}`);
      await fs.promises.mkdir(tempDir, { recursive: true });

      const downloadedFiles = await downloadIssueAttachments(issue, tempDir);

      if (downloadedFiles.length > 0 && browserPage) {
        // Upload to GitHub
        await uploadAttachmentsToIssue(browserPage, githubIssue.htmlUrl, downloadedFiles);
        result.attachmentsUploaded = downloadedFiles.length;
      }

      // Clean up temp directory
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }

    result.success = true;
  } catch (error) {
    console.error(`  ✗ Failed to migrate ${issue.key}:`, error);
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * Save migration report
 */
async function saveMigrationReport(report: MigrationReport): Promise<void> {
  const reportPath = path.join(process.cwd(), "scripts", "jira-migration", "migration-report.json");

  await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n✓ Migration report saved to: ${reportPath}`);
}

/**
 * Main migration function
 */
async function main() {
  const options = parseArgs();

  console.log("=".repeat(60));
  console.log("JIRA to GitHub Issues Migration");
  console.log("=".repeat(60));
  console.log(`JIRA Project: ${JIRA_PROJECT}`);
  console.log(`JIRA Label: ${JIRA_LABEL}`);
  console.log(`JIRA Base URL: ${JIRA_BASE_URL}`);
  console.log(`Dry Run: ${options.dryRun ? "Yes" : "No"}`);
  console.log(`Skip Attachments: ${options.skipAttachments ? "Yes" : "No"}`);
  if (options.limit) {
    console.log(`Limit: ${options.limit} issues`);
  }
  if (options.project) {
    console.log(`Project Board: ${options.project}`);
  }
  console.log("=".repeat(60));

  // Check GitHub authentication
  if (!options.dryRun) {
    console.log("\nChecking GitHub CLI authentication...");
    const isGitHubAuth = await checkGitHubAuth();
    if (!isGitHubAuth) {
      console.error("Error: GitHub CLI is not authenticated. Run 'gh auth login' first.");
      process.exit(1);
    }
    console.log("✓ GitHub CLI is authenticated");
  }

  // Fetch JIRA issues
  console.log(`\nFetching JIRA issues from project "${JIRA_PROJECT}" with label "${JIRA_LABEL}"...`);
  const jql = `project = "${JIRA_PROJECT}" AND labels = "${JIRA_LABEL}"`;
  const allIssues = await getAllIssues(jql);

  let issuesToMigrate = allIssues;
  if (options.limit && options.limit < allIssues.length) {
    issuesToMigrate = allIssues.slice(0, options.limit);
    console.log(`Limiting to first ${options.limit} issues`);
  }

  console.log(`Found ${allIssues.length} issues, will migrate ${issuesToMigrate.length}`);

  if (issuesToMigrate.length === 0) {
    console.log("No issues to migrate.");
    return;
  }

  // Initialize browser for attachments
  let browserPage = null;
  if (!options.skipAttachments && !options.dryRun) {
    browserPage = await initBrowser();
    await ensureGitHubLogin(browserPage);
  }

  // Migrate issues
  const report: MigrationReport = {
    startedAt: new Date().toISOString(),
    completedAt: "",
    totalIssues: issuesToMigrate.length,
    successfulMigrations: 0,
    failedMigrations: 0,
    createdCount: 0,
    updatedCount: 0,
    results: []
  };

  for (const issue of issuesToMigrate) {
    const result = await migrateIssue(issue, options, browserPage);
    report.results.push(result);

    if (result.success) {
      report.successfulMigrations++;
      if (result.updated) {
        report.updatedCount++;
      } else {
        report.createdCount++;
      }
    } else {
      report.failedMigrations++;
    }

    // Add a small delay between issues to avoid rate limiting
    if (!options.dryRun) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  report.completedAt = new Date().toISOString();

  // Close browser
  if (browserPage) {
    await closeBrowser();
  }

  // Print summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("Migration Summary");
  console.log("=".repeat(60));
  console.log(`Total Issues: ${report.totalIssues}`);
  console.log(`Created: ${report.createdCount}`);
  console.log(`Updated: ${report.updatedCount}`);
  console.log(`Failed: ${report.failedMigrations}`);
  console.log(`Attachments Uploaded: ${report.results.reduce((sum, r) => sum + r.attachmentsUploaded, 0)}`);
  console.log("=".repeat(60));

  // Save report
  if (!options.dryRun) {
    await saveMigrationReport(report);
  }

  // Exit with error code if any migrations failed
  if (report.failedMigrations > 0) {
    process.exit(1);
  }
}

// Run migration
main().catch((error) => {
  console.error("Fatal error:", error);
  closeBrowser().finally(() => process.exit(1));
});
