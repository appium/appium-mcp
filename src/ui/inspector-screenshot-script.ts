/** Browser controller for the optional screenshot and XML bounds overlay. */
export const INSPECTOR_SCREENSHOT_SCRIPT = String.raw`
function createScreenshotInspector(callTool, setSource, readSourceResult) {
  const button = document.getElementById('takeScreenshotButton');
  const panel = document.getElementById('screenshotPanel');
  const image = document.getElementById('inspectorScreenshot');
  const overlay = document.getElementById('elementOverlay');
  const select = document.getElementById('screenshotElement');
  const status = document.getElementById('screenshotStatus');
  const details = document.getElementById('selectedXmlElement');
  let elements = [];
  let screen;
  let query = '';

  function readBounds(element) {
    const android = (element.getAttribute('bounds') || '').match(/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/);
    if (android) {
      const [, x, y, right, bottom] = android.map(Number);
      return {x, y, width: right - x, height: bottom - y};
    }
    const names = ['x', 'y', 'width', 'height'];
    if (!names.every(name => element.hasAttribute(name) && element.getAttribute(name).trim() !== '')) return;
    const values = names.map(name => Number(element.getAttribute(name)));
    if (!values.every(Number.isFinite)) return;
    const [x, y, width, height] = values;
    return {x, y, width, height};
  }

  function showSelection() {
    overlay.hidden = true;
    details.textContent = '';
    if (!select.value) return;
    const element = elements[Number(select.value) - 1];
    if (!element) return;
    // Display only the selected opening tag, not its entire subtree.
    const clone = element.cloneNode(false);
    details.textContent = new XMLSerializer().serializeToString(clone);
    if (!screen) {
      status.textContent = 'Take a screenshot to highlight this element.';
      return;
    }
    const rect = readBounds(element);
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      status.textContent = 'This element has no usable screen bounds.';
      return;
    }
    if (element.getAttribute('visible') === 'false' || element.getAttribute('displayed') === 'false') {
      status.textContent = 'This element is marked hidden in the XML.';
      return;
    }
    const left = Math.max(0, rect.x);
    const top = Math.max(0, rect.y);
    const right = Math.min(screen.width, rect.x + rect.width);
    const bottom = Math.min(screen.height, rect.y + rect.height);
    if (right <= left || bottom <= top) {
      status.textContent = 'This element is outside the captured screen.';
      return;
    }
    overlay.style.left = (left / screen.width * 100) + '%';
    overlay.style.top = (top / screen.height * 100) + '%';
    overlay.style.width = ((right - left) / screen.width * 100) + '%';
    overlay.style.height = ((bottom - top) / screen.height * 100) + '%';
    overlay.hidden = false;
    status.textContent = 'XML bounds: x=' + rect.x + ', y=' + rect.y + ', width=' + rect.width + ', height=' + rect.height;
  }

  function filter(nextQuery) {
    query = nextQuery.trim().toLowerCase();
    const previous = select.value;
    select.textContent = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select an XML element to highlight';
    select.appendChild(placeholder);
    let retained = false;
    elements.forEach((element, index) => {
      const attributes = Array.from(element.attributes).map(attr => attr.value);
      if (query && ![element.tagName, ...attributes].some(value => value.toLowerCase().includes(query))) return;
      const option = document.createElement('option');
      option.value = String(index + 1);
      const name = element.getAttribute('name') || element.getAttribute('label') || element.getAttribute('text') || element.getAttribute('resource-id') || element.getAttribute('id');
      option.textContent = (index + 1) + '. ' + element.tagName + (name ? ' — ' + name : '');
      select.appendChild(option);
      if (option.value === previous) retained = true;
    });
    select.value = retained ? previous : '';
    showSelection();
  }

  function updateSource(source) {
    screen = undefined;
    image.hidden = true;
    overlay.hidden = true;
    elements = [];
    select.value = '';
    if (source.trim().startsWith('<')) {
      const doc = new DOMParser().parseFromString(source, 'text/xml');
      if (!doc.getElementsByTagName('parsererror').length) elements = Array.from(doc.getElementsByTagName('*'));
    }
    filter(query);
    status.textContent = 'XML updated. Take a screenshot to refresh the preview.';
  }

  function assertSuccess(result) {
    if (result?.isError) throw new Error((result.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n') || 'Tool failed');
    return result;
  }

  async function capture() {
    if (button.disabled) return;
    button.disabled = true;
    panel.hidden = false;
    screen = undefined;
    image.hidden = true;
    overlay.hidden = true;
    status.textContent = 'Capturing screenshot and refreshing XML…';
    try {
      const sourceResult = assertSuccess(await callTool('appium_get_page_source', {saveToFile: false}));
      const sizeResult = assertSuccess(await callTool('appium_get_window_size', {}));
      const result = assertSuccess(await callTool('appium_screenshot', {returnRawBase64: true}));
      const sizeText = (sizeResult.content || []).filter(item => item.type === 'text').map(item => item.text).join(' ');
      const size = sizeText.match(/Width:\s*([\d.]+),\s*Height:\s*([\d.]+)/);
      if (!size || !(Number(size[1]) > 0 && Number(size[2]) > 0)) throw new Error('Screen size is unavailable');
      const picture = result.structuredContent?.screenshot || (result.content || []).find(item => item.type === 'image');
      if (!picture?.data || !['image/png', 'image/jpeg'].includes(picture.mimeType)) throw new Error('No supported screenshot returned');
      setSource(readSourceResult(sourceResult));
      screen = {width: Number(size[1]), height: Number(size[2])};
      image.src = 'data:' + picture.mimeType + ';base64,' + picture.data;
      image.hidden = false;
      status.textContent = 'Select an XML element below. Search filters the list.';
    } catch (error) {
      status.textContent = 'Screenshot failed: ' + error.message;
    } finally {
      button.disabled = false;
    }
  }

  image.addEventListener('load', () => {
    if (!screen) return;
    // Pixel density is handled by percentages; orientation changes are not.
    const ratio = image.naturalWidth / image.naturalHeight;
    if (Math.abs(ratio / (screen.width / screen.height) - 1) > 0.03) {
      screen = undefined;
      overlay.hidden = true;
      status.textContent = 'Screenshot and screen dimensions differ. Capture again before highlighting.';
    }
  });
  image.addEventListener('error', () => {
    screen = undefined;
    image.hidden = true;
    overlay.hidden = true;
    status.textContent = 'Unable to display screenshot.';
  });
  button.addEventListener('click', capture);
  select.addEventListener('change', showSelection);
  return {updateSource, filter};
}
`;
