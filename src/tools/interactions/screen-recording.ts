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

const screenRecordingSchema = z.object({
  action: z
    .enum(['start', 'stop'])
    .describe(
      'Use start to begin recording. Use stop to end the current recording, retrieve it from the driver, and save it to disk.'
    ),
  timeLimit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Maximum recording duration in seconds for the underlying recorder. This does not automatically stop and save the recording through this tool; call action="stop" to retrieve/save the video. iOS default: 180 (max 4200). Android default: 180 (max 1800).'
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
    .describe('iOS only. Video codec to use (e.g. libx264).'),
  videoFilters: z
    .string()
    .optional()
    .describe(
      'iOS only. FFMPEG video filters. Takes precedence over videoScale.'
    ),
  videoScale: z
    .string()
    .optional()
    .describe('iOS only. Scaling value (e.g. 1280:720).'),
  pixelFormat: z
    .string()
    .optional()
    .describe('iOS only. Output pixel format (e.g. yuv420p).'),
  hardwareAcceleration: z
    .enum(['videoToolbox', 'cuda', 'amf_dx11', 'qsv', 'vaapi'])
    .optional()
    .describe('iOS only. FFMPEG hardware acceleration backend.'),
  videoSize: z
    .string()
    .optional()
    .describe(
      'Android only. Frame size in WIDTHxHEIGHT format (e.g. 1280x720).'
    ),
  bitRate: z
    .number()
    .int()
    .optional()
    .describe('Android only. Video bit rate in bits per second.'),
  bugReport: z
    .boolean()
    .optional()
    .describe(
      'Android only. Display timestamp overlay. Requires API level 27+.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
});

export default function screenRecording(server: FastMCP): void {
  server.addTool({
    name: 'appium_screen_recording',
    description:
      'Start or stop screen recording. action=start begins recording; action=stop stops and saves to MP4.',
    parameters: screenRecordingSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
    execute: async (
      args: z.infer<typeof screenRecordingSchema>,
      _context: Record<string, unknown> | undefined
    ): Promise<ContentResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        throw new Error('No driver found');
      }

      try {
        if (args.action === 'stop') {
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
        }

        const platform = getPlatformName(driver);
        if (![PLATFORM.ios, PLATFORM.android].includes(platform)) {
          throw new Error(
            `Unsupported platform: ${platform}. Only Android and iOS are supported.`
          );
        }

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
              text: `Failed screen recording action ${args.action}. Error: ${message}`,
            },
          ],
        };
      }
    },
  });
}
