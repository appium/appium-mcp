import {describe, expect, test} from '@jest/globals';

import {summarizePageSource} from '../../../tools/interactions/page-source-summary.js';

const source =
  '<root><node name="target" visible="false" x="1"/><node name="shown" visible="true"/><node name="hidden" visible="false"/></root>';
describe('page source summaries', () => {
  test('selects nodes with visible siblings and bounds', () => {
    expect(summarizePageSource(source, '//*[@name="target"]')).toEqual({
      matches: [
        {
          node: {type: 'node', name: 'target', visible: 'false', x: '1'},
          visibleSiblings: [{type: 'node', name: 'shown', visible: 'true'}],
        },
      ],
      truncated: false,
    });
  });
  test('combines XPath and literal pattern', () => {
    expect(summarizePageSource(source, '//*[@visible="true"]', 'target').matches).toEqual([]);
    expect(summarizePageSource(source, undefined, '.*').matches).toEqual([]);
  });
  test('handles Android displayed and bounds fields', () => {
    const result = summarizePageSource(
      '<hierarchy><node text="a" bounds="[0,0][10,10]"/><node text="b" displayed="true"/></hierarchy>',
      '//*[@text="a"]',
    );
    expect(result.matches[0].node.bounds).toBe('[0,0][10,10]');
    expect(result.matches[0].visibleSiblings[0].text).toBe('b');
  });
  test('bounds summaries including siblings', () => {
    const xml = `<root>${'<node visible="true"/>'.repeat(150)}</root>`;
    const result = summarizePageSource(xml, '//node');
    expect(result.matches.reduce((sum, match) => sum + 1 + match.visibleSiblings.length, 0)).toBe(100);
    expect(result.truncated).toBe(true);
  });
  test.each(['count(//node)', '//@name', '//*['])('rejects non-element or invalid XPath %s', (selector) => {
    expect(() => summarizePageSource(source, selector)).toThrow();
  });
});
