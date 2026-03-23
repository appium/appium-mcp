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
  videoFps?: string | number;
  /** FFMPEG video filters. Takes precedence over videoScale. @see https://ffmpeg.org/ffmpeg-filters.html */
  videoFilters?: string;
  /** Scaling value (e.g. 1280:720). Ignored if videoFilters is set. @see https://trac.ffmpeg.org/wiki/Scaling */
  videoScale?: string;
  /** Output pixel format. Run `ffmpeg -pix_fmts` for options. Use yuv420p with videoType=libx264 for QuickTime compatibility. */
  pixelFormat?: string;
  /** Maximum duration in seconds. Default: 180, max: 4200. */
  timeLimit?: string | number;
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
  timeLimit?: string | number;
  /** Video bit rate in bits per second. Default: 4000000. */
  bitRate?: string | number;
  /** Show timestamp overlay. Requires API level 27+. */
  bugReport?: boolean;
  /** If true, discard any active recording and start fresh. Default: false. */
  forceRestart?: boolean;
}
