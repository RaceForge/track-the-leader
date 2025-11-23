# Milestone 2.5 — Camera Motion & Homography Stabilization
track-the-leader

## Objective

Estimate and apply a per-frame 2D homography so that the **user-defined track line (from Milestone 2)** behaves as if it were drawn in a fixed world coordinate system, even though the camera is moving (GoPro on helmet).

This milestone adds a **motion stabilization layer** that:

- Tracks static scene features over time
- Computes homography transforms per frame relative to a reference frame
- Provides utilities to map points between:
  - **image space (current frame)** and
  - **reference frame (track-mapping frame)**

No detection, no leader logic yet — this is purely camera motion estimation.

---

## Key Concepts

- **Reference frame**:
  - For now, use the **frame where the user defined the track line** as the reference frame.
- **Homography H_t**:
  - 3×3 matrix that maps coordinates from current frame `t` → reference frame
  - `p_ref ~ H_t * p_t` (homogeneous coordinates)

The goal is that:
- The track line, defined in reference frame, aligns visually with the physical track across all frames when transformed appropriately.

---

## Requirements

### 1. Frame Sampling & Preprocessing

- Capture frames from the `<video>` element for motion estimation.
- Downscale frames for performance (e.g. 640×360 or similar) while maintaining aspect ratio.
- Convert frames to a format usable by the feature detection implementation.

Implementation notes:
- This milestone can be CPU-only; no WebGPU required.
- You may use:
  - OpenCV.js (WASM) loaded in the browser, or
  - A custom feature detector/tracker + homography solver in TS.

### 2. Feature Detection & Tracking

- Detect **static scene features** (track borders, walls, pipes, jumps, banner edges).
- Track those features over time:
  - Either via descriptor matching (e.g. ORB keypoints) or
  - Optical flow for sparse features.

Requirements:
- Prefer features that belong to the **static environment**, not the cars.
- Reject fast-moving/unstable features via matching thresholds and RANSAC.

### 3. Homography Estimation

For each frame `t`:

1. Match feature points from frame `t` to features in the **reference frame**.
2. Estimate a homography `H_t` using RANSAC (or similar robust method).
3. Store and/or smooth `H_t` over time, e.g. exponential moving average on matrix parameters.

Data shape:

```ts
type Homography = number[][]; // 3x3 matrix
let homographies: Map<number, Homography>; // frameIndex -> H_t
Notes:

If direct matches to reference frame are too expensive, you can:

Track incrementally between consecutive frames and compose transforms back to the reference.

Homography should handle planar track assumption (good enough for RC track floor).

4. Mapping Utilities
Create utility functions (in a dedicated service/module) to map points:

ts
Copy code
type Point2D = { x: number; y: number };

// Map a point in current frame to reference frame
function mapToReference(point: Point2D, frameIndex: number): Point2D | null;

// Map a point in reference frame to current frame
function mapToCurrent(point: Point2D, frameIndex: number): Point2D | null;
These will be used later by:

Detection pipeline (map car centroids into reference frame)

Overlay rendering (map leader marker back into current frame)

5. Debug Visualization
Add a debug mode (toggle in sidebar) that:

Draws the track line (defined in reference frame) transformed into the current frame using H_t.

When the camera moves, the line should still appear pinned to the physical track.

Requirements:

When debug mode is enabled:

Render transformed track line on the overlay canvas each frame.

When disabled:

Suppress this debug overlay.

State & Integration
Store homography state alongside existing race viewer state.

Hook into the same render loop that currently draws overlays.

Maintain a notion of currentFrameIndex (can approximate from time and FPS or keep a frame counter in the processing loop).

Deliverables
A homography estimation subsystem in TS/Angular that:

Detects and tracks static features.

Computes H_t per frame relative to the track-mapping reference frame.

Exposes mapping utilities for future use by detection/leader logic.

Debug visualization showing the track line remaining aligned with the track despite camera motion.

Definition of Done
When debug mode is ON and the video plays:

The user-defined track polyline appears visually glued to the track floor even as the camera moves.

No detection/leader logic required yet.

Performance is acceptable on a typical desktop machine for a 10-second clip.

No blocking errors in the console.

Homography estimation gracefully handles frames where too few matches are found (e.g. fallback to last good H_t).
