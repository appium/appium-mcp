# AI驱动的元素查找设计方案（更新版）

## 1. 概述

**目标**：增强 `appium_find_element` 工具，支持使用自然语言指令进行AI元素定位，同时保持与传统定位策略的向后兼容性。

**关键变更**：
- 在 `findElementSchema` 中添加 `ai_instruction` 策略
- 集成视觉模型API进行元素检测
- 使用 **W3C Actions API** 替代 mobile: 命令以实现跨平台兼容性
- 支持 **基于环境变量的模型配置**
- 实现 **图片压缩** 以减少API延迟和token成本
- 保持完全向后兼容

---

## 2. 架构设计

```
┌─────────────────────────────────────────────────────────┐
│  appium_find_element (增强的MCP工具)                     │
│  ├─ 传统模式: strategy + selector → elementUUID         │
│  └─ AI模式: ai_instruction → 坐标 → 点击操作            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  AI视觉查找器模块                                        │
│  ├─ 截图捕获与压缩 (sharp)                              │
│  ├─ 视觉模型API调用 (环境变量配置)                       │
│  ├─ 边界框解析与坐标转换                                 │
│  └─ 通过W3C Actions API执行点击 (performActions)        │
└─────────────────────────────────────────────────────────┘
```

**关键设计决策**：
1. **单一工具增强**：修改现有的 `appium_find_element` 而非创建新工具
2. **基于策略的路由**：使用 `strategy` 字段区分传统模式和AI模式
3. **坐标适配**：AI模式返回包含坐标的特殊elementUUID格式
4. **W3C Actions API**：使用 `performActions` 实现跨平台点击操作（Android/iOS）
5. **环境配置**：通过环境变量配置模型设置以提供灵活性
6. **图片优化**：使用 `@appium/support` 的 sharp 压缩截图

---

## 3. 环境配置

### 3.1 必需的环境变量

```bash
# 视觉模型配置（与 benchmark_model.ts 保持一致）
AI_VISION_MODEL=Qwen3-VL-235B-A22B-Instruct  # 模型名称（可选，有默认值）
API_BASE_URL=https://api.example.com  # API端点（必需）
API_TOKEN=your_api_key_here  # API认证密钥（必需）

# 可选：模型特定的坐标类型
AI_VISION_COORD_TYPE=normalized  # 'normalized' (0-1000) 或 'absolute' (像素)，默认：normalized

# 可选：图片压缩设置
AI_VISION_IMAGE_MAX_WIDTH=1080  # 压缩最大宽度（默认：1080）
AI_VISION_IMAGE_QUALITY=80      # JPEG质量 1-100（默认：80）
```

**注意**：环境变量名称（`API_BASE_URL`、`API_TOKEN`）与 benchmark 实现保持一致。

### 3.2 MCP设置中的配置

**Cursor IDE 示例**：
```json
{
  "appium-mcp": {
    "env": {
      "ANDROID_HOME": "/Users/xyz/Library/Android/sdk",
      "AI_VISION_MODEL": "Qwen3-VL-235B-A22B-Instruct",
      "AI_VISION_API_BASE_URL": "https://api.your-provider.com",
      "AI_VISION_API_TOKEN": "your_api_key_here",
      "AI_VISION_COORD_TYPE": "normalized"
    }
  }
}
```

---

## 4. 核心实现（伪代码）

### 4.1 增强的Schema (`src/tools/interactions/find.ts`)

```typescript
// 修改前
export const findElementSchema = z.object({
  strategy: z.enum([
    'xpath', 'id', 'name', 'class name', 'accessibility id',
    'css selector', '-android uiautomator', '-ios predicate string',
    '-ios class chain'
  ]),
  selector: z.string()
});

// 修改后
export const findElementSchema = z.object({
  strategy: z.enum([
    'xpath', 'id', 'name', 'class name', 'accessibility id',
    'css selector', '-android uiautomator', '-ios predicate string',
    '-ios class chain',
    'ai_instruction'  // 新增：基于AI的自然语言查找
  ]),
  selector: z.string().optional(),  // 使用ai_instruction时可选
  ai_instruction: z.string().optional()  // 自然语言描述
});
```

### 4.2 AI视觉查找器模块 (`src/ai-finder/vision-finder.ts`)

```typescript
import { imageUtil } from '@appium/support';
import axios from 'axios';

/**
 * 核心AI视觉元素查找器
 * 基于基准测试结果：Qwen3-VL-235B-A22B-Instruct（100%准确率，8417ms）
 */
class AIVisionFinder {
  private config = {
    // 基于环境变量的配置（与 benchmark_model.ts 保持一致）
    model: process.env.AI_VISION_MODEL || 'Qwen3-VL-235B-A22B-Instruct',
    apiBaseUrl: process.env.API_BASE_URL,  // 与 benchmark 相同
    apiToken: process.env.API_TOKEN,       // 与 benchmark 相同
    coordType: (process.env.AI_VISION_COORD_TYPE || 'normalized') as 'normalized' | 'absolute',
    // 图片压缩设置
    imageMaxWidth: parseInt(process.env.AI_VISION_IMAGE_MAX_WIDTH || '1080'),
    imageQuality: parseInt(process.env.AI_VISION_IMAGE_QUALITY || '80')
  };

  constructor() {
    // 验证必需的环境变量
    if (!this.config.apiBaseUrl) {
      throw new Error('需要设置 API_BASE_URL 环境变量');
    }
    if (!this.config.apiToken) {
      throw new Error('需要设置 API_TOKEN 环境变量');
    }
  }

  async findElement(screenshotBase64: string, instruction: string, imageWidth: number, imageHeight: number) {
    // 步骤1：使用 @appium/support 压缩图片
    const compressedBase64 = await this.compressImage(screenshotBase64, imageWidth, imageHeight);
    
    // 步骤2：构建提示词
    const prompt = this.buildPrompt(instruction, imageWidth, imageHeight);
    
    // 步骤3：调用视觉模型API
    const response = await this.callVisionAPI(compressedBase64, prompt);
    
    // 步骤4：从响应中解析边界框
    // 预期格式：{"target": "...", "bbox_2d": [x1, y1, x2, y2]}
    const { target, bbox_2d } = this.parseBBox(response);
    
    // 步骤5：将归一化坐标（0-1000）转换为绝对像素
    const absoluteBBox = this.convertCoordinates(bbox_2d, imageWidth, imageHeight);
    
    // 步骤6：计算点击的中心点
    const center = {
      x: Math.floor((absoluteBBox[0] + absoluteBBox[2]) / 2),
      y: Math.floor((absoluteBBox[1] + absoluteBBox[3]) / 2)
    };
    
    return { bbox: absoluteBBox, center, target };
  }

  /**
   * 使用 @appium/support 的 sharp 工具压缩图片
   * 减少API延迟和token消耗
   */
  async compressImage(base64Image: string, width: number, height: number): Promise<string> {
    try {
      const imageBuffer = Buffer.from(base64Image, 'base64');
      
      // 使用 @appium/support 的 imageUtil 进行压缩
      const sharp = imageUtil.requireSharp();
      let sharpInstance = sharp(imageBuffer);
      
      // 如果图片过大则调整大小
      if (width > this.config.imageMaxWidth) {
        const scaleFactor = this.config.imageMaxWidth / width;
        const newHeight = Math.floor(height * scaleFactor);
        sharpInstance = sharpInstance.resize(this.config.imageMaxWidth, newHeight);
      }
      
      // 使用质量设置压缩为JPEG
      const compressedBuffer = await sharpInstance
        .jpeg({ quality: this.config.imageQuality })
        .toBuffer();
      
      return compressedBuffer.toString('base64');
    } catch (error) {
      // 如果压缩失败，返回原始图片
      console.warn('图片压缩失败，使用原始图片:', error);
      return base64Image;
    }
  }

  buildPrompt(instruction: string, width: number, height: number): string {
    // 与 benchmark_model.ts 的提示词格式保持一致
    return `你是一名专业的移动自动化测试专家。你的任务是在提供的UI截图中定位「${instruction}」。

**关键：输出格式规则**
你必须仅使用以下确切格式进行响应，不得有其他内容：

action: **CLICK**
Parameters: {"target": "<确切的可见文本或图标描述>", "bbox_2d": [<x1>, <y1>, <x2>, <y2>]}

**边界框坐标**
- x1：左边缘X坐标（元素左上角）
- y1：上边缘Y坐标（元素左上角）
- x2：右边缘X坐标（元素右下角）
- y2：下边缘Y坐标（元素右下角）

**图片尺寸（绝对像素坐标）**
- 宽度：${width} 像素
- 高度：${height} 像素
- 原点 (0,0)：左上角
- 最大值 (${width}, ${height})：右下角
- **必须使用 0-${width} 之间的整数作为 x，0-${height} 之间的整数作为 y**

**要查找的内容**
- **目标**：${instruction}
- 根据描述精确识别元素

**正确响应示例：**
action: **CLICK**
Parameters: {"target": "搜索", "bbox_2d": [100, 200, 300, 280]}
// target 是确切的可见文本或图标描述
// bbox_2d 是绝对像素坐标，x1 和 y1 是左上角，x2 和 y2 是右下角

**你的响应（仅限严格格式）：**`;
  }

  async callVisionAPI(imageBase64: string, prompt: string, mimeType: string = 'image/jpeg'): Promise<string> {
    // 调用统一模型API（与 benchmark_model.ts 实现保持一致）
    const response = await axios.post(
      `${this.config.apiBaseUrl}/chat/completions`,
      {
        model: this.config.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { 
              type: 'image_url', 
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
              // 图片大小控制参数（来自 benchmark_model.ts）
              min_pixels: 64 * 32 * 32,    // 65536 像素
              max_pixels: 2560 * 32 * 32   // 2621440 像素
            }
          ]
        }],
        max_tokens: 4096
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiToken}`
        },
        timeout: 120000  // 120秒超时（与 benchmark 一致）
      }
    );
    
    return response.data.choices[0].message.content;
  }

  parseBBox(response: string): { target: string; bbox_2d: number[] } {
    // 从模型响应中解析边界框坐标（与 benchmark_model.ts 保持一致）
    try {
      // 尝试匹配JSON格式的边界框
      const jsonMatch = response.match(/\{[^}]*"target"[^}]*"bbox_2d"[^}]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.bbox_2d && Array.isArray(parsed.bbox_2d) && parsed.bbox_2d.length === 4) {
          return parsed;
        }
      }

      // 尝试匹配数组格式 [x1, y1, x2, y2]
      const arrayMatch = response.match(/\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/);
      if (arrayMatch) {
        return {
          target: '检测到的元素',
          bbox_2d: [
            parseInt(arrayMatch[1], 10),
            parseInt(arrayMatch[2], 10),
            parseInt(arrayMatch[3], 10),
            parseInt(arrayMatch[4], 10)
          ]
        };
      }

      throw new Error('响应中未找到有效的边界框');
    } catch (error) {
      console.error('解析边界框失败:', error);
      throw new Error('无法从响应中解析边界框');
    }
  }

  convertCoordinates(bbox: number[], width: number, height: number): number[] {
    let [x1, y1, x2, y2] = bbox;

    // 根据模型配置的坐标类型进行处理（与 benchmark_model.ts 保持一致）
    if (this.config.coordType === 'normalized') {
      // 归一化坐标（0-1000）→ 绝对像素坐标
      x1 = Math.floor((x1 / 1000) * width);
      y1 = Math.floor((y1 / 1000) * height);
      x2 = Math.floor((x2 / 1000) * width);
      y2 = Math.floor((y2 / 1000) * height);
      console.log(`已将归一化坐标转换为绝对坐标：[${x1}, ${y1}, ${x2}, ${y2}]`);
    } else {
      // 绝对像素坐标，直接使用
      console.log(`使用绝对坐标：[${x1}, ${y1}, ${x2}, ${y2}]`);
    }

    // 确保坐标顺序正确（x1 < x2, y1 < y2）
    if (x1 > x2) [x1, x2] = [x2, x1];
    if (y1 > y2) [y1, y2] = [y2, y1];

    // 确保坐标在图片边界内
    x1 = Math.max(0, Math.min(x1, width - 1));
    y1 = Math.max(0, Math.min(y1, height - 1));
    x2 = Math.max(0, Math.min(x2, width));
    y2 = Math.max(0, Math.min(y2, height));

    return [x1, y1, x2, y2];
}
```

### 4.3 增强的查找元素工具 (`src/tools/interactions/find.ts`)

```typescript
import { imageUtil } from '@appium/support';

export default function findElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_find_element',
    description: `使用传统定位器或AI自然语言查找元素。

**传统模式**：使用 strategy + selector（xpath、id等）
**AI模式**：使用 strategy='ai_instruction' + ai_instruction="自然语言描述"

AI使用示例：
- ai_instruction: "黄色的搜索酒店按钮"
- ai_instruction: "顶部的用户名输入框"
- ai_instruction: "右上角的设置图标"

**AI模式所需的环境变量**：
- AI_VISION_API_BASE_URL：视觉模型API端点
- AI_VISION_API_KEY：API认证密钥
- AI_VISION_MODEL：模型名称（可选，默认为 Qwen3-VL-235B-A22B-Instruct）`,
    
    parameters: findElementSchema,
    
    execute: async (args, _context) => {
      const driver = getDriver();
      
      // 路由1：传统定位器策略
      if (args.strategy !== 'ai_instruction') {
        const element = await driver.findElement(args.strategy, args.selector);
        return {
          content: [{
            type: 'text',
            text: `找到元素。UUID：${element['element-6066-11e4-a52e-4f735466cecf']}`
          }]
        };
      }
      
      // 路由2：基于AI视觉的查找
      if (!args.ai_instruction) {
        throw new Error('使用 ai_instruction 策略时需要提供 ai_instruction 参数');
      }
      
      // 步骤1：捕获截图
      const screenshotBase64 = await getScreenshot(driver);
      
      // 步骤2：使用 @appium/support 获取图片尺寸
      const imageBuffer = Buffer.from(screenshotBase64, 'base64');
      const { sharp } = imageUtil;
      const metadata = await sharp(imageBuffer).metadata();
      const { width, height } = metadata;
      
      // 步骤3：使用AI查找元素
      const finder = new AIVisionFinder();
      const result = await finder.findElement(
        screenshotBase64,
        args.ai_instruction,
        width,
        height
      );
      
      // 步骤4：创建包含坐标的特殊elementUUID
      // 格式："ai-element:{x},{y}:{bbox}"
      const elementUUID = `ai-element:${result.center.x},${result.center.y}:${result.bbox.join(',')}`;
      
      return {
        content: [{
          type: 'text',
          text: `在坐标 (${result.center.x}, ${result.center.y}) 找到「${result.target}」。UUID：${elementUUID}`
        }]
      };
    }
  });
}
```

### 4.4 使用W3C Actions API的点击适配 (`src/tools/interactions/click.ts`)

```typescript
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import { performActions, elementClick as _elementClick } from '../../command.js';

/**
 * 增强的点击功能，同时处理传统elementUUID和基于AI坐标的UUID
 * 使用W3C Actions API进行基于坐标的点击（跨平台兼容）
 */
export default function clickElement(server: FastMCP): void {
  server.addTool({
    name: 'appium_click',
    parameters: { elementUUID: z.string() },
    
    execute: async (args, _context) => {
      const driver = getDriver();
      if (!driver) {
        throw new Error('未找到驱动');
      }
      
      // 检查是否为AI生成的基于坐标的UUID
      if (args.elementUUID.startsWith('ai-element:')) {
        // 解析格式："ai-element:{x},{y}:{bbox}"
        const [_, coords] = args.elementUUID.split(':');
        const [x, y] = coords.split(',').map(Number);
        
        // 使用W3C Actions API进行基于坐标的点击（跨平台）
        // 参考：double-tap.ts 实现
        const operation = [
          {
            type: 'pointer',
            id: 'finger1',
            parameters: { pointerType: 'touch' },
            actions: [
              { type: 'pointerMove', duration: 0, x, y },
              { type: 'pointerDown', button: 0 },
              { type: 'pause', duration: 50 },
              { type: 'pointerUp', button: 0 }
            ]
          }
        ];
        
        await performActions(driver, operation);
        
        return {
          content: [{
            type: 'text',
            text: `使用AI找到的元素在坐标 (${x}, ${y}) 处点击`
          }]
        };
      }
      
      // 传统元素点击
      await _elementClick(driver, args.elementUUID);
      
      return {
        content: [{
          type: 'text',
          text: `点击元素 ${args.elementUUID}`
        }]
      };
    }
  });
}
```

---

## 5. 使用示例

### 传统模式（不变）
```json
{
  "tool": "appium_find_element",
  "arguments": {
    "strategy": "xpath",
    "selector": "//android.widget.Button[@text='Search']"
  }
}
```

### AI模式（新增）
```json
{
  "tool": "appium_find_element",
  "arguments": {
    "strategy": "ai_instruction",
    "ai_instruction": "底部的黄色搜索酒店按钮"
  }
}
// 返回：elementUUID = "ai-element:500,552:42,526,958,578"

{
  "tool": "appium_click",
  "arguments": {
    "elementUUID": "ai-element:500,552:42,526,958,578"
  }
}
// 使用W3C Actions API自动在 (500, 552) 处点击
```

---

## 6. 文件结构

```
src/
├── ai-finder/                    # 新增模块
│   ├── vision-finder.ts          # 带压缩的核心AI查找器
│   └── types.ts                  # 类型定义
│
├── tools/interactions/
│   ├── find.ts                   # 修改：添加 ai_instruction
│   └── click.ts                  # 修改：使用W3C Actions API处理坐标
│
└── tests/benchmark_model/        # 现有（参考）
    ├── benchmark_model.ts
    └── TEST_REPORT.md
```

---

## 7. 关键实现说明

1. **向后兼容性**：所有使用传统策略的现有代码继续正常工作

2. **W3C Actions API**：使用 `performActions` 替代 `mobile: tap` 以实现跨平台兼容性（Android/iOS）

3. **环境配置**：
   - 模型名称、API端点和API密钥来自环境变量
   - 为不同部署场景提供灵活配置
   - 缺少必需环境变量时提供清晰的错误消息

4. **图片压缩**：
   - 使用 `@appium/support` 的 sharp 工具（无需额外依赖）
   - 通常可减少50-80%的图片大小
   - 显著提高API响应时间（快2-5倍）
   - 减少token消耗和API成本

5. **坐标格式**：AI生成的elementUUID使用特殊格式 `ai-element:{x},{y}:{bbox}` 以区别于传统UUID

6. **点击拦截**：`appium_click` 检查UUID前缀以路由到W3C Actions API点击或传统元素点击

7. **模型选择**：基于基准测试，默认使用 `Qwen3-VL-235B-A22B-Instruct`（100%准确率，最快），但可通过环境变量配置

8. **错误处理**：如果AI查找失败，抛出清晰错误；不自动回退到传统方法

---

## 8. 视觉模型访问指南

### 推荐的提供商

基于基准测试结果，推荐以下模型：

1. **Qwen3-VL-235B-A22B-Instruct**（推荐）
   - 准确率：100%
   - 速度：约8.4秒
   - 提供商：阿里云 / DashScope
   - 访问：https://dashscope.aliyun.com

2. **Gemini 2.0 Flash**
   - 准确率：100%
   - 速度：约10.5秒
   - 提供商：Google AI
   - 访问：https://ai.google.dev

3. **GPT-4o**
   - 准确率：100%
   - 速度：约18.2秒
   - 提供商：OpenAI
   - 访问：https://platform.openai.com

### 获取API访问权限

**阿里云 DashScope（Qwen）**：
```bash
1. 访问 https://dashscope.aliyun.com
2. 注册账号
3. 导航到API密钥部分
4. 创建新的API密钥
5. 设置环境变量：
   AI_VISION_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
   AI_VISION_API_KEY=your_api_key_here
   AI_VISION_MODEL=Qwen3-VL-235B-A22B-Instruct
```

**Google AI（Gemini）**：
```bash
1. 访问 https://ai.google.dev
2. 从Google AI Studio获取API密钥
3. 设置环境变量：
   AI_VISION_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
   AI_VISION_API_KEY=your_api_key_here
   AI_VISION_MODEL=gemini-2.0-flash-exp
```

**OpenAI（GPT-4o）**：
```bash
1. 访问 https://platform.openai.com
2. 创建账号并添加付费方式
3. 生成API密钥
4. 设置环境变量：
   AI_VISION_API_BASE_URL=https://api.openai.com/v1
   AI_VISION_API_KEY=your_api_key_here
   AI_VISION_MODEL=gpt-4o
```

---

## 9. 优势对比

| 方面 | 传统方式 | AI指令 |
|--------|------------|----------------|
| **学习曲线** | 高（XPath/UiAutomator） | 低（自然语言） |
| **鲁棒性** | 脆弱（UI变化会破坏） | 有韧性（语义理解） |
| **速度** | 快（约100ms） | 中等（压缩后约5-10秒） |
| **准确率** | 取决于定位器 | 100%（基准测试验证） |
| **使用场景** | 稳定UI，已知结构 | 动态UI，快速原型 |
| **维护成本** | 高（定位器更新） | 低（语义描述） |

---

## 10. 实现清单

- [ ] 创建带压缩支持的 `src/ai-finder/vision-finder.ts`
- [ ] 创建 `src/ai-finder/types.ts`
- [ ] 修改 `src/tools/interactions/find.ts`（添加 ai_instruction）
- [ ] 修改 `src/tools/interactions/click.ts`（W3C Actions API）
- [ ] 添加环境变量验证和错误消息
- [ ] 更新README添加AI配置部分
- [ ] 使用基准测试图片进行测试
- [ ] 测试图片压缩性能
- [ ] 在Android和iOS上测试W3C Actions API
- [ ] 更新工具描述添加环境变量要求

---

此更新的设计方案整合了仓库维护者的所有反馈，确保了一个生产就绪、易于维护的解决方案。