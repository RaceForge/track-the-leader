# Testing Guide - Object Detection Feature

## Prerequisites

Before testing the object detection feature, ensure you have:

1. **YOLOv8n ONNX Model**: Download and place in `public/assets/yolov8n.onnx`
   - See [public/assets/MODEL_SETUP.md](public/assets/MODEL_SETUP.md) for instructions
   - Model size: ~6-8 MB
   - Format: ONNX (Ultralytics YOLOv8n)

2. **Test Video**: Prepare a video file with RC cars or vehicles
   - Format: `.mp4` or `.mov`
   - Recommended: 10-30 second clip for initial testing
   - Should contain visible cars/vehicles for detection

## Running the Application

### Development Mode

```bash
# Start the development server
pnpm run dev

# Open browser to http://localhost:4200
```

### Production Build

```bash
# Build the application
pnpm run build

# Deploy to Cloudflare Pages
pnpm run deploy
```

## Testing Checklist

### 1. Basic Functionality

- [ ] Application loads without errors
- [ ] Drag and drop a video file
- [ ] Video plays successfully
- [ ] Sidebar controls are visible

### 2. Detection Service Initialization

Open browser console and check for:
- [ ] "Loading YOLO model from: /assets/yolov8n.onnx"
- [ ] "Model loaded successfully"
- [ ] "Input names: ..." and "Output names: ..."
- [ ] No error messages about missing WASM files

**Expected Console Output:**
```
Loading YOLO model from: /assets/yolov8n.onnx
Model loaded successfully
Input names: ['images']
Output names: ['output0']
```

### 3. UI Controls

- [ ] "Detection Boxes" toggle is initially disabled (grayed out)
- [ ] After model loads, toggle becomes enabled
- [ ] Toggle can be checked/unchecked

### 4. Detection Visualization

**Enable Detection Boxes:**
1. Check the "Detection Boxes" toggle
2. Video should continue playing
3. Green bounding boxes should appear around detected vehicles
4. Each box should have:
   - Green border (3px width)
   - Red center point (5px radius)
   - Label with class name and confidence (e.g., "car 87%")
   - Semi-transparent green background behind label text

**Verify:**
- [ ] Boxes appear on vehicles/cars in the video
- [ ] Boxes move with the vehicles as video plays
- [ ] Multiple vehicles can be detected simultaneously
- [ ] Labels are readable and show confidence percentages
- [ ] Center points are visible (red dots)

### 5. Performance Testing

**Metrics to monitor (in browser DevTools):**
- [ ] Video playback remains smooth (no stuttering)
- [ ] Frame rate stays close to 30 fps
- [ ] Memory usage grows but stabilizes (cache eviction working)
- [ ] CPU usage is reasonable (< 80% on average desktop)

**Console Performance Logs:**
Check for warnings about:
- "Not enough keypoints in current frame" (occasional is OK)
- "Only X good matches, need at least 4" (occasional is OK)
- No repeated errors about failed inference

### 6. Edge Cases

**No Model File:**
- [ ] With no model file, toggle stays disabled
- [ ] Console shows error: "Failed to load model"
- [ ] Application continues to work (graceful degradation)

**Poor Detection Conditions:**
- [ ] Fast-moving vehicles may have intermittent detection (expected)
- [ ] Small vehicles may not be detected (YOLOv8n limitation)
- [ ] Occluded vehicles may not be detected (expected)

**Long Video:**
- [ ] Memory usage should not grow indefinitely
- [ ] Cache eviction happens after ~10 seconds (300 frames at 30fps)
- [ ] Performance remains stable throughout playback

### 7. Integration with Existing Features

**Track Line Mapping (Milestone 2):**
- [ ] Can define track line with detection enabled
- [ ] Track line and detection boxes can coexist on overlay
- [ ] Both features work independently

**Camera Stabilization (Milestone 2.5):**
- [ ] Can enable "Stabilized Track Line" and "Detection Boxes" together
- [ ] Both features work simultaneously
- [ ] No performance degradation with both enabled

### 8. Browser Compatibility

Test on multiple browsers:
- [ ] Chrome/Chromium (recommended)
- [ ] Firefox
- [ ] Safari (Mac)
- [ ] Edge

**Check for:**
- WebAssembly support (all modern browsers)
- OffscreenCanvas support (fallback needed for Safari < 16.4)
- Performance differences between browsers

## Troubleshooting

### Model Not Loading

**Symptoms:**
- "Detection Boxes" toggle remains disabled
- Console error: "Failed to load model"

**Solutions:**
1. Verify `public/assets/yolov8n.onnx` exists
2. Check file size is ~6-8 MB (not 0 or corrupt)
3. Ensure WASM files exist in `public/assets/onnx-wasm/`
4. Clear browser cache and reload

### No Detections Visible

**Symptoms:**
- Toggle is enabled but no boxes appear
- Video plays normally

**Solutions:**
1. Check video contains vehicles/cars
2. Verify camera angle shows vehicles clearly
3. Check console for inference errors
4. Try increasing lighting/contrast in video
5. Test with different video

### Poor Performance

**Symptoms:**
- Video stutters or drops frames
- High CPU usage
- Browser becomes unresponsive

**Solutions:**
1. Close other browser tabs
2. Reduce video resolution (smaller file)
3. Disable other features temporarily
4. Check available system memory
5. Try in production build (better optimization)

### Memory Issues

**Symptoms:**
- Browser tab crashes after long playback
- Memory usage grows continuously
- "Out of memory" errors

**Solutions:**
1. Verify cache eviction is working (check console logs)
2. Refresh page to clear cache
3. Use shorter video clips for testing
4. Check MAX_CACHE_SIZE setting (currently 300 frames)

## Performance Benchmarks

**Expected Performance (typical desktop):**

| Metric | Target | Acceptable | Poor |
|--------|--------|------------|------|
| Inference Latency | < 50ms | < 100ms | > 150ms |
| Frame Rate | 30 fps | 25-30 fps | < 20 fps |
| Memory Usage | < 300 MB | < 500 MB | > 1 GB |
| Model Load Time | < 3s | < 5s | > 10s |

**Note:** Performance varies based on:
- Device CPU/GPU capabilities
- Video resolution and complexity
- Number of objects in frame
- Other browser activity

## Automated Testing

### Unit Tests

```bash
# Run unit tests (requires Chrome/Chromium)
pnpm test
```

**Detection Service Tests:**
- Service initialization
- Configuration signals
- Cache management
- Model loading (mocked)

### Integration Tests

Currently manual testing only. Future work:
- E2E tests with Playwright
- Visual regression testing
- Performance benchmarking

## Reporting Issues

When reporting issues, include:
1. Browser and version
2. Video file details (resolution, duration)
3. Console logs (full output)
4. Expected vs actual behavior
5. Performance metrics if relevant
6. Steps to reproduce

## Success Criteria

The feature is working correctly if:
- ✅ Model loads without errors
- ✅ Detection boxes appear on vehicles
- ✅ Video playback remains smooth
- ✅ Memory usage is stable
- ✅ UI toggles work as expected
- ✅ Integration with other features works
- ✅ Graceful degradation without model file

---

For more details on the implementation, see:
- [COPILOT_MILESTONE_3.md](.github/COPILOT_MILESTONE_3.md)
- [MODEL_SETUP.md](public/assets/MODEL_SETUP.md)
- [README.md](README.md)
