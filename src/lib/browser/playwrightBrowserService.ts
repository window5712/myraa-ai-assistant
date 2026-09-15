/**
 * Alya AI Assistant — Persistent Playwright Browser Service
 *
 * Provides a robust, persistent Chromium browser runtime engine for Alya's personal browser.
 * Handles direct Playwright page navigation, JavaScript execution, cookies, session persistence,
 * dynamic SPA rendering, YouTube playback, interactive coordinate clicks, tab management,
 * and granular diagnostic error classification.
 */

import { chromium, Browser, BrowserContext, Page } from "playwright";

export type DiagnosticErrorCategory =
  | "BROWSER_NAVIGATION_ERROR"
  | "PROXY_ERROR"
  | "NETWORK_ERROR"
  | "DNS_ERROR"
  | "PAGE_LOAD_ERROR"
  | "BROWSER_DISCONNECTED";

export interface LogItem {
  id: string;
  timestamp: string;
  text: string;
  type: "info" | "success" | "error" | "action" | "warn";
  category?: DiagnosticErrorCategory;
}

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  isLoading: boolean;
  history: string[];
  currentIndex: number;
}

export interface BrowserStatus {
  connected: boolean;
  browserActive: boolean;
  lastAction: string;
  currentUrl: string;
  activeTabId: string;
  tabs: TabInfo[];
  logs: LogItem[];
  lastErrorCategory: DiagnosticErrorCategory | null;
  lastErrorMessage: string | null;
}

class PlaywrightBrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<string, Page> = new Map();
  private tabHistory: Map<string, { history: string[]; currentIndex: number }> = new Map();
  private activeTabId: string = "";
  private lastActionStatus: string = "Standing by for navigation...";
  private logsList: LogItem[] = [];
  private isLaunching: boolean = false;
  private lastErrorCategory: DiagnosticErrorCategory | null = null;
  private lastErrorMessage: string | null = null;

  constructor() {
    this.logAndBroadcast("Initializing persistent Playwright browser engine...", "info");
  }

  public logAndBroadcast(
    message: string,
    type: "info" | "success" | "error" | "action" | "warn" = "info",
    category?: DiagnosticErrorCategory
  ) {
    const timestamp = new Date().toLocaleTimeString();
    const formattedLog: LogItem = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp,
      text: `[${timestamp}] ${message}`,
      type,
      category,
    };
    console.log(`[PlaywrightEngine][${type.toUpperCase()}] ${message}`);
    this.logsList.push(formattedLog);
    if (this.logsList.length > 100) this.logsList.shift();
    this.lastActionStatus = message;

    if (type === "error" && category) {
      this.lastErrorCategory = category;
      this.lastErrorMessage = message;
    }
  }

  /**
   * Ensures a persistent Chromium browser and active context exist.
   */
  public async ensureBrowser(): Promise<{ context: BrowserContext; page: Page; tabId: string }> {
    if (this.isLaunching) {
      let attempts = 0;
      while (this.isLaunching && attempts < 30) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        attempts++;
      }
    }

    if (!this.browser || !this.browser.isConnected()) {
      this.isLaunching = true;
      try {
        this.logAndBroadcast("[BROWSER_LAUNCH] Launching persistent Chromium browser engine...", "info");
        this.browser = await chromium.launch({
          headless: false, // Headed so user can see or interact if desktop window is visible
          args: [
            "--start-maximized",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
          ],
        });

        this.browser.on("disconnected", () => {
          this.logAndBroadcast(
            "[BROWSER_DISCONNECTED] Chromium engine disconnected or process terminated.",
            "error",
            "BROWSER_DISCONNECTED"
          );
          this.browser = null;
          this.context = null;
          this.pages.clear();
          this.tabHistory.clear();
          this.activeTabId = "";
        });

        this.logAndBroadcast("[CONTEXT_CREATED] Spawning persistent browser context with session storage...", "info");
        this.context = await this.browser.newContext({
          viewport: { width: 1280, height: 800 },
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        });

        // Setup page creation listener
        const initialPage = await this.context.newPage();
        const tabId = "tab-" + Math.random().toString(36).substring(2, 8);
        this.pages.set(tabId, initialPage);
        this.tabHistory.set(tabId, { history: ["about:blank"], currentIndex: 0 });
        this.activeTabId = tabId;

        this.setupPageListeners(initialPage, tabId);
        this.logAndBroadcast(`[PAGE_CREATED] Initial tab created successfully (ID: ${tabId}).`, "success");
      } catch (err: any) {
        this.logAndBroadcast(
          `[BROWSER_LAUNCH_FAILED] Could not launch Playwright engine: ${err.message}`,
          "error",
          "BROWSER_DISCONNECTED"
        );
        throw err;
      } finally {
        this.isLaunching = false;
      }
    }

    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
    }

    let activePage = this.pages.get(this.activeTabId);
    if (!activePage || activePage.isClosed()) {
      const tabId = "tab-" + Math.random().toString(36).substring(2, 8);
      this.logAndBroadcast(`[PAGE_CREATED] Spawning new browser tab (ID: ${tabId})...`, "info");
      activePage = await this.context.newPage();
      this.pages.set(tabId, activePage);
      this.tabHistory.set(tabId, { history: ["about:blank"], currentIndex: 0 });
      this.activeTabId = tabId;
      this.setupPageListeners(activePage, tabId);
    }

    return { context: this.context, page: activePage, tabId: this.activeTabId };
  }

  private setupPageListeners(page: Page, tabId: string) {
    page.on("pageerror", (err) => {
      this.logAndBroadcast(
        `[PAGE_LOAD_ERROR] Uncaught JS exception in tab ${tabId}: ${err.message}`,
        "warn",
        "PAGE_LOAD_ERROR"
      );
    });

    page.on("crash", () => {
      this.logAndBroadcast(
        `[PAGE_LOAD_ERROR] Tab ${tabId} crashed unexpectedly.`,
        "error",
        "PAGE_LOAD_ERROR"
      );
    });

    page.on("close", () => {
      this.pages.delete(tabId);
      this.tabHistory.delete(tabId);
      if (this.activeTabId === tabId) {
        const remaining = Array.from(this.pages.keys());
        this.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : "";
      }
    });
  }

  /**
   * Resolves URL queries ("open YouTube", "google.com", "github") into proper HTTPS URLs.
   */
  public resolveUrl(inputUrl: string): string {
    let dest = (inputUrl || "").trim();
    if (!dest || dest === "about:blank") return "about:blank";

    const lower = dest.toLowerCase();

    // Contextual shortcuts
    if (lower === "youtube" || lower.includes("open youtube") || lower === "youtube.com") {
      return "https://www.youtube.com";
    }
    if (lower === "google" || lower.includes("open google") || lower === "google.com") {
      return "https://www.google.com";
    }
    if (lower === "github" || lower.includes("open github") || lower === "github.com") {
      return "https://github.com";
    }
    if (lower === "wikipedia" || lower === "wikipedia.org") {
      return "https://www.wikipedia.org";
    }

    // Direct domain detection
    const isDomain = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?(\?.*)?(#.*)?$/i.test(dest);
    if (isDomain) {
      if (!dest.startsWith("http://") && !dest.startsWith("https://")) {
        return "https://" + dest;
      }
      return dest;
    }

    // If string starts with http:// or https://
    if (dest.startsWith("http://") || dest.startsWith("https://")) {
      return dest;
    }

    // Default search query fallthrough
    return `https://www.google.com/search?q=${encodeURIComponent(dest)}`;
  }

  /**
   * Categorizes network/Playwright navigation errors empirical error analysis.
   */
  private classifyNavigationError(err: any): DiagnosticErrorCategory {
    const msg = (err.message || "").toLowerCase();
    if (msg.includes("err_name_not_resolved") || msg.includes("enotfound")) {
      return "DNS_ERROR";
    }
    if (msg.includes("err_connection_refused") || msg.includes("err_internet_disconnected") || msg.includes("econnrefused")) {
      return "NETWORK_ERROR";
    }
    if (msg.includes("err_cert_") || msg.includes("cert_")) {
      return "NETWORK_ERROR";
    }
    if (msg.includes("target closed") || msg.includes("browser closed") || msg.includes("has been closed")) {
      return "BROWSER_DISCONNECTED";
    }
    if (msg.includes("timeout")) {
      return "BROWSER_NAVIGATION_ERROR";
    }
    return "BROWSER_NAVIGATION_ERROR";
  }

  /**
   * Directly navigates Playwright browser page to target location.
   */
  public async navigate(inputUrl: string, targetTabId?: string): Promise<{ success: boolean; url: string; title: string; error?: string; category?: DiagnosticErrorCategory }> {
    const targetUrl = this.resolveUrl(inputUrl);
    this.logAndBroadcast(`[NAVIGATE_START] Direct Playwright navigation requested for: "${inputUrl}" -> ${targetUrl}`, "action");

    try {
      const { page, tabId } = await this.ensureBrowser();
      const activeTab = targetTabId && this.pages.has(targetTabId) ? this.pages.get(targetTabId)! : page;
      const currentTabId = targetTabId || tabId;

      if (targetUrl === "about:blank") {
        await activeTab.goto("about:blank");
        this.updateHistory(currentTabId, "about:blank");
        return { success: true, url: "about:blank", title: "Start Page" };
      }

      const startTime = Date.now();
      let response = null;

      try {
        response = await activeTab.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: 25000,
        });
      } catch (navErr: any) {
        // Retry safely once on network/timeout issue
        this.logAndBroadcast(`[NAVIGATE_RETRY] Initial load attempt failed (${navErr.message}). Retrying safely...`, "warn");
        try {
          response = await activeTab.goto(targetUrl, { waitUntil: "commit", timeout: 20000 });
        } catch (retryErr: any) {
          const category = this.classifyNavigationError(retryErr);
          const errMsg = `Playwright navigation failure to ${targetUrl}: ${retryErr.message}`;
          this.logAndBroadcast(errMsg, "error", category);
          return { success: false, url: targetUrl, title: "Navigation Failed", error: errMsg, category };
        }
      }

      const loadDuration = Date.now() - startTime;
      const statusCode = response ? response.status() : 200;
      const pageTitle = await activeTab.title().catch(() => targetUrl);

      this.logAndBroadcast(`[RESPONSE_STATUS] HTTP ${statusCode} | Loaded in ${loadDuration}ms`, "info");

      // Auto dismiss YouTube cookie consent if visible
      if (targetUrl.includes("youtube.com")) {
        try {
          const consentBtn = activeTab.locator('button:has-text("Reject all"), button:has-text("Accept all"), button:has-text("I agree")').first();
          if (await consentBtn.isVisible({ timeout: 1500 })) {
            this.logAndBroadcast("Dismissed YouTube cookie consent popup automatically.", "info");
            await consentBtn.click();
          }
        } catch (e) {}
      }

      this.updateHistory(currentTabId, targetUrl);
      this.logAndBroadcast(`[PAGE_LOADED] Successfully loaded: ${targetUrl} ("${pageTitle}")`, "success");

      return {
        success: true,
        url: activeTab.url(),
        title: pageTitle,
      };
    } catch (err: any) {
      const category = this.classifyNavigationError(err);
      const errMsg = `Direct browser navigation exception: ${err.message}`;
      this.logAndBroadcast(errMsg, "error", category);
      return { success: false, url: targetUrl, title: "Error", error: errMsg, category };
    }
  }

  private updateHistory(tabId: string, url: string) {
    const current = this.tabHistory.get(tabId) || { history: [], currentIndex: -1 };
    const nextHistory = current.history.slice(0, current.currentIndex + 1);
    nextHistory.push(url);
    this.tabHistory.set(tabId, {
      history: nextHistory,
      currentIndex: nextHistory.length - 1,
    });
  }

  /**
   * Executes actions directly on active Playwright page.
   */
  public async executeAction(type: string, args: any = {}): Promise<any> {
    const { page, tabId } = await this.ensureBrowser();
    this.logAndBroadcast(`Executing Playwright directive: ${type}`, "action");

    try {
      switch (type) {
        case "browserOpen": {
          return await this.navigate(args.url || "https://google.com");
        }

        case "browserSearch": {
          const query = args.query;
          if (!query) throw new Error("Missing search query string.");

          this.logAndBroadcast(`Searching Playwright page for term: "${query}"`, "info");
          const currentUrl = page.url().toLowerCase();

          if (currentUrl.includes("youtube.com")) {
            const ytInput = page.locator('input[id="search"], input[name="search_query"]').first();
            await ytInput.waitFor({ state: "visible", timeout: 5000 });
            await ytInput.fill(query);
            await ytInput.press("Enter");
          } else if (currentUrl.includes("google.com")) {
            const googleInput = page.locator('textarea[name="q"], input[name="q"]').first();
            await googleInput.waitFor({ state: "visible", timeout: 5000 });
            await googleInput.fill(query);
            await googleInput.press("Enter");
          } else {
            const generalInput = page.locator('input[type="text"], input[type="search"]').first();
            await generalInput.fill(query);
            await generalInput.press("Enter");
          }

          this.logAndBroadcast(`Search query submitted: "${query}"`, "success");
          return { result: `Submitted query "${query}" on active browser page.` };
        }

        case "browserClick": {
          const { selector, x, y } = args;

          // Support coordinate clicks directly from frontend image viewport overlay!
          if (x !== undefined && y !== undefined) {
            this.logAndBroadcast(`Executing viewport coordinate click at (${x}, ${y})`, "info");
            await page.mouse.click(x, y);
            this.logAndBroadcast(`Clicked at position (${x}, ${y})`, "success");
            return { result: `Clicked viewport coordinates (${x}, ${y}) successfully.` };
          }

          if (!selector) throw new Error("Selector or coordinates required for click.");

          if (selector.startsWith("video-")) {
            const videoId = selector.replace("video-", "");
            const directUrl = `https://www.youtube.com/watch?v=${videoId}`;
            this.logAndBroadcast(`Navigating straight to YouTube stream: ${directUrl}`, "info");
            return await this.navigate(directUrl);
          }

          let clicked = false;
          if (page.url().includes("youtube.com")) {
            if (selector === "play-button") {
              await page.evaluate(() => { (document.querySelector("video") as any)?.play(); });
              clicked = true;
            } else if (selector === "pause-button") {
              await page.evaluate(() => { (document.querySelector("video") as any)?.pause(); });
              clicked = true;
            } else {
              const firstResult = page.locator("ytd-video-renderer a#video-title, ytd-rich-grid-media a#video-title").first();
              if (await firstResult.isVisible({ timeout: 2000 })) {
                await firstResult.click();
                clicked = true;
              }
            }
          }

          if (!clicked) {
            const textLocator = page.locator(`text="${selector}"`).first();
            if (await textLocator.isVisible({ timeout: 1500 })) {
              await textLocator.click();
            } else {
              await page.click(selector, { timeout: 4000 });
            }
          }

          this.logAndBroadcast(`Successfully clicked target: ${selector}`, "success");
          return { result: `Click completed on ${selector}` };
        }

        case "browserMediaControl": {
          const action = args.action;
          const val = args.value;
          this.logAndBroadcast(`Media directive: ${action}`, "info");

          if (action === "play") {
            await page.evaluate(() => { (document.querySelector("video") as any)?.play(); });
          } else if (action === "pause") {
            await page.evaluate(() => { (document.querySelector("video") as any)?.pause(); });
          } else if (action === "volume") {
            const percent = val || 75;
            await page.evaluate((pct) => {
              const v = document.querySelector("video") as any;
              if (v) v.volume = pct / 100;
            }, percent);
          } else if (action === "mute") {
            await page.evaluate(() => {
              const v = document.querySelector("video") as any;
              if (v) v.muted = true;
            });
          } else if (action === "unmute") {
            await page.evaluate(() => {
              const v = document.querySelector("video") as any;
              if (v) v.muted = false;
            });
          } else if (action === "skip") {
            await page.evaluate(() => {
              const v = document.querySelector("video") as any;
              if (v) v.currentTime += 30;
            });
          }

          this.logAndBroadcast(`Media action completed: ${action}`, "success");
          return { result: `Media action '${action}' completed.` };
        }

        case "browserScroll": {
          const direction = args.direction || "down";
          const distance = args.amount || 400;
          const delta = direction === "down" ? distance : -distance;

          await page.evaluate((yOffset) => {
            window.scrollBy({ top: yOffset, behavior: "smooth" });
          }, delta);

          this.logAndBroadcast(`Scrolled viewport ${direction} by ${distance}px`, "success");
          return { result: `Scrolled page ${direction} ${distance}px.` };
        }

        case "browserType": {
          const text = args.text;
          if (!text) throw new Error("Missing text to type.");
          await page.keyboard.type(text);
          this.logAndBroadcast(`Typed text into active element.`, "success");
          return { result: `Typed "${text}" successfully.` };
        }

        case "browserGoBack": {
          await page.goBack().catch(() => {});
          this.logAndBroadcast("Returned to previous browser history page.", "success");
          return { result: "Navigated back." };
        }

        case "browserTabAction": {
          const subAct = args.action;
          if (subAct === "new") {
            const startUrl = args.url || "https://google.com";
            const newTabId = "tab-" + Math.random().toString(36).substring(2, 8);
            const newPage = await this.context!.newPage();
            this.pages.set(newTabId, newPage);
            this.tabHistory.set(newTabId, { history: [startUrl], currentIndex: 0 });
            this.activeTabId = newTabId;
            this.setupPageListeners(newPage, newTabId);
            await newPage.goto(startUrl);
            return { result: `Opened new tab: ${startUrl}`, tabId: newTabId };
          } else if (subAct === "close") {
            await page.close();
            return { result: "Closed active tab." };
          } else if (subAct === "switch") {
            const targetId = args.tabId;
            if (targetId && this.pages.has(targetId)) {
              this.activeTabId = targetId;
              return { result: `Switched to tab ${targetId}` };
            }
          }
          return { result: `Tab action ${subAct} completed.` };
        }

        case "browserReadPage": {
          const title = await page.title();
          const url = page.url();
          const textContent = await page.evaluate(() => {
            return document.body?.innerText?.replace(/\s+/g, " ").trim().substring(0, 3000) || "";
          });
          const headings = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("h1, h2, h3"))
              .map((h) => h.textContent?.trim() || "")
              .filter((t) => t.length > 2)
              .slice(0, 10);
          });

          this.logAndBroadcast(`Read text content from page: "${title}"`, "success");
          return {
            result: {
              url,
              title,
              headings,
              textSummary: textContent,
            },
          };
        }

        default:
          throw new Error(`Unrecognized Playwright action directive: ${type}`);
      }
    } catch (err: any) {
      const category = this.classifyNavigationError(err);
      this.logAndBroadcast(`Action ${type} error: ${err.message}`, "error", category);
      throw err;
    }
  }

  /**
   * Captures current active page screenshot buffer as JPEG/PNG or base64.
   */
  public async getPageScreenshot(tabId?: string): Promise<{ buffer: Buffer; mimeType: string; url: string; title: string }> {
    const { page } = await this.ensureBrowser();
    const targetPage = tabId && this.pages.has(tabId) ? this.pages.get(tabId)! : page;

    try {
      const buffer = await targetPage.screenshot({
        type: "jpeg",
        quality: 75,
        fullPage: false,
      });
      const title = await targetPage.title().catch(() => targetPage.url());

      return {
        buffer,
        mimeType: "image/jpeg",
        url: targetPage.url(),
        title,
      };
    } catch (err: any) {
      // Fallback empty transparent pixel if page screenshot fails
      const fallbackPixel = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );
      return {
        buffer: fallbackPixel,
        mimeType: "image/png",
        url: targetPage.url(),
        title: "Page Frame Unavailable",
      };
    }
  }

  /**
   * Retrieves overall browser status and diagnostic metrics.
   */
  public async getStatus(): Promise<BrowserStatus> {
    const connected = !!this.browser && this.browser.isConnected();
    let currentUrl = "about:blank";
    const tabsInfo: TabInfo[] = [];

    for (const [id, p] of this.pages.entries()) {
      const url = p.url();
      let title = url;
      try {
        title = await p.title();
      } catch (e) {}

      const hist = this.tabHistory.get(id) || { history: [url], currentIndex: 0 };
      tabsInfo.push({
        id,
        url,
        title: title || url,
        isLoading: false,
        history: hist.history,
        currentIndex: hist.currentIndex,
      });

      if (id === this.activeTabId) {
        currentUrl = url;
      }
    }

    return {
      connected,
      browserActive: connected,
      lastAction: this.lastActionStatus,
      currentUrl,
      activeTabId: this.activeTabId,
      tabs: tabsInfo,
      logs: [...this.logsList],
      lastErrorCategory: this.lastErrorCategory,
      lastErrorMessage: this.lastErrorMessage,
    };
  }
}

export const playwrightBrowserService = new PlaywrightBrowserService();
