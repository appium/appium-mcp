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
- **Intelligent Locator Generation**: AI-powered element identification using priority-based strategies.
- **Interactive Session Management**: Easily create and manage sessions on local mobile devices.
- **Smart Element Interactions**: Perform actions like clicks, text input, screenshots, and element finding.
- **Automated Test Generation**: Generate Java/TestNG test code from natural language descriptions.
- **Page Object Model Support**: Utilize built-in templates that follow industry best practices.
- **Flexible Configuration**: Customize capabilities and settings for different environments.

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
  }
}
```

Set the `CAPABILITIES_CONFIG` environment variable to point to your configuration file.

## 🎯 Available Tools

MCP Appium provides a comprehensive set of tools organized into the following categories:

### Platform & Device Setup

| Tool              | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `select_platform` | **REQUIRED FIRST**: Ask user to choose between Android or iOS platform   |
| `select_device`   | Select a specific device when multiple devices are available             |
| `boot_simulator`  | Boot an iOS simulator and wait for it to be ready (iOS only)             |
| `setup_wda`       | Download and setup prebuilt WebDriverAgent for iOS simulators (iOS only) |
| `install_wda`     | Install and launch WebDriverAgent on a booted iOS simulator (iOS only)   |

### Session Management

| Tool             | Description                                               |
| ---------------- | --------------------------------------------------------- |
| `create_session` | Create a new mobile automation session for Android or iOS |
| `delete_session` | Delete the current mobile session and clean up resources  |

### Context Management

| Tool                  | Description                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `appium_get_contexts` | Get all available contexts in the current Appium session. Returns a list of context names including NATIVE_APP and any webview contexts (e.g., WEBVIEW_<id> or WEBVIEW_<package>). |
| `appium_switch_context` | Switch to a specific context in the Appium session. Use this to switch between native app context (NATIVE_APP) and webview contexts (WEBVIEW_<id> or WEBVIEW_<package>). Use appium_get_contexts to see available contexts first. |

### Element Discovery & Interaction

| Tool                  | Description                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `appium_find_element` | Find a specific element using various locator strategies (xpath, id, accessibility id, etc.) |
| `appium_click`        | Click on an element                                                                          |
| `appium_double_tap`   | Perform double tap on an element                                                             |
| `appium_set_value`    | Enter text into an input field                                                               |
| `appium_get_text`     | Get text content from an element                                                             |

### Screen & Navigation

| Tool                       | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `appium_screenshot`        | Take a screenshot of the current screen and save as PNG |
| `appium_scroll`            | Scroll the screen vertically (up or down)               |
| `appium_scroll_to_element` | Scroll until a specific element becomes visible         |
| `appium_swipe`             | Swipe the screen in a direction (left, right, up, down) or between custom coordinates |
| `appium_get_page_source`   | Get the page source (XML) from the current screen       |

### App Management

| Tool                  | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `appium_activate_app` | Activate (launch/bring to foreground) a specified app by bundle ID |
| `appium_installApp`   | Install an app on the device from a file path                      |
| `appium_uninstallApp` | Uninstall an app from the device by bundle ID                      |
| `appium_terminateApp` | Terminate (close) a specified app                                  |
| `appium_list_apps`    | List all installed apps on the device (Android only)               |

### Test Generation & Documentation

| Tool                         | Description                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `generate_locators`          | Generate intelligent locators for all interactive elements on the current screen |
| `appium_generate_tests`      | Generate automated test code from natural language scenarios                     |
| `appium_documentation_query` | Query Appium documentation using RAG for help and guidance                       |

## 🤖 Client Support

MCP Appium is designed to be compatible with any MCP-compliant client.

## 📚 Usage Examples

### Amazon Mobile App Checkout Flow

Here's an example prompt to test the Amazon mobile app checkout process:

```
Open Amazon mobile app, search for "iPhone 15 Pro", select the first search result, add the item to cart, proceed to checkout, sign in with email "test@example.com" and password "testpassword123", select shipping address, choose payment method, review order details, and place the order. Use JAVA + TestNG for test generation.
```

This example demonstrates a complete e-commerce checkout flow that can be automated using MCP Appium's intelligent locator generation and test creation capabilities.

## 🙌 Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue to discuss any changes.

## 📄 License

This project is licensed under the Apache-2.0. See the [LICENSE](LICENSE) file for details.
