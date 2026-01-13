/**
 * Tool to create a new mobile session (Android or iOS)
 */
import { z } from 'zod';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { URL } from 'node:url';
import { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import { XCUITestDriver } from 'appium-xcuitest-driver';
import {
  setSession,
  hasActiveSession,
  safeDeleteSession,
} from '../../session-store.js';
import {
  getSelectedDevice,
  getSelectedDeviceType,
  getSelectedDeviceInfo,
  clearSelectedDevice,
} from './select-device.js';
import { IOSManager } from '../../devicemanager/ios-manager.js';
import log from '../../logger.js';
import {
  createUIResource,
  createSessionDashboardUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import WebDriver from 'webdriver';

// Define capabilities type
interface Capabilities {
  platformName: string;
  'appium:automationName': string;
  'appium:deviceName'?: string;
  [key: string]: any;
}

// Define capabilities config type
interface CapabilitiesConfig {
  android: Record<string, any>;
  ios: Record<string, any>;
}

/**
 * Load capabilities configuration from file if specified in environment
 */
async function loadCapabilitiesConfig(): Promise<CapabilitiesConfig> {
  const configPath = process.env.CAPABILITIES_CONFIG;
  if (!configPath) {
    return { android: {}, ios: {} };
  }

  try {
    await access(configPath, constants.F_OK);
    const configContent = await readFile(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (error) {
    log.warn(`Failed to parse capabilities config: ${error}`);
    return { android: {}, ios: {} };
  }
}

/**
 * Remove empty string values from capabilities object
 */
function filterEmptyCapabilities(capabilities: Capabilities): Capabilities {
  const filtered = { ...capabilities };
  Object.keys(filtered).forEach(key => {
    if (filtered[key] === '') {
      delete filtered[key];
    }
  });
  return filtered;
}

/**
 * Build Android capabilities by merging defaults, config, device selection, and custom capabilities
 */
function buildAndroidCapabilities(
  configCaps: Record<string, any>,
  customCaps: Record<string, any> | undefined,
  isRemoteServer: boolean
): Capabilities {
  const defaultCaps: Capabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': 'Android Device',
  };

  const selectedDeviceUdid = isRemoteServer ? undefined : getSelectedDevice();

  const capabilities = {
    ...defaultCaps,
    ...configCaps,
    ...(selectedDeviceUdid && { 'appium:udid': selectedDeviceUdid }),
    ...customCaps,
  };

  if (selectedDeviceUdid) {
    clearSelectedDevice();
  }

  return filterEmptyCapabilities(capabilities);
}

/**
 * Validate iOS device selection when multiple devices are available
 */
async function validateIOSDeviceSelection(
  deviceType: 'simulator' | 'real' | null
): Promise<void> {
  if (!deviceType) {
    return;
  }

  const iosManager = IOSManager.getInstance();
  const devices = await iosManager.getDevicesByType(deviceType);

  if (devices.length > 1) {
    const selectedDevice = getSelectedDevice();
    if (!selectedDevice) {
      throw new Error(
        `Multiple iOS ${deviceType === 'simulator' ? 'simulators' : 'devices'} found (${devices.length}). Please use the select_device tool to choose which device to use before creating a session.`
      );
    }
  }
}

/**
 * Build iOS capabilities by merging defaults, config, device selection, and custom capabilities
 */
async function buildIOSCapabilities(
  configCaps: Record<string, any>,
  customCaps: Record<string, any> | undefined,
  isRemoteServer: boolean
): Promise<Capabilities> {
  const deviceType = isRemoteServer ? null : getSelectedDeviceType();
  await validateIOSDeviceSelection(deviceType);

  const defaultCaps: Capabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': 'iPhone Simulator',
  };

  const selectedDeviceUdid = isRemoteServer ? undefined : getSelectedDevice();
  const selectedDeviceInfo = isRemoteServer
    ? undefined
    : getSelectedDeviceInfo();

  log.debug('Selected device info:', selectedDeviceInfo);

  const platformVersion =
    selectedDeviceInfo?.platform && selectedDeviceInfo.platform.trim() !== ''
      ? selectedDeviceInfo.platform
      : undefined;

  log.debug('Platform version:', platformVersion);

  const capabilities = {
    ...defaultCaps,
    // Auto-detected platform version as fallback (before config)
    ...(platformVersion && { 'appium:platformVersion': platformVersion }),
    ...configCaps,
    ...(selectedDeviceUdid && { 'appium:udid': selectedDeviceUdid }),
    ...(deviceType === 'simulator' && {
      'appium:usePrebuiltWDA': true,
      'appium:wdaStartupRetries': 4,
      'appium:wdaStartupRetryInterval': 20000,
    }),
    ...customCaps,
  };

  if (selectedDeviceUdid) {
    clearSelectedDevice();
  }

  return filterEmptyCapabilities(capabilities);
}

/**
 * Create the appropriate driver instance for the given platform
 */
function createDriverForPlatform(platform: 'android' | 'ios'): any {
  if (platform === 'android') {
    return new AndroidUiautomator2Driver();
  }
  if (platform === 'ios') {
    return new XCUITestDriver();
  }
  throw new Error(
    `Unsupported platform: ${platform}. Please choose 'android' or 'ios'.`
  );
}

/**
 * Create a new session with the given driver and capabilities
 */
async function createDriverSession(
  driver: any,
  capabilities: Capabilities
): Promise<string> {
  // @ts-ignore
  const sessionId = await driver.createSession(null, {
    alwaysMatch: capabilities,
    firstMatch: [{}],
  });
  return sessionId;
}

/**
 * Registers a tool for creating a new mobile session with Android or iOS devices.
 *
 * This function adds a 'create_session' tool to the provided server that handles
 * mobile session creation with support for both local and remote Appium servers.
 *
 * @param server - The server instance to which the create_session tool will be added
 *
 * @tool create_session
 * @description Creates a new mobile session with Android or iOS device. Requires prior
 * platform selection via the select_platform tool. Supports both local and remote
 * Appium server connections.
 *
 * @param {Object} args - Tool execution arguments
 * @param {'ios' | 'android'} args.platform - REQUIRED. The target platform, must match
 * the platform explicitly selected via select_platform tool
 * @param {Object} [args.capabilities] - Optional custom W3C format capabilities
 * @param {string} [args.remoteServerUrl] - Optional remote Appium server URL
 * (e.g., http://localhost:4723). If not provided, uses local Appium server
 *
 * @returns {Promise<Object>} Response object containing:
 * - text: Success message with session ID and device details
 * - ui: Interactive session dashboard UI component
 *
 * @throws {Error} If session creation fails or platform capabilities cannot be loaded
 *
 * @example
 * // Register the tool
 * createSession(server);
 */
export default function createSession(server: any): void {
  server.addTool({
    name: 'create_session',
    description: `Create a new mobile session with Android or iOS device.
      WORKFLOW FOR LOCAL SERVERS (no remoteServerUrl):
      - Use select_platform tool FIRST to ask the user which platform they want
      - Then optionally use select_device tool if multiple devices are available
      - Finally call create_session with the selected platform and device
      - DO NOT assume or default to any platform
      WORKFLOW FOR REMOTE SERVERS (remoteServerUrl provided):
      - SKIP select_platform tool entirely
      - Infer the platform from the user's request (e.g., 'ios', 'android')
      - Infer device type from context when possible (e.g., 'simulator', 'real device')
      - Call create_session directly with platform, remoteServerUrl, and any other capabilities from the user's request
      - Example: User says 'start session with http://localhost:4723 for ios with iphone 17' → infer platform='ios' and call create_session with remoteServerUrl and platform parameters
      `,
    parameters: z.object({
      platform: z.enum(['ios', 'android']).describe(
        `REQUIRED: Platform to use. For local servers, this must match the platform the user explicitly selected via the select_platform tool.
          If remoteServerUrl is provided, the assistant should ask the user to confirm or infer the platform from the conversation; do not assume a default.`
      ),
      capabilities: z
        .object({})
        .optional()
        .describe(
          'Optional custom W3C format capabilities for the session. Common options include appium:app (app path), appium:deviceName, appium:platformVersion, appium:bundleId, appium:autoGrantPermissions, etc. Custom capabilities override default and config file settings.'
        ),
      remoteServerUrl: z
        .string()
        .optional()
        .describe(
          'Remote Appium server URL (e.g., http://localhost:4723 or http://192.168.1.100:4723). If not provided, uses local Appium server.'
        ),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (args: any, context: any): Promise<any> => {
      try {
        if (hasActiveSession()) {
          log.info(
            'Existing session detected, cleaning up before creating new session...'
          );
          try {
            await safeDeleteSession();
          } catch {
            // ok to ignore
          }
        }

        const {
          platform,
          capabilities: customCapabilities,
          remoteServerUrl,
        } = args;

        const configCapabilities = await loadCapabilitiesConfig();
        const platformCaps =
          platform === 'android'
            ? configCapabilities.android
            : configCapabilities.ios;
        const finalCapabilities =
          platform === 'android'
            ? buildAndroidCapabilities(
                platformCaps,
                customCapabilities,
                !!remoteServerUrl
              )
            : await buildIOSCapabilities(
                platformCaps,
                customCapabilities,
                !!remoteServerUrl
              );

        let sessionId;
        if (remoteServerUrl) {
          const remoteUrl = new URL(remoteServerUrl);
          const client = await WebDriver.newSession({
            protocol: remoteUrl.protocol.replace(':', ''),
            hostname: remoteUrl.hostname,
            port: parseInt(remoteUrl.port, 10),
            path: remoteUrl.pathname,
            capabilities: finalCapabilities,
          });
          sessionId = client.sessionId;
          setSession(client, client.sessionId);
        } else {
          log.info(
            `Creating new ${platform.toUpperCase()} session with capabilities:`,
            JSON.stringify(finalCapabilities, null, 2)
          );

          const driver = createDriverForPlatform(platform);
          sessionId = await createDriverSession(driver, finalCapabilities);
          setSession(driver, sessionId);
        }

        // Safely convert sessionId to string for display
        const sessionIdStr =
          typeof sessionId === 'string'
            ? sessionId
            : String(sessionId || 'Unknown');

        log.info(
          `${platform.toUpperCase()} session created successfully with ID: ${sessionIdStr}`
        );

        const textResponse = {
          content: [
            {
              type: 'text',
              text: `${platform.toUpperCase()} session created successfully with ID: ${sessionIdStr}\nPlatform: ${finalCapabilities.platformName}\nAutomation: ${finalCapabilities['appium:automationName']}\nDevice: ${finalCapabilities['appium:deviceName']}`,
            },
          ],
        };

        // Add interactive session dashboard UI
        const uiResource = createUIResource(
          `ui://appium-mcp/session-dashboard/${sessionIdStr}`,
          createSessionDashboardUI({
            sessionId: sessionIdStr,
            platform: finalCapabilities.platformName,
            automationName: finalCapabilities['appium:automationName'],
            deviceName: finalCapabilities['appium:deviceName'],
            platformVersion: finalCapabilities['appium:platformVersion'],
            udid: finalCapabilities['appium:udid'],
          })
        );

        return addUIResourceToResponse(textResponse, uiResource);
      } catch (error: any) {
        log.error('Error creating session:', error);
        throw new Error(`Failed to create session: ${error.message}`);
      }
    },
  });
}
