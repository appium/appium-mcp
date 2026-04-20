import type { ContentResult, FastMCP } from 'fastmcp';
import { resolveDriver } from '../tool-response.js';
import { GESTURE_ACTIONS, gestureSchema, type GestureArgs } from './schema.js';
import { handleTap, handleDoubleTap, handleLongPress } from './handlers/tap.js';
import {
  handleScroll,
  handleSwipe,
  handleFlick,
} from './handlers/swipe-scroll.js';
import { handlePinchZoom } from './handlers/pinch.js';
import { handleScrollToElement } from './handlers/scroll-to-element.js';

export default function gesture(server: FastMCP): void {
  server.addTool({
    name: 'appium_gesture',
    description:
      `Perform a touch gesture on the device. Use the action parameter to choose the gesture: ${GESTURE_ACTIONS.join(', ')}. ` +
      `Key distinction — scroll vs swipe vs flick: scroll is slow and content-aware (respects scroll views on iOS) for browsing content; ` +
      `swipe is fast raw touch for navigation/dismissal (carousels, sheets, screen switching); ` +
      `flick is fastest with no hold for velocity-sensitive UIs (pull-to-refresh). ` +
      `For drag-and-drop use appium_drag_and_drop. For arbitrary multi-touch sequences use appium_perform_actions.`,
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
        case 'flick':
          return handleFlick(driver, args);
        case 'pinch_zoom':
          return handlePinchZoom(driver, args);
        case 'scroll_to_element':
          return handleScrollToElement(driver, args);
      }
    },
  });
}
