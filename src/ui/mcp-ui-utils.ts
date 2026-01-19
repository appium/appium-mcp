/**
 * MCP-UI Utility Functions
 *
 * This module provides utilities for creating UI resources using MCP-UI protocol.
 * It enables interactive UI components to be returned alongside text responses.
 *
 * Reference: https://mcpui.dev/guide/introduction
 */

/**
 * Creates a UIResource object following MCP-UI protocol
 * @param uri - Unique identifier using ui:// scheme (e.g., 'ui://appium-mcp/device-picker')
 * @param htmlContent - HTML string to render in the iframe
 * @returns UIResource object ready to be included in MCP response content
 */
export function createUIResource(
  uri: string,
  htmlContent: string
): {
  type: 'resource';
  resource: {
    uri: string;
    mimeType: 'text/html';
    text: string;
  };
} {
  return {
    type: 'resource',
    resource: {
      uri,
      mimeType: 'text/html',
      text: htmlContent,
    },
  };
}

/**
 * Creates a device picker UI component
 * @param devices - Array of device objects with name, udid, state, etc.
 * @param platform - 'android' or 'ios'
 * @param deviceType - 'simulator' or 'real' for iOS
 * @returns HTML string for device picker UI
 */
export function createDevicePickerUI(
  devices: Array<{
    name?: string;
    udid: string;
    state?: string;
    type?: string;
  }>,
  platform: 'android' | 'ios',
  deviceType?: 'simulator' | 'real'
): string {
  const deviceTypeLabel =
    platform === 'ios' && deviceType
      ? deviceType === 'simulator'
        ? 'iOS Simulators'
        : 'iOS Devices'
      : 'Android Devices';

  const deviceCards = devices
    .map(
      (device, index) => `
    <div class="device-card" data-udid="${device.udid}" data-index="${index}">
      <div class="device-header">
        <h3>${device.name || device.udid}</h3>
        ${device.state ? `<span class="device-state ${device.state.toLowerCase()}">${device.state}</span>` : ''}
      </div>
      <div class="device-details">
        <p><strong>UDID:</strong> <code>${device.udid}</code></p>
        ${device.type ? `<p><strong>Type:</strong> ${device.type}</p>` : ''}
      </div>
      <button class="select-device-btn" onclick="selectDevice('${device.udid}')">
        Select Device
      </button>
    </div>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Device Picker - ${deviceTypeLabel}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      padding: 20px;
      background: #f5f5f5;
      color: #333;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 24px;
      margin-bottom: 8px;
      color: #1a1a1a;
    }
    .header p {
      color: #666;
      font-size: 14px;
    }
    .devices-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }
    .device-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      transition: all 0.2s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .device-card:hover {
      border-color: #007AFF;
      box-shadow: 0 4px 12px rgba(0,122,255,0.15);
      transform: translateY(-2px);
    }
    .device-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .device-header h3 {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
    }
    .device-state {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
    }
    .device-state.booted {
      background: #d4edda;
      color: #155724;
    }
    .device-state.shutdown {
      background: #f8d7da;
      color: #721c24;
    }
    .device-details {
      margin-bottom: 12px;
      font-size: 13px;
    }
    .device-details p {
      margin-bottom: 6px;
      color: #666;
    }
    .device-details code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    .select-device-btn {
      width: 100%;
      padding: 10px 16px;
      background: #007AFF;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    .select-device-btn:hover {
      background: #0056b3;
    }
    .select-device-btn:active {
      transform: scale(0.98);
    }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📱 Select ${deviceTypeLabel}</h1>
      <p>Found ${devices.length} device${devices.length !== 1 ? 's' : ''}. Click on a device to select it.</p>
    </div>
    <div class="devices-grid">
      ${devices.length > 0 ? deviceCards : '<div class="empty-state">No devices found</div>'}
    </div>
  </div>
  <script>
    function selectDevice(udid) {
      // Send intent message to parent window
      window.parent.postMessage({
        type: 'intent',
        payload: {
          intent: 'select-device',
          params: {
            platform: '${platform}',
            ${deviceType ? `deviceType: '${deviceType}',` : ''}
            deviceUdid: udid
          }
        }
      }, '*');
    }

    // Add click handlers for better UX
    document.querySelectorAll('.device-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('select-device-btn')) return;
        const udid = card.dataset.udid;
        selectDevice(udid);
      });
    });
  </script>
</body>
</html>
  `;
}

/**
 * Creates a screenshot viewer UI component
 * @param screenshotBase64 - Base64 encoded PNG image
 * @param filepath - Path where screenshot was saved
 * @returns HTML string for screenshot viewer
 */
export function createScreenshotViewerUI(
  screenshotBase64: string,
  filepath: string
): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Screenshot Viewer</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #1a1a1a;
      color: #fff;
      padding: 20px;
      overflow: hidden;
    }
    .viewer-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      max-width: 100%;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #2a2a2a;
      border-radius: 8px 8px 0 0;
      margin-bottom: 1px;
    }
    .toolbar-left {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .toolbar-right {
      display: flex;
      gap: 8px;
    }
    .btn {
      padding: 6px 12px;
      background: #007AFF;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #0056b3;
    }
    .btn-secondary {
      background: #444;
    }
    .btn-secondary:hover {
      background: #555;
    }
    .filepath {
      font-size: 12px;
      color: #999;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    .image-container {
      flex: 1;
      overflow: auto;
      background: #1a1a1a;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .screenshot-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 4px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      cursor: zoom-in;
    }
    .screenshot-img.zoomed {
      cursor: zoom-out;
      transform: scale(2);
      transition: transform 0.3s;
    }
    .zoom-controls {
      position: absolute;
      bottom: 20px;
      right: 20px;
      display: flex;
      gap: 8px;
      background: rgba(42, 42, 42, 0.9);
      padding: 8px;
      border-radius: 6px;
    }
    .zoom-btn {
      width: 32px;
      height: 32px;
      background: #007AFF;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .zoom-btn:hover {
      background: #0056b3;
    }
  </style>
</head>
<body>
  <div class="viewer-container">
    <div class="toolbar">
      <div class="toolbar-left">
        <span style="font-size: 14px; font-weight: 500;">📸 Screenshot</span>
        <span class="filepath">${filepath}</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-secondary" onclick="downloadScreenshot()">Download</button>
        <button class="btn" onclick="takeNewScreenshot()">Take New</button>
      </div>
    </div>
    <div class="image-container" id="imageContainer">
      <img src="data:image/png;base64,${screenshotBase64}"
           alt="Screenshot"
           class="screenshot-img"
           id="screenshotImg"
           onclick="toggleZoom()">
    </div>
    <div class="zoom-controls">
      <button class="zoom-btn" onclick="zoomIn()">+</button>
      <button class="zoom-btn" onclick="zoomOut()">−</button>
      <button class="zoom-btn" onclick="resetZoom()">⌂</button>
    </div>
  </div>
  <script>
    let currentZoom = 1;
    const img = document.getElementById('screenshotImg');

    function toggleZoom() {
      if (currentZoom === 1) {
        zoomIn();
      } else {
        resetZoom();
      }
    }

    function zoomIn() {
      currentZoom = Math.min(currentZoom + 0.5, 4);
      img.style.transform = \`scale(\${currentZoom})\`;
    }

    function zoomOut() {
      currentZoom = Math.max(currentZoom - 0.5, 0.5);
      img.style.transform = \`scale(\${currentZoom})\`;
    }

    function resetZoom() {
      currentZoom = 1;
      img.style.transform = 'scale(1)';
    }

    function downloadScreenshot() {
      const link = document.createElement('a');
      link.href = img.src;
      link.download = '${filepath.split('/').pop() || 'screenshot.png'}';
      link.click();
    }

    function takeNewScreenshot() {
      window.parent.postMessage({
        type: 'tool',
        payload: {
          toolName: 'appium_screenshot',
          params: {}
        }
      }, '*');
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
      if (e.key === '0') resetZoom();
    });
  </script>
</body>
</html>
  `;
}

/**
 * Creates a session dashboard UI component
 * @param sessionInfo - Session information object
 * @returns HTML string for session dashboard
 */
export function createSessionDashboardUI(sessionInfo: {
  sessionId: string | any;
  platform: string;
  automationName: string;
  deviceName?: string;
  platformVersion?: string;
  udid?: string;
}): string {
  // Safely convert sessionId to string
  const sessionIdStr =
    typeof sessionInfo.sessionId === 'string'
      ? sessionInfo.sessionId
      : String(sessionInfo.sessionId || 'Unknown');

  // Get first 8 characters for display, or full string if shorter
  const sessionIdDisplay =
    sessionIdStr.length > 8
      ? `${sessionIdStr.substring(0, 8)}...`
      : sessionIdStr;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      padding: 20px;
    }
    .dashboard {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #007AFF 0%, #0056b3 100%);
      color: white;
      padding: 24px;
    }
    .header h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .header .status {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(255,255,255,0.2);
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .content {
      padding: 24px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .info-card {
      padding: 16px;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 3px solid #007AFF;
    }
    .info-card label {
      display: block;
      font-size: 12px;
      color: #666;
      margin-bottom: 4px;
      text-transform: uppercase;
      font-weight: 500;
    }
    .info-card value {
      display: block;
      font-size: 16px;
      color: #1a1a1a;
      font-weight: 600;
    }
    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #007AFF;
      color: white;
    }
    .btn-primary:hover {
      background: #0056b3;
    }
    .btn-secondary {
      background: #f0f0f0;
      color: #333;
    }
    .btn-secondary:hover {
      background: #e0e0e0;
    }
    .btn-danger {
      background: #dc3545;
      color: white;
    }
    .btn-danger:hover {
      background: #c82333;
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <div class="header">
      <h1>📱 Appium Session Dashboard</h1>
      <span class="status">● Active</span>
    </div>
    <div class="content">
      <div class="info-grid">
        <div class="info-card">
          <label>Session ID</label>
          <value>${sessionIdDisplay}</value>
        </div>
        <div class="info-card">
          <label>Platform</label>
          <value>${sessionInfo.platform}</value>
        </div>
        <div class="info-card">
          <label>Automation</label>
          <value>${sessionInfo.automationName}</value>
        </div>
        ${
          sessionInfo.deviceName
            ? `
        <div class="info-card">
          <label>Device</label>
          <value>${sessionInfo.deviceName}</value>
        </div>
        `
            : ''
        }
        ${
          sessionInfo.platformVersion
            ? `
        <div class="info-card">
          <label>Platform Version</label>
          <value>${sessionInfo.platformVersion}</value>
        </div>
        `
            : ''
        }
        ${
          sessionInfo.udid
            ? `
        <div class="info-card">
          <label>UDID</label>
          <value><code style="font-size: 12px;">${sessionInfo.udid}</code></value>
        </div>
        `
            : ''
        }
      </div>
      <div class="actions">
        <button class="btn btn-primary" onclick="takeScreenshot()">📸 Screenshot</button>
        <button class="btn btn-primary" onclick="getPageSource()">📄 Page Source</button>
        <button class="btn btn-primary" onclick="generateLocators()">🔍 Generate Locators</button>
        <button class="btn btn-secondary" onclick="getContexts()">🌐 Contexts</button>
        <button class="btn btn-danger" onclick="deleteSession()">🗑️ End Session</button>
      </div>
    </div>
  </div>
  <script>
    function takeScreenshot() {
      window.parent.postMessage({
        type: 'tool',
        payload: {
          toolName: 'appium_screenshot',
          params: {}
        }
      }, '*');
    }

    function getPageSource() {
      window.parent.postMessage({
        type: 'tool',
        payload: {
          toolName: 'appium_get_page_source',
          params: {}
        }
      }, '*');
    }

    function generateLocators() {
      window.parent.postMessage({
        type: 'tool',
        payload: {
          toolName: 'generate_locators',
          params: {}
        }
      }, '*');
    }

    function getContexts() {
      window.parent.postMessage({
        type: 'tool',
        payload: {
          toolName: 'appium_get_contexts',
          params: {}
        }
      }, '*');
    }

    function deleteSession() {
      if (confirm('Are you sure you want to end this session?')) {
        window.parent.postMessage({
          type: 'tool',
          payload: {
            toolName: 'delete_session',
            params: {}
          }
        }, '*');
      }
    }
  </script>
</body>
</html>
  `;
}

/**
 * Creates a locator generator UI component
 * @param locators - Array of elements with locators
 * @returns HTML string for locator generator UI
 */
export function createLocatorGeneratorUI(
  locators: Array<{
    tagName: string;
    locators: Record<string, string>;
    text: string;
    contentDesc: string;
    resourceId: string;
    clickable: boolean;
    enabled: boolean;
    displayed: boolean;
  }>
): string {
  const locatorCards = locators
    .map(
      (element, index) => `
    <div class="locator-card" data-index="${index}">
      <div class="locator-header">
        <h3>${element.tagName}</h3>
        <div class="badges">
          ${element.clickable ? '<span class="badge badge-clickable">Clickable</span>' : ''}
          ${element.enabled ? '<span class="badge badge-enabled">Enabled</span>' : ''}
          ${element.displayed ? '<span class="badge badge-displayed">Displayed</span>' : ''}
        </div>
      </div>
      ${element.text ? `<p class="element-text"><strong>Text:</strong> ${element.text}</p>` : ''}
      ${element.contentDesc ? `<p class="element-text"><strong>Content Desc:</strong> ${element.contentDesc}</p>` : ''}
      ${element.resourceId ? `<p class="element-text"><strong>Resource ID:</strong> <code>${element.resourceId}</code></p>` : ''}
      <div class="locators-list">
        ${Object.entries(element.locators)
          .map(
            ([strategy, selector]) => `
          <div class="locator-item">
            <span class="strategy">${strategy}</span>
            <code class="selector">${selector}</code>
            <button class="test-btn" onclick="testLocator('${strategy}', \`${selector.replace(/`/g, '\\`')}\`)">Test</button>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Locator Generator</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .locators-grid {
      display: grid;
      gap: 16px;
    }
    .locator-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .locator-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .locator-header h3 {
      font-size: 16px;
      font-weight: 600;
    }
    .badges {
      display: flex;
      gap: 6px;
    }
    .badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
    }
    .badge-clickable {
      background: #d4edda;
      color: #155724;
    }
    .badge-enabled {
      background: #d1ecf1;
      color: #0c5460;
    }
    .badge-displayed {
      background: #fff3cd;
      color: #856404;
    }
    .element-text {
      font-size: 13px;
      color: #666;
      margin-bottom: 8px;
    }
    .element-text code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
    }
    .locators-list {
      margin-top: 12px;
    }
    .locator-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px;
      background: #f8f9fa;
      border-radius: 4px;
      margin-bottom: 6px;
    }
    .strategy {
      font-size: 12px;
      font-weight: 600;
      color: #007AFF;
      min-width: 120px;
    }
    .selector {
      flex: 1;
      font-size: 12px;
      font-family: 'Monaco', 'Menlo', monospace;
      background: white;
      padding: 4px 8px;
      border-radius: 3px;
      overflow-x: auto;
    }
    .test-btn {
      padding: 4px 12px;
      background: #007AFF;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }
    .test-btn:hover {
      background: #0056b3;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 Generated Locators</h1>
      <p>Found ${locators.length} interactable element${locators.length !== 1 ? 's' : ''}</p>
    </div>
    <div class="locators-grid">
      ${locators.length > 0 ? locatorCards : '<p>No locators found</p>'}
    </div>
  </div>
  <script>
    function testLocator(strategy, selector) {
      window.parent.postMessage({
        type: 'tool',
        payload: {
          toolName: 'appium_find_element',
          params: {
            strategy: strategy,
            selector: selector
          }
        }
      }, '*');
    }
  </script>
</body>
</html>
  `;
}

/**
 * Creates a page source inspector UI component
 * @param pageSource - XML page source string
 * @returns HTML string for page source inspector
 */
export function createPageSourceInspectorUI(pageSource: string): string {
  // Escape HTML for safe display
  const escapedSource = pageSource
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Source Inspector</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 0;
      overflow: hidden;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #2d2d2d;
      border-bottom: 1px solid #3e3e3e;
    }
    .toolbar-left {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .toolbar-right {
      display: flex;
      gap: 8px;
    }
    .btn {
      padding: 6px 12px;
      background: #007AFF;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .btn:hover {
      background: #0056b3;
    }
    .btn-secondary {
      background: #444;
    }
    .btn-secondary:hover {
      background: #555;
    }
    .info {
      font-size: 12px;
      color: #999;
    }
    .viewer {
      height: calc(100vh - 50px);
      overflow: auto;
      padding: 16px;
    }
    .xml-content {
      background: #1e1e1e;
      color: #d4d4d4;
      white-space: pre;
      font-size: 13px;
      line-height: 1.6;
    }
    .xml-tag {
      color: #569cd6;
    }
    .xml-attr {
      color: #9cdcfe;
    }
    .xml-value {
      color: #ce9178;
    }
    .search-box {
      padding: 6px 12px;
      background: #3e3e3e;
      border: 1px solid #555;
      border-radius: 4px;
      color: #d4d4d4;
      font-size: 13px;
      width: 200px;
    }
    .search-box:focus {
      outline: none;
      border-color: #007AFF;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <span style="font-size: 14px; font-weight: 500;">📄 Page Source Inspector</span>
      <span class="info">${pageSource.length} characters</span>
    </div>
    <div class="toolbar-right">
      <input type="text" class="search-box" id="searchBox" placeholder="Search...">
      <button class="btn btn-secondary" onclick="copyToClipboard()">Copy</button>
      <button class="btn btn-secondary" onclick="formatXML()">Format</button>
      <button class="btn" onclick="generateLocators()">Generate Locators</button>
    </div>
  </div>
  <div class="viewer">
    <pre class="xml-content" id="xmlContent">${escapedSource}</pre>
  </div>
  <script>
    function copyToClipboard() {
      const text = document.getElementById('xmlContent').textContent;
      navigator.clipboard.writeText(text).then(() => {
        alert('Copied to clipboard!');
      });
    }

    function formatXML() {
      const content = document.getElementById('xmlContent').textContent;
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, 'text/xml');
        const serializer = new XMLSerializer();
        const formatted = serializer.serializeToString(xmlDoc);
        document.getElementById('xmlContent').textContent = formatted;
      } catch (e) {
        alert('Failed to format XML');
      }
    }

    function generateLocators() {
      window.parent.postMessage({
        type: 'tool',
        payload: {
          toolName: 'generate_locators',
          params: {}
        }
      }, '*');
    }

    // Search functionality
    document.getElementById('searchBox').addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const content = document.getElementById('xmlContent');
      if (!searchTerm) {
        content.innerHTML = \`${escapedSource}\`;
        return;
      }
      const highlighted = content.textContent.replace(
        new RegExp(\`(\${searchTerm})\`, 'gi'),
        '<mark style="background: #ffd700; color: #000;">$1</mark>'
      );
      content.innerHTML = highlighted;
    });
  </script>
</body>
</html>
  `;
}

/**
 * Creates a context switcher UI component
 * @param contexts - Array of context names
 * @param currentContext - Currently active context name
 * @returns HTML string for context switcher
 */
export function createContextSwitcherUI(
  contexts: string[],
  currentContext: string | null
): string {
  const contextCards = contexts
    .map(
      (context) => `
    <div class="context-card ${context === currentContext ? 'active' : ''}"
         onclick="switchContext('${context}')">
      <div class="context-header">
        <h3>${context}</h3>
        ${context === currentContext ? '<span class="badge-active">Active</span>' : ''}
      </div>
      <div class="context-type">
        ${context === 'NATIVE_APP' ? '📱 Native App' : '🌐 WebView'}
      </div>
      <button class="switch-btn" onclick="event.stopPropagation(); switchContext('${context}')">
        ${context === currentContext ? 'Current' : 'Switch'}
      </button>
    </div>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Context Switcher</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .header p {
      color: #666;
      font-size: 14px;
    }
    .contexts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 16px;
    }
    .context-card {
      background: white;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .context-card:hover {
      border-color: #007AFF;
      box-shadow: 0 4px 12px rgba(0,122,255,0.15);
      transform: translateY(-2px);
    }
    .context-card.active {
      border-color: #007AFF;
      background: #f0f7ff;
    }
    .context-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .context-header h3 {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    .badge-active {
      padding: 4px 8px;
      background: #d4edda;
      color: #155724;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
    }
    .context-type {
      font-size: 13px;
      color: #666;
      margin-bottom: 12px;
    }
    .switch-btn {
      width: 100%;
      padding: 8px 16px;
      background: #007AFF;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    .switch-btn:hover {
      background: #0056b3;
    }
    .context-card.active .switch-btn {
      background: #6c757d;
      cursor: default;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌐 Context Switcher</h1>
      <p>Found ${contexts.length} context${contexts.length !== 1 ? 's' : ''}. Click to switch.</p>
    </div>
    <div class="contexts-grid">
      ${contexts.length > 0 ? contextCards : '<p>No contexts available</p>'}
    </div>
  </div>
  <script>
    function switchContext(contextName) {
      window.parent.postMessage({
        type: 'tool',
        payload: {
          toolName: 'appium_switch_context',
          params: {
            context: contextName
          }
        }
      }, '*');
    }
  </script>
</body>
</html>
  `;
}

/**
 * Creates an app list UI component
 * @param apps - Array of app objects with packageName and appName
 * @returns HTML string for app list
 */
export function createAppListUI(
  apps: Array<{ packageName: string; appName?: string }>
): string {
  const appCards = apps
    .map(
      (app) => `
    <div class="app-card" data-package="${app.packageName}">
      <div class="app-header">
        <h3>${app.appName || app.packageName}</h3>
      </div>
      <div class="app-details">
        <p><strong>Package:</strong> <code>${app.packageName}</code></p>
      </div>
      <div class="app-actions">
        <button class="btn btn-primary" onclick="activateApp('${app.packageName}')">Activate</button>
        <button class="btn btn-secondary" onclick="terminateApp('${app.packageName}')">Terminate</button>
        <button class="btn btn-danger" onclick="uninstallApp('${app.packageName}')">Uninstall</button>
      </div>
    </div>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Installed Apps</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 {
      font-size: 24px;
    }
    .header p {
      color: #666;
      font-size: 14px;
    }
    .search-box {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      width: 300px;
    }
    .apps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }
    .app-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      transition: all 0.2s;
    }
    .app-card:hover {
      border-color: #007AFF;
      box-shadow: 0 4px 12px rgba(0,122,255,0.15);
    }
    .app-header h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #1a1a1a;
    }
    .app-details {
      margin-bottom: 12px;
      font-size: 13px;
    }
    .app-details code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    .app-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-primary {
      background: #007AFF;
      color: white;
    }
    .btn-primary:hover {
      background: #0056b3;
    }
    .btn-secondary {
      background: #6c757d;
      color: white;
    }
    .btn-secondary:hover {
      background: #5a6268;
    }
    .btn-danger {
      background: #dc3545;
      color: white;
    }
    .btn-danger:hover {
      background: #c82333;
    }
    .hidden {
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>📱 Installed Apps</h1>
        <p>Found ${apps.length} app${apps.length !== 1 ? 's' : ''}</p>
      </div>
      <input type="text" class="search-box" id="searchBox" placeholder="Search apps...">
    </div>
    <div class="apps-grid" id="appsGrid">
      ${apps.length > 0 ? appCards : '<p>No apps found</p>'}
    </div>
  </div>
  <script>
    function activateApp(packageName) {
      window.parent.postMessage({
        type: 'tool',
        payload: {
          toolName: 'appium_activate_app',
          params: {
            id: packageName
          }
        }
      }, '*');
    }

    function terminateApp(packageName) {
      if (confirm('Are you sure you want to terminate this app?')) {
        window.parent.postMessage({
          type: 'tool',
          payload: {
            toolName: 'appium_terminate_app',
            params: {
              id: packageName
            }
          }
        }, '*');
      }
    }

    function uninstallApp(packageName) {
      if (confirm('Are you sure you want to uninstall this app? This action cannot be undone.')) {
        window.parent.postMessage({
          type: 'tool',
          payload: {
            toolName: 'appium_uninstall_app',
            params: {
              id: packageName
            }
          }
        }, '*');
      }
    }

    // Search functionality
    document.getElementById('searchBox').addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const cards = document.querySelectorAll('.app-card');
      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
    });
  </script>
</body>
</html>
  `;
}

/**
 * Creates a test code viewer UI component
 * @param code - Generated test code string
 * @param language - Code language (java, javascript, etc.)
 * @returns HTML string for test code viewer
 */
export function createTestCodeViewerUI(
  code: string,
  language: string = 'java'
): string {
  // Escape HTML for safe display
  const escapedCode = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Code Viewer</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #1e1e1e;
      color: #d4d4d4;
      overflow: hidden;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #2d2d2d;
      border-bottom: 1px solid #3e3e3e;
    }
    .toolbar-left {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .toolbar-right {
      display: flex;
      gap: 8px;
    }
    .btn {
      padding: 6px 12px;
      background: #007AFF;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #0056b3;
    }
    .btn-secondary {
      background: #444;
    }
    .btn-secondary:hover {
      background: #555;
    }
    .language-badge {
      padding: 4px 8px;
      background: #007AFF;
      color: white;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
    }
    .viewer {
      height: calc(100vh - 50px);
      overflow: auto;
      padding: 16px;
    }
    .code-content {
      background: #1e1e1e;
      color: #d4d4d4;
      white-space: pre;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.6;
      margin: 0;
    }
    .line-numbers {
      display: inline-block;
      padding-right: 16px;
      color: #858585;
      user-select: none;
      text-align: right;
      min-width: 50px;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <span style="font-size: 14px; font-weight: 500;">💻 Test Code Viewer</span>
      <span class="language-badge">${language}</span>
      <span style="font-size: 12px; color: #999;">${code.length} characters, ${code.split('\\n').length} lines</span>
    </div>
    <div class="toolbar-right">
      <button class="btn btn-secondary" onclick="copyToClipboard()">Copy Code</button>
      <button class="btn btn-secondary" onclick="downloadCode()">Download</button>
      <button class="btn" onclick="formatCode()">Format</button>
    </div>
  </div>
  <div class="viewer">
    <pre class="code-content" id="codeContent">${escapedCode}</pre>
  </div>
  <script>
    function copyToClipboard() {
      const text = document.getElementById('codeContent').textContent;
      navigator.clipboard.writeText(text).then(() => {
        alert('Code copied to clipboard!');
      });
    }

    function downloadCode() {
      const text = document.getElementById('codeContent').textContent;
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'TestCode.${language === 'java' ? 'java' : 'js'}';
      a.click();
      URL.revokeObjectURL(url);
    }

    function formatCode() {
      // Basic formatting - could be enhanced with a proper formatter
      const content = document.getElementById('codeContent');
      const text = content.textContent;
      // Add line numbers
      const lines = text.split('\\n');
      const formatted = lines.map((line, i) =>
        \`<span class="line-numbers">\${i + 1}</span>\${line}\`
      ).join('\\n');
      content.innerHTML = formatted;
    }

    // Initial format
    formatCode();
  </script>
</body>
</html>
  `;
}

/**
 * Helper function to add UI resource to response content
 * Returns both text and UI resource for backward compatibility
 */
export function addUIResourceToResponse(
  response: { content: Array<{ type: string; text?: string }> },
  uiResource: ReturnType<typeof createUIResource>
): { content: Array<any> } {
  return {
    content: [...response.content, uiResource],
  };
}
