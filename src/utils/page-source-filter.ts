/**
 * Page Source Filter for Android
 *
 * Filters Android page source XML to extract only interactive/important elements,
 * reducing output size by ~95% while preserving actionable information.
 */
import { XMLParser } from 'fast-xml-parser';

export interface FilteredElement {
  type: string; // Short class name (e.g., "Button")
  text?: string; // Display text
  strategy: string; // For appium_find_element
  selector: string; // For appium_find_element
  bounds: string; // Position info
  enabled: boolean;
  clickable: boolean;
}

export interface FilteredPageSource {
  elements: FilteredElement[];
  stats: {
    totalElements: number;
    filteredElements: number;
    interactableElements: number;
  };
}

// Layout containers that should be excluded
const LAYOUT_CLASSES = new Set([
  'android.widget.FrameLayout',
  'android.widget.LinearLayout',
  'android.widget.RelativeLayout',
  'android.view.ViewGroup',
  'android.view.View',
  'androidx.constraintlayout.widget.ConstraintLayout',
  'androidx.recyclerview.widget.RecyclerView',
  'android.widget.ScrollView',
  'android.widget.HorizontalScrollView',
  'androidx.coordinatorlayout.widget.CoordinatorLayout',
  'androidx.appcompat.widget.LinearLayoutCompat',
  'androidx.core.widget.NestedScrollView',
  'androidx.viewpager.widget.ViewPager',
  'androidx.viewpager2.widget.ViewPager2',
  'android.widget.ListView',
  'androidx.swiperefreshlayout.widget.SwipeRefreshLayout',
]);

// Interactive classes that should always be kept
const INTERACTIVE_CLASSES = new Set([
  'android.widget.Button',
  'android.widget.EditText',
  'android.widget.CheckBox',
  'android.widget.RadioButton',
  'android.widget.Switch',
  'android.widget.Spinner',
  'android.widget.ImageButton',
  'android.widget.ToggleButton',
  'android.widget.SeekBar',
  'android.widget.RatingBar',
  'androidx.appcompat.widget.AppCompatButton',
  'androidx.appcompat.widget.AppCompatEditText',
  'androidx.appcompat.widget.AppCompatCheckBox',
  'androidx.appcompat.widget.AppCompatRadioButton',
  'androidx.appcompat.widget.AppCompatSpinner',
  'androidx.appcompat.widget.SwitchCompat',
  'com.google.android.material.button.MaterialButton',
  'com.google.android.material.textfield.TextInputEditText',
  'com.google.android.material.checkbox.MaterialCheckBox',
  'com.google.android.material.switchmaterial.SwitchMaterial',
]);

/**
 * Determine if an element should be kept in the filtered output
 */
function shouldKeepElement(el: any): boolean {
  const className = el['@_class'] || '';

  // Exclude invisible elements first
  if (el['@_bounds'] === '[0,0][0,0]') {
    return false;
  }

  // Always keep interactive classes
  if (INTERACTIVE_CLASSES.has(className)) {
    return true;
  }

  // Keep elements with content-desc (accessibility) - even if they're layout containers
  // This catches navigation items like "Home", "Search", etc. which may use LinearLayout
  if (el['@_content-desc']) {
    return true;
  }

  // Keep clickable or focusable elements - even if they're layout containers
  if (el['@_clickable'] === 'true' || el['@_focusable'] === 'true') {
    return true;
  }

  // Exclude layout containers (only if they don't have identifying attributes above)
  if (LAYOUT_CLASSES.has(className)) {
    return false;
  }

  // Keep elements with resource-id AND text
  if (el['@_resource-id'] && el['@_text']) {
    return true;
  }

  return false;
}

/**
 * Get the best locator strategy for an element
 * Priority: accessibility id > id > -android uiautomator > class name
 */
function getStrategy(el: any): { strategy: string; selector: string } {
  // Highest priority: accessibility id (content-desc)
  if (el['@_content-desc']) {
    return {
      strategy: 'accessibility id',
      selector: el['@_content-desc'],
    };
  }

  // Second: resource-id
  if (el['@_resource-id']) {
    return {
      strategy: 'id',
      selector: el['@_resource-id'],
    };
  }

  // Fallback: UiSelector with text
  if (el['@_text']) {
    return {
      strategy: '-android uiautomator',
      selector: `new UiSelector().text("${el['@_text']}")`,
    };
  }

  // Last resort: class name
  return {
    strategy: 'class name',
    selector: el['@_class'] || 'android.view.View',
  };
}

/**
 * Recursively extract elements from the parsed XML tree
 */
function extractElements(node: any, results: FilteredElement[]): void {
  if (!node) return;

  // Evaluate current node
  if (node['@_class'] && shouldKeepElement(node)) {
    const { strategy, selector } = getStrategy(node);
    results.push({
      type: (node['@_class'] || '').split('.').pop() || 'View',
      text: node['@_text'] || undefined,
      strategy,
      selector,
      bounds: node['@_bounds'] || '',
      enabled: node['@_enabled'] === 'true',
      clickable: node['@_clickable'] === 'true',
    });
  }

  // Process child elements recursively
  for (const key of Object.keys(node)) {
    if (!key.startsWith('@_')) {
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(c => extractElements(c, results));
      } else if (typeof child === 'object') {
        extractElements(child, results);
      }
    }
  }
}

/**
 * Count total elements in the XML tree
 */
function countElements(node: any): number {
  if (!node || typeof node !== 'object') return 0;

  let count = node['@_class'] ? 1 : 0;

  for (const key of Object.keys(node)) {
    if (!key.startsWith('@_')) {
      const child = node[key];
      if (Array.isArray(child)) {
        count += child.reduce((sum, c) => sum + countElements(c), 0);
      } else {
        count += countElements(child);
      }
    }
  }

  return count;
}

/**
 * Filter Android page source XML and return structured data
 *
 * @param xmlString - Raw XML page source from Appium
 * @returns Filtered elements with statistics
 */
export function filterPageSource(xmlString: string): FilteredPageSource {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  const parsed = parser.parse(xmlString);
  const filteredElements: FilteredElement[] = [];

  const totalElements = countElements(parsed);
  extractElements(parsed, filteredElements);

  return {
    elements: filteredElements,
    stats: {
      totalElements,
      filteredElements: filteredElements.length,
      interactableElements: filteredElements.filter(e => e.clickable).length,
    },
  };
}
