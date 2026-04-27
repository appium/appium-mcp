/**
 * Tools Registration Module
 *
 * This file registers all available MCP tools with the server.
 *
 * ADDING A NEW TOOL:
 * 1. Create your tool file in src/tools/
 * 2. Import it at the top of this file
 * 3. Call it in the registerTools function below
 *
 * See docs/CONTRIBUTING.md for detailed instructions.
 * See src/tools/README.md for tool organization.
 * See src/tools/metadata/README.md for YAML metadata approach.
 */
import type { ContentResult, FastMCP } from 'fastmcp';
import log from '../logger.js';
import answerAppium from './documentation/answer-appium.js';
import appiumSkills from './documentation/appium-skills.js';
import session from './session/session.js';
import generateLocators from './test-generation/locators.js';
import selectDevice from './session/select-device.js';
import mobileDeviceControl from './session/device-control.js';
import geolocation from './session/geolocation.js';
import deviceInfo from './session/device-info.js';
import fileTransfer from './session/file-transfer.js';
import driverSettings from './session/driver-settings.js';
import prepareIosSimulator from './ios/prepare-ios-simulator.js';
import generateTest from './test-generation/generate-tests.js';
import gesture from './gestures/gesture.js';
import performActionsTool from './gestures/perform-actions.js';
import dragAndDrop from './gestures/drag-and-drop.js';
import findElement from './interactions/find.js';
import pressKey from './interactions/press-key.js';
import setValue from './interactions/set-value.js';
import keyboard from './interactions/keyboard.js';
import getText from './interactions/get-text.js';
import getElementAttribute from './interactions/get-element-attribute.js';
import getActiveElement from './interactions/active-element.js';
import getPageSource from './interactions/get-page-source.js';
import orientation from './interactions/orientation.js';
import clipboard from './interactions/clipboard.js';
import alert from './interactions/handle-alert.js';
import screenshot from './interactions/screenshot.js';
import getWindowSize from './interactions/window-size.js';
import screenRecording from './interactions/screen-recording.js';
import app from './app-management/app.js';
import mobilePermissions from './app-management/permissions.js';
import context from './context/context.js';

type RegisteredTool = Parameters<FastMCP['addTool']>[0];

function sessionIdFromToolArgs(args: unknown): string | undefined {
  if (
    args &&
    typeof args === 'object' &&
    'sessionId' in args &&
    typeof (args as { sessionId?: unknown }).sessionId === 'string'
  ) {
    return (args as { sessionId: string }).sessionId;
  }
  return undefined;
}

function isErrorFromToolResult(result: unknown): boolean {
  if (
    result &&
    typeof result === 'object' &&
    'content' in result &&
    Array.isArray((result as { content: unknown }).content)
  ) {
    return (result as ContentResult).isError === true;
  }
  return false;
}

export default function registerTools(server: FastMCP): void {
  // Wrap addTool to inject logging around tool execution
  const originalAddTool = server.addTool.bind(server);
  server.addTool = (toolDef: RegisteredTool): void => {
    const toolName = toolDef?.name ?? 'unknown_tool';
    const originalExecute = toolDef?.execute;
    if (typeof originalExecute !== 'function') {
      return originalAddTool(toolDef);
    }
    const SENSITIVE_KEYS = [
      'password',
      'token',
      'accessToken',
      'authorization',
      'apiKey',
      'apikey',
      'secret',
      'clientSecret',
    ];
    const redactArgs = (obj: unknown): unknown => {
      if (obj === undefined || obj === null) {
        return obj;
      }
      try {
        return JSON.parse(
          JSON.stringify(obj, (key, value) => {
            if (
              key &&
              SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))
            ) {
              return '[REDACTED]';
            }
            // Avoid logging extremely large buffers/strings
            if (value && typeof value === 'string' && value.length > 2000) {
              return `[string:${value.length}]`;
            }
            if (
              value &&
              typeof Buffer !== 'undefined' &&
              Buffer.isBuffer(value)
            ) {
              return `[buffer:${(value as Buffer).length}]`;
            }
            return value;
          })
        );
      } catch {
        return '[Unserializable args]';
      }
    };
    return originalAddTool({
      ...toolDef,
      execute: async (args, context) => {
        const start = Date.now();
        log.info(`[TOOL START] ${toolName}`, redactArgs(args));
        try {
          const result = await originalExecute(args, context);
          const durationMs = Date.now() - start;
          log.info(
            JSON.stringify({
              tool: toolName,
              durationMs,
              sessionId: sessionIdFromToolArgs(args),
              isError: isErrorFromToolResult(result),
            })
          );
          return result;
        } catch (err: unknown) {
          const durationMs = Date.now() - start;
          log.info(
            JSON.stringify({
              tool: toolName,
              durationMs,
              sessionId: sessionIdFromToolArgs(args),
              isError: true,
            })
          );
          const msg =
            err instanceof Error ? err.stack || err.message : String(err);
          log.error(`[TOOL ERROR] ${toolName} (${durationMs}ms): ${msg}`);
          throw err;
        }
      },
    });
  };

  // Session Management
  selectDevice(server);
  session(server);
  mobileDeviceControl(server);
  geolocation(server);
  deviceInfo(server);
  fileTransfer(server);
  driverSettings(server);

  // iOS Setup
  prepareIosSimulator(server);

  // Gestures (touch input)
  gesture(server);
  dragAndDrop(server);
  performActionsTool(server);

  // Element Interactions
  // PRIORITY ORDER FOR ELEMENT SEARCH:
  // 1. getActiveElement    - Get currently focused element (efficient, instant)
  // 2. findElement         - Find specific element by strategy/selector
  // 3. generateLocators    - Generate all locators (heavyweight, for debugging only)
  findElement(server);
  pressKey(server);
  setValue(server);
  keyboard(server);
  getText(server);
  getElementAttribute(server);
  clipboard(server);
  getActiveElement(server);
  getPageSource(server);
  orientation(server);
  alert(server);
  screenshot(server);
  getWindowSize(server);
  screenRecording(server);

  // App Management
  app(server);
  mobilePermissions(server);

  // Context Management
  context(server);

  // Test Generation
  generateLocators(server);
  generateTest(server);

  // Documentation
  answerAppium(server);
  appiumSkills(server);
  log.info('All tools registered');
}
