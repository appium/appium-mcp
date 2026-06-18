import { describe, expect, test } from '@jest/globals';

import { createLocatorGeneratorUI } from '../ui/mcp-ui-utils.js';

describe('createLocatorGeneratorUI', () => {
  test('escapes locator metadata and selectors before rendering HTML', () => {
    const html = createLocatorGeneratorUI([
      {
        tagName: 'android.widget.TextView<script>alert(1)</script>',
        locators: {
          "id' onclick='alert(1)":
            'com.attacker.app/`<img src=x onerror=alert(1)>',
        },
        text: "<img src=x onerror=\"window.parent.postMessage({type:'tool'},'*')\">",
        contentDesc: '<b>xss-in-contentDesc</b>',
        resourceId: 'com.attacker.app/<u>xss-resource-id</u>',
        clickable: true,
        enabled: true,
        displayed: true,
      },
    ]);

    expect(html).not.toContain('<h3>android.widget.TextView<script');
    expect(html).not.toContain('<img src=x onerror=');
    expect(html).not.toContain('<b>xss-in-contentDesc</b>');
    expect(html).not.toContain('<u>xss-resource-id</u>');
    expect(html).not.toContain('onclick="testLocator');
    expect(html).not.toContain("onclick='alert");

    expect(html).toContain(
      '&lt;img src=x onerror=&quot;window.parent.postMessage({type:&#039;tool&#039;},&#039;*&#039;)&quot;&gt;'
    );
    expect(html).toContain('&lt;b&gt;xss-in-contentDesc&lt;/b&gt;');
    expect(html).toContain('&lt;u&gt;xss-resource-id&lt;/u&gt;');
    expect(html).toContain(
      'data-selector="com.attacker.app/`&lt;img src=x onerror=alert(1)&gt;"'
    );
  });
});
