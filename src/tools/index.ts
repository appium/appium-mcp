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
import { FastMCP } from 'fastmcp';
import log from '../logger.js';
import answerAppium from './documentation/answer-appium.js';
import appiumSkills from './documentation/appium-skills.js';
import createSession from './session/create-session.js';
import deleteSession from './session/delete-session.js';
import listSessions from './session/list-sessions.js';
import selectSession from './session/select-session.js';
import generateLocators from './test-generation/locators.js';
import selectDevice from './session/select-device.js';
import openNotifications from './session/open-notifications.js';
import shakeDevice from './session/shake.js';
import { lockDevice, unlockDevice } from './session/lock.js';
import geolocation from './session/geolocation.js';
import deviceInfo from './session/device-info.js';
import fileTransfer from './session/file-transfer.js';
import driverSettings from './session/driver-settings.js';
import prepareIosSimulator from './ios/prepare-ios-simulator.js';
import generateTest from './test-generation/generate-tests.js';
import scroll from './navigations/scroll.js';
import scrollToElement from './navigations/scroll-to-element.js';
import swipe from './navigations/swipe.js';
import findElement from './interactions/find.js';
import tap from './interactions/tap.js';
import clickElement from './interactions/click.js';
import doubleTap from './interactions/double-tap.js';
import longPress from './interactions/long-press.js';
import dragAndDrop from './interactions/drag-and-drop.js';
import pinch from './interactions/pinch.js';
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

export default function registerTools(server: FastMCP): void {
  // Wrap addTool to inject logging around tool execution
  const originalAddTool = (server as any).addTool.bind(server);
  (server as any).addTool = (toolDef: any) => {
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
    const redactArgs = (obj: any) => {
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
      execute: async (args: any, context: any) => {
        const start = Date.now();
        log.info(`[TOOL START] ${toolName}`, redactArgs(args));
        try {
          const result = await originalExecute(args, context);
          const duration = Date.now() - start;
          log.info(`[TOOL END] ${toolName} (${duration}ms)`);
          return result;
        } catch (err: any) {
          const duration = Date.now() - start;
          const msg = err?.stack || err?.message || String(err);
          log.error(`[TOOL ERROR] ${toolName} (${duration}ms): ${msg}`);
          throw err;
        }
      },
    });
  };

  // Session Management
  selectDevice(server);
  createSession(server);
  listSessions(server);
  selectSession(server);
  deleteSession(server);
  openNotifications(server);
  shakeDevice(server);
  lockDevice(server);
  unlockDevice(server);
  geolocation(server);
  deviceInfo(server);
  fileTransfer(server);
  driverSettings(server);

  // iOS Setup
  prepareIosSimulator(server);

  // Navigation
  scroll(server);
  scrollToElement(server);
  swipe(server);

  // Element Interactions
  // PRIORITY ORDER FOR ELEMENT SEARCH:
  // 1. getActiveElement    - Get currently focused element (efficient, instant)
  // 2. findElement         - Find specific element by strategy/selector
  // 3. generateLocators    - Generate all locators (heavyweight, for debugging only)
  tap(server);
  findElement(server);
  clickElement(server);
  doubleTap(server);
  longPress(server);
  dragAndDrop(server);
  pinch(server);
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
