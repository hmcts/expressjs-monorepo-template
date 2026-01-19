export interface JiraAttachment {
  id: string;
  filename: string;
  content: string;
  mimeType: string;
  size: number;
  created: string;
}

export interface JiraIssue {
  key: string;
  id: string;
  self: string;
  fields: {
    summary: string;
    description: string;
    status: {
      name: string;
      category: string;
    };
    assignee: {
      displayName: string;
    } | null;
    issuetype: {
      name: string;
      subtask: boolean;
    };
    priority: string;
    created: string;
    updated: string;
    labels: string[];
    attachment: JiraAttachment[];
    customfield_10004?: number; // Story Points
    customfield_10008?: string; // Epic Link (key like "VIBE-338")
  };
}

export interface GitHubIssue {
  number: number;
  url: string;
  htmlUrl: string;
}

export interface MigrationResult {
  jiraKey: string;
  jiraUrl: string;
  githubIssue: GitHubIssue | null;
  success: boolean;
  error?: string;
  attachmentsUploaded: number;
  updated: boolean; // true if updated existing issue, false if created new
  isEpic: boolean;
  linkedToEpic?: string; // Parent epic JIRA key if linked
  sizeSet?: string; // Size value if set (XS, S, M, L, XL)
}

export interface MigrationReport {
  startedAt: string;
  completedAt: string;
  totalIssues: number;
  successfulMigrations: number;
  failedMigrations: number;
  createdCount: number;
  updatedCount: number;
  epicsCreated: number;
  childrenLinked: number;
  orphansCreated: number;
  results: MigrationResult[];
}
