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
 * SAM2 (Segment Anything Model 2) segmentation service.
 *
 * This service provides interactive segmentation using the SAM2 image encoder
 * with WebGPU/WASM backend for efficient browser-based inference.
 *
 * Note: This currently uses only the SAM2 image encoder which outputs embeddings.
 * For full segmentation, you would need to also load and run the SAM2 decoder
 * which takes embeddings + prompts and outputs masks.
 *
 * Current architecture:
 * 1. Load SAM2 encoder with WebGPU/WASM backend
 * 2. Preprocess frame to model input format [1, 3, H, W]
 * 3. Run encoder inference to generate embeddings
 * 4. (TODO) Run decoder with embeddings + prompts to get masks
 * 5. Postprocess mask: compute centroid, bbox, binary mask
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
			console.log('Loading SAM2 encoder from:', pathToUse);

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
			console.log(`SAM2 encoder loaded successfully using ${activeProvider} provider`);
			console.log('Model inputs:', this.model.inputNames, 'shape:', this.imageInputShape);
			console.log('Model outputs:', this.model.outputNames);
		} catch (error) {
			const errorMessage = `Failed to load SAM2 encoder: ${error}`;
			console.error(errorMessage);
			this.modelError.set(errorMessage);
		} finally {
			this.modelLoading.set(false);
		}
	}

	/**
	 * Run SAM2 segmentation on a frame with a prompt.
	 *
	 * Note: Currently uses encoder only. For full segmentation,
	 * decoder model is needed to convert embeddings + prompts to masks.
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
	 * SAM2 image encoder expects a single input: image [1, 3, H, W]
	 * The decoder (not included here) would take the image embeddings + prompts.
	 *
	 * For now, we only run the encoder to get embeddings.
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
			throw new Error('SAM2 preprocessing requires a browser environment');
		}

		// SAM2 typically expects 1024x1024 or specific model dimensions
		// Check imageInputShape for actual expected dimensions
		const targetHeight = (this.imageInputShape?.[2] && typeof this.imageInputShape[2] === 'number' && this.imageInputShape[2] > 0)
			? Number(this.imageInputShape[2])
			: 1024;
		const targetWidth = (this.imageInputShape?.[3] && typeof this.imageInputShape[3] === 'number' && this.imageInputShape[3] > 0)
			? Number(this.imageInputShape[3])
			: 1024;

		console.log(`Preprocessing: target size ${targetWidth}x${targetHeight}, input shape:`, this.imageInputShape);

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

		// Convert RGBA to RGB planar format [1, 3, H, W]
		for (let i = 0; i < pixelCount; i++) {
			const idx = i * 4;
			imageBuffer[i] = resizedData[idx] / 255;                    // R channel
			imageBuffer[i + pixelCount] = resizedData[idx + 1] / 255;   // G channel
			imageBuffer[i + pixelCount * 2] = resizedData[idx + 2] / 255; // B channel
		}

		const imageTensor = new ort.Tensor('float32', imageBuffer, [1, 3, targetHeight, targetWidth]);
		console.log('Created image tensor with shape:', imageTensor.dims);

		// Prompt tensor - for encoder-only model this may not be used
		// But we keep it for compatibility with decoder if needed later
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
	 * SAM2 image encoder takes only the image input and outputs embeddings.
	 * For a full segmentation pipeline, you'd need the decoder model too.
	 *
	 * For now, we'll use the encoder output as a placeholder and return
	 * a simple mask based on the bounding box hint.
	 */
	private async runInference(preprocessed: {
		imageTensor: ort.Tensor;
		promptTensor: ort.Tensor;
		width: number;
		height: number;
	}): Promise<Uint8ClampedArray> {
		if (!this.model || !this.imageInputName || !this.maskOutputName) {
			throw new Error('SAM2 model is not fully configured');
		}

		// SAM2 encoder only takes image input
		const feeds: Record<string, ort.Tensor> = {
			[this.imageInputName]: preprocessed.imageTensor,
		};

		console.log('Running inference with feeds:', Object.keys(feeds), 'input shape:', preprocessed.imageTensor.dims);

		const results = await this.model.run(feeds);
		console.log('Inference results:', Object.keys(results));

		// SAM2 encoder outputs embeddings, not masks directly
		// For a complete pipeline, you'd need the decoder model
		// As a placeholder, we'll create a simple mask from the prompt box
		const outputTensor = results[this.maskOutputName];
		if (!outputTensor) {
			console.warn(`Expected output "${this.maskOutputName}" not found. Available:`, Object.keys(results));
			// Return a simple box-based mask as fallback
			return this.createBoxMask(preprocessed.width, preprocessed.height);
		}

		const data = outputTensor.data as Float32Array | Float64Array | number[];
		const mask = new Uint8ClampedArray(data.length);
		for (let i = 0; i < data.length; i++) {
			mask[i] = data[i] > 0.5 ? 255 : 0;
		}
		return mask;
	}

	/**
	 * Create a simple box-based mask as fallback when decoder is not available.
	 */
	private createBoxMask(width: number, height: number): Uint8ClampedArray {
		// Return a full mask for now - in production you'd use the prompt box
		const mask = new Uint8ClampedArray(width * height);
		mask.fill(255);
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
