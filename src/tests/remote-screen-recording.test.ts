import {describe, test, expect, jest} from '@jest/globals';

import {startRecordingScreen, stopRecordingScreen} from '../command.js';
const REMOTE_COMMAND_ERROR = {error: 'unknown command', message: 'Recording is unavailable'};

describe('remote screen recording', () => {
  test('forwards recording options and returns the previous recording', async () => {
    const options = {timeLimit: 30, videoType: 'libx264', pixelFormat: 'yuv420p'};
    const driver = {startRecordingScreen: jest.fn(async (_options: unknown) => 'previous-video')};
    await expect(startRecordingScreen(driver as never, options)).resolves.toBe('previous-video');
    expect(driver.startRecordingScreen).toHaveBeenCalledWith(options);
  });

  test('stops recording with default options and returns video data', async () => {
    const driver = {stopRecordingScreen: jest.fn(async () => 'video')};
    await expect(stopRecordingScreen(driver as never)).resolves.toBe('video');
    expect(driver.stopRecordingScreen).toHaveBeenCalledWith();
  });

  test('preserves empty recording results', async () => {
    const driver = {stopRecordingScreen: jest.fn(async () => '')};
    await expect(stopRecordingScreen(driver as never)).resolves.toBe('');
  });

  test('rethrows swallowed remote errors for start and stop', async () => {
    const driver = {
      startRecordingScreen: jest.fn(async () => REMOTE_COMMAND_ERROR),
      stopRecordingScreen: jest.fn(async () => REMOTE_COMMAND_ERROR),
    };
    await expect(startRecordingScreen(driver as never)).rejects.toMatchObject({name: 'unknown command'});
    await expect(stopRecordingScreen(driver as never)).rejects.toMatchObject({name: 'unknown command'});
  });
});
