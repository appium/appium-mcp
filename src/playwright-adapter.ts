/**
 * Playwright Adapter
 *
 * Bridges Playwright's Locator/ElementHandle-based API to the UUID-based
 * element model used by the existing tool infrastructure.
 */
import type {
  Browser,
  BrowserContext,
  Page,
  ElementHandle,
} from 'playwright';
import { randomUUID } from 'node:crypto';

/**
 * Wraps a Playwright Browser + BrowserContext + Page into a single object
 * that can be stored in the session store alongside Appium drivers.
 *
 * Maintains an element registry that maps generated UUIDs to Playwright
 * ElementHandles so that downstream tools can reference elements the
 * same way they do with Appium's W3C element IDs.
 */
export class PlaywrightDriver {
  readonly browser: Browser;
  readonly context: BrowserContext;
  private _page: Page;
  private readonly elements = new Map<string, ElementHandle>();

  constructor(browser: Browser, context: BrowserContext, page: Page) {
    this.browser = browser;
    this.context = context;
    this._page = page;
  }

  get page(): Page {
    return this._page;
  }

  /** Switch the active page (tab). */
  setPage(page: Page): void {
    this._page = page;
  }

  // ── Element Registry ────────────────────────────────────────────

  /** Register an ElementHandle and return a UUID for it. */
  registerElement(handle: ElementHandle): string {
    const uuid = randomUUID();
    this.elements.set(uuid, handle);
    return uuid;
  }

  /** Look up a previously registered ElementHandle by UUID. */
  getElement(uuid: string): ElementHandle | undefined {
    return this.elements.get(uuid);
  }

  /** Require an element handle or throw. */
  requireElement(uuid: string): ElementHandle {
    const el = this.elements.get(uuid);
    if (!el) {
      throw new Error(
        `Element with UUID "${uuid}" not found. It may have been removed from the DOM or the page navigated away.`
      );
    }
    return el;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  /** Clean up: close context and browser. */
  async deleteSession(): Promise<void> {
    this.elements.clear();
    await this.context.close();
    await this.browser.close();
  }

  // ── Element Operations (Appium-compatible surface) ──────────────

  async findElement(
    strategy: string,
    selector: string
  ): Promise<Record<string, string>> {
    let pwSelector: string;

    switch (strategy) {
      case 'css selector':
        pwSelector = selector;
        break;
      case 'xpath':
        pwSelector = `xpath=${selector}`;
        break;
      case 'id':
        pwSelector = `#${selector}`;
        break;
      case 'name':
        pwSelector = `[name="${selector}"]`;
        break;
      case 'class name':
        pwSelector = `.${selector}`;
        break;
      case 'tag name':
        pwSelector = selector;
        break;
      case 'text':
        pwSelector = `text=${selector}`;
        break;
      case 'accessibility id':
      case 'role':
        pwSelector = `[aria-label="${selector}"]`;
        break;
      case 'data-testid':
      case 'test id':
        pwSelector = `[data-testid="${selector}"]`;
        break;
      case 'placeholder':
        pwSelector = `[placeholder="${selector}"]`;
        break;
      default:
        // Treat unknown strategies as CSS selectors
        pwSelector = selector;
    }

    const handle = await this._page.waitForSelector(pwSelector, {
      timeout: 10000,
    });
    if (!handle) {
      throw new Error(
        `Element not found with strategy "${strategy}" and selector "${selector}"`
      );
    }

    const uuid = this.registerElement(handle);
    return { 'element-6066-11e4-a52e-4f735466cecf': uuid };
  }
}
