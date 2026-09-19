import {beforeEach, describe, expect, jest, test} from '@jest/globals';

jest.unstable_mockModule('../../../command.js', () => ({
  startRecordingScreen: jest.fn(async () => ''),
  stopRecordingScreen: jest.fn(async () => ''),
}));
jest.unstable_mockModule('../../../session-store.js', () => ({
  getPlatformName: jest.fn(() => 'iOS'),
  PLATFORM: {ios: 'iOS', android: 'Android'},
}));
jest.unstable_mockModule('../../../tools/tool-response.js', () => ({
  resolveDriver: jest.fn(async () => ({ok: true, driver: {}})),
  textResult: (text: string) => ({content: [{type: 'text', text}]}),
  errorResult: (text: string) => ({content: [{type: 'text', text}], isError: true}),
  toolErrorMessage: (error: Error) => error.message,
}));

const {startRecordingScreen, stopRecordingScreen} = await import('../../../command.js');
const {getPlatformName} = await import('../../../session-store.js');
const {default: screenRecording} = await import('../../../tools/interactions/screen-recording.js');

describe('appium_screen_recording', () => {
  const server = {addTool: jest.fn()} as any;
  let tool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPlatformName).mockReturnValue('iOS');
    screenRecording(server);
    tool = server.addTool.mock.calls[0][0];
  });

  // Apply the registered schema before execution, as FastMCP does.
  async function callTool(input: Record<string, unknown>) {
    return await tool.execute(await tool.parameters.parseAsync(input), undefined);
  }

  test.each(['1280:720', '1:1', '16384:16384', '-1:720', '-2:720', '1280:-1', '1280:-2'])(
    'forwards supported dimensions %s',
    async (videoScale) => {
      await callTool({action: 'start', videoScale});
      expect(startRecordingScreen).toHaveBeenCalledWith(expect.anything(), {
        videoType: 'libx264',
        pixelFormat: 'yuv420p',
        videoScale,
      });
    },
  );

  test.each([
    '',
    '0:720',
    '1280:0',
    '-3:720',
    '-1:-2',
    '16385:720',
    '1280:16385',
    '999999999999:720',
    '1280x720',
    '1280:720:1',
    'iw:ih',
    '1280/2:720',
    '1280.5:720',
    '+1280:720',
    ' 1280:720',
    '1280:720 ',
    '1280:720\n',
    '1280:720\r\n',
    '1280:720\0',
    '32:32,hflip',
    '32:32;null',
    "32:32,metadata=mode=print:file='/tmp/recording-test'",
    "32:32,movie='http\\://127.0.0.1\\:18765/marker.mp4'",
    "32:32,subtitles='http\\://127.0.0.1\\:18765/marker.srt'",
    "'1280:720'",
    'http://127.0.0.1/video',
  ])('rejects unsupported dimensions %j before calling the driver', async (videoScale) => {
    await expect(callTool({action: 'start', videoScale})).rejects.toThrow();
    expect(startRecordingScreen).not.toHaveBeenCalled();
  });

  test('does not advertise or forward videoFilters from older clients', async () => {
    expect(tool.parameters.shape).not.toHaveProperty('videoFilters');
    await callTool({action: 'start', videoFilters: 'hflip', videoScale: '1280:720'});
    expect(startRecordingScreen).toHaveBeenCalledWith(expect.anything(), {
      videoType: 'libx264',
      pixelFormat: 'yuv420p',
      videoScale: '1280:720',
    });
  });

  test('does not forward videoFilters even when execute is called directly', async () => {
    await tool.execute({action: 'start', videoFilters: 'hflip'}, undefined);
    expect(startRecordingScreen).toHaveBeenCalledWith(expect.anything(), {
      videoType: 'libx264',
      pixelFormat: 'yuv420p',
    });
  });

  test('starts iOS recording without a scale', async () => {
    await callTool({action: 'start'});
    expect(startRecordingScreen).toHaveBeenCalledWith(expect.anything(), {
      videoType: 'libx264',
      pixelFormat: 'yuv420p',
    });
  });

  test('preserves Android recording options', async () => {
    jest.mocked(getPlatformName).mockReturnValue('Android');
    await callTool({action: 'start', videoSize: '1280x720', bitRate: 4000000, timeLimit: 30});
    expect(startRecordingScreen).toHaveBeenCalledWith(expect.anything(), {
      videoSize: '1280x720',
      bitRate: 4000000,
      timeLimit: 30,
    });
  });

  test('stops recording without scaling options', async () => {
    await callTool({action: 'stop'});
    expect(stopRecordingScreen).toHaveBeenCalledTimes(1);
    expect(startRecordingScreen).not.toHaveBeenCalled();
  });
});
