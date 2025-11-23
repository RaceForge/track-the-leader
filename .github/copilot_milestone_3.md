# Milestone 3 — RC Car Detection (YOLO11 + WebGPU)
track-the-leader

## Objective

Run RC car detection in the browser using an exported **Ultralytics YOLO11** ONNX model with the **WebGPU** execution provider. This will produce per-frame bounding boxes and centroids for the `"rc car"` class that later feed into tracking + world mapping.

No tracking, no leader logic yet — this milestone is detection-only.

---

## Model Assumptions

- Base model: **Ultralytics YOLO11** (e.g. `yolo11n` or similar)
- Trained with a single `"rc car"` class
- Input size: **640×640** (static)
- Exported to ONNX:

Example (Python, OUTSIDE this repo):

```python
from ultralytics import YOLO

model = YOLO("path/to/your/yolo11_rc_car.pt")
model.export(format="onnx", imgsz=640)
Resulting file: rc_car_yolo11.onnx (name can vary; wire it below).

Requirements
1. Model Placement & Loading
Add the exported ONNX model to the app (e.g. under public/models/rc_car_yolo11.onnx or similar).

Implement a ModelLoader / InferenceService that:

Loads the ONNX model on app start or on first use.

Uses ONNX Runtime Web with WebGPU execution provider.

Pseudo-config:

ts
Copy code
const session = await ort.InferenceSession.create('models/rc_car_yolo11.onnx', {
  executionProviders: ['webgpu']
});
Provide a way to know when the model is ready (e.g. a BehaviorSubject/Signal).

2. Frame Preprocessing
For each processed frame:

Extract the current video frame into an offscreen canvas.

Resize and letterbox to 640×640 while preserving aspect ratio:

Compute scale and padding so that the original video is mapped correctly.

Normalize pixel values as expected by YOLO11 ONNX export:

Typically: float32, 0–1 range, channels-first [1, 3, 640, 640].

Build input tensor for ONNX Runtime Web.

3. Inference Loop
Integrate inference into the existing render loop or a dedicated detection loop.

Allow a “Detection” toggle in the sidebar:

When OFF: skip inference to save GPU.

When ON: run inference at a reasonable rate (every frame or every N frames).

Ensure the detection loop:

Checks modelLoaded state.

Does not block UI (async/await + non-blocking loops).

4. YOLO11 ONNX Post-Processing
Implement post-processing for YOLO-style output:

Decode bounding boxes from model outputs.

Convert from model space (640×640) back to original video coordinates using stored scale/padding.

Compute confidence scores per detection.

Implement Non-Maximum Suppression (NMS):

Parameters:

confThreshold (e.g. 0.3–0.5, configurable)

nmsIoUThreshold (e.g. 0.45, configurable)

Filter:

Keep only "rc car" class.

Store results as:

ts
Copy code
type Detection = {
  bbox: [number, number, number, number]; // x1, y1, x2, y2 in video coords
  confidence: number;
  classId: number;
  centroid: { x: number; y: number };
};
Expose a detections list per frame via state or signals.

5. Debug Overlay (Bounding Boxes)
Add a Detection Debug toggle in the sidebar.

When ON:

Draw bounding boxes and centroids on the overlay canvas.

Optional: draw confidence score in small text.

When OFF:

Suppress detection overlay (but detection may still run internally later for tracking).

Integration Points
Use existing race-viewer render/update loop.

Keep detection logic separate (service or helper) so Milestone 4 (tracking) can consume detections cleanly.

Respect current mapping and homography architecture:

For this milestone, it’s OK to only produce image-space detections.

World mapping will consume these later.

Deliverables
ONNX Runtime Web + WebGPU detection pipeline wired into Angular.

UI toggle to enable/disable detection.

Visual bounding box overlay (debug).

Detection data structure ready for tracking logic.

Definition of Done
User enables “Detection Debug” and:

RC cars are detected and show bounding boxes on the video.

Multiple cars in frame are detected when visible.

Performance:

At least ~10–15 FPS on a mid-range desktop GPU at 640×640 input.

No blocking errors in console related to ONNX or WebGPU.

If WebGPU is not available in the browser:

Clear error state shown in UI (e.g. “WebGPU required”).

yaml
Copy code
