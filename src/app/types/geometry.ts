/**
 * Shared geometry types used across the application.
 * Centralizing these types ensures consistency and reduces duplication.
 */

/**
 * A 2D point with x and y coordinates.
 */
export type Point2D = { x: number; y: number };

/**
 * A bounding box represented as [x, y, width, height].
 */
export type BBox = [number, number, number, number];

/**
 * A 3x3 homography transformation matrix.
 */
export type Homography = number[][];
