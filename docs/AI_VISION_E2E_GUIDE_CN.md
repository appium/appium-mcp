# AI 视觉元素查找 — 端到端调试操作手册（新手版）

> 本文档面向完全不了解 MCP 和 Node.js 的新手，手把手带你从零开始，验证 AI 视觉元素查找功能（`appium_find_element` AI 模式 + `appium_click`）的完整端到端流程。

---

## 目录

1. [你需要了解的基本概念](#1-你需要了解的基本概念)
2. [前置准备](#2-前置准备)
3. [环境变量配置](#3-环境变量配置)
4. [启动方式选择](#4-启动方式选择)
5. [第一阶段：用 MCP Inspector 验证工具注册](#5-第一阶段用-mcp-inspector-验证工具注册)
6. [第二阶段：连接真实设备做端到端测试](#6-第二阶段连接真实设备做端到端测试)
7. [常见错误排查](#7-常见错误排查)
8. [验证成功的判断标准](#8-验证成功的判断标准)

---

## 1. 你需要了解的基本概念

**MCP 是什么？**
MCP（Model Context Protocol）是一种让 AI 助手调用外部工具的协议。这个仓库把 Appium（手机自动化框架）封装成了一组 MCP 工具，让 AI 可以直接操控手机。

**MCP Inspector 是什么？**
MCP Inspector 是官方提供的调试工具，它会启动一个网页界面，让你可以手动调用任意 MCP 工具、查看输入输出，就像 Postman 之于 HTTP 接口一样。**不需要连接 AI 助手，直接在浏览器里测试。**

**AI 视觉查找是什么？**
传统方式需要写 XPath 或 ID 来定位元素。AI 模式只需要用自然语言描述，比如 "右上角的搜索按钮"，系统会截图发给视觉大模型，大模型返回元素的坐标，然后自动点击。

**整体调用链路：**
```
你的描述
  → appium_find_element (strategy=ai_instruction)
    → 截图当前手机屏幕
    → 压缩图片
    → 调用视觉大模型 API
    → 解析返回的坐标 bbox
    → 返回 ai-element:x,y:x1,y1,x2,y2 格式的 UUID
  → appium_click (elementUUID=ai-element:...)
    → 用 W3C Actions API 在坐标处点击
```

---

## 2. 前置准备

### 2.1 安装 Node.js

确保你已经安装了 Node.js（v20 或更高版本）：

```bash
node --version
```

如果没有安装，请访问 [Node.js 官网](https://nodejs.org/) 下载安装。

### 2.2 克隆并构建项目

```bash
# 克隆项目
git clone https://github.com/appium/appium-mcp.git
cd appium-mcp

# 安装依赖
npm install

# 构建项目
npm run build
```

`npm run build` 会把 TypeScript 源码编译到 `dist/` 目录。**每次修改源码后都需要重新 build。**

构建成功的标志：命令正常退出，`dist/index.js` 文件存在。

```bash
# 验证构建产物存在
ls dist/index.js
```

### 2.3 配置 ADB（Android 必需）

**重要**：确保你的 ADB 版本统一，避免版本不匹配问题。

1. **检查当前 ADB 版本：**
   ```bash
   adb --version
   adb devices
   ```

2. **如果看到版本不匹配警告：**
   ```
   adb server version (41) doesn't match this client (40); killing...
   ```
   
   说明你的 ADB client 和 server 版本不一致，需要统一。

3. **推荐方案：使用 Android SDK 中的 ADB**
   
   确保 `ANDROID_HOME` 环境变量正确设置：
   ```bash
   # macOS/Linux
   export ANDROID_HOME=~/Library/Android/sdk
   export PATH=$ANDROID_HOME/platform-tools:$PATH
   
   # 验证
   which adb
   # 应该输出：/Users/yourname/Library/Android/sdk/platform-tools/adb
   ```

4. **重启 ADB server：**
   ```bash
   adb kill-server
   adb start-server
   adb devices
   ```

5. **验证设备连接：**
   ```bash
   adb devices
   # 应该看到：
   # List of devices attached
   # d49f6aaf    device
   ```

## 3. 环境变量配置

AI 查找功能通过环境变量读取配置。以下是完整的变量说明：

| 变量名 | 是否必填 | 说明 | 示例值 |
|--------|---------|------|--------|
| `API_BASE_URL` | **必填** | 视觉模型 API 的基础地址 | example use dashscope, you can also use openrouter, etc.: `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `API_TOKEN` | **必填** | API 认证密钥 | `sk-xxxxxxxxxxxxxxxx` |
| `AI_VISION_MODEL` | 选填 | 模型名称，默认 `Qwen3-VL-235B-A22B-Instruct` | `Qwen3-VL-235B-A22B-Instruct` |
| `AI_VISION_COORD_TYPE` | 选填 | 坐标类型，默认 `normalized`（0-1000 归一化）| `normalized` 或 `absolute` |
| `AI_VISION_IMAGE_MAX_WIDTH` | 选填 | 图片压缩最大宽度，默认 `1080` | `1080` |
| `AI_VISION_IMAGE_QUALITY` | 选填 | JPEG 压缩质量 1-100，默认 `80` | `80` |
| `ANDROID_HOME` | Android 必填 | Android SDK 路径 | `/Users/yourname/Library/Android/sdk` |

**各提供商的 API_BASE_URL：**

```bash
# 阿里云 DashScope（Qwen 系列）
API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# Google AI（Gemini）
API_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai

# OpenAI（GPT-4o）
API_BASE_URL=https://api.openai.com/v1
```

---

## 4. 启动方式选择

本项目提供了两种启动 MCP Inspector 的方式：

### 方式一：命令行启动（推荐用于快速测试）

**使用 `npm run inspect:built` 命令：**

```bash
# 设置环境变量并启动
API_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1" \
API_TOKEN="sk-xxxxxxxxxxxxxxxx" \
AI_VISION_MODEL="Qwen3-VL-235B-A22B-Instruct" \
ANDROID_HOME="/Users/yourname/Library/Android/sdk" \
MCP_TOOL_TIMEOUT="180000" \
npm run inspect:built
```

**优点：**
- ✅ 快速启动，无需 IDE
- ✅ 避免 `tsx` 和 `unicorn-magic` 兼容性问题
- ✅ 适合快速验证和测试

**注意事项：**
- 必须先运行 `npm run build` 构建项目
- 每次修改代码后需要重新构建

### 方式二：VSCode 调试启动（推荐用于开发调试）

**使用 VSCode 的 Launch 配置：**

1. 在 VSCode 中打开项目
2. 按 `F5` 或点击"运行和调试"
3. 选择以下配置之一：
   ```json
   {
      "type": "node",
      "request": "launch",
      "name": "Run Vision Finder Tests",
      "runtimeExecutable": "npx",
      "runtimeArgs": [
        "--experimental-vm-modules",
        "jest",
        "src/tests/vision-finder.test.ts",
        "--verbose"
      ],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "env": {
        "AI_VISION_API_BASE_URL": "https://xxxxxxx" // 你需要替换为你的 API_BASE_URL,
        "AI_VISION_API_TOKEN": "sk-xxxxx" // 你需要替换为你的 API_TOKEN,
        "AI_VISION_MODEL": "Qwen3-VL-235B-A22B-Instruct" // 你可以替换为任何你希望的VL模型名称，详见 benchmark 测试完成已支持的模型,
        "AI_VISION_COORD_TYPE": "normalized" // 不同模型的坐标类型不同，详见 benchmark 测试完成已支持的坐标类型,
        "AI_VISION_IMAGE_MAX_WIDTH": "1080",
        "AI_VISION_IMAGE_QUALITY": "80",
        "NODE_OPTIONS": "--experimental-vm-modules"
      }
    },
   ```

**优点：**
- ✅ 自动构建（配置了 `preLaunchTask: "npm: build"`）
- ✅ 环境变量已预配置
- ✅ 超时时间已设置为 180 秒
- ✅ 支持断点调试
- ✅ 一键启动，无需手动输入命令

**配置文件位置：** `.vscode/launch.json`

**需要修改的地方：**
- 如果使用 DashScope，需要替换 `API_TOKEN` 为你的真实 token
- 如果 `ANDROID_HOME` 路径不同，需要修改为你的实际路径

---

## 5. 第一阶段：用 MCP Inspector 验证工具注册

> **目标**：验证 MCP 服务器正常启动，工具已正确注册。

### 5.1 启动 MCP Inspector

**方式一：命令行启动**

```bash
API_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1" \
API_TOKEN="sk-xxxxxxxxxxxxxxxx" \
AI_VISION_MODEL="Qwen3-VL-235B-A22B-Instruct" \
ANDROID_HOME="/Users/yourname/Library/Android/sdk" \
MCP_TOOL_TIMEOUT="180000" \
npm run inspect:built
```

**方式二：VSCode 启动**

按 `F5`，选择 `MCP Inspector (DashScope)` 配置。

**启动成功的标志：**

终端会显示类似以下内容：

```
npm warn exec The following package was not found and will be installed: @modelcontextprotocol/inspector@0.15.0
Starting MCP inspector...
⚙️ Proxy server listening on 127.0.0.1:6277
🔑 Session token: 275fb57a76ddbfe7d710e6259af7dc73b8f93c0c68d94e1df51332c34b3a1288

🔗 Open inspector with token pre-filled:
   http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=275fb57a...

🔍 MCP Inspector is up and running at http://127.0.0.1:6274 🚀
```

### 5.2 连接到 Inspector

**方式一（推荐）：** 直接点击终端输出的带 token 的完整 URL

**方式二：** 手动访问
1. 打开浏览器访问 `http://localhost:6274`
2. 在 **Proxy Session Token** 输入框中粘贴终端输出的 token
3. 点击 **Connect**

**重要提示：**
- ✅ **不要**在 Command 或 Arguments 输入框填写任何内容
- ✅ **只需要**填写 Proxy Session Token
- ✅ Inspector 会自动连接到已运行的 MCP 服务器

### 5.3 验证工具已注册

在 Inspector 界面中：

1. 点击左侧的 **"Tools"** 标签
2. 在工具列表中找到 **`appium_find_element`**
3. 点击它，查看右侧的参数说明

**验证要点：**
- ✅ `strategy` 参数的枚举值中包含 `ai_instruction`
- ✅ 存在 `ai_instruction` 参数（自然语言描述）
- ✅ `appium_click` 工具存在 `elementUUID` 参数

**这一步验证了：AI 查找功能已经正确注册到 MCP 服务器中。**

---

## 6. 第二阶段：连接真实设备做端到端测试

> **目标**：连接 Android 设备，完整跑通 "选择平台 → 创建会话 → AI 查找 → AI 点击" 的全链路。

### 6.1 准备 Android 设备

**方式一：使用 Android Studio 模拟器**

1. 打开 Android Studio → Tools → Device Manager
2. 创建一个虚拟设备（推荐 Pixel 6，API 33）
3. 点击启动按钮，等待模拟器完全启动

**方式二：命令行启动已有模拟器**

```bash
# 查看可用模拟器列表
emulator -list-avds

# 启动指定模拟器（替换 Pixel_6_API_33 为你的模拟器名）
emulator -avd Pixel_6_API_33
```

**验证模拟器已连接：**

```bash
adb devices
```

输出应该包含类似：
```
List of devices attached
emulator-5554   device
```

### 6.2 配置 capabilities.json（可选）

如果需要自定义设备配置，在项目根目录创建 `capabilities.json`：

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

> **提示**：这里使用 Android 系统自带的"设置"应用作为测试目标，不需要额外安装 APK。

如果不创建此文件，系统会使用默认配置。

### 6.3 确保 Inspector 正在运行

如果 Inspector 还没启动，参考 [第 4 章](#4-启动方式选择) 启动。

### 6.4 步骤一：选择平台

在 Inspector 中调用 `select_platform`：

```json
{
  "platform": "android"
}
```

**预期返回：**
```
✅ Android platform selected

Found 1 Android device: d49f6aaf

You can now create an Android session using the create_session tool with platform='android'.
```

**执行时间：** 约 2-5 秒（首次可能需要初始化 ADB）

### 6.5 步骤二：创建 Appium Session

调用 `create_session`：

```json
{
  "platform": "android"
}
```

**预期返回：**
```
ANDROID session created successfully with ID: 40c59fdc-a268-45ae-b509-6ee8a24b93ad
```

**执行时间：** 约 10-15 秒（首次需要安装 Appium Settings 和 UiAutomator2 Server）

**观察设备：** 设备屏幕应该会显示当前应用（如果配置了 appPackage）或保持在主屏幕。

### 6.6 步骤三：截图确认当前屏幕

调用 `appium_screenshot`：

```json
{}
```

**预期返回：**
```
Screenshot saved to /Users/yourname/Desktop/code/github/appium-mcp/screenshot_20260311_162945.png
```

**验证：** 打开截图文件，确认显示的是设备当前屏幕内容。

**这一步非常重要**，因为 AI 查找会基于这个截图来定位元素。

### 6.7 步骤四：使用 AI 查找元素

调用 `appium_find_element`，使用 AI 模式：

```json
{
  "strategy": "ai_instruction",
  "ai_instruction": "搜索按钮"
}
```

**执行时间：** 约 5-15 秒（视觉模型需要处理时间）

**预期返回：**
```
Successfully found "Search" at coordinates (540, 156) using AI vision.
Element id ai-element:540,156:42,130,1038,182
```

**返回值解析：**
- `"Search"` — 大模型识别到的元素文字
- `(540, 156)` — 元素中心点坐标（像素）
- `ai-element:540,156:42,130,1038,182` — 特殊格式的 UUID

**复制这个 UUID**，下一步会用到。

### 6.8 步骤五：点击 AI 找到的元素

调用 `appium_click`，传入上一步返回的 UUID：

```json
{
  "elementUUID": "ai-element:540,156:42,130,1038,182"
}
```

**预期返回：**
```
Successfully clicked at coordinates (540, 156) using AI-found element
```

**观察设备：** 对应位置的元素应该被点击，UI 应该有相应变化（如搜索框被激活）。

### 6.9 步骤六：清理 Session

测试完成后，调用 `delete_session` 关闭 Session：

```json
{}
```

**预期返回：**
```
Session deleted successfully
```

---

## 7. 常见错误排查

### 错误 1：`API_BASE_URL environment variable is required`

**原因**：启动 Inspector 时没有设置环境变量。

**解决**：确保在 `npm run inspect` 命令前面加上环境变量：
```bash
API_BASE_URL="https://..." API_TOKEN="sk-..." npm run inspect
```

### 错误 2：`Vision API call failed: HTTP 401`

**原因**：API Token 无效或过期。

**解决**：
1. 检查 `API_TOKEN` 是否正确复制（注意不要有多余空格）
2. 登录对应平台控制台，确认 API Key 状态正常
3. 确认 `API_BASE_URL` 与 API Key 的提供商匹配

### 错误 3：`Vision API call failed: HTTP 429`

**原因**：API 调用频率超限。

**解决**：等待 1-2 分钟后重试，或检查账户的 QPS 限制。

### 错误 4：`Failed to parse bbox from vision model response`

**原因**：大模型返回的格式不符合预期，无法解析坐标。

**解决**：
1. 确认使用的模型支持视觉输入（Vision 模型）
2. 尝试更换模型，如从 `Qwen3-VL-235B-A22B-Instruct` 换为 `gpt-4o`
3. 检查 `AI_VISION_COORD_TYPE` 是否与模型输出格式匹配

### 错误 5：`No driver found`

**原因**：还没有创建 Appium Session，或 Session 已过期。

**解决**：先调用 `create_session` 创建 Session，再调用 AI 查找工具。

### 错误 6：`Failed to get image dimensions from screenshot`

**原因**：截图失败，或图片格式异常。

**解决**：
1. 确认 Appium Session 正常（模拟器/真机已连接）
2. 先调用 `appium_screenshot` 确认截图功能正常

### 错误 7：`Cannot connect to Appium server`

**原因**：Appium 服务器没有启动。

**解决**：
```bash
# 在新终端窗口启动 Appium
appium

# 确认 Appium 正在监听
curl http://localhost:4723/status
```

### 错误 8：`adb: command not found`

**原因**：`ANDROID_HOME` 环境变量未设置，或 Android SDK 未安装。

**解决**：
```bash
# macOS/Linux，找到你的 Android SDK 路径
ls ~/Library/Android/sdk/platform-tools/adb

# 设置环境变量（加到 ~/.zshrc 或 ~/.bashrc）
export ANDROID_HOME=~/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### 错误 9：`ERR_PACKAGE_PATH_NOT_EXPORTED` - unicorn-magic 包错误

**错误信息：**
```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in 
/Users/xxx/node_modules/unicorn-magic/package.json
npm warn exec The following package was not found and will be installed: tsx@4.21.0
```

**原因**：这是 `unicorn-magic` 包在 Node.js v20 环境下与 `tsx` 运行时的兼容性问题。`fastmcp inspect` 命令内部会使用 `tsx` 来运行文件，导致此错误。

**解决方案：**

1. **确保项目已构建：**
   ```bash
   npm run build
   ```

2. **检查 `package.json` 中的 inspect 命令：**
   
   应该是：
   ```json
   "inspect": "npx @modelcontextprotocol/inspector node dist/index.js"
   ```
   
   而不是：
   ```json
   "inspect": "npx fastmcp inspect src/index.js"  // ❌ 错误（使用 tsx）
   "inspect": "npx fastmcp inspect dist/index.js" // ❌ 仍然错误（fastmcp 内部使用 tsx）
   ```

3. **重新启动 Inspector：**
   ```bash
   npm run inspect
   ```

**为什么这样能解决？**
- 直接使用 `@modelcontextprotocol/inspector` 而不是 `fastmcp inspect`
- 使用 `node dist/index.js` 而不是让 fastmcp 内部调用 `tsx`
- 完全避免 `tsx` 运行时，绕过 `unicorn-magic` 的兼容性问题

**技术细节：**
- `fastmcp inspect` 会自动使用 `tsx` 来运行任何文件（包括 `.js` 文件）
- `@modelcontextprotocol/inspector` 允许我们直接指定运行命令（如 `node`）
- 这样就完全绕过了 `tsx` 和 `unicorn-magic` 的兼容性问题

### 错误 10：`MCP error -32001: Request timed out` - 工具调用超时

**错误信息：**
```
MCP error -32001: Request timed out
```

**原因**：工具执行时间超过了 MCP Inspector 的默认超时时间（通常是 60 秒）。`select_platform` 工具需要初始化 ADB 并扫描设备，可能需要较长时间。

**解决方案：**

**方式一：增加超时时间（推荐）**

在启动 MCP Inspector 时设置更长的超时时间：

```bash
MCP_TOOL_TIMEOUT=180000 npm run inspect
```

或者在 VSCode 的 `launch.json` 中添加环境变量：
```json
{
  "env": {
    "MCP_TOOL_TIMEOUT": "180000",
    // ... 其他环境变量
  }
}
```

**推荐超时时间：**
- `select_platform`: 120 秒（2 分钟）通常足够
- `create_session`: 180 秒（3 分钟）更安全，因为需要：
  - 初始化 ADB
  - 安装/验证 Appium Settings APK
  - 安装/验证 UiAutomator2 Server APK
  - 启动 UiAutomator2 Server
  - 建立连接

**方式二：确保 ADB 正常工作**

1. 验证 ADB 可以正常访问设备：
   ```bash
   adb devices
   ```

2. 如果设备显示为 `offline` 或 `unauthorized`：
   ```bash
   adb kill-server
   adb start-server
   adb devices
   ```

3. 确保 `ANDROID_HOME` 环境变量正确设置：
   ```bash
   echo $ANDROID_HOME
   # 应该输出类似：/Users/yourname/Library/Android/sdk
   ```

**方式三：重启 MCP Inspector**

有时 ADB 初始化会卡住，重启 Inspector 可以解决：
1. 停止当前的 Inspector（Ctrl+C）
2. 重新运行 `npm run inspect`

**为什么会超时？**
- ADB 初始化需要时间（默认 60 秒超时）
- 扫描连接的设备需要时间
- 如果有多个设备或模拟器，扫描时间会更长
- 网络问题可能导致 ADB 连接缓慢

### 错误 11：MCP Inspector 提示 "Connection Error - Did you add the proxy session token in Configuration?"

**原因**：这是最常见的新手误区！你在 Inspector 界面填写了错误的配置。

**正确做法**：
1. ✅ **不要**在 Command 输入框填写任何内容（如 `mcp-server-everything`、`appium-mcp` 等）
2. ✅ **不要**在 Arguments 输入框填写任何内容
3. ✅ **只需要**填写 **Proxy Session Token**（从终端输出复制）
4. ✅ 或者直接点击终端输出的带 token 的完整 URL

**为什么会出现这个错误？**
- `npm run inspect` 已经自动启动了 MCP 服务器和代理
- Inspector 界面的 Command/Arguments 是用于**手动启动**服务器的（我们不需要）
- 我们只需要通过 **Session Token** 连接到已经运行的代理服务器

**正确的连接方式（两选一）：**

**方式一（推荐）：** 直接点击终端输出的 URL
```
🔗 Open inspector with token pre-filled:
   http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=275fb57a...
```

**方式二：** 手动填写 token
1. 打开 `http://localhost:6274`
2. 找到 **Configuration** 区域的 **Proxy Session Token** 输入框
3. 粘贴终端输出的 token（例如：`275fb57a76ddbfe7d710e6259af7dc73b8f93c0c68d94e1df51332c34b3a1288`）
4. 点击 **Connect**

---

## 8. 验证成功的判断标准

### 第一阶段（MCP Inspector 工具注册验证）成功标准

- [x] `npm run inspect` 命令正常启动，浏览器可以打开 `http://localhost:5173`
- [x] 工具列表中能看到 `appium_find_element`
- [x] `appium_find_element` 的 `strategy` 枚举值包含 `ai_instruction`
- [x] 调用时返回 `No driver found` 错误（而不是工具未找到的错误）

### 第二阶段（端到端测试）成功标准

- [x] `create_session` 返回 Session ID，模拟器/真机上的 App 成功打开
- [x] `appium_find_element` 返回包含 `ai-element:` 前缀的 UUID，且坐标合理
- [x] `appium_click` 返回 `Successfully clicked at coordinates`
- [x] 观察模拟器/真机屏幕，对应位置的元素确实被点击（UI 发生变化）

### 完整成功的输出示例

```
# appium_find_element 成功输出
Successfully found "Search" at coordinates (540, 156) using AI vision.
Element id ai-element:540,156:42,130,1038,182

# appium_click 成功输出
Successfully clicked at coordinates (540, 156) using AI-found element
```

---

## 9. 附录：快速参考

### 环境变量一键设置模板

```bash
# 复制以下内容，替换 YOUR_* 部分，然后在终端执行
export API_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export API_TOKEN="YOUR_DASHSCOPE_API_KEY"
export AI_VISION_MODEL="Qwen3-VL-235B-A22B-Instruct"
export ANDROID_HOME="YOUR_ANDROID_SDK_PATH"
export CAPABILITIES_CONFIG="$(pwd)/capabilities.json"

# 然后启动 Inspector
npm run inspect:built
```

### 工具调用顺序速查

```
1. select_platform    → 选择 android 或 ios
2. create_session     → 创建 Appium Session（打开 App）
3. appium_screenshot  → 截图确认当前屏幕
4. appium_find_element (strategy=ai_instruction) → AI 查找元素，获取 UUID
5. appium_click (elementUUID=ai-element:...)    → 点击 AI 找到的元素
6. delete_session     → 关闭 Session
```

### AI 查找的 UUID 格式说明

```
ai-element:540,156:42,130,1038,182
           ↑   ↑   ↑   ↑   ↑    ↑
           x   y   x1  y1  x2   y2
           (中心点)  (边界框 bbox)
```
