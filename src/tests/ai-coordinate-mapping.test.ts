import {imageUtil} from '@appium/support';
import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';

const findElement = jest.fn(async (_screenshot: string, _instruction: string, _width: number, _height: number) => ({
  target: 'button',
  center: {x: 585, y: 1266},
  bbox: [555, 1236, 615, 1296],
  annotatedImagePath: '/tmp/vision.png',
}));
jest.unstable_mockModule('../ai-finder/vision-finder.js', () => ({
  AIVisionFinder: class {
    findElement = findElement;
  },
}));

const {handleFindElement} = await import('../tools/ai/handlers/find-element.js');
const {handleTap} = await import('../tools/gestures/handlers/tap.js');
const {parseAiElement} = await import('../tools/gestures/handlers/ai-element.js');
const {gestureSchema} = await import('../tools/gestures/schema.js');
let sharpSpy: jest.SpiedFunction<typeof imageUtil.requireSharp>;
let originalAIEnabled: string | undefined;

beforeEach(() => {
  originalAIEnabled = process.env.AI_VISION_ENABLED;
  process.env.AI_VISION_ENABLED = 'true';
  findElement.mockClear();
  sharpSpy = jest
    .spyOn(imageUtil, 'requireSharp')
    .mockReturnValue((() => ({metadata: async () => ({width: 1170, height: 2532})})) as never);
});

afterEach(() => {
  sharpSpy.mockRestore();
  if (originalAIEnabled === undefined) {
    delete process.env.AI_VISION_ENABLED;
  } else {
    process.env.AI_VISION_ENABLED = originalAIEnabled;
  }
});

class XCUITestDriver {
  getScreenshot = jest.fn(async () => 'screenshot');
  getWindowRect = jest.fn(async () => ({x: 0, y: 0, width: 390, height: 844}));
  performActions = jest.fn(async (_actions: unknown) => {});
}

describe('AI coordinate tokens', () => {
  test.each(['embedded', 'remote'])('maps a Retina screenshot to iOS touch coordinates (%s)', async (mode) => {
    const embedded = new XCUITestDriver();
    const driver =
      mode === 'embedded'
        ? embedded
        : {
            isIOS: true,
            takeScreenshot: embedded.getScreenshot,
            getWindowRect: embedded.getWindowRect,
            performActions: embedded.performActions,
          };
    const result = await handleFindElement(driver as never, {action: 'find_element', instruction: 'button'});
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as {text: string}).text;
    const token = text.match(/elementId '([^']+)'/)?.[1];
    if (!token) {
      throw new Error(`Missing AI element token in: ${text}`);
    }
    expect(parseAiElement(token)).toEqual({
      center: {x: 195, y: 422},
      rect: {x: 185, y: 412, width: 20, height: 20},
    });
    expect(text).toContain('/tmp/vision.png');
    expect(findElement).toHaveBeenCalledWith('screenshot', 'button', 1170, 2532);

    await handleTap(driver as never, gestureSchema.parse({action: 'tap', elementUUID: token}));
    expect(embedded.performActions).toHaveBeenCalledWith([
      expect.objectContaining({
        actions: expect.arrayContaining([expect.objectContaining({type: 'pointerMove', x: 195, y: 422})]),
      }),
    ]);
  });

  test('leaves Android screenshot coordinates unchanged', async () => {
    const driver = {isAndroid: true, takeScreenshot: jest.fn(async () => 'screenshot')};
    const result = await handleFindElement(driver as never, {action: 'find_element', instruction: 'button'});
    expect((result.content[0] as {text: string}).text).toContain('ai-element:585,1266:555,1236,615,1296');
  });
});
