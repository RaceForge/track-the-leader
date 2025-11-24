import { Injectable, signal } from '@angular/core';
import * as ort from 'onnxruntime-web';

type WebGpuNavigator = Navigator & { gpu?: GPU };
type OrtTensorMetadata = { dimensions?: readonly number[] };

export type Point2D = { x: number; y: number };

export type SamPrompt = {
	point: Point2D;
	box?: [number, number, number, number]; // Optional bounding box hint
};

export type SamMaskResult = {
	mask: Uint8ClampedArray; // Binary mask (0 or 255)
	bbox: [number, number, number, number]; // [x, y, width, height]
	centroid: Point2D;
	width: number;
	height: number;
};

/**
 * SAM3 (Segment Anything Model 3) segmentation service.
 *
 * This service provides interactive segmentation using the SAM3 model
 * with WebGPU backend for efficient browser-based inference.
 *
 * SAM3 takes a prompt (point and optional box) and generates a precise
 * segmentation mask for the object at that location.
 *
 * Architecture:
 * 1. Load SAM3 model with WebGPU backend
 * 2. Preprocess frame and prompt to model input
 * 3. Run inference to generate mask
 * 4. Postprocess mask: compute centroid, bbox, binary mask
 * 5. Return segmentation result
 *
 * Note: This is a placeholder implementation ready for SAM3 model integration.
 * The actual model loading and inference will depend on the specific SAM3
 * implementation available (e.g., ONNX Runtime Web with WebGPU, TensorFlow.js, etc.)
 */
@Injectable({
	providedIn: 'root',
})
export class Sam3SegmentationService {
	/** Model loading state */
	modelLoading = signal<boolean>(false);
	modelReady = signal<boolean>(false);
	modelError = signal<string | null>(null);

	/** WebGPU availability */
	webGpuAvailable = signal<boolean>(false);

	/** Model reference (will be typed based on actual implementation) */
	private model: ort.InferenceSession | null = null;

	/** Optional path to ONNX Runtime WASM assets (used as fallback when WebGPU unavailable) */
	private readonly wasmAssetsPath = '/assets/ort-wasm/';

	/** Cached input/output metadata */
	private imageInputName: string | null = null;
	private promptInputName: string | null = null;
	private maskOutputName: string | null = null;
	private imageInputShape: readonly number[] | null = null;

	/** Model configuration */
	readonly modelPath = signal<string>('/assets/sam2_tiny_image_encoder.onnx');

	constructor() {
		this.checkWebGPU();
	}

	/**
	 * Check if WebGPU is available in the browser.
	 */
	private async checkWebGPU(): Promise<void> {
		if ('gpu' in navigator) {
			try {
				const adapter = await (
					navigator as WebGpuNavigator
				).gpu?.requestAdapter();
				if (adapter) {
					this.webGpuAvailable.set(true);
					console.log('WebGPU is available');
				} else {
					console.warn('WebGPU adapter not available');
				}
			} catch (error) {
				console.warn('WebGPU check failed:', error);
			}
		} else {
			console.warn('WebGPU not supported in this browser');
		}
	}

	/**
	 * Load SAM3 model with WebGPU backend.
	 *
	 * This is a placeholder for the actual model loading implementation.
	 * The specific implementation will depend on:
	 * - ONNX Runtime Web with WebGPU EP
	 * - TensorFlow.js with WebGPU backend
	 * - Or custom WebGPU implementation
	 *
	 * @param modelPath - Path to model file (default: configured modelPath)
	 */
	async loadModel(modelPath?: string): Promise<void> {
		if (this.modelLoading()) {
			console.warn('Model is already loading');
			return;
		}

		if (this.modelReady()) {
			console.log('Model already loaded');
			return;
		}

		const pathToUse = modelPath || this.modelPath();
		this.modelLoading.set(true);
		this.modelError.set(null);

		try {
			console.log('Loading SAM3 model from:', pathToUse);

			// Configure ONNX Runtime environment (wasm fallback)
			ort.env.wasm.wasmPaths = this.wasmAssetsPath;
			// Keep threads modest to avoid starving UI thread
			const hardwareThreads = Math.max(
				typeof navigator !== 'undefined' && navigator.hardwareConcurrency
					? navigator.hardwareConcurrency
					: 2,
				2,
			);
			ort.env.wasm.numThreads = Math.min(hardwareThreads, 4);
			ort.env.wasm.proxy = true;

			let executionProviders: Array<'webgpu' | 'wasm'> = [];
			if (this.webGpuAvailable()) {
				executionProviders.push('webgpu');
			}
			executionProviders.push('wasm');

			try {
				this.model = await ort.InferenceSession.create(pathToUse, {
					executionProviders,
					graphOptimizationLevel: 'all',
				});
			} catch (primaryError) {
				// Fallback: retry with pure wasm if webgpu+wasm failed
				if (executionProviders.includes('webgpu')) {
					console.warn('Primary load with webgpu failed, retrying with wasm only');
					try {
						executionProviders = ['wasm'];
						this.model = await ort.InferenceSession.create(pathToUse, {
							executionProviders,
							graphOptimizationLevel: 'all',
						});
					} catch (fallbackError) {
						throw new Error(`Primary error: ${primaryError}; Fallback error: ${fallbackError}`);
					}
				} else {
					throw primaryError;
				}
			}

			this.imageInputName = this.model.inputNames[0] ?? null;
			this.promptInputName = this.model.inputNames[1] ?? this.model.inputNames[0] ?? null;
			this.maskOutputName = this.model.outputNames[0] ?? null;
			const metadata = this.model.inputMetadata as unknown as Record<string, OrtTensorMetadata | undefined>;
			if (this.imageInputName) {
				const imageMeta = metadata[this.imageInputName];
				this.imageInputShape = imageMeta?.dimensions ?? null;
			} else {
				this.imageInputShape = null;
			}

			this.modelReady.set(true);
			const activeProvider = executionProviders.includes('webgpu') && this.webGpuAvailable() ? 'webgpu' : 'wasm';
			console.log(`SAM3 model loaded successfully using ${activeProvider} provider`);
		} catch (error) {
			const errorMessage = `Failed to load SAM3 model: ${error}`;
			console.error(errorMessage);
			this.modelError.set(errorMessage);
		} finally {
			this.modelLoading.set(false);
		}
	}

	/**
	 * Run SAM3 segmentation on a frame with a prompt.
	 *
	 * Takes a point (and optional bounding box) as input and generates
	 * a precise segmentation mask for the object at that location.
	 *
	 * @param frame - Input frame (ImageData or HTMLCanvasElement)
	 * @param prompt - Segmentation prompt (point + optional box)
	 * @returns Segmentation result with mask, bbox, and centroid
	 */
	async runSegmentation(
		frame: ImageData | HTMLCanvasElement,
		prompt: SamPrompt,
	): Promise<SamMaskResult> {
		if (!this.modelReady()) {
			throw new Error('SAM3 model not loaded. Call loadModel() first.');
		}

		try {
			// Convert frame to ImageData if needed
			const imageData = this.toImageData(frame);

			// Preprocess frame and prompt
			const preprocessed = this.preprocessInput(imageData, prompt);

			// Run inference
			const mask = await this.runInference(preprocessed);

			// Postprocess mask
			const result = this.postprocessMask(
				mask,
				imageData.width,
				imageData.height,
			);

			return result;
		} catch (error) {
			console.error('Error during segmentation:', error);
			throw error;
		}
	}

	/**
	 * Convert frame to ImageData if it's a canvas element.
	 */
	private toImageData(frame: ImageData | HTMLCanvasElement): ImageData {
		if (frame instanceof HTMLCanvasElement) {
			const ctx = frame.getContext('2d');
			if (!ctx) {
				throw new Error('Failed to get canvas context');
			}
			return ctx.getImageData(0, 0, frame.width, frame.height);
		}
		return frame;
	}

	/**
	 * Preprocess frame and prompt to model input format.
	 *
	 * TODO: Implement based on SAM3 model requirements:
	 * - Resize frame to model input size
	 * - Normalize pixel values
	 * - Encode prompt (point coordinates, box coordinates)
	 * - Create input tensors
	 */
	private preprocessInput(
		imageData: ImageData,
		prompt: SamPrompt,
	): {
		imageTensor: ort.Tensor;
		promptTensor: ort.Tensor;
		width: number;
		height: number;
	} {
		if (typeof document === 'undefined') {
			throw new Error('SAM3 preprocessing requires a browser environment');
		}

		const targetHeight = this.imageInputShape?.[2] && this.imageInputShape[2] > 0
			? this.imageInputShape[2]
			: imageData.height;
		const targetWidth = this.imageInputShape?.[3] && this.imageInputShape[3] > 0
			? this.imageInputShape[3]
			: imageData.width;

		const sourceCanvas = document.createElement('canvas');
		sourceCanvas.width = imageData.width;
		sourceCanvas.height = imageData.height;
		const sourceCtx = sourceCanvas.getContext('2d');
		if (!sourceCtx) {
			throw new Error('Failed to obtain source canvas context');
		}
		sourceCtx.putImageData(imageData, 0, 0);

		const resizeCanvas = document.createElement('canvas');
		resizeCanvas.width = targetWidth;
		resizeCanvas.height = targetHeight;
		const resizeCtx = resizeCanvas.getContext('2d');
		if (!resizeCtx) {
			throw new Error('Failed to obtain resize canvas context');
		}
		resizeCtx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
		const resizedImage = resizeCtx.getImageData(0, 0, targetWidth, targetHeight);

		const pixelCount = targetWidth * targetHeight;
		const imageBuffer = new Float32Array(pixelCount * 3);
		const resizedData = resizedImage.data;
		for (let i = 0; i < pixelCount; i++) {
			const idx = i * 4;
			const r = resizedData[idx] / 255;
			const g = resizedData[idx + 1] / 255;
			const b = resizedData[idx + 2] / 255;
			imageBuffer[i] = r;
			imageBuffer[i + pixelCount] = g;
			imageBuffer[i + pixelCount * 2] = b;
		}
		const imageTensor = new ort.Tensor('float32', imageBuffer, [1, 3, targetHeight, targetWidth]);

		const promptArray = new Float32Array(6);
		promptArray[0] = prompt.point.x / imageData.width;
		promptArray[1] = prompt.point.y / imageData.height;
		if (prompt.box) {
			promptArray[2] = prompt.box[0] / imageData.width;
			promptArray[3] = prompt.box[1] / imageData.height;
			promptArray[4] = (prompt.box[0] + prompt.box[2]) / imageData.width;
			promptArray[5] = (prompt.box[1] + prompt.box[3]) / imageData.height;
		} else {
			promptArray.fill(-1, 2);
		}
		const promptTensor = new ort.Tensor('float32', promptArray, [1, promptArray.length]);

		return {
			imageTensor,
			promptTensor,
			width: targetWidth,
			height: targetHeight,
		};
	}

	/**
	 * Run model inference.
	 *
	 * TODO: Implement based on chosen framework:
	 * - ONNX Runtime Web: session.run(feeds)
	 * - TensorFlow.js: model.predict(inputs)
	 */
	private async runInference(preprocessed: {
		imageTensor: ort.Tensor;
		promptTensor: ort.Tensor;
	}): Promise<Uint8ClampedArray> {
		if (!this.model || !this.imageInputName || !this.promptInputName || !this.maskOutputName) {
			throw new Error('SAM3 model is not fully configured');
		}

		const feeds: Record<string, ort.Tensor> = {
			[this.imageInputName]: preprocessed.imageTensor,
			[this.promptInputName]: preprocessed.promptTensor,
		};

		const results = await this.model.run(feeds);
		const maskTensor = results[this.maskOutputName];
		if (!maskTensor) {
			throw new Error(`Mask output "${this.maskOutputName}" not found in inference results`);
		}

		const data = maskTensor.data as Float32Array | Float64Array | number[];
		const mask = new Uint8ClampedArray(data.length);
		for (let i = 0; i < data.length; i++) {
			mask[i] = data[i] > 0.5 ? 255 : 0;
		}
		return mask;
	}

	/**
	 * Postprocess mask to extract bbox, centroid, and binary mask.
	 */
	private postprocessMask(
		maskData: Uint8ClampedArray,
		width: number,
		height: number,
	): SamMaskResult {
		// Find mask bounds and compute centroid
		let minX = width;
		let minY = height;
		let maxX = 0;
		let maxY = 0;
		let sumX = 0;
		let sumY = 0;
		let count = 0;

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const idx = y * width + x;
				if (maskData[idx] > 128) {
					// Threshold at 128
					minX = Math.min(minX, x);
					minY = Math.min(minY, y);
					maxX = Math.max(maxX, x);
					maxY = Math.max(maxY, y);
					sumX += x;
					sumY += y;
					count++;
				}
			}
		}

		// Compute centroid
		const centroid: Point2D =
			count > 0
				? { x: sumX / count, y: sumY / count }
				: { x: width / 2, y: height / 2 };

		// Compute bounding box
		const bbox: [number, number, number, number] =
			count > 0
				? [minX, minY, maxX - minX, maxY - minY]
				: [0, 0, width, height];

		return {
			mask: maskData,
			bbox,
			centroid,
			width,
			height,
		};
	}

	/**
	 * Check if model is loaded and ready.
	 */
	isLoaded(): boolean {
		return this.modelReady();
	}

	/**
	 * Clear model and free resources.
	 */
	clear(): void {
		if (this.model) {
			// TODO: Dispose model based on framework
			// ONNX: this.model.release()
			// TensorFlow.js: this.model.dispose()
      this.model.release();
			this.model = null;
		}
		this.modelReady.set(false);
	}
}
