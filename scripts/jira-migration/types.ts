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
    issueType: {
      name: string;
      subtask: boolean;
    };
    priority: string;
    created: string;
    updated: string;
    labels: string[];
    attachment: JiraAttachment[];
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
}

export interface MigrationReport {
  startedAt: string;
  completedAt: string;
  totalIssues: number;
  successfulMigrations: number;
  failedMigrations: number;
  createdCount: number;
  updatedCount: number;
  results: MigrationResult[];
}
