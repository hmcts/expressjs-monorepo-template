/**
 * Convert JIRA wiki markup to GitHub-flavored Markdown
 */
export function convertJiraToMarkdown(jiraText: string): string {
  if (!jiraText) {
    return "";
  }

  let text = jiraText;

  // Headings: h1. -> #, h2. -> ##, etc.
  text = text.replace(/^h1\.\s+(.+)$/gm, "# $1");
  text = text.replace(/^h2\.\s+(.+)$/gm, "## $1");
  text = text.replace(/^h3\.\s+(.+)$/gm, "### $1");
  text = text.replace(/^h4\.\s+(.+)$/gm, "#### $1");
  text = text.replace(/^h5\.\s+(.+)$/gm, "##### $1");
  text = text.replace(/^h6\.\s+(.+)$/gm, "###### $1");

  // Bold: *text* -> **text**
  text = text.replace(/\*(\S.*?\S)\*/g, "**$1**");

  // Italic: _text_ -> *text*
  text = text.replace(/_(\S.*?\S)_/g, "*$1*");

  // Strikethrough: -text- -> ~~text~~
  text = text.replace(/-(\S.*?\S)-/g, "~~$1~~");

  // Monospace/inline code: {{text}} -> `text`
  text = text.replace(/\{\{([^}]+)\}\}/g, "`$1`");

  // Code blocks with language: {code:lang}...{code} -> ```lang...```
  text = text.replace(/\{code:([^}]+)\}([\s\S]*?)\{code\}/g, "```$1$2```");
  text = text.replace(/\{code\}([\s\S]*?)\{code\}/g, "```$1```");

  // Noformat: {noformat}...{noformat} -> ```...```
  text = text.replace(/\{noformat\}([\s\S]*?)\{noformat\}/g, "```$1```");

  // Quote blocks: {quote}...{quote} -> > ...
  text = text.replace(/\{quote\}([\s\S]*?)\{quote\}/g, (_, content) => {
    return content
      .split("\n")
      .map((line: string) => `> ${line}`)
      .join("\n");
  });

  // Links: [text|url] -> [text](url)
  text = text.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "[$1]($2)");

  // Links with just URL: [url] -> <url>
  text = text.replace(/\[([^\]|]+)\]/g, "<$1>");

  // Bullet lists: * -> -
  text = text.replace(/^\* /gm, "- ");

  // Numbered lists are the same format (1., 2., etc.)

  // Tables: || header || -> | header |
  text = text.replace(/\|\|/g, "|");

  // Color: {color:xxx}text{color} -> text (remove color markup)
  text = text.replace(/\{color:[^}]+\}(.*?)\{color\}/g, "$1");

  // Panel: {panel}...{panel} -> blockquote
  text = text.replace(/\{panel:?[^}]*\}([\s\S]*?)\{panel\}/g, (_, content) => {
    return content
      .split("\n")
      .map((line: string) => `> ${line}`)
      .join("\n");
  });

  // Images: !image.png! -> ![image.png](image.png)
  // Note: This creates a broken link, but preserves the filename
  text = text.replace(/!([^!|]+)!/g, "![$1]($1)");

  // User mentions: [~username] -> @username (GitHub won't resolve these)
  text = text.replace(/\[~([^\]]+)\]/g, "@$1");

  return text;
}
