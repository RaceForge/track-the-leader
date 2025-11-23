# Object Detection Model Setup

This directory contains the ONNX model and WASM files required for object detection.

## Required Files

### 1. YOLOv8n ONNX Model

Download a pre-trained YOLOv8n model in ONNX format and place it in this directory as `yolov8n.onnx`.

**Option A: Download from Ultralytics**
```bash
# Install ultralytics package
pip install ultralytics

# Export YOLOv8n to ONNX format
yolo export model=yolov8n.pt format=onnx

# Copy the generated yolov8n.onnx file to this directory
```

**Option B: Download pre-converted model**
You can find pre-converted ONNX models at:
- [Ultralytics GitHub Releases](https://github.com/ultralytics/ultralytics/releases)
- [ONNX Model Zoo](https://github.com/onnx/models)

**Model Requirements:**
- Model: YOLOv8n (nano) - optimized for browser performance
- Input: `[1, 3, 640, 640]` - RGB image, 640x640 resolution
- Output: `[1, 84, 8400]` - 8400 detections with 84 values each (4 bbox + 80 class scores)
- Format: ONNX Opset 11 or later
- Size: ~6-8 MB (YOLOv8n is the smallest YOLO model)

### 2. ONNX Runtime WASM Files

The WASM files are automatically copied from `node_modules/onnxruntime-web/dist/` during build:
- `ort-wasm-simd-threaded.wasm` - Main WASM runtime with SIMD support
- `ort-wasm-simd-threaded.mjs` - JavaScript loader for WASM
- Additional .mjs and .wasm files for different backends

These files are located in `public/assets/onnx-wasm/` and are served at `/assets/onnx-wasm/` at runtime.

## Directory Structure

```
public/assets/
├── MODEL_SETUP.md          # This file
├── yolov8n.onnx            # YOLOv8n model (you need to add this)
└── onnx-wasm/              # ONNX Runtime WASM files (auto-copied)
    ├── ort-wasm-simd-threaded.wasm
    ├── ort-wasm-simd-threaded.mjs
    └── ... (other WASM files)
```

## Testing

After adding the model file:

1. Start the development server:
   ```bash
   pnpm run dev
   ```

2. Load a video file in the application

3. Enable "Detection Boxes" toggle in the sidebar

4. You should see bounding boxes around detected vehicles in the video

## Troubleshooting

### Model not found error
- Ensure `yolov8n.onnx` is in the `public/assets/` directory
- Check browser console for specific error messages

### WASM initialization errors
- Check that WASM files are in `public/assets/onnx-wasm/`
- Ensure your browser supports WebAssembly (all modern browsers do)
- Try clearing browser cache

### Poor detection performance
- YOLOv8n is optimized for speed over accuracy
- Consider increasing `confidenceThreshold` in the detection service
- Adjust `nmsThreshold` to reduce overlapping detections

### Model takes too long to load
- YOLOv8n is ~6-8 MB, which may take a few seconds on slow connections
- Model is loaded asynchronously and cached by the browser
- The "Detection Boxes" toggle will be disabled until model loads

## Alternative Models

If YOLOv8n doesn't meet your needs, you can try:

- **YOLOv8s** (small) - Better accuracy, slower inference (~22 MB)
- **YOLOv8m** (medium) - Even better accuracy, much slower (~52 MB)
- **YOLOv5n** - Alternative lightweight option

When using a different model, update the `MODEL_INPUT_SIZE` and class names in `detection.service.ts` if needed.

## Development Notes

The detection service is configured to:
- Run inference at video frame rate (30 fps target)
- Cache detection results per frame
- Filter detections to only show vehicles (car, truck, bus, motorcycle, bicycle)
- Apply Non-Maximum Suppression to remove duplicate detections
- Render bounding boxes with class labels and confidence scores

For more details, see `src/app/services/detection.service.ts`.
