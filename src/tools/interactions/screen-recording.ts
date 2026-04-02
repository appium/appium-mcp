import type { ContentResult, FastMCP } from 'fastmcp';
import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getDriver, getPlatformName, PLATFORM } from '../../session-store.js';
import {
  startRecordingScreen as cmdStartRecording,
  stopRecordingScreen as cmdStopRecording,
} from '../../command.js';
import { resolveScreenshotDir } from '../../utils/paths.js';

/**
 * iOS-specific options for startRecordingScreen.
 * @see https://github.com/appium/appium-xcuitest-driver/blob/5bdad71/lib/commands/types.ts
 */
export interface IOSRecordingOptions {
  /** Video codec. Run `ffmpeg -codecs` for options. Default: mjpeg. */
  videoType?: string;
  /** Quality preset. Default: medium. */
  videoQuality?: 'low' | 'medium' | 'high' | 'photo' | number;
  /** Frames per second. Default: 10. */
  videoFps?: number;
  /** FFMPEG video filters. Takes precedence over videoScale. @see https://ffmpeg.org/ffmpeg-filters.html */
  videoFilters?: string;
  /** Scaling value (e.g. 1280:720). Ignored if videoFilters is set. @see https://trac.ffmpeg.org/wiki/Scaling */
  videoScale?: string;
  /** Output pixel format. Run `ffmpeg -pix_fmts` for options. Use yuv420p with videoType=libx264 for QuickTime compatibility. */
  pixelFormat?: string;
  /** Maximum duration in seconds. Default: 180, max: 4200. */
  timeLimit?: number;
  /** If true, discard any active recording and start fresh. Default: false. */
  forceRestart?: boolean;
  /** FFMPEG hardware acceleration backend. */
  hardwareAcceleration?: 'videoToolbox' | 'cuda' | 'amf_dx11' | 'qsv' | 'vaapi';
}

/**
 * Android-specific options for startRecordingScreen.
 * @see https://github.com/appium/appium-xcuitest-driver/blob/5bdad71/lib/commands/types.ts
 */
export interface AndroidRecordingOptions {
  /** Frame size in WIDTHxHEIGHT format (e.g. 1280x720). Defaults to native display resolution. */
  videoSize?: string;
  /** Maximum duration in seconds. Default: 180, max: 1800. Values >180 require ffmpeg for chunk merging. */
  timeLimit?: number;
  /** Video bit rate in bits per second. Default: 4000000. */
  bitRate?: number;
  /** Show timestamp overlay. Requires API level 27+. */
  bugReport?: boolean;
  /** If true, discard any active recording and start fresh. Default: false. */
  forceRestart?: boolean;
}

async function saveRecording(base64Video: string): Promise<string> {
  const videoDir = resolveScreenshotDir();
  await mkdir(videoDir, { recursive: true });
  const filename = `recording_${Date.now()}_${crypto.randomUUID()}.mp4`;
  const filepath = join(videoDir, filename);
  await writeFile(filepath, Buffer.from(base64Video, 'base64'));
  return filepath;
}

export function startRecordingScreen(server: FastMCP): void {
  const schema = z.object({
    timeLimit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Maximum recording duration in seconds. iOS default: 180 (max 4200). Android default: 180 (max 1800).'
      ),
    forceRestart: z
      .boolean()
      .optional()
      .describe(
        'If true, stop any active recording immediately and start a new one without returning the previous video. Default: false.'
      ),
    videoQuality: z
      .enum(['low', 'medium', 'high', 'photo'])
      .optional()
      .describe('iOS only. Video quality preset. Default: medium.'),
    videoFps: z
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .describe('iOS only. Frames per second. Default: 10.'),
    videoType: z
      .string()
      .optional()
      .describe(
        'iOS only. Video codec to use (e.g. libx264). Run `ffmpeg -codecs` for options. Default: libx264.'
      ),
    videoFilters: z
      .string()
      .optional()
      .describe(
        'iOS only. FFMPEG video filters (e.g. scale, flip, rotate). See https://ffmpeg.org/ffmpeg-filters.html. Takes precedence over videoScale if both are set.'
      ),
    videoScale: z
      .string()
      .optional()
      .describe(
        'iOS only. Scaling value (e.g. 1280:720). See https://trac.ffmpeg.org/wiki/Scaling. Ignored if videoFilters is set.'
      ),
    pixelFormat: z
      .string()
      .optional()
      .describe(
        'iOS only. Output pixel format (e.g. yuv420p). Run `ffmpeg -pix_fmts` for options. Default: yuv420p (ensures correct duration and QuickTime compatibility).'
      ),
    hardwareAcceleration: z
      .enum(['videoToolbox', 'cuda', 'amf_dx11', 'qsv', 'vaapi'])
      .optional()
      .describe(
        'iOS only. FFMPEG hardware acceleration: videoToolbox (Apple Silicon), cuda (NVIDIA), amf_dx11 (AMD), qsv (Intel), vaapi (Linux).'
      ),
    videoSize: z
      .string()
      .optional()
      .describe(
        'Android only. Frame size in WIDTHxHEIGHT format (e.g. 1280x720). Defaults to the device screen size.'
      ),
    bitRate: z
      .number()
      .int()
      .optional()
      .describe(
        'Android only. Video bit rate in bits per second. Default: 4000000.'
      ),
    bugReport: z
      .boolean()
      .optional()
      .describe(
        'Android only. Set to true to display a timestamp overlay on the video, useful for bug reporting. Requires API level 27 (Android P) or higher.'
      ),
    sessionId: z.string().optional().describe('Session ID to target. If omitted, uses the active session.'),
  });

  server.addTool({
    name: 'appium_start_recording_screen',
    description:
      'Start recording the device screen. Works on both iOS (XCUITest, requires ffmpeg) and Android (UiAutomator2). If timeLimit is provided, automatically stops the recording after the duration and returns the saved file path. Otherwise, returns immediately and requires a separate stop call.',
    parameters: schema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof schema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const platform = getPlatformName(driver);
        let options: IOSRecordingOptions | AndroidRecordingOptions;

        if (platform === PLATFORM.ios) {
          const iosOptions: IOSRecordingOptions = {};
          if (args.timeLimit !== undefined) {
            iosOptions.timeLimit = args.timeLimit;
          }
          if (args.forceRestart !== undefined) {
            iosOptions.forceRestart = args.forceRestart;
          }
          if (args.videoQuality !== undefined) {
            iosOptions.videoQuality = args.videoQuality;
          }
          if (args.videoFps !== undefined) {
            iosOptions.videoFps = args.videoFps;
          }
          // Default videoType is libx264 and pixelFormat is yuv420p for Quicktime compatability
          iosOptions.videoType = args.videoType ?? 'libx264';
          iosOptions.pixelFormat = args.pixelFormat ?? 'yuv420p';
          if (args.videoFilters !== undefined) {
            iosOptions.videoFilters = args.videoFilters;
          }
          if (args.videoScale !== undefined) {
            iosOptions.videoScale = args.videoScale;
          }
          if (args.hardwareAcceleration !== undefined) {
            iosOptions.hardwareAcceleration = args.hardwareAcceleration;
          }
          options = iosOptions;
        } else {
          const androidOptions: AndroidRecordingOptions = {};
          if (args.timeLimit !== undefined) {
            androidOptions.timeLimit = args.timeLimit;
          }
          if (args.forceRestart !== undefined) {
            androidOptions.forceRestart = args.forceRestart;
          }
          if (args.videoSize !== undefined) {
            androidOptions.videoSize = args.videoSize;
          }
          if (args.bitRate !== undefined) {
            androidOptions.bitRate = args.bitRate;
          }
          if (args.bugReport !== undefined) {
            androidOptions.bugReport = args.bugReport;
          }
          options = androidOptions;
        }

        await cmdStartRecording(driver, options);
        return {
          content: [{ type: 'text', text: 'Screen recording started.' }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to start screen recording. Error: ${message}`,
            },
          ],
        };
      }
    },
  });
}

export function stopRecordingScreen(server: FastMCP): void {
  server.addTool({
    name: 'appium_stop_recording_screen',
    description:
      'Stop the active screen recording and save the video to disk. Returns the path to the saved MP4 file. Works on both iOS (XCUITest) and Android (UiAutomator2).',
    parameters: z.object({
      sessionId: z.string().optional().describe('Session ID to target. If omitted, uses the active session.'),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: { sessionId?: string },
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        const base64Video = await cmdStopRecording(driver);

        if (!base64Video) {
          return {
            content: [
              { type: 'text', text: 'No active screen recording to stop.' },
            ],
          };
        }

        const filepath = await saveRecording(base64Video);

        return {
          content: [
            { type: 'text', text: `Screen recording saved to: ${filepath}` },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to stop screen recording. Error: ${message}`,
            },
          ],
        };
      }
    },
  });
}
