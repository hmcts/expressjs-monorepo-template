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
// Keys are normalized (lowercase, spaces replaced with hyphens)
const JIRA_STATUS_TO_COLUMN_NAME: Record<string, string> = {
  // Backlog statuses
  new: "Backlog",
  open: "Backlog",
  backlog: "Backlog",
  "to-do": "Backlog",
  todo: "Backlog",
  // Prioritised/Refined statuses
  "prioritised-backlog": "Prioritised Backlog",
  "next---prioritised": "Prioritised Backlog",
  "ready-for-progress": "Refined Tickets",
  "ready-for-development": "Refined Tickets",
  refined: "Refined Tickets",
  // In Progress statuses
  "in-progress": "In Progress",
  "in-development": "In Progress",
  development: "In Progress",
  // Code Review statuses
  "code-review": "Code Review",
  "in-review": "Code Review",
  review: "Code Review",
  // Test statuses
  "ready-for-test": "Ready For Test",
  "ready-for-testing": "Ready For Test",
  "in-test": "In Test",
  "in-testing": "In Test",
  testing: "In Test",
  test: "In Test",
  // Sign off statuses
  "ready-for-sign-off": "Ready For Sign Off",
  "ready-for-signoff": "Ready For Sign Off",
  "awaiting-sign-off": "Ready For Sign Off",
  acceptance: "Ready For Sign Off",
  // Done statuses
  closed: "Done",
  done: "Done",
  resolved: "Done",
  complete: "Done",
  completed: "Done",
  finished: "Done",
  withdrawn: "Done",
  cancelled: "Done",
  canceled: "Done",
  rejected: "Done",
  "won't-do": "Done",
  wontdo: "Done",
  "wont-do": "Done",
  "prod-release": "Done"
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
    const { stdout } = await execAsync(`gh project view ${projectNumber} --owner ${GITHUB_OWNER} --format json`);
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
 * Query existing status field options from the project
 */
async function getStatusFieldOptions(projectNumber: number): Promise<Array<{ id: string; name: string }>> {
  try {
    const query = `
      query {
        organization(login: "${GITHUB_OWNER}") {
          projectV2(number: ${projectNumber}) {
            field(name: "Status") {
              ... on ProjectV2SingleSelectField {
                id
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `;

    const { stdout } = await execAsync(`gh api graphql -f query='${query}'`, {
      maxBuffer: 1024 * 1024
    });

    const result = JSON.parse(stdout);
    return result.data?.organization?.projectV2?.field?.options || [];
  } catch {
    return [];
  }
}

/**
 * Set up the project board - queries existing status columns and builds mapping
 */
export async function setupProjectBoard(projectNumber: number, dryRun = false): Promise<boolean> {
  console.log("\nSetting up project board...");

  if (dryRun) {
    console.log("  [DRY RUN] Would query status columns");
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

    // Query existing status options from the project
    const options = await getStatusFieldOptions(projectNumber);

    if (options.length === 0) {
      console.error("  ✗ No status options found in project");
      return false;
    }

    // Build mapping from column name to option ID
    const nameToId: Record<string, string> = {};
    for (const opt of options) {
      nameToId[opt.name] = opt.id;
      // Also add normalized version for flexible matching
      nameToId[opt.name.toLowerCase()] = opt.id;
      nameToId[opt.name.toLowerCase().replace(/\s+/g, "-")] = opt.id;
    }

    // Map JIRA statuses to column IDs
    for (const [jiraStatus, columnName] of Object.entries(JIRA_STATUS_TO_COLUMN_NAME)) {
      // Try exact match first, then normalized matches
      const columnId = nameToId[columnName] || nameToId[columnName.toLowerCase()] || nameToId[columnName.toLowerCase().replace(/\s+/g, "-")];
      if (columnId) {
        STATUS_TO_COLUMN[jiraStatus] = columnId;
      }
    }

    console.log("  ✓ Status columns found:");
    for (const opt of options) {
      console.log(`    - ${opt.name} (${opt.id})`);
    }

    // Show which JIRA statuses are mapped
    const mappedCount = Object.keys(STATUS_TO_COLUMN).length;
    console.log(`  ✓ Mapped ${mappedCount} JIRA statuses to project columns`);

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
  const columnName = JIRA_STATUS_TO_COLUMN_NAME[normalizedStatus];
  const columnOptionId = STATUS_TO_COLUMN[normalizedStatus];

  if (dryRun) {
    console.log(`  [DRY RUN] Would add to project ${projectNumber}`);
    if (columnName) {
      console.log(`    JIRA Status: "${jiraStatus}" -> "${normalizedStatus}" -> Column: "${columnName}"`);
    } else {
      console.log(`    JIRA Status: "${jiraStatus}" -> "${normalizedStatus}" (unmapped, will use Backlog)`);
    }
    return "dry-run-item-id";
  }

  let itemId: string | null = null;

  try {
    // Add issue to project
    const addCommand = `gh project item-add ${projectNumber} --owner ${GITHUB_OWNER} --url "${issueUrl}" --format json`;
    const { stdout: addOutput } = await execAsync(addCommand, {
      maxBuffer: 1024 * 1024
    });

    const addResult = JSON.parse(addOutput);
    itemId = addResult.id;

    if (!itemId) {
      console.error("  ✗ Failed to get project item ID from response");
      return null;
    }

    console.log(`  ✓ Added to project board`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Check if already in project
    if (message.includes("already exists")) {
      console.log(`  ✓ Already in project board`);
      // Try to get the item ID from the project by matching issue number
      try {
        // Extract issue number from URL (e.g., https://github.com/owner/repo/issues/123 -> 123)
        const issueNumberMatch = issueUrl.match(/\/issues\/(\d+)/);
        const issueNumber = issueNumberMatch ? issueNumberMatch[1] : null;

        const listCommand = `gh project item-list ${projectNumber} --owner ${GITHUB_OWNER} --format json --limit 1000`;
        const { stdout } = await execAsync(listCommand, { maxBuffer: 1024 * 1024 * 10 });
        const items = JSON.parse(stdout);

        // Try to match by URL first, then by issue number in URL
        const existingItem = items.items?.find((item: { content?: { url?: string; number?: number } }) => {
          if (item.content?.url === issueUrl) return true;
          if (issueNumber && item.content?.url?.includes(`/issues/${issueNumber}`)) return true;
          if (issueNumber && item.content?.number === Number(issueNumber)) return true;
          return false;
        });

        if (existingItem) {
          itemId = existingItem.id;
        } else if (issueNumber) {
          // Fallback: Try GraphQL to find the project item for this issue
          try {
            const query = `
              query {
                repository(owner: "${GITHUB_OWNER}", name: "${GITHUB_REPO}") {
                  issue(number: ${issueNumber}) {
                    projectItems(first: 10) {
                      nodes {
                        id
                        project { number }
                      }
                    }
                  }
                }
              }
            `;
            const { stdout: gqlOutput } = await execAsync(`gh api graphql -f query='${query}'`, {
              maxBuffer: 1024 * 1024
            });
            const gqlResult = JSON.parse(gqlOutput);
            const projectItem = gqlResult.data?.repository?.issue?.projectItems?.nodes?.find(
              (item: { project?: { number?: number } }) => item.project?.number === projectNumber
            );
            if (projectItem) {
              itemId = projectItem.id;
            } else {
              console.warn(`  ⚠ Could not find project item via GraphQL, will skip status update`);
            }
          } catch {
            console.warn(`  ⚠ Could not find existing project item for issue, will skip status update`);
          }
        } else {
          console.warn(`  ⚠ Could not find existing project item for issue, will skip status update`);
        }
      } catch (listError) {
        const listMessage = listError instanceof Error ? listError.message : String(listError);
        console.warn(`  ⚠ Could not list project items: ${listMessage}`);
      }
    } else {
      console.error(`  ✗ Failed to add to project: ${message}`);
      return null;
    }
  }

  // Set the status column if we have an item ID
  if (itemId) {
    // Use the mapped column or fall back to Backlog
    const targetColumnId = columnOptionId || STATUS_TO_COLUMN.new || STATUS_TO_COLUMN.backlog;

    if (!targetColumnId) {
      console.warn(`  ⚠ No status column ID available for "${normalizedStatus}", skipping status update`);
      return itemId;
    }

    try {
      const editCommand = `gh project item-edit --id "${itemId}" --project-id "${PROJECT_ID}" --field-id "${STATUS_FIELD_ID}" --single-select-option-id "${targetColumnId}"`;
      await execAsync(editCommand, {
        maxBuffer: 1024 * 1024
      });

      const targetColumnName = columnName || "Backlog";
      console.log(`  ✓ Set status: "${jiraStatus}" -> "${targetColumnName}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  ⚠ Failed to set status for "${jiraStatus}" (${normalizedStatus}): ${message}`);
      // Still return itemId since the issue was added to the project
    }
  }

  return itemId;
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
 * Check if an issue is already linked as a sub-issue of a parent
 */
async function isAlreadyLinkedAsSubIssue(parentIssueNumber: number, childIssueNumber: number): Promise<boolean> {
  try {
    const query = `
      query {
        repository(owner: "${GITHUB_OWNER}", name: "${GITHUB_REPO}") {
          issue(number: ${parentIssueNumber}) {
            subIssues(first: 100) {
              nodes { number }
            }
          }
        }
      }
    `;

    const { stdout } = await execAsync(`gh api graphql -f query='${query}'`, {
      maxBuffer: 1024 * 1024
    });

    const result = JSON.parse(stdout);
    const subIssues = result.data?.repository?.issue?.subIssues?.nodes || [];
    return subIssues.some((issue: { number: number }) => issue.number === childIssueNumber);
  } catch {
    return false;
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
    // Check if already linked
    const alreadyLinked = await isAlreadyLinkedAsSubIssue(parentIssueNumber, childIssueNumber);
    if (alreadyLinked) {
      console.log(`  ✓ Already linked as sub-issue of #${parentIssueNumber}`);
      return true;
    }

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
    const addCommand = `gh project item-add ${projectNumber} --owner ${GITHUB_OWNER} --url "${issueUrl}" --format json`;
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
 * Add a comment to a GitHub issue with retry logic for rate limiting
 */
export async function addCommentToIssue(issueNumber: number, body: string, dryRun = false): Promise<boolean> {
  if (dryRun) {
    return true;
  }

  // Write body to temporary file to avoid shell escaping issues
  const bodyFile = `/tmp/gh-comment-body-${issueNumber}-${Date.now()}.txt`;
  await import("node:fs/promises").then((fs) => fs.writeFile(bodyFile, body));

  const maxRetries = 3;
  let lastError = "";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const command = `gh issue comment -R ${GITHUB_OWNER}/${GITHUB_REPO} ${issueNumber} --body-file "${bodyFile}"`;
      await execAsync(command, { maxBuffer: 1024 * 1024 * 10 });
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      // Check if it's a rate limit error
      if (lastError.includes("submitted too quickly") || lastError.includes("rate limit")) {
        if (attempt < maxRetries) {
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      } else {
        // Non-rate-limit error, don't retry
        break;
      }
    }
  }

  console.warn(`    ⚠ Failed to add comment after ${maxRetries} attempts: ${lastError}`);

  // Clean up temp file
  await import("node:fs/promises")
    .then((fs) => fs.unlink(bodyFile))
    .catch(() => {
      /* ignore */
    });

  return false;
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

    // Add delay between comments to avoid rate limiting (longer due to parallel processing)
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  if (successCount > 0) {
    console.log(`  ✓ Migrated ${successCount}/${comments.length} comment(s)`);
  }

  return successCount;
}
