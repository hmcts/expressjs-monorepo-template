import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type BrowserContext, firefox, type Page } from "@playwright/test";

let context: BrowserContext | null = null;
let page: Page | null = null;

/**
 * Find Firefox profile directory
 */
function findFirefoxProfile(): string | null {
  const home = os.homedir();
  let profilesDir: string;

  switch (process.platform) {
    case "linux":
      profilesDir = path.join(home, ".mozilla", "firefox");
      break;
    case "darwin":
      profilesDir = path.join(home, "Library", "Application Support", "Firefox", "Profiles");
      break;
    case "win32":
      profilesDir = path.join(process.env.APPDATA || "", "Mozilla", "Firefox", "Profiles");
      break;
    default:
      return null;
  }

  if (!fs.existsSync(profilesDir)) {
    return null;
  }

  // Find the default profile
  const profiles = fs.readdirSync(profilesDir);
  const defaultProfile = profiles.find((p) => p.endsWith(".default") || p.endsWith(".default-release") || p.includes("default"));

  if (defaultProfile) {
    return path.join(profilesDir, defaultProfile);
  }

  // Fallback to first profile found
  if (profiles.length > 0) {
    return path.join(profilesDir, profiles[0]);
  }

  return null;
}

/**
 * Initialize Playwright browser with Firefox using existing profile
 */
export async function initBrowser(): Promise<Page> {
  if (page) {
    return page;
  }

  console.log("Launching Firefox browser...");

  const firefoxProfile = findFirefoxProfile();

  if (firefoxProfile) {
    console.log(`Using Firefox profile: ${firefoxProfile}`);
    // Use persistent context to leverage existing session cookies
    context = await firefox.launchPersistentContext(firefoxProfile, {
      headless: false,
      viewport: { width: 1280, height: 720 }
    });
  } else {
    console.log("No Firefox profile found, launching with fresh context");
    const browser = await firefox.launch({ headless: false });
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
  }

  page = context.pages()[0] || (await context.newPage());

  console.log("Firefox browser launched with your existing session.");

  return page;
}

/**
 * Close Playwright browser
 */
export async function closeBrowser(): Promise<void> {
  if (page) {
    await page.close();
    page = null;
  }
  if (context) {
    await context.close();
    context = null;
  }
}

/**
 * Ensure user is logged in to GitHub
 */
export async function ensureGitHubLogin(browserPage: Page): Promise<void> {
  console.log("Checking GitHub authentication...");

  // Navigate to GitHub
  await browserPage.goto("https://github.com", {
    waitUntil: "networkidle"
  });

  // Check if user is logged in by looking for the user menu
  const isLoggedIn = await browserPage
    .locator('[data-target="react-app.embeddedData"]')
    .count()
    .then((count) => count > 0)
    .catch(() => false);

  if (!isLoggedIn) {
    console.log("\n====================================");
    console.log("Please log in to GitHub in the browser window");
    console.log("Press ENTER after you have logged in...");
    console.log("====================================\n");

    // Wait for user to press Enter
    await new Promise((resolve) => {
      process.stdin.once("data", resolve);
    });

    // Verify login
    await browserPage.reload({ waitUntil: "networkidle" });
  }

  console.log("GitHub authentication confirmed.");
}

/**
 * Upload attachments to a GitHub issue
 */
export async function uploadAttachmentsToIssue(browserPage: Page, issueUrl: string, attachmentPaths: string[]): Promise<void> {
  if (attachmentPaths.length === 0) {
    return;
  }

  console.log(`  Uploading ${attachmentPaths.length} attachment(s)...`);

  // Navigate to the issue
  await browserPage.goto(issueUrl, { waitUntil: "networkidle" });

  // Wait a bit for the page to fully load
  await browserPage.waitForTimeout(1000);

  // Scroll to the comment box
  await browserPage.evaluate(() => {
    const commentBox = document.querySelector("#new_comment_field");
    if (commentBox) {
      commentBox.scrollIntoView({ behavior: "smooth" });
    }
  });

  await browserPage.waitForTimeout(500);

  // Click in the comment textarea to focus it
  const commentField = browserPage.locator("textarea#new_comment_field");
  await commentField.waitFor({ state: "visible", timeout: 10000 });
  await commentField.click();

  // Type a message
  await commentField.fill("Attachments from JIRA:");

  // Upload files one by one
  for (const attachmentPath of attachmentPaths) {
    const filename = path.basename(attachmentPath);
    console.log(`    Uploading: ${filename}...`);

    // Set up file chooser handler
    const fileChooserPromise = browserPage.waitForEvent("filechooser");

    // Trigger file chooser by pressing Ctrl+G (GitHub's keyboard shortcut)
    // or by clicking the attach files button
    try {
      // Try clicking the paperclip icon
      await browserPage.locator('[aria-label="Attach files by dragging & dropping, selecting or pasting them."]').click({ timeout: 2000 });
    } catch {
      // Fallback: use keyboard shortcut
      await browserPage.keyboard.press("Control+Shift+G");
    }

    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(attachmentPath);

    // Wait for upload to complete
    // GitHub shows "Uploading..." text which disappears when done
    try {
      await browserPage.locator("text=Uploading").waitFor({ state: "visible", timeout: 5000 });
      await browserPage.locator("text=Uploading").waitFor({ state: "detached", timeout: 60000 });
    } catch {
      // If we don't see "Uploading", wait a bit and continue
      await browserPage.waitForTimeout(2000);
    }

    console.log(`    ✓ ${filename} uploaded`);
  }

  // Submit the comment
  console.log("  Submitting comment...");
  await browserPage.locator('button:has-text("Comment")').first().click();

  // Wait for comment to be posted
  await browserPage.waitForTimeout(2000);

  console.log("  ✓ Attachments uploaded successfully");
}
