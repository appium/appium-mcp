import type {FastMCP} from 'fastmcp';

export const JAVA_TEMPLATE_URI = 'generate://code-with-locators';

const JAVA_BY_LOCATORS_TEMPLATE = `package templates;

import io.appium.java_client.AppiumBy;
import io.appium.java_client.AppiumDriver;
import org.openqa.selenium.By;
import org.openqa.selenium.Dimension;
import org.openqa.selenium.NoSuchElementException;
import org.openqa.selenium.Point;
import org.openqa.selenium.StaleElementReferenceException;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.interactions.PointerInput;
import org.openqa.selenium.interactions.Sequence;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Page Object template using the By locators pattern with Appium.
 *
 * Locators are stored as {@link By} fields and resolved dynamically on each interaction
 * through explicit waits, avoiding cached element proxies and preventing
 * {@link StaleElementReferenceException} on dynamic mobile UIs.
 * Rename this class and replace the sample locators with the current screen's elements.
 */
public class LoginPage {

    private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(10);

    private final AppiumDriver driver;
    private final WebDriverWait wait;

    // ========== ELEMENT LOCATORS ==========

    // Cross-platform accessibility id (preferred when available on both Android and iOS)
    private final By usernameField = AppiumBy.accessibilityId("username_input");

    // Android-specific locators (id, UiAutomator)
    private final By androidPasswordField = By.id("com.example.app:id/password_input");
    private final By androidSignInButton = AppiumBy.androidUIAutomator(
            "new UiSelector().text(\\"Sign In\\")");

    // iOS-specific locators (NSPredicate, Class Chain)
    private final By iosPasswordField = AppiumBy.iOSNsPredicateString("name == 'password_input'");
    private final By iosSecondaryField = AppiumBy.iOSClassChain("**/XCUIElementTypeTextField[2]");

    // Multi-language / fallback locators (first visible match wins)
    private final By[] proceedButtonLocators = {
            AppiumBy.accessibilityId("proceed_button"),
            By.xpath("//android.widget.TextView[@text='Proceed']"),
            By.xpath("//android.widget.TextView[@text='تابع']")
    };

    // Slider element for W3C Actions gesture example
    private final By sliderElement = AppiumBy.accessibilityId("slider");

    public LoginPage(AppiumDriver driver) {
        this(driver, DEFAULT_TIMEOUT);
    }

    public LoginPage(AppiumDriver driver, Duration timeout) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, timeout);
    }

    // ========== BASE LOOKUP HELPERS ==========

    protected boolean isAndroid() {
        Object platformName = driver.getCapabilities().getCapability("platformName");
        return platformName != null && "android".equalsIgnoreCase(platformName.toString());
    }

    protected WebElement findElement(By locator) {
        return wait.until(ExpectedConditions.visibilityOfElementLocated(locator));
    }

    protected WebElement findClickableElement(By locator) {
        return wait.until(ExpectedConditions.elementToBeClickable(locator));
    }

    protected List<WebElement> findElements(By locator) {
        return wait.until(ExpectedConditions.presenceOfAllElementsLocatedBy(locator));
    }

    protected WebElement findElementByLocators(By... locators) {
        if (locators == null || locators.length == 0) {
            throw new IllegalArgumentException("At least one locator must be provided");
        }
        try {
            return wait.until(d -> {
                for (By locator : locators) {
                    if (locator == null) {
                        continue;
                    }
                    try {
                        List<WebElement> matches = d.findElements(locator);
                        if (!matches.isEmpty() && matches.get(0).isDisplayed()) {
                            return matches.get(0);
                        }
                    } catch (StaleElementReferenceException ignored) {
                        // Retry on next poll if the view hierarchy re-rendered mid-check
                    }
                }
                return null;
            });
        } catch (TimeoutException e) {
            throw new NoSuchElementException(
                    "Unable to locate element using locators: " + Arrays.toString(locators), e);
        }
    }

    // ========== FRESH ELEMENT GETTERS ==========

    public WebElement getUsernameField() {
        return findElement(usernameField);
    }

    public WebElement getPasswordField() {
        return findElement(isAndroid() ? androidPasswordField : iosPasswordField);
    }

    public WebElement getSecondaryTextField() {
        return findElement(iosSecondaryField);
    }

    public WebElement getProceedButton() {
        return findElementByLocators(proceedButtonLocators);
    }

    // ========== PAGE ACTIONS ==========

    public LoginPage enterUsername(String username) {
        WebElement field = findElement(usernameField);
        field.clear();
        field.sendKeys(username);
        return this;
    }

    public LoginPage enterPassword(String password) {
        WebElement field = getPasswordField();
        field.clear();
        field.sendKeys(password);
        return this;
    }

    public void tapProceed() {
        findElementByLocators(proceedButtonLocators).click();
    }

    // Navigation actions can return the next Page Object instance (e.g. return new HomePage(driver);)
    public void tapSignIn() {
        findClickableElement(isAndroid() ? androidSignInButton : AppiumBy.accessibilityId("sign_in_button"))
                .click();
    }

    // ========== W3C ACTIONS GESTURE EXAMPLE ==========

    public void slideToRight() {
        WebElement slider = findElement(sliderElement);
        Point location = slider.getLocation();
        Dimension size = slider.getSize();

        // Swipe right: from left side of the slider to the right side
        int startX = location.getX() + (int) (size.getWidth() * 0.1);
        int endX = location.getX() + (int) (size.getWidth() * 0.9);
        int y = location.getY() + size.getHeight() / 2;

        PointerInput finger = new PointerInput(PointerInput.Kind.TOUCH, "finger");
        Sequence swipe = new Sequence(finger, 1);

        swipe.addAction(finger.createPointerMove(Duration.ZERO, PointerInput.Origin.viewport(), startX, y));
        swipe.addAction(finger.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
        swipe.addAction(finger.createPointerMove(Duration.ofMillis(600), PointerInput.Origin.viewport(), endX, y));
        swipe.addAction(finger.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));

        driver.perform(Collections.singletonList(swipe));
    }
}
`;

/**
 * Resource for Java Page Object template using the By locators pattern
 */
export default function javaTemplatesResource(server: FastMCP): void {
  server.addResource({
    uri: JAVA_TEMPLATE_URI,
    name: 'Generate Code With Locators',
    description: `Generate Java Page Object code for the current page with locators retrieved from generate_locators tool.
    The code should be generated in the same priority order as the locators were generated.
    Always use the W3C Actions API code from the template for gestures and explicit waits instead of Thread.sleep.
    For iOS the priority order is:
      'id',
      'accessibility id',
      '-ios predicate string',
      '-ios class chain',
      'xpath',
      'class name',
    For Android the priority order is:
      'id',
      'accessibility id',
      'xpath',
      '-android uiautomator',
      'class name',
    Follow the By locators Page Object pattern (avoid PageFactory and @AndroidFindBy/@iOSXCUITFindBy annotations to prevent stale element references). Do not strictly create test cases, just generate the page object code for locators.`,
    mimeType: 'text/plain',
    async load() {
      return {
        text: JAVA_BY_LOCATORS_TEMPLATE,
      };
    },
  });
}
