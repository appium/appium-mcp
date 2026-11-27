import {createRequire} from 'node:module';

import type sharp from 'sharp';

const require = createRequire(import.meta.url);

let _sharp: typeof sharp | undefined;

/**
 * Load the optional `sharp` module used for screenshot resizing and AI vision.
 *
 * `@appium/support` 8 removed `imageUtil.requireSharp()` and its optional `sharp`
 * dependency, so appium-mcp now declares `sharp` itself and loads it here, with the
 * same behaviour and error message as before.
 */
function requireSharp(): typeof sharp {
  if (!_sharp) {
    try {
      _sharp = require('sharp') as typeof sharp;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Cannot load the 'sharp' module needed for images processing. ` +
          `Consider visiting https://sharp.pixelplumbing.com/install ` +
          `for troubleshooting. Original error: ${message}`,
        {cause: err},
      );
    }
  }
  return _sharp;
}

/** Kept as an object so tests can replace `requireSharp` with `jest.spyOn`. */
export const imageUtil = {requireSharp};
