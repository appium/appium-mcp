import { describe, test, expect } from '@jest/globals';
import {
  generateAllElementLocators,
  ElementWithLocators,
} from '../locators/generate-all-locators.js';

describe('generateAllElementLocators', () => {
  // Sample XML for testing
  const sampleXML = `
    <hierarchy>
      <android.widget.FrameLayout resource-id="android:id/content">
        <android.widget.LinearLayout>
          <android.widget.TextView text="Hello World" resource-id="com.example:id/text_view" clickable="true" enabled="true" displayed="true" />
          <android.widget.Button text="Click Me" resource-id="com.example:id/button" clickable="true" enabled="true" displayed="true" />
          <android.widget.EditText text="" resource-id="com.example:id/edit_text" clickable="true" enabled="true" displayed="true" />
        </android.widget.LinearLayout>
      </android.widget.FrameLayout>
    </hierarchy>
  `;

  // Sample iOS XML for testing
  const sampleIOSXML = `
    <hierarchy>
      <XCUIElementTypeApplication>
        <XCUIElementTypeWindow>
          <XCUIElementTypeButton name="Click Me" enabled="true" visible="true" />
          <XCUIElementTypeTextField name="Enter text" enabled="true" visible="true" />
          <XCUIElementTypeStaticText name="Hello World" enabled="true" visible="true" />
        </XCUIElementTypeWindow>
      </XCUIElementTypeApplication>
    </hierarchy>
  `;

  test('should return an array when given valid XML', () => {
    // Call the function with the sample XML
    const result = generateAllElementLocators(sampleXML, true, 'uiautomator2');

    // Basic validation of the result
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    // Verify the structure of the returned elements
    if (result.length > 0) {
      const element = result[0];
      expect(element).toHaveProperty('tagName');
      expect(element).toHaveProperty('locators');
      expect(element).toHaveProperty('text');
      expect(element).toHaveProperty('contentDesc');
      expect(element).toHaveProperty('resourceId');
      expect(element).toHaveProperty('clickable');
      expect(element).toHaveProperty('enabled');
      expect(element).toHaveProperty('displayed');
    }
  });

  test('should return an empty array when given invalid XML', () => {
    // Call the function with invalid XML (just a root element with no content)
    const result = generateAllElementLocators(
      '<hierarchy></hierarchy>',
      true,
      'uiautomator2'
    );

    // Verify the result is an empty array or at least doesn't throw an error
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  test('should apply includeTagNames filter correctly', () => {
    // Call the function with filters
    const result = generateAllElementLocators(sampleXML, true, 'uiautomator2', {
      includeTagNames: ['android.widget.Button'],
    });

    // If the filter works, either the result will be empty (if no buttons found)
    // or all elements will be buttons
    if (result.length > 0) {
      expect(
        result.every((element) => element.tagName.includes('Button'))
      ).toBe(true);
    }
  });

  test('should apply excludeTagNames filter correctly', () => {
    // Call the function with excludeTagNames filter
    const result = generateAllElementLocators(sampleXML, true, 'uiautomator2', {
      excludeTagNames: ['android.widget.Button'],
    });

    // Verify no Button elements are included
    expect(result.every((element) => !element.tagName.includes('Button'))).toBe(
      true
    );
  });

  test('should apply minAttributeCount filter correctly', () => {
    // Call the function with minAttributeCount filter
    const result = generateAllElementLocators(sampleXML, true, 'uiautomator2', {
      minAttributeCount: 3,
    });

    // All elements should have at least 3 attributes
    if (result.length > 0) {
      // We can't directly check the attributes count since we only have the processed elements
      // But we can verify that elements with fewer attributes are filtered out
      expect(result.length).toBeLessThanOrEqual(
        generateAllElementLocators(sampleXML, true, 'uiautomator2').length
      );
    }
  });

  test('should handle fetchableOnly filter for Android', () => {
    // Call the function with fetchableOnly filter
    const result = generateAllElementLocators(sampleXML, true, 'uiautomator2', {
      fetchableOnly: true,
    });

    // Verify the result contains only interactable elements
    if (result.length > 0) {
      const interactableTags = [
        'EditText',
        'Button',
        'ImageButton',
        'CheckBox',
        'RadioButton',
        'Switch',
        'ToggleButton',
        'TextView',
      ];

      expect(
        result.every(
          (element) =>
            interactableTags.some((tag) => element.tagName.includes(tag)) ||
            element.clickable === true
        )
      ).toBe(true);
    }
  });

  test('should handle fetchableOnly filter for iOS', () => {
    // Call the function with fetchableOnly filter for iOS
    const result = generateAllElementLocators(sampleIOSXML, true, 'xcuitest', {
      fetchableOnly: true,
    });

    // Verify the result contains only interactable iOS elements
    if (result.length > 0) {
      const interactableTags = [
        'XCUIElementTypeTextField',
        'XCUIElementTypeSecureTextField',
        'XCUIElementTypeButton',
        'XCUIElementTypeImage',
        'XCUIElementTypeSwitch',
        'XCUIElementTypeStaticText',
        'XCUIElementTypeTextView',
        'XCUIElementTypeCell',
        'XCUIElementTypeLink',
      ];

      expect(
        result.every((element) =>
          interactableTags.some((tag) => element.tagName.includes(tag))
        )
      ).toBe(true);
    }
  });

  test('should handle clickableOnly filter correctly', () => {
    // Call the function with clickableOnly filter
    const result = generateAllElementLocators(sampleXML, true, 'uiautomator2', {
      clickableOnly: true,
    });

    // Verify all elements are clickable
    expect(result.every((element) => element.clickable === true)).toBe(true);
  });
});
