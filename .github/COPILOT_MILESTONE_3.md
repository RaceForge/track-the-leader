# Milestone 3 — RC Car Detection via SAM3 (Hybrid Proposals)
track-the-leader

> This replaces the previous YOLO-based Milestone 3 doc.  
> Goal: use **SAM3** in the browser (WebGPU) to segment RC cars, using a **hybrid proposal** approach:
>  - automatic motion-based proposals
>  - user confirmation of which blobs are cars
>  - SAM3 segmentation for pixel-accurate masks + centroids

No tracking, no leader logic yet. This milestone is about:
1. Getting SAM3 running in the browser.
2. Building a **"Mark Cars"** UI flow.
3. Producing high-quality car masks + centroids on a single frame.

---

## Objective

Implement an interactive **Car Initialization** step:

1. User enters **Mark Cars** mode (after track line is defined).
2. App generates **candidate blobs** from motion/foreground.
3. User confirms which blobs are RC cars.
4. For each confirmed car:
   - Run SAM3 segmentation.
   - Compute and store centroid + mask + bounding box.
   - Seed that car with a unique ID for use in later tracking milestones.

---

## Requirements

### 1. SAM3 Model Integration (WebGPU)

- Load a **SAM3** model (ONNX / LiteRT format) in browser with WebGPU backend.
- Create a `Sam3SegmentationService` (or similar) that:
  - Initializes the model once.
  - Exposes a method like:

    ```ts
    type SamPrompt = {
      point: { x: number; y: number };
      box?: [number, number, number, number]; // optional
    };

    type SamMaskResult = {
      mask: ImageData | Uint8ClampedArray; // binary or soft mask
      bbox: [number, number, number, number]; // in video coordinates
      centroid: { x: number; y: number };
    };

    runSegmentation(
      frame: HTMLCanvasElement | ImageData,
      prompt: SamPrompt
    ): Promise<SamMaskResult>;
    ```

- Use **WebGPU** execution provider (or LiteRT.js WebGPU backend).
- Provide `isLoaded()` or similar readiness state to the Race Viewer.

### 2. Motion-Based Proposal Generation (Hybrid C)

- Implement a **proposal generator** that finds likely moving blobs (cars) on a selected key frame:

  - Use simple CV:
    - Frame differencing against a background snapshot (early frame).
    - Or a running average background model.
  - Threshold + morphological operations to get binary regions.
  - Extract connected components / contours.
  - Compute bounding boxes for each region.

- Filter out noise:
  - Minimum/maximum area thresholds (too small or too large).
  - Optionally restrict to regions near the user-defined track polyline.

- Expose candidate proposals to the Race Viewer as:

  ```ts
  type Proposal = {
    id: number;
    bbox: [number, number, number, number];
    centroid: { x: number; y: number };
  };

  let proposals: Proposal[];
  ```

### 3. "Mark Cars" UI Flow

Add a **"Mark Cars"** button to the sidebar, enabled when:
- Track line is defined and confirmed.
- A valid video is loaded.

**Flow:**

1. User clicks **Mark Cars**:
   - Video pauses.
   - The current frame is used for proposals.
   - Proposals are drawn as translucent rectangles over the video.

2. User interaction:
   - User can click a proposal to mark it as a car.
   - Clicking toggles selection (selected vs not selected).
   - Provide a simple list in the sidebar:
     - "Selected cars: N"
   - Also allow manual click on empty area:
     - Converts that click into a `SamPrompt` with a point-only proposal.

3. Controls:
   - Button: **Confirm Cars**
     - Enabled when ≥ 1 proposal is selected.
   - Button: **Cancel**
     - Discards proposals, exits Mark Cars mode.

### 4. Running SAM3 on Confirmed Cars

When user clicks **Confirm Cars**:

For each selected proposal:
1. Build a `SamPrompt`:
   - `point`: proposal centroid or user click.
   - `box`: proposal bounding box (optional, improves segmentation).

2. Call `Sam3SegmentationService.runSegmentation(...)` with:
   - The paused key frame.
   - The prompt.

3. Get back `SamMaskResult`:
   - Mask, bbox, centroid.

4. Assign a new car ID:

```ts
type CarSeed = {
  id: number;
  centroid: { x: number; y: number };    // in video coordinates
  bbox: [number, number, number, number];
  mask: SamMaskResult["mask"];
};

let carSeeds: CarSeed[];
```

5. Store `carSeeds` in state for later milestones:
   - These become the initial tracks / prompts for temporal tracking with SAM3.

### 5. Visual Display

**During Mark Cars mode:**
- Draw proposals as boxes (e.g. yellow).
- Selected proposals as highlighted (e.g. green).

**After SAM3 segmentation:**
- Optionally overlay SAM masks with low alpha (debug toggle).

**After Confirm:**
- Exit Mark Cars mode.
- Hide proposals unless debug mode is enabled.

---

## Integration with Existing State

- Only allow **Mark Cars** after track is locked (Milestone 2 complete).
- Store:
  - `proposals: Proposal[]`
  - `selectedProposalIds: number[]`
  - `carSeeds: CarSeed[]`
- Wire these into the Race Viewer state/signals.
- These seeds will be used in later milestones (tracking and leader logic).

---

## Deliverables

1. SAM3 model loaded and callable from Angular.
2. Motion-based proposal generator creating candidate blobs.
3. **"Mark Cars"** UI flow:
   - User can select which proposals correspond to cars.
   - System runs SAM3 on selected ones.
4. Produces stable `carSeeds` (masks + centroids) for each car.

---

## Definition of Done

- Clicking **Mark Cars** pauses video and shows proposal boxes.
- User can select/deselect proposals.
- Confirming runs SAM3 and outputs car seeds with reasonable masks for each car.
- Visual feedback makes it clear which cars were accepted.
- Performance is acceptable for a single key frame segmentation step (MVP).
- **No tracking, no per-frame inference yet** — this comes in the next milestone.
