import type { ContentResult, FastMCP } from 'fastmcp';
import { resolveDriver } from '../tool-response.js';
import { GESTURE_ACTIONS, gestureSchema, type GestureArgs } from './schema.js';
import { handleTap, handleDoubleTap, handleLongPress } from './handlers/tap.js';
import { handleScroll, handleSwipe } from './handlers/swipe-scroll.js';
import { handlePinchZoom } from './handlers/pinch.js';
import { handleScrollToElement } from './handlers/scroll-to-element.js';

export default function gesture(server: FastMCP): void {
  server.addTool({
    name: 'appium_gesture',
    description:
      `Perform a touch gesture. Use 'action' to choose: ${GESTURE_ACTIONS.join(', ')}. ` +
      `Choose scroll vs swipe by intent: scroll to browse content in a list or feed; ` +
      `swipe to dismiss, switch screens, navigate carousels, or pull-to-refresh (speed=fast). ` +
      `For drag-and-drop use appium_drag_and_drop. For custom multi-touch use appium_perform_actions.`,
    parameters: gestureSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: GestureArgs,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const resolved = resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      switch (args.action) {
        case 'tap':
          return handleTap(driver, args);
        case 'double_tap':
          return handleDoubleTap(driver, args);
        case 'long_press':
          return handleLongPress(driver, args);
        case 'scroll':
          return handleScroll(driver, args);
        case 'swipe':
          return handleSwipe(driver, args);
        case 'pinch_zoom':
          return handlePinchZoom(driver, args);
        case 'scroll_to_element':
          return handleScrollToElement(driver, args);
      }
    },
  });
}
