import type { ContentResult, FastMCP } from 'fastmcp';
import type { DriverInstance } from '../../session-store.js';
import {
  errorResult,
  resolveDriver,
  textResult,
  toolErrorMessage,
} from '../tool-response.js';
import {
  GESTURE_ACTIONS,
  gestureSchema,
  type GestureAction,
  type GestureArgs,
} from './schema.js';
import { handleTap, handleDoubleTap, handleLongPress } from './handlers/tap.js';
import { handleScroll, handleSwipe } from './handlers/swipe-scroll.js';
import { handlePinchZoom } from './handlers/pinch.js';
import { handleScrollToElement } from './handlers/scroll-to-element.js';
import { back } from '../../command.js';
import {
  withEvidence,
  evidenceContext,
  type EvidenceStage,
} from '../evidence.js';
import { isAiElementUUID } from './handlers/ai-element.js';

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
      const resolved = await resolveDriver(args.sessionId);
      if (!resolved.ok) {
        return resolved.result;
      }
      const { driver } = resolved;

      const startedAt = Date.now();
      const result = await dispatchGesture(driver, args);
      return withEvidence(result, {
        toolName: 'appium_gesture',
        stage: gestureStage(args.action),
        startedAt,
        context: evidenceContext(args.sessionId),
        ...(args.strategy && args.selector
          ? { locator: { strategy: args.strategy, selector: args.selector } }
          : {}),
        ...(args.elementUUID && !isAiElementUUID(args.elementUUID)
          ? { element: { webdriverId: args.elementUUID } }
          : {}),
      });
    },
  });
}

async function dispatchGesture(
  driver: DriverInstance,
  args: GestureArgs
): Promise<ContentResult> {
  switch (args.action) {
    case 'back':
      try {
        await back(driver);
        return textResult('Successfully performed back action.');
      } catch (err: unknown) {
        return errorResult(
          `Failed to perform back action. ${toolErrorMessage(err)}`
        );
      }
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
}

function gestureStage(action: GestureAction): EvidenceStage {
  return action === 'scroll_to_element' ? 'locate' : 'interact';
}
