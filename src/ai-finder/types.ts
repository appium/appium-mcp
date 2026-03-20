/**
 * Type definitions for AI Vision Finder
 */

/**
 * AI Vision configuration interface
 */
export interface AIVisionConfig {
  model: string;
  apiBaseUrl: string;
  apiToken: string;
  coordType: 'normalized' | 'absolute';
  imageMaxWidth: number;
  imageQuality: number;
}

/**
 * Bounding box type: [x1, y1, x2, y2]
 * - x1, y1: top-left corner coordinates
 * - x2, y2: bottom-right corner coordinates
 */
export type BBox = [x1: number, y1: number, x2: number, y2: number];

/**
 * Bounding box coordinates interface
 * Matches the format returned by vision models
 */
export interface BBoxCoordinates {
  target: string;
  bbox_2d: BBox;
}

/**
 * AI element finding result interface
 */
export interface AIFindResult {
  bbox: BBox;
  center: { x: number; y: number };
  target: string;
  annotatedImagePath?: string;
}
