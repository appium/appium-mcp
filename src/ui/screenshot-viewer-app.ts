/**
 * Static MCP App used by appium_screenshot.
 *
 * Saved screenshots are read from structuredContent so the image remains
 * available to the UI without placing base64-encoded data in model context.
 * Raw image results are also supported for explicit manual calls.
 */
export function createScreenshotViewerAppUI(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Screenshot Viewer</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      overflow: hidden;
      background: #1a1a1a;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .viewer {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid #333;
      background: #2a2a2a;
    }
    .toolbar-left, .toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .title { flex: none; font-size: 14px; font-weight: 500; }
    .filepath {
      overflow: hidden;
      color: #999;
      font: 12px Monaco, Menlo, monospace;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .btn {
      padding: 6px 12px;
      border: 0;
      border-radius: 4px;
      background: #007aff;
      color: #fff;
      cursor: pointer;
      font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .btn:hover { background: #0056b3; }
    .btn-secondary { background: #444; }
    .btn-secondary:hover { background: #555; }
    .image-container {
      position: relative;
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: center;
      overflow: auto;
      padding: 20px;
    }
    .screenshot {
      display: none;
      max-width: 100%;
      max-height: 100%;
      border-radius: 4px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      cursor: zoom-in;
      object-fit: contain;
      transform-origin: center;
    }
    .status { color: #999; font-size: 14px; }
    .zoom-controls {
      position: absolute;
      right: 20px;
      bottom: 20px;
      display: flex;
      gap: 8px;
      padding: 8px;
      border-radius: 6px;
      background: rgba(42, 42, 42, 0.9);
    }
    .zoom-btn {
      display: flex;
      width: 32px;
      height: 32px;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 4px;
      background: #007aff;
      color: #fff;
      cursor: pointer;
      font-size: 16px;
    }
    .zoom-btn:hover { background: #0056b3; }
  </style>
</head>
<body>
  <div class="viewer">
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title">📸 Screenshot</span>
        <span class="filepath" id="filepath">Waiting for screenshot…</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-secondary" id="downloadButton">Download</button>
        <button class="btn" id="takeNewButton">Take New</button>
      </div>
    </div>
    <div class="image-container">
      <span class="status" id="status">Waiting for screenshot…</span>
      <img class="screenshot" id="screenshot" alt="Appium screenshot">
      <div class="zoom-controls">
        <button class="zoom-btn" id="zoomInButton" aria-label="Zoom in">+</button>
        <button class="zoom-btn" id="zoomOutButton" aria-label="Zoom out">−</button>
        <button class="zoom-btn" id="resetZoomButton" aria-label="Reset zoom">⌂</button>
      </div>
    </div>
  </div>
  <script>
    (() => {
      const screenshot = document.getElementById('screenshot');
      const filepath = document.getElementById('filepath');
      const status = document.getElementById('status');
      let currentZoom = 1;
      let currentFilepath = '';
      let nextRequestId = 1;
      const pendingRequests = new Map();

      function sendRequest(method, params) {
        const id = nextRequestId++;
        window.parent.postMessage({jsonrpc: '2.0', id, method, params}, '*');
        return new Promise((resolve, reject) => pendingRequests.set(id, {resolve, reject}));
      }

      function sendNotification(method, params) {
        window.parent.postMessage({jsonrpc: '2.0', method, params}, '*');
      }

      function screenshotFromToolResult(result) {
        const structuredScreenshot = result && result.structuredContent
          ? result.structuredContent.screenshot
          : undefined;
        if (
          structuredScreenshot &&
          typeof structuredScreenshot === 'object' &&
          typeof structuredScreenshot.data === 'string'
        ) {
          return {
            data: structuredScreenshot.data,
            mimeType: typeof structuredScreenshot.mimeType === 'string'
              ? structuredScreenshot.mimeType
              : 'image/png',
            filepath: typeof structuredScreenshot.filepath === 'string'
              ? structuredScreenshot.filepath
              : '',
          };
        }

        const imageBlock = result && Array.isArray(result.content)
          ? result.content.find((item) => item && item.type === 'image' && typeof item.data === 'string')
          : undefined;
        return imageBlock
          ? {data: imageBlock.data, mimeType: imageBlock.mimeType || 'image/png', filepath: ''}
          : undefined;
      }

      function errorFromToolResult(result) {
        const textBlock = result && Array.isArray(result.content)
          ? result.content.find((item) => item && item.type === 'text' && typeof item.text === 'string')
          : undefined;
        return result && result.isError && textBlock ? textBlock.text : 'No screenshot was returned.';
      }

      function setZoom(nextZoom) {
        currentZoom = Math.min(Math.max(nextZoom, 0.5), 4);
        screenshot.style.transform = 'scale(' + currentZoom + ')';
        screenshot.style.cursor = currentZoom === 1 ? 'zoom-in' : 'zoom-out';
      }

      function setScreenshot(result) {
        const nextScreenshot = screenshotFromToolResult(result);
        if (!nextScreenshot) {
          screenshot.style.display = 'none';
          status.style.display = 'block';
          status.textContent = errorFromToolResult(result);
          return;
        }

        currentFilepath = nextScreenshot.filepath;
        filepath.textContent = currentFilepath || 'Raw screenshot';
        screenshot.src = 'data:' + nextScreenshot.mimeType + ';base64,' + nextScreenshot.data;
        screenshot.style.display = 'block';
        status.style.display = 'none';
        setZoom(1);
      }

      function downloadScreenshot() {
        if (!screenshot.src) return;
        const pathParts = currentFilepath.split(/[\\\\/]/);
        const link = document.createElement('a');
        link.href = screenshot.src;
        link.download = pathParts[pathParts.length - 1] || 'screenshot.png';
        link.click();
      }

      async function takeNewScreenshot() {
        status.style.display = 'block';
        status.textContent = 'Taking screenshot…';
        try {
          const result = await sendRequest('tools/call', {
            name: 'appium_screenshot',
            arguments: {},
          });
          setScreenshot(result);
        } catch {
          status.textContent = 'Failed to take screenshot.';
        }
      }

      window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;
        const message = event.data;
        if (!message || message.jsonrpc !== '2.0') return;

        if (message.id !== undefined && pendingRequests.has(message.id)) {
          const pending = pendingRequests.get(message.id);
          pendingRequests.delete(message.id);
          if (message.error) {
            pending.reject(new Error(message.error.message || 'MCP App request failed'));
          } else {
            pending.resolve(message.result);
          }
          return;
        }

        if (message.method === 'ui/notifications/tool-result') {
          setScreenshot(message.params);
        }
      });

      screenshot.addEventListener('click', () => setZoom(currentZoom === 1 ? 2 : 1));
      document.getElementById('downloadButton').addEventListener('click', downloadScreenshot);
      document.getElementById('takeNewButton').addEventListener('click', takeNewScreenshot);
      document.getElementById('zoomInButton').addEventListener('click', () => setZoom(currentZoom + 0.5));
      document.getElementById('zoomOutButton').addEventListener('click', () => setZoom(currentZoom - 0.5));
      document.getElementById('resetZoomButton').addEventListener('click', () => setZoom(1));
      document.addEventListener('keydown', (event) => {
        if (event.key === '+' || event.key === '=') setZoom(currentZoom + 0.5);
        if (event.key === '-') setZoom(currentZoom - 0.5);
        if (event.key === '0') setZoom(1);
      });

      sendRequest('ui/initialize', {
        protocolVersion: '2026-01-26',
        appInfo: {name: 'Appium Screenshot Viewer', version: '1.0.0'},
        appCapabilities: {availableDisplayModes: ['inline', 'fullscreen']},
      })
        .then(() => sendNotification('ui/notifications/initialized', {}))
        .catch(() => {
          status.textContent = 'Unable to initialize screenshot viewer.';
        });
    })();
  </script>
</body>
</html>
  `;
}
