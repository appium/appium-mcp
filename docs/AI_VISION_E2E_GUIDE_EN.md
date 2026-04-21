# AI Vision Element Finding — End-to-End Debugging Guide (Beginner's Edition)

> This document is designed for complete beginners who are unfamiliar with MCP and Node.js. It will guide you step-by-step from scratch to verify the complete end-to-end process of AI vision element finding (`appium_find_element` AI mode + `appium_gesture` action=tap).

---

## Table of Contents

1. [Basic Concepts You Need to Know](#1-basic-concepts-you-need-to-know)
2. [Prerequisites](#2-prerequisites)
3. [Environment Variable Configuration](#3-environment-variable-configuration)
4. [Launch Method Selection](#4-launch-method-selection)
5. [Phase 1: Verify Tool Registration with MCP Inspector](#5-phase-1-verify-tool-registration-with-mcp-inspector)
6. [Phase 2: Connect Real Device for End-to-End Testing](#6-phase-2-connect-real-device-for-end-to-end-testing)
7. [Common Error Troubleshooting](#7-common-error-troubleshooting)
8. [Success Verification Criteria](#8-success-verification-criteria)
9. [Appendix: Quick Reference](#9-appendix-quick-reference)

---

## 1. Basic Concepts You Need to Know

**What is MCP?**
MCP (Model Context Protocol) is a protocol that allows AI assistants to call external tools. This repository wraps Appium (mobile automation framework) into a set of MCP tools, enabling AI to directly control mobile devices.

**What is MCP Inspector?**
MCP Inspector is an official debugging tool that launches a web interface, allowing you to manually call any MCP tool and view input/output, similar to how Postman works for HTTP APIs. **No need to connect to an AI assistant; test directly in the browser.**

**What is AI Vision Finding?**
Traditional methods require writing XPath or ID to locate elements. AI mode only needs natural language descriptions, such as "search button in the upper right corner". The system will take a screenshot and send it to a vision model, which returns the element's coordinates, then automatically clicks it.

**Overall Call Chain:**
```
Your description
  → appium_find_element (strategy=ai_instruction)
    → Screenshot current device screen
    → Compress image
    → Call vision model API
    → Parse returned bbox coordinates
    → Return UUID in format ai-element:x,y:x1,y1,x2,y2
  → appium_gesture (action=tap, elementUUID=ai-element:...)
    → Tap at coordinates using W3C Actions API
```

---

## 2. Prerequisites

### 2.1 Install Node.js

Ensure you have Node.js installed (v20 or higher):

```bash
node --version
```

If not installed, visit [Node.js official website](https://nodejs.org/) to download and install.

### 2.2 Clone and Build the Project

```bash
# Clone the project
git clone https://github.com/appium/appium-mcp.git
cd appium-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

`npm run build` compiles TypeScript source code to the `dist/` directory. **You need to rebuild after every source code modification.**

Build success indicator: Command exits normally, `dist/index.js` file exists.

```bash
# Verify build artifacts exist
ls dist/index.js
```

### 2.3 Configure ADB (Required for Android)

**Important**: Ensure your ADB version is unified to avoid version mismatch issues.

1. **Check current ADB version:**
   ```bash
   adb --version
   adb devices
   ```

2. **If you see version mismatch warning:**
   ```
   adb server version (41) doesn't match this client (40); killing...
   ```
   
   This means your ADB client and server versions are inconsistent and need to be unified.

3. **Recommended solution: Use ADB from Android SDK**
   
   Ensure `ANDROID_HOME` environment variable is correctly set:
   
   ```bash
   # macOS/Linux
   export ANDROID_HOME=~/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   
   # Add to ~/.zshrc or ~/.bashrc for persistence
   echo 'export ANDROID_HOME=~/Library/Android/sdk' >> ~/.zshrc
   echo 'export PATH=$PATH:$ANDROID_HOME/platform-tools' >> ~/.zshrc
   source ~/.zshrc
   ```

4. **Restart ADB server:**
   ```bash
   adb kill-server
   adb start-server
   adb devices
   ```

5. **Verify version is unified:**
   ```bash
   adb --version
   # Should show the same version as Android SDK's ADB
   ```

### 2.4 Install Appium

```bash
npm install -g appium
```

Start Appium server (keep it running in a separate terminal):

```bash
appium
```

Verify Appium is running:
```bash
curl http://localhost:4723/status
```

---

## 3. Environment Variable Configuration

AI vision finding requires calling a vision model API. You need to configure the following environment variables:

### 3.1 Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `API_BASE_URL` | Vision model API endpoint | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `API_TOKEN` | API Key | `sk-xxxxxxxxxxxxxxxx` |
| `AI_VISION_MODEL` | Model name | `Qwen3-VL-235B-A22B-Instruct` |
| `ANDROID_HOME` | Android SDK path | `/Users/yourname/Library/Android/sdk` |
| `MCP_TOOL_TIMEOUT` | Tool call timeout (milliseconds) | `180000` (3 minutes) |

### 3.2 Supported Vision Model Providers

This project supports any OpenAI-compatible vision model API, including:

- **Alibaba Cloud DashScope** (Qwen series)
  - API_BASE_URL: `https://dashscope.aliyuncs.com/compatible-mode/v1`
  - Models: `Qwen3-VL-235B-A22B-Instruct`, `qwen-vl-max`, etc.

- **OpenAI**
  - API_BASE_URL: `https://api.openai.com/v1`
  - Models: `gpt-4o`, `gpt-4-vision-preview`

- **Alibaba Internal FAI API**
  - API_BASE_URL: `https://xxxxxxx` (internal address)
  - Models: Custom internal models

- **Other OpenAI-compatible APIs**
  - As long as they support the `/v1/chat/completions` endpoint and vision input

### 3.3 Get API Key

**DashScope (Alibaba Cloud):**
1. Visit [DashScope Console](https://dashscope.console.aliyun.com/)
2. Log in and go to "API Key Management"
3. Create a new API Key
4. Copy the `sk-` prefixed key

**OpenAI:**
1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Go to API Keys section
3. Create a new key

---

## 4. Launch Method Selection

There are two ways to start MCP Inspector: **Command Line** and **VSCode**. Choose based on your preference.

### Method 1: Command Line Launch

**Advantages:**
- ✅ Flexible, can quickly modify environment variables
- ✅ Suitable for temporary testing
- ✅ No IDE dependency

**Disadvantages:**
- ❌ Need to manually input long commands each time
- ❌ Need to manually run `npm run build` before starting

**Usage:**

```bash
# Build first
npm run build

# Then start Inspector with environment variables
API_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1" \
API_TOKEN="sk-xxxxxxxxxxxxxxxx" \
AI_VISION_MODEL="Qwen3-VL-235B-A22B-Instruct" \
ANDROID_HOME="/Users/yourname/Library/Android/sdk" \
MCP_TOOL_TIMEOUT="180000" \
npm run inspect:built
```

### Method 2: VSCode Launch (Recommended)

**Prerequisites:** Project already has `.vscode/launch.json` configured

**Configuration example:**

```json
{
  "name": "MCP Inspector (DashScope)",
  "type": "node",
  "request": "launch",
  "runtimeExecutable": "npm",
  "runtimeArgs": [
    "run",
    "inspect:built"
  ],
  "cwd": "${workspaceFolder}",
  "console": "integratedTerminal",
  "env": {
    "AI_VISION_API_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "AI_VISION_API_TOKEN": "sk-xxxxx",
    "AI_VISION_MODEL": "Qwen3-VL-235B-A22B-Instruct",
    "AI_VISION_COORD_TYPE": "normalized",
    "AI_VISION_IMAGE_MAX_WIDTH": "1080",
    "AI_VISION_IMAGE_QUALITY": "80",
    "ANDROID_HOME": "/Users/youngfreefjs/Library/Android/sdk",
    "MCP_TOOL_TIMEOUT": "180000"
  },
  "preLaunchTask": "npm: build"
}
```

**Similar configurations available:**
- MCP Inspector (FAI API) - For Alibaba internal FAI API
- MCP Inspector (DMX) - For DMX API

**Advantages:**
- ✅ Auto-build (configured with `preLaunchTask: "npm: build"`)
- ✅ Pre-configured environment variables
- ✅ Timeout set to 180 seconds
- ✅ Supports breakpoint debugging
- ✅ One-click launch, no manual command input needed

**Configuration file location:** `.vscode/launch.json`

**What needs to be modified:**
- If using DashScope, replace `API_TOKEN` with your actual token
- If `ANDROID_HOME` path is different, modify to your actual path

---

## 5. Phase 1: Verify Tool Registration with MCP Inspector

> **Goal**: Verify MCP server starts normally and tools are correctly registered.

### 5.1 Start MCP Inspector

**Method 1: Command Line Launch**

```bash
API_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1" \
API_TOKEN="sk-xxxxxxxxxxxxxxxx" \
AI_VISION_MODEL="Qwen3-VL-235B-A22B-Instruct" \
ANDROID_HOME="/Users/yourname/Library/Android/sdk" \
MCP_TOOL_TIMEOUT="180000" \
npm run inspect:built
```

**Method 2: VSCode Launch**

Press `F5`, select `MCP Inspector (DashScope)` configuration.

**Success indicators:**

Terminal will display something similar to:

```
npm warn exec The following package was not found and will be installed: @modelcontextprotocol/inspector@0.15.0
Starting MCP inspector...
⚙️ Proxy server listening on 127.0.0.1:6277
🔑 Session token: 275fb57a76ddbfe7d710e6259af7dc73b8f93c0c68d94e1df51332c34b3a1288

🔗 Open inspector with token pre-filled:
   http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=275fb57a...

🔍 MCP Inspector is up and running at http://127.0.0.1:6274 🚀
```

### 5.2 Connect to Inspector

**Method 1 (Recommended):** Directly click the URL with token from terminal output

**Method 2:** Manual access
1. Open browser and visit `http://localhost:6274`
2. Paste the token from terminal output into the **Proxy Session Token** input box
3. Click **Connect**

**Important Notes:**
- ✅ **Do NOT** fill in anything in Command or Arguments input boxes
- ✅ **Only** fill in the Proxy Session Token
- ✅ Inspector will automatically connect to the running MCP server

### 5.3 Verify Tools are Registered

In the Inspector interface:

1. Click the **"Tools"** tab on the left
2. Find **`appium_find_element`** in the tool list
3. Click it to view parameter descriptions on the right

**Verification points:**
- ✅ `strategy` parameter enum values include `ai_instruction`
- ✅ `ai_instruction` parameter exists (natural language description)
- ✅ `appium_gesture` tool has `action` and `elementUUID` parameters

**This step verifies: AI finding functionality is correctly registered in the MCP server.**

---

## 6. Phase 2: Connect Real Device for End-to-End Testing

> **Goal**: Connect Android device and complete the full chain: "Select platform → Create session → AI find → AI click".

### 6.1 Prepare Android Device

**Method 1: Use Android Studio Emulator**

1. Open Android Studio → Tools → Device Manager
2. Create a virtual device (recommended Pixel 6, API 33)
3. Click start button and wait for emulator to fully launch

**Method 2: Launch Existing Emulator via Command Line**

```bash
# List available emulators
emulator -list-avds

# Start specific emulator (replace Pixel_6_API_33 with your emulator name)
emulator -avd Pixel_6_API_33
```

**Verify emulator is connected:**

```bash
adb devices
```

Output should include something like:
```
List of devices attached
emulator-5554   device
```

### 6.2 Configure capabilities.json (Optional)

If you need to customize device configuration, create `capabilities.json` in project root:

```json
{
  "android": {
    "appium:deviceName": "Android Device",
    "appium:platformVersion": "13.0",
    "appium:automationName": "UiAutomator2",
    "appium:appPackage": "com.android.settings",
    "appium:appActivity": ".Settings"
  }
}
```

> **Tip**: This uses Android's built-in "Settings" app as test target, no need to install additional APK.

If you don't create this file, the system will use default configuration.

### 6.3 Ensure Inspector is Running

If Inspector hasn't started yet, refer to [Chapter 4](#4-launch-method-selection) to start it.

### 6.4 Step 1: Select Platform

Call `select_platform` in Inspector:

```json
{
  "platform": "android"
}
```

**Expected response:**
```
✅ Android platform selected

Found 1 Android device: d49f6aaf

You can now create an Android session using the create_session tool with platform='android'.
```

**Execution time:** About 2-5 seconds (first time may need to initialize ADB)

### 6.5 Step 2: Create Appium Session

Call `create_session`:

```json
{
  "platform": "android"
}
```

**Expected response:**
```
ANDROID session created successfully with ID: 40c59fdc-a268-45ae-b509-6ee8a24b93ad
```

**Execution time:** About 10-15 seconds (first time needs to install Appium Settings and UiAutomator2 Server)

**Observe device:** Device screen should display the current app (if appPackage is configured) or stay on home screen.

### 6.6 Step 3: Screenshot to Confirm Current Screen

Call `appium_screenshot`:

```json
{}
```

**Expected response:**
```
Screenshot saved to /Users/yourname/Desktop/code/github/appium-mcp/screenshot_20260311_162945.png
```

**Verify:** Open the screenshot file and confirm it shows the device's current screen content.

**This step is very important** because AI finding will use this screenshot to locate elements.

### 6.7 Step 4: Use AI to Find Element

Call `appium_find_element` using AI mode:

```json
{
  "strategy": "ai_instruction",
  "ai_instruction": "search button"
}
```

**Execution time:** About 5-15 seconds (vision model needs processing time)

**Expected response:**
```
Successfully found "Search" at coordinates (540, 156) using AI vision.
Element id ai-element:540,156:42,130,1038,182
```

**Response breakdown:**
- `"Search"` — Text recognized by the model
- `(540, 156)` — Element center point coordinates (pixels)
- `ai-element:540,156:42,130,1038,182` — Special format UUID

**Copy this UUID**, you'll need it in the next step.

### 6.8 Step 5: Tap AI-Found Element

Call `appium_gesture` with `action=tap` and the UUID from previous step:

```json
{
  "action": "tap",
  "elementUUID": "ai-element:540,156:42,130,1038,182"
}
```

**Expected response:**
```
Successfully tapped at AI element coordinates (540, 156).
```

**Observe device:** The element at that position should be clicked, and UI should change accordingly (e.g., search box activated).

### 6.9 Step 6: Clean Up Session

After testing, call `delete_session` to close the session:

```json
{}
```

**Expected response:**
```
Session deleted successfully
```

---

## 7. Common Error Troubleshooting

### Error 1: `API_BASE_URL environment variable is required`

**Cause**: Environment variables not set when starting Inspector.

**Solution**: Ensure environment variables are added before `npm run inspect` command:
```bash
API_BASE_URL="https://..." API_TOKEN="sk-..." npm run inspect
```

### Error 2: `Vision API call failed: HTTP 401`

**Cause**: API Token is invalid or expired.

**Solution**:
1. Check if `API_TOKEN` is correctly copied (no extra spaces)
2. Log in to the corresponding platform console to confirm API Key status is normal
3. Confirm `API_BASE_URL` matches the API Key provider

### Error 3: `Vision API call failed: HTTP 429`

**Cause**: API call rate limit exceeded.

**Solution**: Wait 1-2 minutes and retry, or check account's QPS limit.

### Error 4: `Failed to parse bbox from vision model response`

**Cause**: Model's returned format doesn't match expectations, unable to parse coordinates.

**Solution**:
1. Confirm the model supports vision input (Vision model)
2. Try switching models, e.g., from `Qwen3-VL-235B-A22B-Instruct` to `gpt-4o`
3. Check if `AI_VISION_COORD_TYPE` matches the model's output format

### Error 5: `No driver found`

**Cause**: Appium Session not created yet, or Session has expired.

**Solution**: Call `create_session` to create a Session first, then call AI finding tool.

### Error 6: `Failed to get image dimensions from screenshot`

**Cause**: Screenshot failed, or image format is abnormal.

**Solution**:
1. Confirm Appium Session is normal (emulator/device is connected)
2. Call `appium_screenshot` first to confirm screenshot functionality works

### Error 7: `Cannot connect to Appium server`

**Cause**: Appium server is not started.

**Solution**:
```bash
# Start Appium in a new terminal window
appium

# Confirm Appium is listening
curl http://localhost:4723/status
```

### Error 8: `adb: command not found`

**Cause**: `ANDROID_HOME` environment variable not set, or Android SDK not installed.

**Solution**:
```bash
# macOS/Linux, find your Android SDK path
ls ~/Library/Android/sdk/platform-tools/adb

# Set environment variable (add to ~/.zshrc or ~/.bashrc)
export ANDROID_HOME=~/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### Error 9: `ERR_PACKAGE_PATH_NOT_EXPORTED` - unicorn-magic Package Error

**Error message:**
```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in 
/Users/xxx/node_modules/unicorn-magic/package.json
npm warn exec The following package was not found and will be installed: tsx@4.21.0
```

**Cause**: This is a compatibility issue between the `unicorn-magic` package and the `tsx` runtime in Node.js v20 environment. The `fastmcp inspect` command internally uses `tsx` to run files, causing this error.

**Solution:**

1. **Ensure project is built:**
   ```bash
   npm run build
   ```

2. **Check inspect command in `package.json`:**
   
   Should be:
   ```json
   "inspect": "npx @modelcontextprotocol/inspector node dist/index.js"
   ```
   
   Not:
   ```json
   "inspect": "npx fastmcp inspect src/index.js"  // ❌ Wrong (uses tsx)
   "inspect": "npx fastmcp inspect dist/index.js" // ❌ Still wrong (fastmcp uses tsx internally)
   ```

3. **Restart Inspector:**
   ```bash
   npm run inspect
   ```

**Why does this solve it?**
- Directly use `@modelcontextprotocol/inspector` instead of `fastmcp inspect`
- Use `node dist/index.js` instead of letting fastmcp internally call `tsx`
- Completely avoid `tsx` runtime, bypassing `unicorn-magic` compatibility issue

**Technical details:**
- `fastmcp inspect` automatically uses `tsx` to run any file (including `.js` files)
- `@modelcontextprotocol/inspector` allows us to directly specify the run command (like `node`)
- This completely bypasses the compatibility issue between `tsx` and `unicorn-magic`

### Error 10: `MCP error -32001: Request timed out` - Tool Call Timeout

**Error message:**
```
MCP error -32001: Request timed out
```

**Cause**: Tool execution time exceeds MCP Inspector's default timeout (usually 60 seconds). The `select_platform` tool needs to initialize ADB and scan devices, which may take longer.

**Solution:**

**Method 1: Increase Timeout (Recommended)**

Set a longer timeout when starting MCP Inspector:

```bash
MCP_TOOL_TIMEOUT=180000 npm run inspect
```

Or add environment variable in VSCode's `launch.json`:
```json
{
  "env": {
    "MCP_TOOL_TIMEOUT": "180000",
    // ... other environment variables
  }
}
```

**Recommended timeout values:**
- `select_platform`: 120 seconds (2 minutes) usually sufficient
- `create_session`: 180 seconds (3 minutes) safer, because it needs to:
  - Initialize ADB
  - Install/verify Appium Settings APK
  - Install/verify UiAutomator2 Server APK
  - Start UiAutomator2 Server
  - Establish connection

**Method 2: Ensure ADB Works Properly**

1. Verify ADB can access device normally:
   ```bash
   adb devices
   ```

2. If device shows as `offline` or `unauthorized`:
   ```bash
   adb kill-server
   adb start-server
   adb devices
   ```

3. Ensure `ANDROID_HOME` environment variable is correctly set:
   ```bash
   echo $ANDROID_HOME
   # Should output something like: /Users/yourname/Library/Android/sdk
   ```

**Method 3: Restart MCP Inspector**

Sometimes ADB initialization gets stuck, restarting Inspector can solve it:
1. Stop current Inspector (Ctrl+C)
2. Re-run `npm run inspect`

**Why does it timeout?**
- ADB initialization takes time (default 60 second timeout)
- Scanning connected devices takes time
- If there are multiple devices or emulators, scanning takes longer
- Network issues may cause slow ADB connection

### Error 11: MCP Inspector Shows "Connection Error - Did you add the proxy session token in Configuration?"

**Cause**: This is the most common beginner mistake! You filled in incorrect configuration in the Inspector interface.

**Correct approach:**
1. ✅ **Do NOT** fill in anything in the Command input box (like `mcp-server-everything`, `appium-mcp`, etc.)
2. ✅ **Do NOT** fill in anything in the Arguments input box
3. ✅ **Only** fill in the **Proxy Session Token** (copy from terminal output)
4. ✅ Or directly click the URL with token from terminal output

**Why does this error occur?**
- `npm run inspect` has already automatically started the MCP server and proxy
- The Command/Arguments in Inspector interface are for **manually starting** the server (we don't need this)
- We only need to connect to the already running proxy server via **Session Token**

**Correct connection methods (choose one):**

**Method 1 (Recommended):** Directly click the URL from terminal output
```
🔗 Open inspector with token pre-filled:
   http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=275fb57a...
```

**Method 2:** Manually fill in token
1. Open `http://localhost:6274`
2. Find the **Proxy Session Token** input box in the **Configuration** area
3. Paste the token from terminal output (e.g., `275fb57a76ddbfe7d710e6259af7dc73b8f93c0c68d94e1df51332c34b3a1288`)
4. Click **Connect**

---

## 8. Success Verification Criteria

### Phase 1 (MCP Inspector Tool Registration Verification) Success Criteria

- [x] `npm run inspect:built` command starts normally, browser can open `http://localhost:6274`
- [x] Can see `appium_find_element` in tool list
- [x] `appium_find_element`'s `strategy` enum values include `ai_instruction`
- [x] Returns `No driver found` error when called (not tool not found error)

### Phase 2 (End-to-End Testing) Success Criteria

- [x] `create_session` returns Session ID, app successfully opens on emulator/device
- [x] `appium_find_element` returns UUID with `ai-element:` prefix, coordinates are reasonable
- [x] `appium_gesture` (action=tap) returns `Successfully tapped at AI element coordinates`
- [x] Observe emulator/device screen, element at corresponding position is indeed tapped (UI changes)

### Complete Success Output Example

```
# appium_find_element success output
Successfully found "Search" at coordinates (540, 156) using AI vision.
Element id ai-element:540,156:42,130,1038,182

# appium_gesture (action=tap) success output
Successfully tapped at AI element coordinates (540, 156).
```

---

## 9. Appendix: Quick Reference

### Environment Variable One-Click Setup Template

```bash
# Copy the following, replace YOUR_* parts, then execute in terminal
export API_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export API_TOKEN="YOUR_DASHSCOPE_API_KEY"
export AI_VISION_MODEL="Qwen3-VL-235B-A22B-Instruct"
export ANDROID_HOME="YOUR_ANDROID_SDK_PATH"
export CAPABILITIES_CONFIG="$(pwd)/capabilities.json"

# Then start Inspector
npm run inspect:built
```

### Tool Call Sequence Quick Reference

```
1. select_platform    → Select android or ios
2. create_session     → Create Appium Session (open app)
3. appium_screenshot  → Screenshot to confirm current screen
4. appium_find_element (strategy=ai_instruction) → AI find element, get UUID
5. appium_gesture (action=tap, elementUUID=ai-element:...) → Tap AI-found element
6. delete_session     → Close session
```

### AI Finding UUID Format Explanation

```
ai-element:540,156:42,130,1038,182
           ↑   ↑   ↑   ↑   ↑    ↑
           x   y   x1  y1  x2   y2
        (center)  (bounding box)
```
