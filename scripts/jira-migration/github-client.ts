import { exec } from "node:child_process";
import { promisify } from "node:util";
import { convertJiraToMarkdown } from "./markdown-converter.js";
import type { GitHubIssue, JiraIssue } from "./types.js";

const execAsync = promisify(exec);

const JIRA_BASE_URL = process.env.JIRA_BASE_URL || "https://tools.hmcts.net/jira";

// GitHub Project configuration
const PROJECT_ID = "PVT_kwDOAVwpV84BMvy3";
const STATUS_FIELD_ID = "PVTSSF_lADOAVwpV84BMvy3zg78TBM";

// JIRA status to GitHub Project column mapping
const STATUS_TO_COLUMN: Record<string, string> = {
  new: "f75ad846", // Backlog
  "prioritised-backlog": "f75ad846", // Backlog
  "ready-for-progress": "61e4505c", // Ready
  "in-progress": "47fc9ee4", // In progress
  "code-review": "df73e18b", // In review
  "ready-for-test": "df73e18b", // In review
  "ready-for-sign-off": "df73e18b", // In review
  closed: "98236657", // Done
  withdrawn: "98236657" // Done
};

/**
 * Normalize text to be a valid GitHub label
 */
function normalizeLabel(text: string | undefined | null): string {
  if (!text || typeof text !== "string") {
    return "unknown";
  }
  return text.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Extract priority name from JIRA priority field (can be string or object)
 */
function getPriorityName(priority: unknown): string | null {
  if (!priority) return null;
  if (typeof priority === "string") return priority;
  if (typeof priority === "object" && "name" in priority) {
    return (priority as { name: string }).name;
  }
  return null;
}

/**
 * Create issue body from JIRA issue
 */
function createIssueBody(issue: JiraIssue): string {
  const jiraUrl = `${JIRA_BASE_URL}/browse/${issue.key}`;
  const convertedDescription = convertJiraToMarkdown(issue.fields.description || "");

  const status = issue.fields.status?.name || "Unknown";
  const priority = getPriorityName(issue.fields.priority) || "Unknown";
  const issueType = issue.fields.issueType?.name || "Unknown";
  const assignee = issue.fields.assignee?.displayName || "Unassigned";
  const created = issue.fields.created ? new Date(issue.fields.created).toLocaleDateString() : "Unknown";
  const updated = issue.fields.updated ? new Date(issue.fields.updated).toLocaleDateString() : "Unknown";
  const labels = issue.fields.labels?.join(", ") || "None";

  const body = `> **Migrated from [${issue.key}](${jiraUrl})**

${convertedDescription}

---

## Original JIRA Metadata

- **Status**: ${status}
- **Priority**: ${priority}
- **Issue Type**: ${issueType}
- **Assignee**: ${assignee}
- **Created**: ${created}
- **Updated**: ${updated}
- **Original Labels**: ${labels}

${issue.fields.attachment && issue.fields.attachment.length > 0 ? "\n_Attachments will be added in a comment below._" : ""}
`;

  return body;
}

/**
 * Create a GitHub issue from a JIRA issue
 */
export async function createGitHubIssue(issue: JiraIssue, dryRun = false): Promise<GitHubIssue> {
  const title = `[${issue.key}] ${issue.fields.summary}`;
  const body = createIssueBody(issue);

  // Create labels
  const labels: string[] = [
    "migrated-from-jira",
    `jira:${issue.key}` // Unique identifier for syncing
  ];

  // Add status label
  if (issue.fields.status?.name) {
    labels.push(`status:${normalizeLabel(issue.fields.status.name)}`);
  }

  // Add priority label
  const priorityName = getPriorityName(issue.fields.priority);
  if (priorityName) {
    labels.push(`priority:${normalizeLabel(priorityName)}`);
  }

  if (dryRun) {
    console.log("  [DRY RUN] Would create issue:");
    console.log(`    Title: ${title}`);
    console.log(`    Labels: ${labels.join(", ")}`);
    console.log(`    Body length: ${body.length} chars`);
    return {
      number: 0,
      url: "https://github.com/hmcts/expressjs-monorepo-template/issues/0",
      htmlUrl: "https://github.com/hmcts/expressjs-monorepo-template/issues/0"
    };
  }

  // Create issue using gh CLI
  const labelArgs = labels.map((label) => `--label "${label}"`).join(" ");

  // Write body to temporary file to avoid shell escaping issues
  const bodyFile = `/tmp/gh-issue-body-${issue.key}.txt`;
  await import("node:fs/promises").then((fs) => fs.writeFile(bodyFile, body));

  try {
    const command = `gh issue create --title "${title.replace(/"/g, '\\"')}" --body-file "${bodyFile}" ${labelArgs}`;

    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    if (stderr && !stderr.includes("Creating")) {
      console.warn("  GitHub CLI stderr:", stderr);
    }

    // Extract issue URL from output
    const issueUrl = stdout.trim();
    const issueNumber = Number.parseInt(issueUrl.split("/").pop() || "0", 10);

    return {
      number: issueNumber,
      url: issueUrl,
      htmlUrl: issueUrl
    };
  } finally {
    // Clean up temp file
    await import("node:fs/promises")
      .then((fs) => fs.unlink(bodyFile))
      .catch(() => {
        /* ignore */
      });
  }
}

/**
 * Check if gh CLI is available and authenticated
 */
export async function checkGitHubAuth(): Promise<boolean> {
  try {
    const { stdout } = await execAsync("gh auth status");
    return stdout.includes("Logged in");
  } catch {
    return false;
  }
}

/**
 * Find an existing GitHub issue by JIRA key label
 */
export async function findExistingIssue(jiraKey: string): Promise<GitHubIssue | null> {
  try {
    const { stdout } = await execAsync(`gh issue list --label "jira:${jiraKey}" --json number,url --limit 1`);
    const issues = JSON.parse(stdout);
    if (issues.length > 0) {
      return {
        number: issues[0].number,
        url: issues[0].url,
        htmlUrl: issues[0].url
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Update an existing GitHub issue from a JIRA issue
 */
export async function updateGitHubIssue(issueNumber: number, issue: JiraIssue, dryRun = false): Promise<GitHubIssue> {
  const title = `[${issue.key}] ${issue.fields.summary}`;
  const body = createIssueBody(issue);

  // Build labels for status and priority
  const statusLabel = issue.fields.status?.name ? `status:${normalizeLabel(issue.fields.status.name)}` : null;
  const priorityName = getPriorityName(issue.fields.priority);
  const priorityLabel = priorityName ? `priority:${normalizeLabel(priorityName)}` : null;

  if (dryRun) {
    console.log(`  [DRY RUN] Would update issue #${issueNumber}`);
    console.log(`    Title: ${title}`);
    console.log(`    Body length: ${body.length} chars`);
    return {
      number: issueNumber,
      url: `https://github.com/hmcts/expressjs-monorepo-template/issues/${issueNumber}`,
      htmlUrl: `https://github.com/hmcts/expressjs-monorepo-template/issues/${issueNumber}`
    };
  }

  // Write body to temporary file to avoid shell escaping issues
  const bodyFile = `/tmp/gh-issue-body-${issue.key}.txt`;
  await import("node:fs/promises").then((fs) => fs.writeFile(bodyFile, body));

  try {
    // Update issue title and body
    const editCommand = `gh issue edit ${issueNumber} --title "${title.replace(/"/g, '\\"')}" --body-file "${bodyFile}"`;
    await execAsync(editCommand, {
      maxBuffer: 1024 * 1024 * 10
    });

    // Update labels - remove old status/priority and add new ones
    // First get current labels
    const { stdout: labelOutput } = await execAsync(`gh issue view ${issueNumber} --json labels`);
    const { labels: currentLabels } = JSON.parse(labelOutput);

    // Find labels to remove (old status/priority labels)
    const labelsToRemove: string[] = [];
    for (const label of currentLabels) {
      if (label.name.startsWith("status:") || label.name.startsWith("priority:")) {
        labelsToRemove.push(label.name);
      }
    }

    // Remove old labels if any
    if (labelsToRemove.length > 0) {
      const removeArgs = labelsToRemove.map((l) => `--remove-label "${l}"`).join(" ");
      await execAsync(`gh issue edit ${issueNumber} ${removeArgs}`);
    }

    // Add new status/priority labels
    const labelsToAdd: string[] = [];
    if (statusLabel) labelsToAdd.push(statusLabel);
    if (priorityLabel) labelsToAdd.push(priorityLabel);

    if (labelsToAdd.length > 0) {
      const addArgs = labelsToAdd.map((l) => `--add-label "${l}"`).join(" ");
      await execAsync(`gh issue edit ${issueNumber} ${addArgs}`);
    }

    const issueUrl = `https://github.com/hmcts/expressjs-monorepo-template/issues/${issueNumber}`;
    return {
      number: issueNumber,
      url: issueUrl,
      htmlUrl: issueUrl
    };
  } finally {
    // Clean up temp file
    await import("node:fs/promises")
      .then((fs) => fs.unlink(bodyFile))
      .catch(() => {
        /* ignore */
      });
  }
}

/**
 * Add an issue to a GitHub Project board and set its column based on JIRA status
 */
export async function addIssueToProject(issueUrl: string, jiraStatus: string, projectNumber: number, dryRun = false): Promise<boolean> {
  const normalizedStatus = normalizeLabel(jiraStatus);
  const columnOptionId = STATUS_TO_COLUMN[normalizedStatus] || STATUS_TO_COLUMN.new;

  if (dryRun) {
    console.log(`  [DRY RUN] Would add to project ${projectNumber}`);
    console.log(`    JIRA Status: ${jiraStatus} -> Column: ${normalizedStatus}`);
    return true;
  }

  try {
    // Add issue to project
    const addCommand = `gh project item-add ${projectNumber} --owner hmcts --url "${issueUrl}" --format json`;
    const { stdout: addOutput } = await execAsync(addCommand, {
      maxBuffer: 1024 * 1024
    });

    const addResult = JSON.parse(addOutput);
    const itemId = addResult.id;

    if (!itemId) {
      console.error("  ✗ Failed to get project item ID from response");
      return false;
    }

    // Set the status column
    const editCommand = `gh project item-edit --id "${itemId}" --project-id "${PROJECT_ID}" --field-id "${STATUS_FIELD_ID}" --single-select-option-id "${columnOptionId}"`;
    await execAsync(editCommand, {
      maxBuffer: 1024 * 1024
    });

    console.log(`  ✓ Added to project board (${normalizedStatus})`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to add to project: ${message}`);
    return false;
  }
}
