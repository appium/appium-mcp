# MCP Appium - MCP server for Mobile Development and Automation | iOS, Android, Simulator, Emulator, and Real Devices

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

MCP Appium is an intelligent MCP (Model Context Protocol) server designed to empower AI assistants with a robust suite of tools for mobile automation. It streamlines mobile app testing by enabling natural language interactions, intelligent locator generation, and automated test creation for both Android and iOS platforms.

## Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Installation](#️-installation)
- [Configuration](#️-configuration)
- [Available Tools](#-available-tools)
- [Client Support](#-client-support)
- [Usage Examples](#-usage-examples)
- [Contributing](#-contributing)
- [License](#-license)

## 🚀 Features

- **Cross-Platform Support**: Automate tests for both Android (UiAutomator2) and iOS (XCUITest).
- **AI-Powered Element Finding**: Locate UI elements using natural language descriptions powered by vision models - no need for complex XPath or selectors.
- **Intelligent Locator Generation**: AI-powered element identification using priority-based strategies.
- **Interactive Session Management**: Easily create and manage sessions on local mobile devices.
- **Smart Element Interactions**: Perform actions like clicks, text input, screenshots, and element finding.
- **Automated Test Generation**: Generate Java/TestNG test code from natural language descriptions.
- **Page Object Model Support**: Utilize built-in templates that follow industry best practices.
- **Flexible Configuration**: Customize capabilities and settings for different environments.
- **Multilingual Support**: Use your native language - AI handles all interactions naturally in any language (English, Spanish, Chinese, Japanese, Korean, etc.).

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

### System Requirements

- **Node.js** (v22 or higher)
- **npm** or **yarn**
- **Java Development Kit (JDK)** (8 or higher)
- **Android SDK** (for Android testing)
- **Xcode** (for iOS testing on macOS)

### Mobile Testing Setup

#### Android

1.  Install Android Studio and the Android SDK.
2.  Set the `ANDROID_HOME` environment variable.
3.  Add the Android SDK tools to your system's PATH.
4.  Enable USB debugging on your Android device.
5.  Install the Appium UiAutomator2 driver dependencies.

#### iOS (macOS only)

1.  Install Xcode from the App Store.
2.  Install the Xcode Command Line Tools: `xcode-select --install`.
3.  Install iOS simulators through Xcode.
4.  For real device testing, configure your provisioning profiles.

## 🛠️ Installation

Standard config works in most of the tools::

```json
{
  "mcpServers": {
    "appium-mcp": {
      "disabled": false,
      "timeout": 100,
      "type": "stdio",
      "command": "npx",
      "args": [
        "appium-mcp@latest"
      ],
      "env": {
        "ANDROID_HOME": "/path/to/android/sdk",
        "CAPABILITIES_CONFIG": "/path/to/your/capabilities.json"
      }
    }
  }
}
```

### In Cursor IDE

The easiest way to install MCP Appium in Cursor IDE is using the one-click install button:

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en-US/install-mcp?name=appium-mcp&config=eyJkaXNhYmxlZCI6ZmFsc2UsInRpbWVvdXQiOjEwMCwidHlwZSI6InN0ZGlvIiwiZW52Ijp7IkFORFJPSURfSE9NRSI6Ii9Vc2Vycy94eXovTGlicmFyeS9BbmRyb2lkL3NkayJ9LCJjb21tYW5kIjoibnB4IGFwcGl1bS1tY3BAbGF0ZXN0In0%3D)

This will automatically configure the MCP server in your Cursor IDE settings. Make sure to update the `ANDROID_HOME` environment variable in the configuration to match your Android SDK path.

#### Or install manually:

Go to **Cursor Settings → MCP → Add new MCP Server**. Name it to your liking, use command type with the command `npx -y appium-mcp@latest`. You can also verify config or add command arguments via clicking **Edit**.

Here is the recommended configuration:

```json
{
  "appium-mcp": {
    "disabled": false,
    "timeout": 100,
    "type": "stdio",
    "command": "npx",
    "args": ["appium-mcp@latest"],
    "env": {
      "ANDROID_HOME": "/Users/xyz/Library/Android/sdk"
    }
  }
}
```

**Note:** Make sure to update the `ANDROID_HOME` path to match your Android SDK installation path.

### With Gemini CLI

Use the Gemini CLI to add the MCP Appium server:

```bash
gemini mcp add appium-mcp npx -y appium-mcp@latest
```

This will automatically configure the MCP server for use with Gemini. Make sure to update the `ANDROID_HOME` environment variable in the configuration to match your Android SDK path.

### With Claude Code CLI

Use the Claude Code CLI to add the MCP Appium server:

```bash
claude mcp add appium-mcp -- npx -y appium-mcp@latest
```

This will automatically configure the MCP server for use with Claude Code. Make sure to update the `ANDROID_HOME` environment variable in the configuration to match your Android SDK path.

## ⚙️ Configuration

### Capabilities

Create a `capabilities.json` file to define your device capabilities:

```json
{
  "android": {
    "appium:app": "/path/to/your/android/app.apk",
    "appium:deviceName": "Android Device",
    "appium:platformVersion": "11.0",
    "appium:automationName": "UiAutomator2",
    "appium:udid": "your-device-udid"
  },
  "ios": {
    "appium:app": "/path/to/your/ios/app.ipa",
    "appium:deviceName": "iPhone 15 Pro",
    "appium:platformVersion": "17.0",
    "appium:automationName": "XCUITest",
    "appium:udid": "your-device-udid"
  },
  "general": {
    "platformName": "mac",
    "appium:automationName": "mac2",
    "appium:bundleId": "com.apple.Safari"
  }
}
```

Set the `CAPABILITIES_CONFIG` environment variable to point to your configuration file.

#### Platform names and "general" mode

- You can pass any platform name to `create_session`.
- If the platform is `ios` or `android`, the server builds capabilities for that platform (including selected device info when local).
- If the platform is any other value, it is treated internally as `general`:
  - The session will use the provided `capabilities` exactly as given, or
  - If `CAPABILITIES_CONFIG` is set, it will merge with the `general` section from your capabilities file.
- This allows custom setups and non-standard platforms to work without changing server logic.

### Screenshots

Set the `SCREENSHOTS_DIR` environment variable to specify where screenshots are saved. If not set, screenshots are saved to the current working directory. Supports both absolute and relative paths (relative paths are resolved from the current working directory). The directory is created automatically if it doesn't exist.

### Screen Recording

Screen recordings are saved as MP4 files to the same directory as screenshots (`SCREENSHOTS_DIR`, or `os.tmpdir()` if not set).

- **iOS**: Requires [ffmpeg](https://ffmpeg.org/download.html) to be installed and available on `PATH`. The default codec is `libx264` with `yuv420p` pixel format for QuickTime compatibility.
- **Android**: Uses the built-in `screenrecord` command via UiAutomator2. No additional dependencies required.

To start recording, call `appium_screen_recording` with `action="start"`. You may provide `timeLimit` in seconds to limit the maximum recording duration, but the start call still returns immediately. To finalize the recording, save the video, and receive the file path, call `appium_screen_recording` again with `action="stop"`.

### AI Vision Element Finding

Configure AI-powered element finding using vision models. This feature allows you to locate UI elements using natural language descriptions instead of traditional XPath or ID selectors.

**Required Environment Variables:**

```json
{
  "appium-mcp": {
    "env": {
      "ANDROID_HOME": "/path/to/android/sdk",
      "AI_VISION_API_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "AI_VISION_API_TOKEN": "your_api_key_here"
    }
  }
}
```

**Optional Environment Variables:**

- `AI_VISION_MODEL`: Model name (default: `Qwen3-VL-235B-A22B-Instruct`)
- `AI_VISION_COORD_TYPE`: Coordinate type - `normalized` or `absolute` (default: `normalized`)
- `AI_VISION_IMAGE_MAX_WIDTH`: Max image width for compression in pixels (default: `1080`)
- `AI_VISION_IMAGE_QUALITY`: JPEG quality 1-100 (default: `80`)

**Supported Vision Model Providers:**

Based on benchmark testing, the following models are recommended:

1. **Qwen3-VL-235B-A22B-Instruct**
   - Provider: Alibaba Cloud DashScope
   - Accuracy: 100%
   - Speed: 12649ms
   - API: `https://dashscope.aliyuncs.com/compatible-mode/v1`

2. **gemini-3-flash-preview**
   - Provider: Google AI
   - Accuracy: 100%
   - Speed: 17353
   - API: `https://generativelanguage.googleapis.com/v1beta`

More models benchmarked can be found [here](src/tests/benchmark_model/TEST_REPORT.md).

**Performance Features:**

- **Image Compression**: Automatically compresses screenshots to reduce API latency and token costs (50-80% size reduction)
- **Result Caching**: Caches results for 5 minutes using a module-level LRU cache (max 50 entries) that persists across tool calls, avoiding redundant API calls for identical screenshot + instruction pairs
- **Coordinate Handling**: In `normalized` mode (default), the model returns 0–1000 range coordinates that are automatically scaled to absolute pixel coordinates using the original image dimensions — independent of any image compression. In `absolute` mode, image resizing is disabled so the model's returned pixel coordinates always map directly to the original screen dimensions.

### Performance Optimization

#### NO_UI Mode

Set the `NO_UI` environment variable to `true` or `1` to disable UI components and improve performance:

```json
{
  "appium-mcp": {
    "env": {
      "NO_UI": "true",
      "ANDROID_HOME": "/path/to/android/sdk"
    }
  }
}
```

**Benefits:**

- **Significantly Faster Response Times**: UI rendering and data processing are completely skipped, resulting in 50-80% faster tool responses depending on the operation.
- **Major Token Savings**: Eliminates 500-5000+ tokens per request by removing HTML UI components from responses, dramatically reducing LLM API costs.
- **Massive Bandwidth Reduction**:
  - Screenshots: Saves 1-5MB of base64-encoded image data per screenshot
  - Page source: Saves 50-200KB+ of duplicated XML data in HTML UI
  - Locators: Saves 10-100KB+ of element data in interactive UI
  - Device/App lists: Saves 5-50KB of HTML UI per selection
- **Lower Memory Usage**: Client applications consume less memory without HTML rendering and embedded data.
- **Perfect for Headless Environments**: Ideal for CI/CD pipelines, automated testing scripts, batch operations, or any scenario where visual UI feedback is not required.
- **Better Scalability**: Reduced resource consumption allows handling more concurrent sessions.

**Affected Tools:**

The following tools return lightweight text-only responses when NO_UI is enabled:
- `appium_screenshot` - Screenshot files are still saved to disk, but base64 data is not embedded in responses
- `appium_get_page_source` - Returns XML as text without interactive inspector UI
- `generate_locators` - Returns locator data as JSON without interactive UI
- `select_device` - Returns device list as text without picker UI
- `create_session` - Returns session info as text without dashboard UI
- `appium_context` - Returns context list as text with `action=list` without switcher UI
- `appium_app_lifecycle` (action=`list`) - Returns app list as JSON without interactive UI

**When to Enable NO_UI:**

- ✅ Automated test execution in CI/CD pipelines
- ✅ Batch processing multiple devices/sessions
- ✅ Cost-sensitive LLM API usage (reduces token consumption by 60-90%)
- ✅ Network-constrained environments
- ✅ Scripted automation where human interaction is not needed
- ❌ Interactive debugging and exploration (keep UI enabled for better experience)

## 🎯 Available Tools

MCP Appium provides a comprehensive set of tools organized into the following categories:

### Platform & Device Setup

| Tool              | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `select_device`   | **REQUIRED FIRST**: Discover available devices and select one. Auto-selects if only one device found |
| `prepare_ios_simulator` | Boot an iOS/tvOS simulator, download WDA (if not cached), and install/launch WDA in a single call. Each step is skipped if already satisfied (iOS/tvOS only) |

### Session Management

| Tool             | Description                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `create_session` | Create a new mobile automation session for Android, iOS, or `general` capabilities (see 'general' mode above). If a remote Appium server is referenced, `create_session` forwards the final capabilities to that server via the WebDriver `newSession` API - include device selection (e.g., `appium:udid`) in `capabilities` when targeting a remote server. |
| `delete_session` | Delete the current mobile session and clean up resources                                                    |
| `appium_mobile_device_control` | Control device behavior: lock/unlock the screen, shake the device, or open the notifications panel (`action`: `lock` \| `unlock` \| `shake` \| `open_notifications`). `shake` is iOS only; `open_notifications` is Android only; `seconds` is optional for timed lock. |
| `appium_get_settings` | Read current Appium driver session settings (idle timeouts, animation-related flags, selector waits, etc.). Helps diagnose and tune flaky automation. |
| `appium_update_settings` | Merge key-value updates into driver session settings (driver-specific keys; use `appium_get_settings` to inspect). |

The remote server URL in `create_session` can be set via the `remoteServerUrl` parameter.
If `REMOTE_SERVER_URL_ALLOW_REGEX` is set, the URL must match the provided regex pattern for security reasons.
This allows you to restrict which remote servers can be used with your MCP Appium instance, preventing unauthorized connections.
The default regex pattern allows any URL that starts with `http://` or `https://`.

### Context Management

| Tool                  | Description                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `appium_context` | Manage contexts in one tool. `action=list` gets all available contexts including NATIVE_APP and WEBVIEW_* entries. `action=switch` switches to a target context (`context` required). |

### Element Discovery & Interaction

| Tool                  | Description                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `appium_find_element` | Find a specific element using traditional locator strategies (xpath, id, accessibility id, etc.) **OR** AI-powered natural language descriptions (e.g., "yellow search button at bottom"). Traditional mode supports optional **`scrollUntilFound`**: scroll between find attempts until the element appears, the page source stops changing after a scroll, or **`maxScrollAttempts`** is reached (not available with `ai_instruction`). |
| `appium_tap_by_coordinates` | Tap at specific screen coordinates (x, y). On iOS, coordinates are in points. On Android, coordinates are in device pixels. Use `appium_get_page_source` for accurate coordinates. |
| `appium_click`        | Click on an element                                                                          |
| `appium_double_tap`   | Perform double tap on an element                                                             |
| `appium_long_press`   | Perform a long press (press and hold) gesture on an element                                  |
| `appium_drag_and_drop` | Perform a drag and drop gesture from a source location to a target location (supports element-to-element, element-to-coordinates, coordinates-to-element, and coordinates-to-coordinates) |
| `appium_pinch`        | Perform a pinch gesture to zoom in (scale > 1) or zoom out (scale < 1) on an element or the whole screen. Works on both iOS and Android. |
| `appium_set_value`    | Enter text into an input field                                                               |
| `appium_mobile_hide_keyboard` | Dismiss the on-screen keyboard (`mobile: hideKeyboard`) |
| `appium_mobile_is_keyboard_shown` | Whether the on-screen keyboard is visible (`mobile: isKeyboardShown`) |
| `appium_get_text`     | Get text content from an element                                                             |
| `appium_get_clipboard` | Get the current clipboard content as plain text from the device            |
| `appium_set_clipboard` | Set the device clipboard to the provided plain text                        |
| `appium_alert` | Handle alerts with `action` = `accept`, `dismiss`, or `get_text` (optional `buttonLabel`) |

### Screen & Navigation

| Tool                       | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `appium_screenshot`        | Take a screenshot and save as PNG. Optionally provide `elementUUID` to capture a specific element. |
| `appium_get_window_size`   | Get the width and height of the device screen in pixels |
| `appium_scroll`            | Scroll the screen vertically (up or down)               |
| `appium_scroll_to_element` | Scroll until a specific element becomes visible         |
| `appium_swipe`             | Swipe the screen in a direction (left, right, up, down) or between custom coordinates |
| `appium_get_page_source`   | Get the page source (XML) from the current screen       |
| `appium_orientation`   | Get or set device/screen orientation with `action` = `get` or `set` (requires `orientation` for set). |
| `appium_geolocation`       | Get, set, or reset the device GPS coordinates with `action` = `get`, `set`, or `reset`. For `set`, provide `latitude` and `longitude` (and optional `altitude` on Android). Not supported on Android emulators for `reset`. |
| `appium_screen_recording` | Start or stop screen recording with `action` = `start` or `stop`. On stop, returns the saved MP4 path. |
| `appium_mobile_device_info` | Get device information, battery status, or current device time. Use `action` = `info` (model, OS version, locale, timezone, screen density, etc.), `battery` (level as percentage and charging state), or `time` (current device time; accepts an optional `format` moment.js string, defaults to ISO 8601). Works on both iOS and Android. |

### App Management

| Tool          | Action           | Description                                                                                                                                                                                |
|---------------|------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `appium_app_lifecycle`  | `activate`       | Activate (launch/bring to foreground) a specified app by bundle ID or name                                                                                                                 |
| `appium_app_lifecycle`  | `terminate`      | Terminate (close) a specified app                                                                                                                                                          |
| `appium_app_lifecycle`  | `install`        | Install an app on the device from a file path                                                                                                                                              |
| `appium_app_lifecycle`  | `uninstall`      | Uninstall an app from the device by bundle ID or name                                                                                                                                      |
| `appium_app_lifecycle`  | `list`           | List all installed apps on the device (Android and iOS)                                                                                                                                    |
| `appium_app_lifecycle`  | `is_installed`   | Check whether an app is installed. Package name for Android, bundle ID for iOS.                                                                                                            |
| `appium_app_lifecycle`  | `query_state`    | Query the current state of an app: 0=not installed, 1=not running, 2=background suspended, 3=background, 4=foreground                                                                      |
| `appium_app_lifecycle`  | `background`     | Background the current app for a duration (optional; defaults to 5 seconds)                                                                                                                |
| `appium_app_lifecycle`  | `clear`          | Clear app data and cache without uninstalling (`mobile: clearApp`). Android: stop the app first when possible. iOS: **Simulator only**; not supported on real devices.                     |
| `appium_app_lifecycle`  | `deep_link`      | Open a deep link URL with the default or a specified app                                                                                                                                    |
| `appium_mobile_permissions`| Get, update, or reset app permissions in one tool (`action`: get / update / reset) |  Android: list or change runtime permissions. iOS Simulator: get/set privacy via bundle id; reset (`action=reset`) applies to the AUT on sim and device. |

### Test Generation & Documentation

| Tool                         | Description                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `generate_locators`          | Generate intelligent locators for all interactive elements on the current screen |
| `appium_generate_tests`      | Generate automated test code from natural language scenarios                     |
| `appium_documentation_query` | Query Appium documentation using RAG for help and guidance                       |
| `appium_skills` | Return ordered setup or troubleshooting skills from `appium/skills` for local Appium environments |

## 🤖 Client Support

MCP Appium is designed to be compatible with any MCP-compliant client.

## 📚 Usage Examples

### Amazon Mobile App Checkout Flow

Here's an example prompt to test the Amazon mobile app checkout process:

```
Open Amazon mobile app, search for "iPhone 15 Pro", select the first search result, add the item to cart, proceed to checkout, sign in with email "test@example.com" and password "testpassword123", select shipping address, choose payment method, review order details, and place the order. Use JAVA + TestNG for test generation.
```

This example demonstrates a complete e-commerce checkout flow that can be automated using MCP Appium's intelligent locator generation and test creation capabilities.

### AI-Powered Element Finding Examples

**Traditional Mode (XPath/ID):**
```json
{
  "tool": "appium_find_element",
  "arguments": {
    "strategy": "xpath",
    "selector": "//android.widget.Button[@text='Search']"
  }
}
```

**Traditional mode — scroll until found (lists / long screens):**
```json
{
  "tool": "appium_find_element",
  "arguments": {
    "strategy": "xpath",
    "selector": "//*[contains(@text,'My header')]",
    "scrollUntilFound": true,
    "scrollDirection": "down",
    "scrollDistance": 0.45,
    "maxScrollAttempts": 40
  }
}
```

**AI Mode (Natural Language):**
```json
{
  "tool": "appium_find_element",
  "arguments": {
    "strategy": "ai_instruction",
    "ai_instruction": "yellow search button at the bottom of the screen"
  }
}
```

**More AI Mode Examples:**
- `"username input field at top"`
- `"settings icon in top-right corner"`
- `"red delete button next to the item"`
- `"blue submit button at bottom"`
- `"profile picture in navigation bar"`

**Benefits of AI Mode:**
- **No Complex Selectors**: Describe elements in plain language
- **Resilient to UI Changes**: Semantic understanding adapts to layout changes
- **Faster Development**: No need to inspect element hierarchies
- **Works Across Languages**: Describe in any language you're comfortable with

### Working in Your Native Language

**MCP Appium works seamlessly in any language** - you don't need to know English! The AI assistant understands and responds in your native language. Simply describe what you want to do in your preferred language:

**Examples in different languages:**

🇪🇸 **Spanish**: "Abre la aplicación de Amazon, busca 'iPhone 15 Pro' y agrégalo al carrito"

🇨🇳 **Chinese**: "打开Amazon应用，搜索'iPhone 15 Pro'并添加到购物车"

🇯🇵 **Japanese**: "Amazonアプリを開いて、'iPhone 15 Pro'を検索してカートに追加する"

🇰🇷 **Korean**: "Amazon 앱을 열고 'iPhone 15 Pro'를 검색한 후 장바구니에 추가"

🇫🇷 **French**: "Ouvre l'application Amazon, recherche 'iPhone 15 Pro' et ajoute-le au panier"

🇩🇪 **German**: "Öffne die Amazon App, suche nach 'iPhone 15 Pro' und füge es zum Warenkorb hinzu"

The AI will handle your requests naturally and generate the appropriate test code, regardless of the language you use.

## 🙌 Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue to discuss any changes.

## 📄 License

This project is licensed under the Apache-2.0. See the [LICENSE](LICENSE) file for details.
