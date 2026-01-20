import { exec } from "node:child_process";
import { promisify } from "node:util";
import { convertJiraToMarkdown } from "./markdown-converter.js";
import type { GitHubIssue, JiraComment, JiraIssue } from "./types.js";

const execAsync = promisify(exec);

const JIRA_BASE_URL = process.env.JIRA_BASE_URL || "https://tools.hmcts.net/jira";

// GitHub configuration - set via setGitHubRepo()
let GITHUB_OWNER = "";
let GITHUB_REPO = "";
let GITHUB_REPO_URL = "";

/**
 * Set the target GitHub repository for migration
 */
export function setGitHubRepo(repo: string): void {
  const parts = repo.split("/");
  if (parts.length !== 2) {
    throw new Error(`Invalid repository format: ${repo}. Expected format: owner/repo`);
  }
  GITHUB_OWNER = parts[0];
  GITHUB_REPO = parts[1];
  GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
}

// GitHub Project configuration - these will be populated dynamically
let PROJECT_ID = "";
let STATUS_FIELD_ID = "";
let ESTIMATE_FIELD_ID = "";

// Required status columns for the project board
const REQUIRED_STATUS_OPTIONS = [
  { name: "Backlog", color: "GRAY", description: "" },
  { name: "Prioritised Backlog", color: "BLUE", description: "" },
  { name: "Refined Tickets", color: "PURPLE", description: "" },
  { name: "In Progress", color: "YELLOW", description: "" },
  { name: "Code Review", color: "ORANGE", description: "" },
  { name: "Ready For Test", color: "PINK", description: "" },
  { name: "In Test", color: "RED", description: "" },
  { name: "Ready For Sign Off", color: "GREEN", description: "" },
  { name: "Done", color: "GREEN", description: "" }
];

// JIRA status to GitHub Project column name mapping
const JIRA_STATUS_TO_COLUMN_NAME: Record<string, string> = {
  new: "Backlog",
  "prioritised-backlog": "Prioritised Backlog",
  "ready-for-progress": "Refined Tickets",
  "in-progress": "In Progress",
  "code-review": "Code Review",
  "ready-for-test": "Ready For Test",
  "in-test": "In Test",
  "ready-for-sign-off": "Ready For Sign Off",
  closed: "Done",
  done: "Done",
  withdrawn: "Done"
};

// Dynamic mapping populated after project setup
let STATUS_TO_COLUMN: Record<string, string> = {};

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
 * Ensure a label exists in the repository, creating it if necessary
 */
async function ensureLabelExists(label: string): Promise<void> {
  try {
    const { stdout } = await execAsync(`gh label list -R ${GITHUB_OWNER}/${GITHUB_REPO} --search "${label}" --limit 1 --json name`);
    const labels = JSON.parse(stdout);

    if (labels.some((l: { name: string }) => l.name === label)) {
      return;
    }

    let color = "ededed";
    if (label.startsWith("jira:")) color = "0052CC";
    else if (label.startsWith("status:")) color = "0E8A16";
    else if (label.startsWith("priority:1")) color = "B60205";
    else if (label.startsWith("priority:2")) color = "D93F0B";
    else if (label.startsWith("priority:3")) color = "FBCA04";
    else if (label.startsWith("priority:4")) color = "0E8A16";
    else if (label.startsWith("priority:5")) color = "C2E0C6";
    else if (label.startsWith("type:")) color = "1D76DB";
    else if (label === "migrated-from-jira") color = "5319E7";

    await execAsync(`gh label create -R ${GITHUB_OWNER}/${GITHUB_REPO} "${label}" --color "${color}" --force`);
  } catch {
    try {
      await execAsync(`gh label create -R ${GITHUB_OWNER}/${GITHUB_REPO} "${label}" --color "ededed" --force`);
    } catch {
      // Label might already exist
    }
  }
}

/**
 * Ensure all labels exist before creating an issue
 */
async function ensureLabelsExist(labels: string[]): Promise<void> {
  for (const label of labels) {
    await ensureLabelExists(label);
  }
}

/**
 * Get project node ID from project number
 */
async function getProjectNodeId(projectNumber: number): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`gh project view ${projectNumber} --owner hmcts --format json`);
    const project = JSON.parse(stdout);
    return project.id || null;
  } catch {
    return null;
  }
}

/**
 * Get the Status and Estimate field IDs for a project
 */
async function getProjectFieldIds(projectNumber: number): Promise<{ statusId: string | null; estimateId: string | null; projectId: string | null }> {
  try {
    const { stdout } = await execAsync(`gh project field-list ${projectNumber} --owner ${GITHUB_OWNER} --format json`);
    const data = JSON.parse(stdout);
    const statusField = data.fields?.find((f: { name: string }) => f.name === "Status");
    const estimateField = data.fields?.find((f: { name: string }) => f.name === "Estimate");

    // Get project node ID
    const { stdout: projectStdout } = await execAsync(`gh project view ${projectNumber} --owner ${GITHUB_OWNER} --format json`);
    const projectData = JSON.parse(projectStdout);

    return {
      statusId: statusField?.id || null,
      estimateId: estimateField?.id || null,
      projectId: projectData?.id || null
    };
  } catch {
    return { statusId: null, estimateId: null, projectId: null };
  }
}

/**
 * Set up the project board with required status columns
 * This ensures all JIRA statuses can be mapped to GitHub project columns
 */
export async function setupProjectBoard(projectNumber: number, dryRun = false): Promise<boolean> {
  console.log("\nSetting up project board...");

  if (dryRun) {
    console.log("  [DRY RUN] Would set up status columns:");
    for (const opt of REQUIRED_STATUS_OPTIONS) {
      console.log(`    - ${opt.name}`);
    }
    console.log("  [DRY RUN] Would use Estimate field for story points");
    // Set up dummy mappings for dry run
    PROJECT_ID = "dry-run-project-id";
    STATUS_FIELD_ID = "dry-run-status-field-id";
    ESTIMATE_FIELD_ID = "dry-run-estimate-field-id";
    for (const [jiraStatus] of Object.entries(JIRA_STATUS_TO_COLUMN_NAME)) {
      STATUS_TO_COLUMN[jiraStatus] = "dry-run-id";
    }
    return true;
  }

  try {
    // Get the field IDs
    const fieldIds = await getProjectFieldIds(projectNumber);
    if (!fieldIds.statusId) {
      console.error("  ✗ Could not find Status field in project");
      return false;
    }
    if (!fieldIds.projectId) {
      console.error("  ✗ Could not find project ID");
      return false;
    }

    // Store the field IDs
    PROJECT_ID = fieldIds.projectId;
    STATUS_FIELD_ID = fieldIds.statusId;
    ESTIMATE_FIELD_ID = fieldIds.estimateId || "";

    if (!ESTIMATE_FIELD_ID) {
      console.warn("  ⚠ Estimate field not found in project - story points will not be set");
    } else {
      console.log("  ✓ Estimate field found for story points");
    }

    // Build the GraphQL mutation to update status options
    const optionsJson = REQUIRED_STATUS_OPTIONS.map((opt) => `{ name: "${opt.name}", color: ${opt.color}, description: "${opt.description}" }`).join(", ");

    const mutation = `
      mutation {
        updateProjectV2Field(input: {
          fieldId: "${STATUS_FIELD_ID}"
          singleSelectOptions: [${optionsJson}]
        }) {
          projectV2Field {
            ... on ProjectV2SingleSelectField {
              id
              name
              options { id name }
            }
          }
        }
      }
    `;

    const { stdout } = await execAsync(`gh api graphql -f query='${mutation}'`, {
      maxBuffer: 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.errors) {
      console.error("  ✗ Failed to update status columns:", result.errors);
      return false;
    }

    // Build the STATUS_TO_COLUMN mapping from the response
    const options = result.data?.updateProjectV2Field?.projectV2Field?.options || [];
    const nameToId: Record<string, string> = {};
    for (const opt of options) {
      nameToId[opt.name] = opt.id;
    }

    // Map JIRA statuses to column IDs
    for (const [jiraStatus, columnName] of Object.entries(JIRA_STATUS_TO_COLUMN_NAME)) {
      const columnId = nameToId[columnName];
      if (columnId) {
        STATUS_TO_COLUMN[jiraStatus] = columnId;
      }
    }

    console.log("  ✓ Status columns configured:");
    for (const opt of options) {
      console.log(`    - ${opt.name} (${opt.id})`);
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to set up project board: ${message}`);
    return false;
  }
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
      url: `${GITHUB_REPO_URL}/issues/0`,
      htmlUrl: `${GITHUB_REPO_URL}/issues/0`
    };
  }

  // Ensure all labels exist before creating the issue
  await ensureLabelsExist(labels);

  // Create issue using gh CLI
  const labelArgs = labels.map((label) => `--label "${label}"`).join(" ");

  // Write body to temporary file to avoid shell escaping issues
  const bodyFile = `/tmp/gh-issue-body-${issue.key}.txt`;
  await import("node:fs/promises").then((fs) => fs.writeFile(bodyFile, body));

  try {
    const command = `gh issue create -R ${GITHUB_OWNER}/${GITHUB_REPO} --title "${title.replace(/"/g, '\\"')}" --body-file "${bodyFile}" ${labelArgs}`;

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
    const { stdout } = await execAsync(`gh issue list -R ${GITHUB_OWNER}/${GITHUB_REPO} --label "jira:${jiraKey}" --json number,url --limit 1`);
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
      url: `${GITHUB_REPO_URL}/issues/${issueNumber}`,
      htmlUrl: `${GITHUB_REPO_URL}/issues/${issueNumber}`
    };
  }

  // Write body to temporary file to avoid shell escaping issues
  const bodyFile = `/tmp/gh-issue-body-${issue.key}.txt`;
  await import("node:fs/promises").then((fs) => fs.writeFile(bodyFile, body));

  try {
    // Update issue title and body
    const editCommand = `gh issue edit -R ${GITHUB_OWNER}/${GITHUB_REPO} ${issueNumber} --title "${title.replace(/"/g, '\\"')}" --body-file "${bodyFile}"`;
    await execAsync(editCommand, {
      maxBuffer: 1024 * 1024 * 10
    });

    // Update labels - remove old status/priority and add new ones
    // First get current labels
    const { stdout: labelOutput } = await execAsync(`gh issue view -R ${GITHUB_OWNER}/${GITHUB_REPO} ${issueNumber} --json labels`);
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
      await execAsync(`gh issue edit -R ${GITHUB_OWNER}/${GITHUB_REPO} ${issueNumber} ${removeArgs}`);
    }

    // Add new status/priority/type labels
    const labelsToAdd: string[] = [];
    if (statusLabel) labelsToAdd.push(statusLabel);
    if (priorityLabel) labelsToAdd.push(priorityLabel);
    if (typeLabel) labelsToAdd.push(typeLabel);

    if (labelsToAdd.length > 0) {
      await ensureLabelsExist(labelsToAdd);
      const addArgs = labelsToAdd.map((l) => `--add-label "${l}"`).join(" ");
      await execAsync(`gh issue edit -R ${GITHUB_OWNER}/${GITHUB_REPO} ${issueNumber} ${addArgs}`);
    }

    const issueUrl = `${GITHUB_REPO_URL}/issues/${issueNumber}`;
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
 * Set the Estimate field for an issue in the project board using story points directly
 */
export async function setIssueEstimate(itemId: string, storyPoints: number | undefined, dryRun = false): Promise<number | null> {
  if (storyPoints === undefined || storyPoints === null) {
    return null;
  }

  if (!ESTIMATE_FIELD_ID) {
    return null;
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would set Estimate: ${storyPoints} points`);
    return storyPoints;
  }

  try {
    const editCommand = `gh project item-edit --id "${itemId}" --project-id "${PROJECT_ID}" --field-id "${ESTIMATE_FIELD_ID}" --number ${storyPoints}`;
    await execAsync(editCommand, { maxBuffer: 1024 * 1024 });
    console.log(`  ✓ Set Estimate: ${storyPoints} points`);
    return storyPoints;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to set Estimate: ${message}`);
    return null;
  }
}

/**
 * Get the GitHub node ID for an issue
 */
export async function getIssueNodeId(issueNumber: number): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`gh issue view -R ${GITHUB_OWNER}/${GITHUB_REPO} ${issueNumber} --json id`);
    const result = JSON.parse(stdout);
    return result.id || null;
  } catch {
    return null;
  }
}

/**
 * Link a child issue as a sub-issue of a parent issue using GraphQL
 */
export async function linkSubIssue(parentIssueNumber: number, childIssueNumber: number, dryRun = false): Promise<boolean> {
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
export async function addIssueToProjectAndGetItemId(issueUrl: string, projectNumber: number, dryRun = false): Promise<string | null> {
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

/**
 * Format a JIRA comment for GitHub
 */
function formatJiraCommentForGitHub(comment: JiraComment): string {
  const createdDate = new Date(comment.created);
  const updatedDate = new Date(comment.updated);

  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

  const authorName = comment.author?.displayName || "Unknown";
  const createdStr = formatDate(createdDate);

  // Check if comment was edited (updated != created)
  const wasEdited = Math.abs(updatedDate.getTime() - createdDate.getTime()) > 60000; // > 1 minute difference
  const editedStr = wasEdited ? ` (edited ${formatDate(updatedDate)})` : "";

  const convertedBody = convertJiraToMarkdown(comment.body || "");

  return `> **${authorName}** commented on ${createdStr}${editedStr}

${convertedBody}`;
}

/**
 * Add a comment to a GitHub issue
 */
export async function addCommentToIssue(issueNumber: number, body: string, dryRun = false): Promise<boolean> {
  if (dryRun) {
    return true;
  }

  // Write body to temporary file to avoid shell escaping issues
  const bodyFile = `/tmp/gh-comment-body-${issueNumber}-${Date.now()}.txt`;
  await import("node:fs/promises").then((fs) => fs.writeFile(bodyFile, body));

  try {
    const command = `gh issue comment -R ${GITHUB_OWNER}/${GITHUB_REPO} ${issueNumber} --body-file "${bodyFile}"`;
    await execAsync(command, { maxBuffer: 1024 * 1024 * 10 });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`    ⚠ Failed to add comment: ${message}`);
    return false;
  } finally {
    await import("node:fs/promises")
      .then((fs) => fs.unlink(bodyFile))
      .catch(() => {
        /* ignore */
      });
  }
}

/**
 * Migrate all comments from a JIRA issue to a GitHub issue
 */
export async function migrateCommentsToIssue(issueNumber: number, comments: JiraComment[], dryRun = false): Promise<number> {
  if (comments.length === 0) {
    return 0;
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would migrate ${comments.length} comment(s)`);
    return comments.length;
  }

  let successCount = 0;

  for (const comment of comments) {
    const formattedBody = formatJiraCommentForGitHub(comment);
    const success = await addCommentToIssue(issueNumber, formattedBody, dryRun);

    if (success) {
      successCount++;
    }

    // Add delay between comments to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (successCount > 0) {
    console.log(`  ✓ Migrated ${successCount}/${comments.length} comment(s)`);
  }

  return successCount;
}
