#!/usr/bin/env node
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  addIssueToProject,
  checkGitHubAuth,
  createGitHubIssue,
  findExistingIssue,
  linkSubIssue,
  migrateCommentsToIssue,
  setGitHubRepo,
  setIssueEstimate,
  setupProjectBoard,
  updateGitHubIssue
} from "./github-client.js";
import { downloadIssueAttachments, getAllIssues, getIssueComments } from "./jira-client.js";
import { closeBrowser, ensureGitHubLogin, initBrowser, uploadAttachmentsToIssue } from "./playwright-uploader.js";
import type { GitHubIssue, JiraIssue, MigrationReport, MigrationResult } from "./types.js";

const JIRA_PROJECT = "VIBE";
const JIRA_LABEL = "CaTH";
const JIRA_BASE_URL = process.env.JIRA_BASE_URL || "https://tools.hmcts.net/jira";

interface MigrationOptions {
  dryRun: boolean;
  limit?: number;
  skipAttachments: boolean;
  skipComments: boolean;
  project?: number;
  repo: string;
}

/**
 * Parse command line arguments
 */
function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    dryRun: false,
    skipAttachments: false,
    skipComments: false,
    repo: ""
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
      case "--skip-comments":
        options.skipComments = true;
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
      case "--repo":
        options.repo = args[++i];
        break;
      case "--help":
      // biome-ignore lint/suspicious/noFallthroughSwitchClause: Intentional fallthrough for alias
      case "-h":
        console.log(`
JIRA to GitHub Issues Migration Script

Usage: yarn migrate:jira --repo <owner/repo> [options]

Options:
  --repo <owner/repo>    Target GitHub repository (required, e.g., hmcts/cath-service)
  --dry-run              List issues without creating GitHub issues
  --skip-attachments     Create issues but skip attachment uploads
  --skip-comments        Create issues but skip comment migration
  --limit N              Migrate only the first N issues (for testing)
  --project N            Add issues to GitHub Project board N (e.g., 42)
  --help, -h             Show this help message

Credentials:
  JIRA credentials are loaded from .claude/.mcp.env (JIRA_PERSONAL_TOKEN, JIRA_URL)
  GitHub credentials use the gh CLI (run 'gh auth login' if needed)

Examples:
  yarn migrate:jira --repo hmcts/cath-service --dry-run
  yarn migrate:jira --repo hmcts/cath-service --limit 5
  yarn migrate:jira --repo hmcts/cath-service --project 42
  yarn migrate:jira --repo hmcts/cath-service --skip-attachments --skip-comments
        `);
        process.exit(0);
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
  }

  // Validate required options
  if (!options.repo) {
    console.error("Error: --repo is required. Example: --repo hmcts/cath-service");
    process.exit(1);
  }

  return options;
}

interface MigrateIssueContext {
  options: MigrationOptions;
  browserPage: unknown;
  epicMapping: Map<string, number>; // JIRA key → GitHub issue number
}

const PARALLEL_BATCH_SIZE = 10;

/**
 * Process an array in parallel batches
 */
async function processInBatches<T, R>(items: T[], batchSize: number, processor: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
}

/**
 * Check if an issue is an Epic
 */
function isEpicIssue(issue: JiraIssue): boolean {
  return issue.fields.issuetype?.name?.toLowerCase() === "epic";
}

/**
 * Migrate a single JIRA issue
 */
async function migrateIssue(issue: JiraIssue, context: MigrateIssueContext): Promise<MigrationResult> {
  const { options, browserPage, epicMapping } = context;
  const jiraUrl = `${JIRA_BASE_URL}/browse/${issue.key}`;
  const isEpic = isEpicIssue(issue);
  const epicLinkKey = issue.fields.customfield_10008;
  const storyPoints = issue.fields.customfield_10004;

  const typeLabel = isEpic ? "Epic" : issue.fields.issuetype?.name || "Issue";
  console.log(`\nMigrating ${issue.key} (${typeLabel}): ${issue.fields.summary.substring(0, 50)}...`);

  const result: MigrationResult = {
    jiraKey: issue.key,
    jiraUrl,
    githubIssue: null,
    success: false,
    attachmentsUploaded: 0,
    commentsAdded: 0,
    updated: false,
    isEpic,
    linkedToEpic: undefined,
    estimateSet: undefined
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

    // Store epic mapping for later child linking
    if (isEpic) {
      epicMapping.set(issue.key, githubIssue.number);
    }

    // Add to project board if specified
    if (options.project) {
      const jiraStatus = issue.fields.status?.name || "new";

      // Add to project and set status column (returns item ID)
      const projectItemId = await addIssueToProject(githubIssue.htmlUrl, jiraStatus, options.project, options.dryRun);

      // Set Estimate field if story points exist (and not an epic)
      if (projectItemId && !isEpic && storyPoints) {
        const estimate = await setIssueEstimate(projectItemId, storyPoints, options.dryRun);
        result.estimateSet = estimate || undefined;
      }
    }

    // Link to parent epic if this is a child issue
    if (!isEpic && epicLinkKey && epicMapping.has(epicLinkKey)) {
      const parentGitHubNumber = epicMapping.get(epicLinkKey);
      // Check for undefined/null explicitly since 0 is valid in dry-run mode
      if (parentGitHubNumber !== undefined && parentGitHubNumber !== null) {
        const linked = await linkSubIssue(parentGitHubNumber, githubIssue.number, options.dryRun);
        if (linked) {
          result.linkedToEpic = epicLinkKey;
        }
      }
    } else if (!isEpic && epicLinkKey && !epicMapping.has(epicLinkKey)) {
      console.log(`  ⚠ Epic ${epicLinkKey} not found in mapping (may not be in migration scope)`);
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
        await uploadAttachmentsToIssue(browserPage as any, githubIssue.htmlUrl, downloadedFiles);
        result.attachmentsUploaded = downloadedFiles.length;
      }

      // Clean up temp directory
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }

    // Handle comments
    if (!options.skipComments) {
      const comments = await getIssueComments(issue.key);
      if (comments.length > 0) {
        console.log(`  Migrating ${comments.length} comment(s)...`);
        const commentsAdded = await migrateCommentsToIssue(githubIssue.number, comments, options.dryRun);
        result.commentsAdded = commentsAdded;
      }
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

  // Set the target GitHub repository
  setGitHubRepo(options.repo);

  console.log("=".repeat(60));
  console.log("JIRA to GitHub Issues Migration");
  console.log("=".repeat(60));
  console.log(`GitHub Repo: ${options.repo}`);
  console.log(`JIRA Project: ${JIRA_PROJECT}`);
  console.log(`JIRA Label: ${JIRA_LABEL}`);
  console.log(`JIRA Base URL: ${JIRA_BASE_URL}`);
  console.log(`Dry Run: ${options.dryRun ? "Yes" : "No"}`);
  console.log(`Skip Attachments: ${options.skipAttachments ? "Yes" : "No"}`);
  console.log(`Skip Comments: ${options.skipComments ? "Yes" : "No"}`);
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

  // Set up project board status columns if project is specified
  if (options.project) {
    const setupSuccess = await setupProjectBoard(options.project, options.dryRun);
    if (!setupSuccess && !options.dryRun) {
      console.error("Error: Failed to set up project board. Aborting migration.");
      process.exit(1);
    }
  }

  // Fetch JIRA issues
  // Order by issuetype ASC to get Epics first (alphabetically: Epic < Story < Task), then by key ASC
  console.log(`\nFetching JIRA issues from project "${JIRA_PROJECT}" with label "${JIRA_LABEL}"...`);
  const jql = `project = "${JIRA_PROJECT}" AND labels = "${JIRA_LABEL}" ORDER BY issuetype ASC, key ASC`;
  const allIssues = await getAllIssues(jql);

  let issuesToMigrate = allIssues;
  if (options.limit && options.limit < allIssues.length) {
    issuesToMigrate = allIssues.slice(0, options.limit);
    console.log(`Limiting to first ${options.limit} issues`);
  }

  // Separate Epics from other issues
  const epics = issuesToMigrate.filter((issue) => isEpicIssue(issue));
  const nonEpics = issuesToMigrate.filter((issue) => !isEpicIssue(issue));

  console.log(`Found ${allIssues.length} issues, will migrate ${issuesToMigrate.length}`);
  console.log(`  - Epics: ${epics.length}`);
  console.log(`  - Stories/Tasks/Bugs: ${nonEpics.length}`);

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

  // Epic mapping: JIRA key → GitHub issue number
  const epicMapping = new Map<string, number>();

  // Migration context
  const context: MigrateIssueContext = {
    options,
    browserPage,
    epicMapping
  };

  // Migrate issues
  const report: MigrationReport = {
    startedAt: new Date().toISOString(),
    completedAt: "",
    totalIssues: issuesToMigrate.length,
    successfulMigrations: 0,
    failedMigrations: 0,
    createdCount: 0,
    updatedCount: 0,
    epicsCreated: 0,
    childrenLinked: 0,
    orphansCreated: 0,
    totalCommentsAdded: 0,
    results: []
  };

  // PASS 1: Create Epics first (so we have their GitHub issue numbers for linking)
  // Epics are processed in batches but we need to update the mapping after each batch
  if (epics.length > 0) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Pass 1: Creating Epics (${PARALLEL_BATCH_SIZE} in parallel)...`);
    console.log("=".repeat(60));

    const epicResults = await processInBatches(epics, PARALLEL_BATCH_SIZE, async (issue) => {
      return migrateIssue(issue, context);
    });

    for (const result of epicResults) {
      report.results.push(result);

      if (result.success) {
        report.successfulMigrations++;
        report.epicsCreated++;
        if (result.updated) {
          report.updatedCount++;
        } else {
          report.createdCount++;
        }
      } else {
        report.failedMigrations++;
      }
    }
  }

  // PASS 2: Create child issues (Stories, Tasks, Bugs) and link to parent Epics
  if (nonEpics.length > 0) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Pass 2: Creating Child Issues (${PARALLEL_BATCH_SIZE} in parallel)...`);
    console.log("=".repeat(60));

    const childResults = await processInBatches(nonEpics, PARALLEL_BATCH_SIZE, async (issue) => {
      return migrateIssue(issue, context);
    });

    for (const result of childResults) {
      report.results.push(result);

      if (result.success) {
        report.successfulMigrations++;
        if (result.linkedToEpic) {
          report.childrenLinked++;
        } else {
          report.orphansCreated++;
        }
        if (result.updated) {
          report.updatedCount++;
        } else {
          report.createdCount++;
        }
      } else {
        report.failedMigrations++;
      }
    }
  }

  report.completedAt = new Date().toISOString();

  // Close browser
  if (browserPage) {
    await closeBrowser();
  }

  // Calculate totals for summary
  report.totalCommentsAdded = report.results.reduce((sum, r) => sum + r.commentsAdded, 0);

  // Print summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("Migration Summary");
  console.log("=".repeat(60));
  console.log(`Total Issues: ${report.totalIssues}`);
  console.log(`  Epics Created: ${report.epicsCreated}`);
  console.log(`  Children Linked: ${report.childrenLinked}`);
  console.log(`  Orphans (no Epic): ${report.orphansCreated}`);
  console.log(`Created: ${report.createdCount}`);
  console.log(`Updated: ${report.updatedCount}`);
  console.log(`Failed: ${report.failedMigrations}`);
  console.log(`Attachments Uploaded: ${report.results.reduce((sum, r) => sum + r.attachmentsUploaded, 0)}`);
  console.log(`Comments Added: ${report.totalCommentsAdded}`);
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
