# SAM3 Integration Guide

This document provides guidance for completing the SAM3 (Segment Anything Model 3) integration.

## Services Implemented

### 1. ProposalGeneratorService ✅

**Status: Fully Implemented**

Motion-based car detection using OpenCV.js:
- Frame differencing against background
- Morphological operations for noise reduction
- Connected component analysis
- Bounding box extraction with area filtering

**Usage:**
```typescript
proposalService.setBackgroundFrame(imageData);
const proposals = proposalService.generateProposals(currentFrame, trackLine);
```

### 2. Sam3SegmentationService ⏳

**Status: Placeholder Ready**

Service structure complete, ready for SAM3 model integration:
- WebGPU detection
- Model loading skeleton
- Preprocessing/inference/postprocessing methods
- Needs: actual model file and tensor operations

## Next Steps

1. Obtain SAM3 model (ONNX or TensorFlow.js format)
2. Implement model loading with WebGPU
3. Complete preprocessing and inference
4. Integrate "Mark Cars" UI in race-viewer
5. Test end-to-end workflow

See service source code for detailed TODOs and implementation notes.
