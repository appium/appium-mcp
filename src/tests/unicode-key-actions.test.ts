import {describe, test, expect, jest} from '@jest/globals';

import {buildW3cKeyActions, setValue} from '../command.js';

describe('buildW3cKeyActions: Unicode text', () => {
  test('keeps supplementary characters intact in mixed text', () => {
    expect(buildW3cKeyActions('A😀𠮷あ').actions).toEqual(
      ['A', '😀', '𠮷', 'あ'].flatMap((value) => [
        {type: 'keyDown', value},
        {type: 'keyUp', value},
      ]),
    );
  });

  test('sends intact Unicode key actions to the focused element', async () => {
    const driver = {performActions: jest.fn(async (_actions: unknown) => undefined)};
    await setValue(driver as never, '', '😀', true);
    expect(driver.performActions).toHaveBeenCalledWith([
      {
        type: 'key',
        id: 'keyboard',
        actions: [
          {type: 'keyDown', value: '😀'},
          {type: 'keyUp', value: '😀'},
        ],
      },
    ]);
  });
});
