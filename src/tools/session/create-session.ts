import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { URL } from 'node:url';
import { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import { XCUITestDriver } from 'appium-xcuitest-driver';
import { setSession, listSessions } from '../../session-store.js';
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
import { textResult, toolErrorMessage } from '../tool-response.js';
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
  general: Record<string, any>;
}

/**
 * Remove empty string values from capabilities object
 */
export function filterEmptyCapabilities(
  capabilities: Capabilities
): Capabilities {
  const filtered = { ...capabilities };
  Object.keys(filtered).forEach((key) => {
    if (filtered[key] === '') {
      delete filtered[key];
    }
  });
  return filtered;
}

/**
 * Build Android capabilities by merging defaults, config, device selection, and custom capabilities
 */
export function buildAndroidCapabilities(
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

  const additionalCaps = {
    'appium:settings[actionAcknowledgmentTimeout]': 0,
    'appium:settings[waitForIdleTimeout]': 0,
    'appium:settings[waitForSelectorTimeout]': 0,
    'appium:autoGrantPermissions': true,
    'appium:newCommandTimeout': 300,
  };

  const capabilities = {
    ...defaultCaps,
    ...additionalCaps,
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
export async function validateIOSDeviceSelection(
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
export async function buildIOSCapabilities(
  configCaps: Record<string, any>,
  customCaps: Record<string, any> | undefined,
  isRemoteServer: boolean
): Promise<Capabilities> {
  const deviceType = isRemoteServer ? null : getSelectedDeviceType();
  await validateIOSDeviceSelection(deviceType);

  // Get selected device info BEFORE constructing defaultCaps so we can use the actual device name
  const selectedDeviceUdid = isRemoteServer ? undefined : getSelectedDevice();
  const selectedDeviceInfo = isRemoteServer
    ? undefined
    : getSelectedDeviceInfo();

  log.debug('Selected device info:', selectedDeviceInfo);

  const defaultCaps: Capabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': selectedDeviceInfo?.name || 'iPhone Simulator',
  };

  const platformVersion =
    selectedDeviceInfo?.platform && selectedDeviceInfo.platform.trim() !== ''
      ? selectedDeviceInfo.platform
      : undefined;

  const additionalCaps =
    deviceType === 'simulator'
      ? {
          'appium:usePrebuiltWDA': true,
          'appium:wdaStartupRetries': 4,
          'appium:wdaStartupRetryInterval': 20000,
        }
      : {};
  additionalCaps['appium:newCommandTimeout'] = 300;
  additionalCaps['appium:settings[animationCoolOffTimeout]'] = 0.5;
  additionalCaps['appium:settings[maxTypingFrequency]'] = 45;
  additionalCaps['appium:settings[pageSourceExcludedAttributes]'] = 'visible';

  log.debug('Platform version:', platformVersion);

  const capabilities = {
    ...defaultCaps,
    ...additionalCaps,
    // Auto-detected platform version as fallback (before config)
    ...(platformVersion && { 'appium:platformVersion': platformVersion }),
    ...configCaps,
    ...(selectedDeviceUdid && { 'appium:udid': selectedDeviceUdid }),
    // customCaps should override additionalCaps.
    ...customCaps,
  };

  if (selectedDeviceUdid) {
    clearSelectedDevice();
  }

  return filterEmptyCapabilities(capabilities);
}

/**
 * Extract port number from a URL object, using protocol defaults (https/http) when not specified.
 */
export function getPortFromUrl(url: URL): number {
  return Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
}

/**
 * Validate the provided remote server URL.
 *
 * @param remoteServerUrl - The URL of the remote Appium server to validate.
 * @param regexRule - Optional regular expression string to further validate the URL format.
 * If the regexRule is provided, the URL must match the regex pattern to be considered valid.
 * @throws {Error} If the URL is invalid.
 */
export function validateRemoteServerUrl(
  remoteServerUrl: string,
  regexRule?: string
): void {
  const regexPattern = regexRule ? new RegExp(regexRule) : /^https?:\/\/.+$/;
  if (!regexPattern.test(remoteServerUrl)) {
    throw new Error(`Invalid remoteServerUrl: ${remoteServerUrl}.`);
  }
}

/**
 * Create a new mobile session with Android or iOS device.
 *
 * Backs the `appium_session_management` tool when called with `action=create`.
 * Requires prior platform selection via the `select_device` tool for local
 * servers. Supports both local and remote Appium server connections.
 *
 * @param {Object} args - Action arguments
 * @param {'ios' | 'android' | 'general'} args.platform - REQUIRED. The target
 * platform. For local servers, must match the platform explicitly selected via
 * `select_device`. Use 'general' only with `remoteServerUrl` for non-Android/iOS
 * drivers.
 * @param {Object} [args.capabilities] - Optional custom W3C-format capabilities
 * @param {string} [args.remoteServerUrl] - Optional remote Appium server URL
 * (e.g., http://localhost:4723). If not provided, uses the local embedded driver.
 *
 * @returns {Promise<Object>} Response object containing:
 * - text: Success message with session ID and device details
 * - ui: Interactive session dashboard UI component
 *
 * @throws {Error} If session creation fails or platform capabilities cannot be loaded
 */
export async function createSessionAction(args: {
  platform: 'ios' | 'android' | 'general';
  capabilities?: Record<string, any>;
  remoteServerUrl?: string;
}): Promise<any> {
  try {
    const {
      platform,
      capabilities: customCapabilities,
      remoteServerUrl,
    } = args;

    const configCapabilities = await loadCapabilitiesConfig();
    let finalCapabilities;
    if (platform === 'android') {
      finalCapabilities = buildAndroidCapabilities(
        configCapabilities.android,
        customCapabilities,
        !!remoteServerUrl
      );
    } else if (platform === 'ios') {
      finalCapabilities = await buildIOSCapabilities(
        configCapabilities.ios,
        customCapabilities,
        !!remoteServerUrl
      );
    } else {
      finalCapabilities = {
        ...configCapabilities.general,
        ...customCapabilities,
      };
    }

    log.info(
      `Creating new ${platform.toUpperCase()} session with capabilities:`,
      JSON.stringify(finalCapabilities, null, 2)
    );
    let sessionId;
    if (remoteServerUrl) {
      validateRemoteServerUrl(
        remoteServerUrl,
        process.env.REMOTE_SERVER_URL_ALLOW_REGEX
      );

      const remoteUrl = new URL(remoteServerUrl);
      const protocol = remoteUrl.protocol.replace(':', '');
      const port = getPortFromUrl(remoteUrl);
      const user = remoteUrl.username
        ? decodeURIComponent(remoteUrl.username)
        : undefined;
      const key = remoteUrl.password
        ? decodeURIComponent(remoteUrl.password)
        : undefined;
      log.info(
        `Sending capabilities to remote server: ${protocol}://${remoteUrl.hostname}:${port}${remoteUrl.pathname}`
      );
      const client = await WebDriver.newSession({
        protocol,
        hostname: remoteUrl.hostname,
        port,
        path: remoteUrl.pathname,
        ...(user && key ? { user, key } : {}),
        capabilities: finalCapabilities,
      });
      sessionId = client.sessionId;
      setSession(client, client.sessionId, finalCapabilities, 'owned');
    } else {
      if (platform === 'general') {
        throw new Error(
          'platform="general" requires a remoteServerUrl — local drivers are not supported for general sessions.'
        );
      }
      const driver = createDriverForPlatform(platform);
      log.info(`Sending session with ${driver.constructor.name}`);
      sessionId = await createDriverSession(driver, finalCapabilities);
      setSession(driver, sessionId, finalCapabilities, 'owned');
    }

    const sessionIdStr =
      typeof sessionId === 'string'
        ? sessionId
        : String(sessionId || 'Unknown');

    log.info(
      `${platform.toUpperCase()} session created successfully with ID: ${sessionIdStr}`
    );

    const totalSessions = listSessions().length;

    const textResponse = textResult(
      `${platform.toUpperCase()} session created successfully with ID: ${sessionIdStr}\nPlatform: ${finalCapabilities.platformName}\nAutomation: ${finalCapabilities['appium:automationName']}\nDevice: ${finalCapabilities['appium:deviceName']}\nActive sessions: ${totalSessions}`
    );

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
    throw new Error(`Failed to create session: ${error.message}`, {
      cause: error,
    });
  }
}

/**
 * Load capabilities configuration from file if specified in environment
 */
async function loadCapabilitiesConfig(): Promise<CapabilitiesConfig> {
  const configPath = process.env.CAPABILITIES_CONFIG;
  if (!configPath) {
    return { android: {}, ios: {}, general: {} };
  }

  try {
    await access(configPath, constants.F_OK);
    const configContent = await readFile(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (error: unknown) {
    log.warn(`Failed to parse capabilities config: ${toolErrorMessage(error)}`);
    return { android: {}, ios: {}, general: {} };
  }
}

/**
 * Create the appropriate driver instance for the given platform
 */
function createDriverForPlatform(platform: 'android' | 'ios'): any {
  if (platform === 'android') {
    const driver = new AndroidUiautomator2Driver({} as any);
    driver.relaxedSecurityEnabled = true;
    return driver;
  }
  if (platform === 'ios') {
    const driver = new XCUITestDriver({} as any);
    driver.relaxedSecurityEnabled = true;
    return driver;
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
  const result = await driver.createSession(null, {
    alwaysMatch: capabilities,
    firstMatch: [{}],
  });
  // Appium drivers return [sessionId, caps], extract just the session ID
  return Array.isArray(result) ? result[0] : result;
}
