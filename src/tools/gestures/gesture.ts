import type { ContentResult, FastMCP } from 'fastmcp';
import {
  errorResult,
  resolveDriver,
  toolErrorMessage,
} from '../tool-response.js';
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

      try {
        switch (args.action) {
          case 'tap':
            return await handleTap(driver, args);
          case 'double_tap':
            return await handleDoubleTap(driver, args);
          case 'long_press':
            return await handleLongPress(driver, args);
          case 'scroll':
            return await handleScroll(driver, args);
          case 'swipe':
            return await handleSwipe(driver, args);
          case 'pinch_zoom':
            return await handlePinchZoom(driver, args);
          case 'scroll_to_element':
            return await handleScrollToElement(driver, args);
        }
      } catch (err: unknown) {
        return errorResult(
          `appium_gesture failed (${args.action}): ${toolErrorMessage(err)}`
        );
      }
    },
  });
}
