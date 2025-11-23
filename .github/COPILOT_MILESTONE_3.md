# Milestone 3 — Object Detection Per Frame
track-the-leader

## Objective

Detect RC cars efficiently in browser using a pre-trained object detection model. This milestone adds real-time detection capabilities to track RC cars frame-by-frame during video playback, providing bounding boxes and center coordinates for future leader tracking logic.

---

## Key Concepts

- **Frame Preprocessing**: Convert video frames to model input tensors
- **Async Inference**: Run detection model per frame without blocking UI
- **Postprocessing**: Apply Non-Maximum Suppression (NMS) and filter for RC car detections
- **Debug Visualization**: Toggle overlay of detection bounding boxes

---

## Requirements

### 1. Frame Preprocessing

- Extract video frame as ImageData from video element
- Resize and normalize frame to match model input requirements (e.g., 640x640 for YOLO models)
- Convert to model-compatible tensor format
- Handle aspect ratio and letterboxing if needed

Implementation notes:
- Use OffscreenCanvas or temporary canvas for preprocessing
- Maintain performance with efficient image resizing
- Preprocess on CPU is acceptable for this milestone

### 2. Object Detection Model Integration

For this milestone, we'll use a lightweight browser-compatible model:
- **ONNX Runtime Web** with a pre-trained YOLO model, OR
- **TensorFlow.js** with a pre-trained model

Model requirements:
- Runs efficiently in browser (WebAssembly or WebGL backend)
- Detects objects including vehicles/cars
- Outputs bounding boxes with class labels and confidence scores

### 3. Async Inference Per Frame

- Run inference asynchronously to avoid blocking the render loop
- Queue frames if inference is slower than video framerate
- Skip frames if necessary to maintain real-time performance
- Store detection results with frame index for tracking

Data structures:
```ts
type BoundingBox = {
  x: number;      // Top-left x coordinate
  y: number;      // Top-left y coordinate
  width: number;  // Box width
  height: number; // Box height
};

type Detection = {
  box: BoundingBox;
  className: string;
  confidence: number;
  center: Point2D;  // Computed center coordinate
};

type FrameDetections = {
  frameIndex: number;
  detections: Detection[];
};
```

### 4. Postprocessing Pipeline

Implement the following postprocessing steps:

#### Non-Maximum Suppression (NMS)
- Remove duplicate/overlapping detections
- Use IoU (Intersection over Union) threshold (e.g., 0.45)
- Keep detection with highest confidence in overlapping region

#### Class Filtering
- Filter detections to only include "rc car", "car", "truck", or similar vehicle classes
- Use configurable class filter list
- Map model class names to application-specific names

#### Center Coordinate Extraction
- Compute center point: `{ x: box.x + box.width/2, y: box.y + box.height/2 }`
- Store center coordinates for future leader tracking logic

### 5. Detection Service

Create a dedicated service for object detection:

```ts
@Injectable({ providedIn: 'root' })
export class DetectionService {
  // Model state
  private model: any | null = null;
  modelReady = signal<boolean>(false);
  
  // Detection results cache
  private detectionCache = new Map<number, Detection[]>();
  
  // Configuration
  confidenceThreshold = signal<number>(0.5);
  nmsThreshold = signal<number>(0.45);
  targetClasses = signal<string[]>(['car', 'truck']);
  
  // Debug state
  showDetections = signal<boolean>(false);
  
  // Methods
  async loadModel(): Promise<void>;
  async detectObjects(imageData: ImageData, frameIndex: number): Promise<Detection[]>;
  getDetections(frameIndex: number): Detection[] | null;
  clear(): void;
}
```

### 6. Debug Visualization

Add a debug mode toggle in the sidebar that:
- Draws detection bounding boxes on overlay canvas
- Labels each box with class name and confidence score
- Draws center point as a small circle
- Uses distinct colors for different classes

Requirements:
- When enabled: Render boxes each frame synchronized with video playback
- When disabled: Suppress detection overlay (but continue running inference)
- Performance: Rendering should not significantly impact playback

### 7. Integration with Race Viewer

Extend the race viewer component to:
- Initialize detection service on video load
- Run detection async on each frame during playback
- Render detection overlays when debug mode is enabled
- Store detection results for future leader tracking

---

## State & Integration

- Add detection service alongside existing homography service
- Hook into the same render loop that currently draws track line
- Maintain frame synchronization between video, homography, and detection
- Store detection state in service, expose via signals for UI

---

## Deliverables

1. Detection service with model loading and inference
2. Frame preprocessing pipeline
3. Postprocessing with NMS and class filtering
4. Debug visualization toggle in sidebar
5. Detection results cached per frame for future use

---

## Definition of Done

When the feature is complete:

- User can toggle "Show Detections" in sidebar
- Detection boxes appear on video overlay in real-time during playback
- Only RC cars/vehicles are detected (other objects filtered out)
- Box labels show class name and confidence
- Performance is acceptable for 10-second clips (no major stuttering)
- No blocking errors in console
- Detection results are stored per frame for future leader tracking logic

---

## Performance Targets

- Inference latency: < 100ms per frame (on typical desktop)
- Video playback remains smooth (no dropped frames)
- Memory usage stays reasonable (< 500MB for 10-second clip)

---

## Future Work (Not in this milestone)

- Leader identification and tracking across frames
- Position calculation along track line
- Leaderboard updates
- Race lap counting
