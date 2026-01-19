import { exec } from "node:child_process";
import { promisify } from "node:util";
import { convertJiraToMarkdown } from "./markdown-converter.js";
import type { GitHubIssue, JiraIssue } from "./types.js";

const execAsync = promisify(exec);

const JIRA_BASE_URL = process.env.JIRA_BASE_URL || "https://tools.hmcts.net/jira";

// GitHub Project configuration
const PROJECT_ID = "PVT_kwDOAVwpV84BMvy3";
const STATUS_FIELD_ID = "PVTSSF_lADOAVwpV84BMvy3zg78TBM";
const SIZE_FIELD_ID = "PVTSSF_lADOAVwpV84BMvy3zg78TFE";

// Story points to Size field mapping
const STORY_POINTS_TO_SIZE: Record<number, { optionId: string; label: string }> = {
  1: { optionId: "6c6483d2", label: "XS" },
  2: { optionId: "f784b110", label: "S" },
  3: { optionId: "7515a9f1", label: "M" },
  5: { optionId: "7515a9f1", label: "M" },
  8: { optionId: "817d0097", label: "L" },
  13: { optionId: "db339eb2", label: "XL" }
};

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
  const issueType = issue.fields.issuetype?.name || "Unknown";
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

  // Add issue type label
  if (issue.fields.issuetype?.name) {
    labels.push(`type:${normalizeLabel(issue.fields.issuetype.name)}`);
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

  // Build labels for status, priority, and type
  const statusLabel = issue.fields.status?.name ? `status:${normalizeLabel(issue.fields.status.name)}` : null;
  const priorityName = getPriorityName(issue.fields.priority);
  const priorityLabel = priorityName ? `priority:${normalizeLabel(priorityName)}` : null;
  const typeLabel = issue.fields.issuetype?.name ? `type:${normalizeLabel(issue.fields.issuetype.name)}` : null;

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

    // Find labels to remove (old status/priority/type labels)
    const labelsToRemove: string[] = [];
    for (const label of currentLabels) {
      if (label.name.startsWith("status:") || label.name.startsWith("priority:") || label.name.startsWith("type:")) {
        labelsToRemove.push(label.name);
      }
    }

    // Remove old labels if any
    if (labelsToRemove.length > 0) {
      const removeArgs = labelsToRemove.map((l) => `--remove-label "${l}"`).join(" ");
      await execAsync(`gh issue edit ${issueNumber} ${removeArgs}`);
    }

    // Add new status/priority/type labels
    const labelsToAdd: string[] = [];
    if (statusLabel) labelsToAdd.push(statusLabel);
    if (priorityLabel) labelsToAdd.push(priorityLabel);
    if (typeLabel) labelsToAdd.push(typeLabel);

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
 * Returns the project item ID on success, null on failure
 */
export async function addIssueToProject(issueUrl: string, jiraStatus: string, projectNumber: number, dryRun = false): Promise<string | null> {
  const normalizedStatus = normalizeLabel(jiraStatus);
  const columnOptionId = STATUS_TO_COLUMN[normalizedStatus] || STATUS_TO_COLUMN.new;

  if (dryRun) {
    console.log(`  [DRY RUN] Would add to project ${projectNumber}`);
    console.log(`    JIRA Status: ${jiraStatus} -> Column: ${normalizedStatus}`);
    return "dry-run-item-id";
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
      return null;
    }

    // Set the status column
    const editCommand = `gh project item-edit --id "${itemId}" --project-id "${PROJECT_ID}" --field-id "${STATUS_FIELD_ID}" --single-select-option-id "${columnOptionId}"`;
    await execAsync(editCommand, {
      maxBuffer: 1024 * 1024
    });

    console.log(`  ✓ Added to project board (${normalizedStatus})`);
    return itemId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to add to project: ${message}`);
    return null;
  }
}

/**
 * Get Size label from story points
 */
export function getSizeFromStoryPoints(storyPoints: number | undefined): { optionId: string; label: string } | null {
  if (storyPoints === undefined || storyPoints === null) {
    return null;
  }
  // For story points > 13, use XL
  if (storyPoints >= 13) {
    return STORY_POINTS_TO_SIZE[13];
  }
  return STORY_POINTS_TO_SIZE[storyPoints] || null;
}

/**
 * Set the Size field for an issue in the project board
 */
export async function setIssueSize(
  itemId: string,
  storyPoints: number | undefined,
  dryRun = false
): Promise<string | null> {
  const size = getSizeFromStoryPoints(storyPoints);
  if (!size) {
    return null;
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would set Size: ${size.label} (${storyPoints} points)`);
    return size.label;
  }

  try {
    const editCommand = `gh project item-edit --id "${itemId}" --project-id "${PROJECT_ID}" --field-id "${SIZE_FIELD_ID}" --single-select-option-id "${size.optionId}"`;
    await execAsync(editCommand, { maxBuffer: 1024 * 1024 });
    console.log(`  ✓ Set Size: ${size.label} (${storyPoints} points)`);
    return size.label;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to set Size: ${message}`);
    return null;
  }
}

/**
 * Get the GitHub node ID for an issue
 */
export async function getIssueNodeId(issueNumber: number): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`gh issue view ${issueNumber} --json id`);
    const result = JSON.parse(stdout);
    return result.id || null;
  } catch {
    return null;
  }
}

/**
 * Link a child issue as a sub-issue of a parent issue using GraphQL
 */
export async function linkSubIssue(
  parentIssueNumber: number,
  childIssueNumber: number,
  dryRun = false
): Promise<boolean> {
  if (dryRun) {
    console.log(`  [DRY RUN] Would link #${childIssueNumber} as sub-issue of #${parentIssueNumber}`);
    return true;
  }

  try {
    // Get node IDs for both issues
    const parentNodeId = await getIssueNodeId(parentIssueNumber);
    const childNodeId = await getIssueNodeId(childIssueNumber);

    if (!parentNodeId || !childNodeId) {
      console.error(`  ✗ Failed to get node IDs for linking (parent: ${parentNodeId}, child: ${childNodeId})`);
      return false;
    }

    // Use GraphQL to link the sub-issue
    const mutation = `
      mutation {
        addSubIssue(input: { issueId: "${parentNodeId}", subIssueId: "${childNodeId}" }) {
          issue { number }
          subIssue { number }
        }
      }
    `;

    const { stdout } = await execAsync(`gh api graphql -f query='${mutation}'`, {
      maxBuffer: 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.errors) {
      console.error(`  ✗ GraphQL error linking sub-issue: ${JSON.stringify(result.errors)}`);
      return false;
    }

    console.log(`  ✓ Linked as sub-issue of #${parentIssueNumber}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to link sub-issue: ${message}`);
    return false;
  }
}

/**
 * Add an issue to a project and return the project item ID
 */
export async function addIssueToProjectAndGetItemId(
  issueUrl: string,
  projectNumber: number,
  dryRun = false
): Promise<string | null> {
  if (dryRun) {
    console.log(`  [DRY RUN] Would add to project ${projectNumber}`);
    return "dry-run-item-id";
  }

  try {
    const addCommand = `gh project item-add ${projectNumber} --owner hmcts --url "${issueUrl}" --format json`;
    const { stdout } = await execAsync(addCommand, { maxBuffer: 1024 * 1024 });
    const result = JSON.parse(stdout);
    return result.id || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to add to project: ${message}`);
    return null;
  }
}
