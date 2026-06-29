import { fs } from '@appium/support';
import { URL } from 'node:url';
import { getPortFromUrl } from '../../utils/url.js';
import { findFreePort, releaseReservedPorts } from '../../utils/ports.js';
import { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';
import { XCUITestDriver } from 'appium-xcuitest-driver';
import { setSession, listSessions } from '../../session-store.js';
import {
  clearSelectedDevice,
  getSelectedLocalDevice,
} from './select-device.js';
import { IOSManager } from '../../devicemanager/ios-manager.js';
import log from '../../logger.js';
import {
  createUIResource,
  createSessionDashboardUI,
  addUIResourceToResponse,
} from '../../ui/mcp-ui-utils.js';
import type { ContentResult } from 'fastmcp';
import { errorResult, textResult, toolErrorMessage } from '../tool-response.js';
import WebDriver from 'webdriver';

/**
 * What driver should the appium-mcp session management tool create and manage.
 * 'ios' and 'android' create sessions with the embedded Appium drivers inside this MCP server.
 * 'general' is for remote servers only and just passes the capabilities through as-is without adding any defaults,
 * so it's up to the user to specify the correct driver in their capabilities (e.g., Windows, macOS, custom).
 *
 */
export const DRIVER_MODE_PLATFORMS = ['ios', 'android', 'general'] as const;

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
 * Driver port capabilities to auto-allocate per platform for embedded sessions.
 *
 * Each embedded Appium driver defaults these to a fixed port (Android
 * `systemPort` 8200 / `mjpegServerPort` 7810, iOS `wdaLocalPort` 8100), so two
 * sessions created in the same process collide unless they get distinct ports.
 * Remote callers can't pick free ports on the host, so we must do it server-side
 * where the drivers actually run.
 */
const EMBEDDED_PORT_CAPABILITIES: Record<'android' | 'ios', string[]> = {
  android: ['appium:systemPort', 'appium:mjpegServerPort'],
  ios: ['appium:wdaLocalPort', 'appium:mjpegServerPort'],
};

/**
 * Auto-allocate driver ports for an embedded (local) session.
 *
 * Purely additive: only fills a port capability the caller (config or custom
 * caps) hasn't already set, so any explicitly provided value is preserved. This
 * keeps concurrent embedded sessions from binding the drivers' shared default
 * ports. No-op for remote sessions, where ports belong to the remote host.
 *
 * Returns the capabilities plus the list of ports this call reserved, so the
 * caller can release them via {@link releaseReservedPorts} once session creation
 * settles (the reservation only needs to guard the creation window). Caller-set
 * ports are not in `allocatedPorts` — they were never reserved by us.
 */
export async function assignEmbeddedDriverPorts(
  platform: 'android' | 'ios',
  capabilities: Capabilities
): Promise<{ capabilities: Capabilities; allocatedPorts: number[] }> {
  const result = { ...capabilities };
  const allocatedPorts: number[] = [];
  for (const cap of EMBEDDED_PORT_CAPABILITIES[platform]) {
    if (result[cap] === undefined || result[cap] === '') {
      const port = await findFreePort();
      result[cap] = port;
      allocatedPorts.push(port);
      log.debug(
        `Auto-allocated ${cap}=${port} for embedded ${platform} session`
      );
    }
  }
  return { capabilities: result, allocatedPorts };
}

/**
 * Build Android capabilities by merging defaults, config, device selection, and custom capabilities
 */
export function buildAndroidCapabilities(
  configCaps: Record<string, any>,
  customCaps: Record<string, any> | undefined,
  isRemoteServer: boolean
): Capabilities {
  const givenCaps = { ...configCaps, ...customCaps };
  const selectedLocalDevice = getSelectedLocalDevice();
  const selectedDeviceUdid =
    !isRemoteServer &&
    !givenCaps['appium:udid'] &&
    selectedLocalDevice?.platform === 'android'
      ? selectedLocalDevice.udid
      : undefined;

  const defaultCaps: Capabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': 'Android Device',
  };

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

  if (selectedLocalDevice) {
    // clear the selected device since we're now using it to create a session,
    // so it doesn't affect future session creations that don't specify a device.
    // Clearing it later would cause race conditions if multiple session creations happen in parallel.
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
    const selectedLocalDevice = getSelectedLocalDevice();
    const selectedDevice = selectedLocalDevice?.udid;
    if (!selectedDevice) {
      throw new Error(
        `Multiple iOS ${deviceType === 'simulator' ? 'simulators' : 'devices'} found (${devices.length}). Use select_device with platform=ios and iosDeviceType=${deviceType} to choose one, then call appium_session_management with action=create.`
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
  const selectedLocalDevice = getSelectedLocalDevice();
  const selectedIOSDevice =
    !isRemoteServer && selectedLocalDevice?.platform === 'ios'
      ? selectedLocalDevice
      : null;

  const deviceType = selectedIOSDevice?.type || null;
  await validateIOSDeviceSelection(deviceType);

  const givenCaps = { ...configCaps, ...customCaps };
  const selectedDeviceUdid =
    !isRemoteServer &&
    !givenCaps['appium:udid'] &&
    selectedIOSDevice?.platform === 'ios'
      ? selectedIOSDevice.udid
      : undefined;
  const selectedDeviceInfo = selectedIOSDevice?.info;

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

  const additionalCaps: Record<string, any> =
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
  additionalCaps['appium:settings[pageSourceExcludedAttributes]'] =
    'visible,accessible';

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

  if (selectedIOSDevice) {
    // clear the selected device since we're now using it to create a session,
    // so it doesn't affect future session creations that don't specify a device.
    // Clearing it later would cause race conditions if multiple session creations happen in parallel.
    clearSelectedDevice();
  }

  return filterEmptyCapabilities(capabilities);
}

/**
 * For local sessions, ensure create platform matches a prior select_device choice.
 */
export function validateLocalCreatePlatformMatch(
  platform: (typeof DRIVER_MODE_PLATFORMS)[number],
  remoteServerUrl?: string
): ContentResult | undefined {
  if (remoteServerUrl || platform === 'general') {
    return undefined;
  }

  const selectedLocalDevice = getSelectedLocalDevice();

  const selectedPlatform = selectedLocalDevice?.platform;
  if (selectedPlatform && selectedPlatform !== platform) {
    return errorResult(
      `platform=${platform} does not match select_device (platform=${selectedPlatform}).`
    );
  }

  return undefined;
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
 * @param {(typeof DRIVER_MODE_PLATFORMS)[number]} args.platform - REQUIRED. The target
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
 * Returns a tool-execution error result (isError: true) on failure.
 */
export async function createSessionAction(args: {
  platform: (typeof DRIVER_MODE_PLATFORMS)[number];
  capabilities?: Record<string, any>;
  remoteServerUrl?: string;
}): Promise<ContentResult> {
  let finalCapabilities: Capabilities | undefined;

  try {
    const {
      platform,
      capabilities: customCapabilities,
      remoteServerUrl,
    } = args;

    const platformMismatch = validateLocalCreatePlatformMatch(
      platform,
      remoteServerUrl
    );
    if (platformMismatch) {
      return platformMismatch;
    }

    const configCapabilities = await loadCapabilitiesConfig();
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
      } as Capabilities;
    }

    log.info(
      `Creating new ${platform.toUpperCase()} session with capabilities:`,
      JSON.stringify(finalCapabilities, null, 2)
    );
    let sessionId;
    if (remoteServerUrl) {
      try {
        validateRemoteServerUrl(
          remoteServerUrl,
          process.env.REMOTE_SERVER_URL_ALLOW_REGEX
        );
      } catch (err: unknown) {
        return errorResult(
          `Invalid remoteServerUrl "${remoteServerUrl}". ${toolErrorMessage(err)} Pass a valid http(s) URL, or omit remoteServerUrl to use the local embedded driver.`
        );
      }

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
      await setSession(
        client,
        client.sessionId,
        finalCapabilities,
        'owned',
        args.remoteServerUrl
      );
    } else {
      if (platform === 'general') {
        return errorResult('platform=general requires remoteServerUrl.');
      }
      const allocation = await assignEmbeddedDriverPorts(
        platform,
        finalCapabilities
      );
      finalCapabilities = allocation.capabilities;
      const driver = createDriverForPlatform(platform);
      log.info(`Sending session with ${driver.constructor.name}`);
      try {
        sessionId = await createDriverSession(driver, finalCapabilities);
      } finally {
        // Release the reservations now that creation has settled: on success
        // Appium has bound the ports (the OS prevents reuse); on failure they're
        // free again. Either way the creation window they guarded is over.
        releaseReservedPorts(allocation.allocatedPorts);
      }
      await setSession(driver, sessionId, finalCapabilities, 'owned');
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
  } catch (error: unknown) {
    log.error('Error creating session:', error);
    return errorResult(
      buildCreateSessionFailureMessage(error, {
        platform: args.platform,
        remoteServerUrl: args.remoteServerUrl,
        finalCapabilities,
      })
    );
  }
}

function buildCreateSessionFailureMessage(
  error: unknown,
  ctx: {
    platform: (typeof DRIVER_MODE_PLATFORMS)[number];
    remoteServerUrl?: string;
    finalCapabilities?: Capabilities;
  }
): string {
  const detail = toolErrorMessage(error);
  const base = `Failed to create session. ${detail}`;

  if (ctx.remoteServerUrl) {
    return `${base} remoteServerUrl="${ctx.remoteServerUrl}".`;
  }

  if (/select_device/i.test(detail)) {
    return base;
  }

  const caps: Record<string, any> = ctx.finalCapabilities ?? {};
  const hasDeviceTarget =
    Boolean(caps['appium:udid'] || caps['appium:deviceName']) ||
    Boolean(getSelectedLocalDevice());

  if (
    !hasDeviceTarget &&
    (ctx.platform === 'ios' || ctx.platform === 'android')
  ) {
    return `${base} For local sessions without appium:udid (or a prior select_device), use select_device with a matching platform or pass target device capabilities, then action=create.`;
  }

  return base;
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
    if (!(await fs.hasAccess(configPath))) {
      throw new Error(
        `Capabilities config does not exist or is not accessible: ${configPath}`
      );
    }
    const configContent = await fs.readFile(configPath, 'utf8');
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

// Re-export for backward compatibility with consumers that imported from this module.
export { getPortFromUrl };
