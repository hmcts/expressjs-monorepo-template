import * as fs from "node:fs";
import * as path from "node:path";
import type { JiraIssue } from "./types.js";

/**
 * Load environment variables from .claude/.mcp.env
 */
function loadMcpEnv(): void {
  const envPath = path.join(process.cwd(), ".claude", ".mcp.env");

  if (!fs.existsSync(envPath)) {
    console.warn(`Warning: ${envPath} not found`);
    return;
  }

  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmedLine = line.trim();
    // Skip comments and empty lines
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const [key, ...valueParts] = trimmedLine.split("=");
    const value = valueParts.join("=");
    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Load credentials from .claude/.mcp.env
loadMcpEnv();

const JIRA_BASE_URL = process.env.JIRA_URL || "https://tools.hmcts.net/jira";
const JIRA_TOKEN = process.env.JIRA_PERSONAL_TOKEN;

if (!JIRA_TOKEN) {
  console.error("Error: JIRA authentication not configured. Ensure JIRA_PERSONAL_TOKEN is set in .claude/.mcp.env");
  process.exit(1);
}

/**
 * Get authorization header for JIRA API
 */
function getAuthHeader(): string {
  return `Bearer ${JIRA_TOKEN}`;
}

/**
 * Search for JIRA issues using JQL
 */
const DEFAULT_FIELDS = [
  "summary",
  "status",
  "description",
  "assignee",
  "created",
  "updated",
  "labels",
  "issuetype",
  "priority",
  "attachment",
  "customfield_10004", // Story Points
  "customfield_10008" // Epic Link
];

export async function searchIssues(
  jql: string,
  fields: string[] = DEFAULT_FIELDS,
  maxResults = 100,
  startAt = 0
): Promise<{ issues: JiraIssue[]; total: number }> {
  const url = new URL(`${JIRA_BASE_URL}/rest/api/2/search`);
  url.searchParams.set("jql", jql);
  url.searchParams.set("fields", fields.join(","));
  url.searchParams.set("maxResults", maxResults.toString());
  url.searchParams.set("startAt", startAt.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to search JIRA issues: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return {
    issues: data.issues,
    total: data.total
  };
}

/**
 * Get all issues matching JQL query (handles pagination)
 */
export async function getAllIssues(jql: string): Promise<JiraIssue[]> {
  const allIssues: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 100;

  while (true) {
    const { issues, total } = await searchIssues(jql, undefined, maxResults, startAt);
    allIssues.push(...issues);

    console.log(`Fetched ${allIssues.length} of ${total} issues from JIRA...`);

    if (allIssues.length >= total) {
      break;
    }

    startAt += maxResults;
  }

  return allIssues;
}

/**
 * Get a specific JIRA issue by key
 */
export async function getIssue(issueKey: string): Promise<JiraIssue> {
  const url = `${JIRA_BASE_URL}/rest/api/2/issue/${issueKey}`;

  const response = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JIRA issue ${issueKey}: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Download an attachment from JIRA
 */
export async function downloadAttachment(attachmentUrl: string, outputPath: string): Promise<void> {
  const response = await fetch(attachmentUrl, {
    headers: {
      Authorization: getAuthHeader()
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, Buffer.from(buffer));
}

/**
 * Download all attachments for an issue
 */
export async function downloadIssueAttachments(issue: JiraIssue, targetDir: string): Promise<string[]> {
  const downloadedFiles: string[] = [];

  if (!issue.fields.attachment || issue.fields.attachment.length === 0) {
    return downloadedFiles;
  }

  for (const attachment of issue.fields.attachment) {
    const outputPath = path.join(targetDir, attachment.filename);
    console.log(`  Downloading attachment: ${attachment.filename}...`);

    try {
      await downloadAttachment(attachment.content, outputPath);
      downloadedFiles.push(outputPath);
    } catch (error) {
      console.error(`  Failed to download ${attachment.filename}:`, error);
    }
  }

  return downloadedFiles;
}
