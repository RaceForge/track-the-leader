import { Injectable, signal } from '@angular/core';
import * as ort from 'onnxruntime-web';

export type Point2D = { x: number; y: number };

export type BoundingBox = {
	x: number; // Top-left x coordinate
	y: number; // Top-left y coordinate
	width: number; // Box width
	height: number; // Box height
};

export type Detection = {
	box: BoundingBox;
	className: string;
	confidence: number;
	center: Point2D; // Computed center coordinate
};

export type FrameDetections = {
	frameIndex: number;
	detections: Detection[];
};

/**
 * Object detection service for identifying RC cars in video frames.
 *
 * This service uses ONNX Runtime Web to run a YOLOv8n object detection model
 * in the browser. It provides frame-by-frame detection with postprocessing
 * including Non-Maximum Suppression (NMS) and class filtering.
 *
 * Architecture:
 * 1. Load YOLOv8n ONNX model (80 COCO classes including cars/trucks)
 * 2. Preprocess video frames to 640x640 tensor input
 * 3. Run async inference per frame
 * 4. Postprocess outputs: NMS, class filtering, center extraction
 * 5. Cache results per frame for tracking
 *
 * The model outputs:
 * - Shape: [1, 84, 8400] for YOLOv8n
 * - Format: [x_center, y_center, width, height, class_scores...]
 * - Each of 8400 anchor points has 84 values (4 bbox + 80 class scores)
 */
@Injectable({
	providedIn: 'root',
})
export class DetectionService {
	/** ONNX Runtime session for model inference */
	private session: ort.InferenceSession | null = null;

	/** Model initialization state */
	modelReady = signal<boolean>(false);
	modelLoading = signal<boolean>(false);
	modelError = signal<string | null>(null);

	/** Detection results cache indexed by frame number */
	private detectionCache = new Map<number, Detection[]>();

	/** Configuration signals */
	confidenceThreshold = signal<number>(0.5);
	nmsThreshold = signal<number>(0.45);
	targetClasses = signal<string[]>([
		'car',
		'truck',
		'bus',
		'motorcycle',
		'bicycle',
	]);

	/** Debug visualization state */
	showDetections = signal<boolean>(false);

	/** Model input size (YOLOv8n uses 640x640) */
	readonly MODEL_INPUT_SIZE = 640;

	/** COCO dataset class names (80 classes) */
	private readonly COCO_CLASSES = [
		'person',
		'bicycle',
		'car',
		'motorcycle',
		'airplane',
		'bus',
		'train',
		'truck',
		'boat',
		'traffic light',
		'fire hydrant',
		'stop sign',
		'parking meter',
		'bench',
		'bird',
		'cat',
		'dog',
		'horse',
		'sheep',
		'cow',
		'elephant',
		'bear',
		'zebra',
		'giraffe',
		'backpack',
		'umbrella',
		'handbag',
		'tie',
		'suitcase',
		'frisbee',
		'skis',
		'snowboard',
		'sports ball',
		'kite',
		'baseball bat',
		'baseball glove',
		'skateboard',
		'surfboard',
		'tennis racket',
		'bottle',
		'wine glass',
		'cup',
		'fork',
		'knife',
		'spoon',
		'bowl',
		'banana',
		'apple',
		'sandwich',
		'orange',
		'broccoli',
		'carrot',
		'hot dog',
		'pizza',
		'donut',
		'cake',
		'chair',
		'couch',
		'potted plant',
		'bed',
		'dining table',
		'toilet',
		'tv',
		'laptop',
		'mouse',
		'remote',
		'keyboard',
		'cell phone',
		'microwave',
		'oven',
		'toaster',
		'sink',
		'refrigerator',
		'book',
		'clock',
		'vase',
		'scissors',
		'teddy bear',
		'hair drier',
		'toothbrush',
	];

	constructor() {
		// Configure ONNX Runtime to use WebAssembly backend
		ort.env.wasm.wasmPaths = '/assets/onnx-wasm/';
	}

	/**
	 * Load YOLOv8n ONNX model for object detection.
	 *
	 * The model should be placed in the public/assets/ directory as yolov8n.onnx.
	 * YOLOv8n is the smallest YOLO model, optimized for speed while maintaining
	 * reasonable accuracy for vehicle detection.
	 *
	 * Model specs:
	 * - Input: [1, 3, 640, 640] - RGB image normalized to [0, 1]
	 * - Output: [1, 84, 8400] - Detections in YOLO format
	 *
	 * @param modelPath - Path to ONNX model file (default: /assets/yolov8n.onnx)
	 */
	async loadModel(modelPath = '/assets/yolov8n.onnx'): Promise<void> {
		if (this.modelLoading()) {
			console.warn('Model is already loading');
			return;
		}

		if (this.modelReady()) {
			console.log('Model already loaded');
			return;
		}

		this.modelLoading.set(true);
		this.modelError.set(null);

		try {
			console.log('Loading YOLO model from:', modelPath);

			// Create inference session with WebAssembly backend
			this.session = await ort.InferenceSession.create(modelPath, {
				executionProviders: ['wasm'],
			});

			console.log('Model loaded successfully');
			console.log('Input names:', this.session.inputNames);
			console.log('Output names:', this.session.outputNames);

			this.modelReady.set(true);
		} catch (error) {
			const errorMessage = `Failed to load model: ${error}`;
			console.error(errorMessage);
			this.modelError.set(errorMessage);
		} finally {
			this.modelLoading.set(false);
		}
	}

	/**
	 * Preprocess video frame to model input tensor.
	 *
	 * Steps:
	 * 1. Resize frame to 640x640 (letterbox with gray padding to maintain aspect ratio)
	 * 2. Convert RGBA to RGB
	 * 3. Normalize pixel values to [0, 1]
	 * 4. Transpose from HWC to CHW format (channels first)
	 * 5. Create ONNX tensor
	 *
	 * @param imageData - Raw frame data from video element
	 * @returns Preprocessed tensor and scale info for postprocessing
	 */
	private preprocessFrame(imageData: ImageData): {
		tensor: ort.Tensor;
		scaleX: number;
		scaleY: number;
		offsetX: number;
		offsetY: number;
	} {
		const { width, height, data } = imageData;

		// Calculate scale to fit image into 640x640 while maintaining aspect ratio
		const scale = Math.min(
			this.MODEL_INPUT_SIZE / width,
			this.MODEL_INPUT_SIZE / height,
		);
		const scaledWidth = Math.round(width * scale);
		const scaledHeight = Math.round(height * scale);

		// Calculate padding to center the image
		const offsetX = Math.floor((this.MODEL_INPUT_SIZE - scaledWidth) / 2);
		const offsetY = Math.floor((this.MODEL_INPUT_SIZE - scaledHeight) / 2);

		// Create temporary canvas for resizing
		const canvas = new OffscreenCanvas(
			this.MODEL_INPUT_SIZE,
			this.MODEL_INPUT_SIZE,
		);
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Failed to get canvas context');
		}

		// Fill with gray background (letterboxing)
		ctx.fillStyle = '#808080';
		ctx.fillRect(0, 0, this.MODEL_INPUT_SIZE, this.MODEL_INPUT_SIZE);

		// Draw resized image centered
		const sourceCanvas = new OffscreenCanvas(width, height);
		const sourceCtx = sourceCanvas.getContext('2d');
		if (!sourceCtx) {
			throw new Error('Failed to get source canvas context');
		}
		sourceCtx.putImageData(imageData, 0, 0);

		ctx.drawImage(
			sourceCanvas,
			0,
			0,
			width,
			height,
			offsetX,
			offsetY,
			scaledWidth,
			scaledHeight,
		);

		// Get resized image data
		const resizedImageData = ctx.getImageData(
			0,
			0,
			this.MODEL_INPUT_SIZE,
			this.MODEL_INPUT_SIZE,
		);

		// Convert to CHW format and normalize
		const inputSize = this.MODEL_INPUT_SIZE * this.MODEL_INPUT_SIZE;
		const float32Data = new Float32Array(3 * inputSize);

		// RGBA to RGB and normalize to [0, 1]
		for (let i = 0; i < inputSize; i++) {
			const pixelIndex = i * 4;
			float32Data[i] = resizedImageData.data[pixelIndex] / 255.0; // R
			float32Data[inputSize + i] =
				resizedImageData.data[pixelIndex + 1] / 255.0; // G
			float32Data[2 * inputSize + i] =
				resizedImageData.data[pixelIndex + 2] / 255.0; // B
		}

		// Create ONNX tensor with shape [1, 3, 640, 640]
		const tensor = new ort.Tensor('float32', float32Data, [
			1,
			3,
			this.MODEL_INPUT_SIZE,
			this.MODEL_INPUT_SIZE,
		]);

		return {
			tensor,
			scaleX: scale,
			scaleY: scale,
			offsetX,
			offsetY,
		};
	}

	/**
	 * Postprocess model output to extract detections.
	 *
	 * YOLOv8 output format: [1, 84, 8400]
	 * - 84 values per anchor: [x_center, y_center, width, height, 80 class scores]
	 * - 8400 anchor points across the image
	 *
	 * Steps:
	 * 1. Transpose output to [8400, 84] for easier processing
	 * 2. For each anchor, find max class score and check confidence threshold
	 * 3. Convert from model coordinates to original image coordinates
	 * 4. Apply NMS to remove overlapping boxes
	 * 5. Filter by target classes (cars, trucks, etc.)
	 * 6. Compute center coordinates
	 */
	private postprocessOutput(
		output: ort.Tensor,
		scaleX: number,
		scaleY: number,
		offsetX: number,
		offsetY: number,
		originalWidth: number,
		originalHeight: number,
	): Detection[] {
		const data = output.data as Float32Array;
		const numAnchors = 8400;
		const numValues = 84; // 4 bbox + 80 classes

		const rawDetections: {
			box: BoundingBox;
			classId: number;
			confidence: number;
		}[] = [];

		// Process each anchor point
		for (let i = 0; i < numAnchors; i++) {
			// Get values for this anchor
			const offset = i;
			const xCenter = data[offset];
			const yCenter = data[numAnchors + offset];
			const w = data[2 * numAnchors + offset];
			const h = data[3 * numAnchors + offset];

			// Find max class score (80 classes start at index 4)
			let maxScore = 0;
			let maxClassId = 0;

			for (let c = 0; c < 80; c++) {
				const score = data[(4 + c) * numAnchors + offset];
				if (score > maxScore) {
					maxScore = score;
					maxClassId = c;
				}
			}

			// Filter by confidence threshold
			if (maxScore < this.confidenceThreshold()) {
				continue;
			}

			// Convert from model coordinates to original image coordinates
			// Model output is in 640x640 space, need to account for letterboxing
			const x1 = (xCenter - w / 2 - offsetX) / scaleX;
			const y1 = (yCenter - h / 2 - offsetY) / scaleY;
			const x2 = (xCenter + w / 2 - offsetX) / scaleX;
			const y2 = (yCenter + h / 2 - offsetY) / scaleY;

			// Clamp to image boundaries
			const clampedX1 = Math.max(0, Math.min(originalWidth, x1));
			const clampedY1 = Math.max(0, Math.min(originalHeight, y1));
			const clampedX2 = Math.max(0, Math.min(originalWidth, x2));
			const clampedY2 = Math.max(0, Math.min(originalHeight, y2));

			rawDetections.push({
				box: {
					x: clampedX1,
					y: clampedY1,
					width: clampedX2 - clampedX1,
					height: clampedY2 - clampedY1,
				},
				classId: maxClassId,
				confidence: maxScore,
			});
		}

		// Apply Non-Maximum Suppression
		const nmsDetections = this.applyNMS(rawDetections);

		// Filter by target classes and convert to Detection format
		const targetClassSet = new Set(this.targetClasses());
		const finalDetections: Detection[] = [];

		for (const det of nmsDetections) {
			const className = this.COCO_CLASSES[det.classId];

			if (targetClassSet.has(className)) {
				finalDetections.push({
					box: det.box,
					className,
					confidence: det.confidence,
					center: {
						x: det.box.x + det.box.width / 2,
						y: det.box.y + det.box.height / 2,
					},
				});
			}
		}

		return finalDetections;
	}

	/**
	 * Apply Non-Maximum Suppression to remove overlapping detections.
	 *
	 * NMS algorithm:
	 * 1. Sort detections by confidence (highest first)
	 * 2. Select highest confidence detection
	 * 3. Remove all detections with IoU > threshold with selected detection
	 * 4. Repeat until no detections remain
	 *
	 * @param detections - Raw detections before NMS
	 * @returns Filtered detections after NMS
	 */
	private applyNMS(
		detections: {
			box: BoundingBox;
			classId: number;
			confidence: number;
		}[],
	): { box: BoundingBox; classId: number; confidence: number }[] {
		if (detections.length === 0) return [];

		// Sort by confidence descending
		const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);

		const keep: typeof detections = [];
		const suppressed = new Set<number>();

		for (let i = 0; i < sorted.length; i++) {
			if (suppressed.has(i)) continue;

			keep.push(sorted[i]);

			// Suppress overlapping boxes of same class
			for (let j = i + 1; j < sorted.length; j++) {
				if (suppressed.has(j)) continue;
				if (sorted[i].classId !== sorted[j].classId) continue;

				const iou = this.computeIoU(sorted[i].box, sorted[j].box);
				if (iou > this.nmsThreshold()) {
					suppressed.add(j);
				}
			}
		}

		return keep;
	}

	/**
	 * Compute Intersection over Union (IoU) between two bounding boxes.
	 *
	 * IoU = Area of Intersection / Area of Union
	 *
	 * Used by NMS to determine if boxes overlap significantly.
	 */
	private computeIoU(box1: BoundingBox, box2: BoundingBox): number {
		// Calculate intersection rectangle
		const x1 = Math.max(box1.x, box2.x);
		const y1 = Math.max(box1.y, box2.y);
		const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
		const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

		// Check if boxes intersect
		if (x2 < x1 || y2 < y1) return 0;

		// Calculate areas
		const intersectionArea = (x2 - x1) * (y2 - y1);
		const box1Area = box1.width * box1.height;
		const box2Area = box2.width * box2.height;
		const unionArea = box1Area + box2Area - intersectionArea;

		return unionArea > 0 ? intersectionArea / unionArea : 0;
	}

	/**
	 * Detect objects in a video frame asynchronously.
	 *
	 * This is the main entry point for running detection on a single frame.
	 * Results are cached by frame index for efficient retrieval.
	 *
	 * @param imageData - Raw frame data from video element
	 * @param frameIndex - Frame number for caching
	 * @returns Array of detected objects with bounding boxes and metadata
	 */
	async detectObjects(
		imageData: ImageData,
		frameIndex: number,
	): Promise<Detection[]> {
		// Return cached result if available
		const cached = this.detectionCache.get(frameIndex);
		if (cached) {
			return cached;
		}

		if (!this.modelReady() || !this.session) {
			console.warn('Model not ready, skipping detection');
			return [];
		}

		try {
			// Preprocess frame
			const { tensor, scaleX, scaleY, offsetX, offsetY } =
				this.preprocessFrame(imageData);

			// Run inference
			const feeds = { images: tensor };
			const results = await this.session.run(feeds);

			// Get output tensor (YOLOv8 uses "output0" as output name)
			const output = results[this.session.outputNames[0]];

			// Postprocess results
			const detections = this.postprocessOutput(
				output,
				scaleX,
				scaleY,
				offsetX,
				offsetY,
				imageData.width,
				imageData.height,
			);

			// Cache results
			this.detectionCache.set(frameIndex, detections);

			return detections;
		} catch (error) {
			console.error('Error during detection:', error);
			return [];
		}
	}

	/**
	 * Get cached detections for a specific frame.
	 *
	 * @param frameIndex - Frame number
	 * @returns Cached detections or null if not available
	 */
	getDetections(frameIndex: number): Detection[] | null {
		return this.detectionCache.get(frameIndex) || null;
	}

	/**
	 * Clear all cached detection results.
	 */
	clear(): void {
		this.detectionCache.clear();
	}
}
