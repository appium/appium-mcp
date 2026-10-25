import {createContext, runInContext} from 'node:vm';

import {afterEach, describe, expect, jest, test} from '@jest/globals';
import {DOMParser, XMLSerializer} from '@xmldom/xmldom';

import {
  addUIResourceToResponse,
  createContextSwitcherUI,
  createLocatorGeneratorUI,
  createPageSourceInspectorUI,
  createTestCodeViewerUI,
  createUIResource,
} from '../ui/mcp-ui-utils.js';

describe('createLocatorGeneratorUI', () => {
  test('escapes locator metadata and selectors before rendering HTML', () => {
    const html = createLocatorGeneratorUI([
      {
        tagName: 'android.widget.TextView<script>alert(1)</script>',
        locators: {
          "id' onclick='alert(1)": 'com.attacker.app/`<img src=x onerror=alert(1)>',
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
      '&lt;img src=x onerror=&quot;window.parent.postMessage({type:&#039;tool&#039;},&#039;*&#039;)&quot;&gt;',
    );
    expect(html).toContain('&lt;b&gt;xss-in-contentDesc&lt;/b&gt;');
    expect(html).toContain('&lt;u&gt;xss-resource-id&lt;/u&gt;');
    expect(html).toContain('data-selector="com.attacker.app/`&lt;img src=x onerror=alert(1)&gt;"');
  });
});

describe('addUIResourceToResponse', () => {
  const originalNoUI = process.env.NO_UI;

  afterEach(() => {
    if (originalNoUI === undefined) {
      delete process.env.NO_UI;
    } else {
      process.env.NO_UI = originalNoUI;
    }
  });

  test.each(['true', '1'])('does not construct UI resources when NO_UI=%s', (value) => {
    process.env.NO_UI = value;
    const response = {content: [{type: 'text', text: 'result'}]};
    const createResource = jest.fn(() => createUIResource('ui://test/resource', '<html></html>'));

    const result = addUIResourceToResponse(response, createResource);

    expect(result).toBe(response);
    expect(createResource).not.toHaveBeenCalled();
  });

  test('constructs and appends lazy UI resources when UI is enabled', () => {
    delete process.env.NO_UI;
    const response = {content: [{type: 'text', text: 'result'}]};
    const uiResource = createUIResource('ui://test/resource', '<html></html>');
    const createResource = jest.fn(() => uiResource);

    const result = addUIResourceToResponse(response, createResource);

    expect(createResource).toHaveBeenCalledTimes(1);
    expect(result.content).toEqual([...response.content, uiResource]);
  });

  test('continues to accept prebuilt UI resources', () => {
    delete process.env.NO_UI;
    const response = {content: [{type: 'text', text: 'result'}]};
    const uiResource = createUIResource('ui://test/resource', '<html></html>');

    const result = addUIResourceToResponse(response, uiResource);

    expect(result.content).toEqual([...response.content, uiResource]);
  });
});

describe('createContextSwitcherUI', () => {
  test('escapes context names and avoids inline context handlers', () => {
    const html = createContextSwitcherUI(["WEBVIEW_<img src=x onerror='alert(1)'>"], null);

    expect(html).not.toContain('<h3>WEBVIEW_<img');
    expect(html).not.toContain("switchContext('WEBVIEW_");
    expect(html).not.toContain("onclick='alert");

    expect(html).toContain('data-context="WEBVIEW_&lt;img src=x onerror=&#039;alert(1)&#039;&gt;"');
    expect(html).toContain('<h3>WEBVIEW_&lt;img src=x onerror=&#039;alert(1)&#039;&gt;</h3>');
  });
});

describe('createPageSourceInspectorUI', () => {
  function inspector(source: string) {
    const html = createPageSourceInspectorUI(source);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    const dom = new DOMParser().parseFromString('<ui><pre/></ui>', 'text/xml');
    const output = dom.getElementsByTagName('pre')[0];
    output.textContent = source;
    const search = {value: '', addEventListener: jest.fn()};
    const alert = jest.fn();
    const context = createContext({
      DOMParser,
      XMLSerializer,
      alert,
      document: {
        getElementById: (id: string) => (id === 'xmlContent' ? output : search),
        createTextNode: (text: string) => dom.createTextNode(text),
        createElement: (name: string) => Object.assign(dom.createElement(name), {style: {}}),
      },
    });
    runInContext(script ?? '', context);
    return {output, search, alert, context, format: () => runInContext('formatXML()', context)};
  }

  test('formats compact XML only on demand and keeps repeated formatting stable', () => {
    const source = '<?xml version="1.0"?><root><group><node label="a &amp; b"/></group></root>';
    const ui = inspector(source);
    expect(ui.output.textContent).toBe(source);
    ui.format();
    const formatted = '<?xml version="1.0"?>\n<root>\n  <group>\n    <node label="a &amp; b"/>\n  </group>\n</root>';
    expect(ui.output.textContent).toBe(formatted);
    ui.format();
    expect(ui.output.textContent).toBe(formatted);
    expect(ui.alert).not.toHaveBeenCalled();
  });

  test('preserves mixed text, CDATA, whitespace-only leaf text, and xml:space subtrees', () => {
    const children = [
      '<label>Hello <b>world</b>!</label>',
      '<data><![CDATA[a<b>]]><node/></data>',
      '<space>  </space>',
      '<group xml:space="preserve"><nested><node/></nested>  </group>',
      '<!-- comment -->',
    ];
    const ui = inspector('<root>' + children.join('') + '</root>');
    ui.format();
    expect(ui.output.textContent).toBe('<root>\n  ' + children.join('\n  ') + '\n</root>');
  });

  test('search highlights and clearing search keep the formatted display', () => {
    const ui = inspector('<root><node/></root>');
    ui.search.value = 'node';
    ui.format();
    expect(ui.output.getElementsByTagName('mark')).toHaveLength(1);
    expect(ui.output.textContent).toBe('<root>\n  <node/>\n</root>');
    runInContext('renderSource()', ui.context);
    expect(ui.output.getElementsByTagName('mark')).toHaveLength(0);
    expect(ui.output.textContent).toBe('<root>\n  <node/>\n</root>');
  });

  test('leaves the original display intact when the browser reports invalid XML', () => {
    const ui = inspector('<root><broken></root>');
    // Browsers return a parsererror document instead of throwing on malformed XML.
    ui.context.DOMParser = class {
      parseFromString() {
        return new DOMParser().parseFromString('<parsererror>Invalid XML</parsererror>', 'text/xml');
      }
    };
    ui.format();
    expect(ui.output.textContent).toBe('<root><broken></root>');
    expect(ui.alert).toHaveBeenCalledWith('Failed to format XML');
  });

  test('escapes page source and does not embed it into script context', () => {
    const html = createPageSourceInspectorUI('<node text="</script><img src=x onerror=alert(1)>"/>');

    expect(html).not.toContain('<pre class="xml-content" id="xmlContent"><node');
    expect(html).not.toContain('content.innerHTML');
    expect(html).not.toContain('new RegExp');
    expect(html).not.toContain('</script><img src=x');
    expect(html).not.toContain('const originalSource = "<node');

    expect(html).toContain('&lt;node text=&quot;&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;&quot;/&gt;');
    expect(html).toContain('const originalSource = xmlContent.textContent;');
  });
});

describe('createTestCodeViewerUI', () => {
  test('escapes code and language labels without rebuilding code through innerHTML', () => {
    const html = createTestCodeViewerUI('<script>alert(1)</script>', 'java<script>alert(2)</script>');

    expect(html).not.toContain('<pre class="code-content" id="codeContent"><script');
    expect(html).not.toContain('<span class="language-badge">java<script>alert(2)</script></span>');
    expect(html).not.toContain('content.innerHTML');

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<span class="language-badge">java&lt;script&gt;alert(2)&lt;/script&gt;</span>');
  });
});
