import {describe, expect, jest, test} from '@jest/globals';
import type {FastMCP} from 'fastmcp';

import registerResources from '../resources/index.js';
import javaTemplatesResource, {JAVA_TEMPLATE_URI} from '../resources/java/template.js';

type RegisteredResource = {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  load: () => Promise<{text: string}>;
};

function registerJavaTemplateResource(): RegisteredResource {
  const addResource = jest.fn();
  const server = {addResource} as unknown as FastMCP;
  javaTemplatesResource(server);
  expect(addResource).toHaveBeenCalledTimes(1);
  return addResource.mock.calls[0]?.[0] as RegisteredResource;
}

describe('javaTemplatesResource', () => {
  test('registers generate://code-with-locators with By locators guidance and priority lists', () => {
    const resource = registerJavaTemplateResource();

    expect(resource.uri).toBe('generate://code-with-locators');
    expect(resource.uri).toBe(JAVA_TEMPLATE_URI);
    expect(resource.name).toBe('Generate Code With Locators');
    expect(resource.mimeType).toBe('text/plain');

    expect(resource.description).toMatch(/By locators/i);
    expect(resource.description).toMatch(/avoid PageFactory/i);
    expect(resource.description).toMatch(/W3C Actions API/i);
    expect(resource.description).toContain("'-ios predicate string'");
    expect(resource.description).toContain("'-ios class chain'");
    expect(resource.description).toContain("'-android uiautomator'");
    expect(resource.description).not.toMatch(/\bpriorty\b/i);
    expect(resource.description).not.toMatch(/Dont not/);
  });

  test('loads a Java Page Object template using By locators without PageFactory or Thread.sleep', async () => {
    const resource = registerJavaTemplateResource();
    const loaded = await resource.load();

    expect(Object.keys(loaded)).toEqual(['text']);
    const code = loaded.text;

    // Must not use PageFactory, FindBy annotations, CacheLookup, or fixed sleeps
    expect(code).not.toMatch(/\bPageFactory\b/);
    expect(code).not.toContain('AppiumFieldDecorator');
    expect(code).not.toContain('@AndroidFindBy');
    expect(code).not.toContain('@iOSXCUITFindBy');
    expect(code).not.toContain('@CacheLookup');
    expect(code).not.toContain('Thread.sleep');
    expect(code).not.toContain('class locators');

    // Uses standard By / AppiumBy locators across Android, iOS, and multi-language fallbacks
    expect(code).toContain('import io.appium.java_client.AppiumBy;');
    expect(code).toContain('import org.openqa.selenium.By;');
    expect(code).toContain('AppiumBy.accessibilityId(');
    expect(code).toContain('By.id(');
    expect(code).toContain('AppiumBy.androidUIAutomator(');
    expect(code).toContain('AppiumBy.iOSNsPredicateString(');
    expect(code).toContain('AppiumBy.iOSClassChain(');
    expect(code).toContain('private final By[]');

    // Dynamic fresh lookup helpers, guardrails, and explicit waits
    expect(code).toContain('new WebDriverWait(driver, timeout)');
    expect(code).toContain('protected boolean isAndroid()');
    expect(code).toContain('findElement(By locator)');
    expect(code).toContain('findClickableElement(By locator)');
    expect(code).toContain('findElements(By locator)');
    expect(code).toContain('findElementByLocators(By... locators)');
    expect(code).toContain('IllegalArgumentException');
    expect(code).toContain('catch (StaleElementReferenceException ignored)');
    expect(code).toContain('catch (TimeoutException e)');
    expect(code).toContain('throw new NoSuchElementException(');
    expect(code).toContain('public WebElement getUsernameField()');
    expect(code).toContain('public WebElement getPasswordField()');
    expect(code).toContain('public WebElement getProceedButton()');

    // Retains W3C Actions API gesture example
    expect(code).toContain('PointerInput.Kind.TOUCH');
    expect(code).toContain('new Sequence(finger, 1)');
    expect(code).toContain('driver.perform(Collections.singletonList(swipe));');

    // Every imported simple class name is referenced in the class body (no dead imports)
    const bodyStart = code.indexOf('public class LoginPage');
    expect(bodyStart).toBeGreaterThan(0);
    const classBody = code.slice(bodyStart);
    const importMatches = [...code.matchAll(/^import\s+[\w.]+\.([A-Za-z_]\w*);$/gm)];
    expect(importMatches.length).toBeGreaterThan(0);
    for (const match of importMatches) {
      const simpleName = match[1];
      expect(classBody).toMatch(new RegExp(`\\b${simpleName}\\b`));
    }

    // Basic structural balance check for the Java template
    const openBraces = (code.match(/\{/g) ?? []).length;
    const closeBraces = (code.match(/\}/g) ?? []).length;
    expect(openBraces).toBe(closeBraces);
    expect(openBraces).toBeGreaterThan(10);
  });

  test('is registered through registerResources and exposes loadable By locators template', async () => {
    const resources: RegisteredResource[] = [];
    const server = {
      addResource: jest.fn((resource: RegisteredResource) => {
        resources.push(resource);
      }),
    } as unknown as FastMCP;

    registerResources(server);

    const javaResource = resources.find((resource) => resource.uri === JAVA_TEMPLATE_URI);
    expect(javaResource).toBeDefined();
    if (!javaResource) {
      throw new Error(`Expected ${JAVA_TEMPLATE_URI} resource to be registered`);
    }
    expect(javaResource.name).toBe('Generate Code With Locators');

    const loaded = await javaResource.load();
    expect(loaded.text).toContain('public class LoginPage');
    expect(loaded.text).not.toMatch(/\bPageFactory\b/);
  });
});
