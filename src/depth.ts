import { clamp, lerp } from "./model";
import type { DepthMap } from "./types";

export const ORT_CDN =
	"https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";
export const MODEL_URL =
	"https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx";

const SIZE = 518;
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

export function preprocessDepthInput(
	rgba: Uint8ClampedArray,
	width: number,
	height: number,
	size = SIZE,
): Float32Array {
	const plane = size * size;
	const input = new Float32Array(3 * plane);
	for (let y = 0; y < size; y++) {
		const sy = clamp(((y + 0.5) * height) / size - 0.5, 0, height - 1);
		const y0 = Math.floor(sy),
			y1 = Math.min(y0 + 1, height - 1);
		for (let x = 0; x < size; x++) {
			const sx = clamp(((x + 0.5) * width) / size - 0.5, 0, width - 1);
			const x0 = Math.floor(sx),
				x1 = Math.min(x0 + 1, width - 1);
			for (let c = 0; c < 3; c++) {
				const top = lerp(
					rgba[(y0 * width + x0) * 4 + c]!,
					rgba[(y0 * width + x1) * 4 + c]!,
					sx - x0,
				);
				const bottom = lerp(
					rgba[(y1 * width + x0) * 4 + c]!,
					rgba[(y1 * width + x1) * 4 + c]!,
					sx - x0,
				);
				input[c * plane + y * size + x] =
					(lerp(top, bottom, sy - y0) / 255 - MEAN[c]!) / STD[c]!;
			}
		}
	}
	return input;
}

export function normalizeDepthMap(
	raw: Float32Array,
	width: number,
	height: number,
): Uint8ClampedArray {
	const sorted = raw.filter(Number.isFinite).sort();
	const last = Math.max(0, sorted.length - 1);
	const percentile = (p: number) => {
		const rank = p * last;
		return lerp(
			sorted[Math.floor(rank)] ?? 0,
			sorted[Math.ceil(rank)] ?? 0,
			rank % 1,
		);
	};
	const low = percentile(0.02),
		high = percentile(0.98);
	const rgba = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		const value =
			high > low && Number.isFinite(raw[i])
				? clamp((raw[i]! - low) / (high - low), 0, 1) * 255
				: 0;
		rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = value;
		rgba[i * 4 + 3] = 255;
	}
	return rgba;
}

export function focusDistanceFromDepth(
	normInvDepth: number,
	nearM: number,
	farM: number,
): number {
	return 1 / lerp(1 / farM, 1 / nearM, normInvDepth);
}

interface Tensor {
	data: Float32Array;
	dims: readonly number[];
	dispose(): void;
}
interface Session {
	inputNames: readonly string[];
	outputNames: readonly string[];
	run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
}
interface Runtime {
	env: { wasm: { wasmPaths: string } };
	InferenceSession: {
		create(
			model: Uint8Array,
			options: { executionProviders: string[] },
		): Promise<Session>;
	};
	Tensor: new (
		type: "float32",
		data: Float32Array,
		shape: readonly number[],
	) => Tensor;
}

async function loadSession() {
	const entry = `${ORT_CDN}ort.webgpu.min.mjs`;
	const ort = (await import(/* @vite-ignore */ entry)) as Runtime;
	ort.env.wasm.wasmPaths = ORT_CDN;
	const cache = await globalThis.caches
		?.open("dogsight-depth-v1")
		.catch(() => undefined);
	let response = await cache?.match(MODEL_URL).catch(() => undefined);
	if (!response) {
		response = await fetch(MODEL_URL);
		if (!response.ok) throw new Error(`Depth model HTTP ${response.status}`);
		void cache?.put(MODEL_URL, response.clone()).catch(() => {});
	}
	const model = new Uint8Array(await response.arrayBuffer());
	const create = (executionProviders: string[]) =>
		ort.InferenceSession.create(model, { executionProviders });
	let provider = "WebGPU";
	let session: Session;
	try {
		session = await create(["webgpu"]);
	} catch {
		provider = "WASM";
		session = await create(["wasm"]);
	}
	return { session, Tensor: ort.Tensor, provider };
}
let sessionLoading: ReturnType<typeof loadSession> | undefined;

export async function estimatePhotoDepth(
	sourceCanvas: HTMLCanvasElement,
	onProgress?: (status: string) => void,
): Promise<DepthMap> {
	try {
		onProgress?.("Loading depth model (~24 MB)…");
		sessionLoading ??= loadSession().catch((cause) => {
			sessionLoading = undefined;
			throw cause;
		});
		const { session, Tensor, provider } = await sessionLoading;
		onProgress?.("Estimating depth…");
		// Let the status paint before the synchronous preprocessing.
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
		);
		const started = performance.now();
		const { width, height } = sourceCanvas;
		const { data } = sourceCanvas
			.getContext("2d")!
			.getImageData(0, 0, width, height, { colorSpace: "srgb" });
		const input = new Tensor(
			"float32",
			preprocessDepthInput(data, width, height),
			[1, 3, SIZE, SIZE],
		);
		try {
			const output = (await session.run({ [session.inputNames[0]!]: input }))[
				session.outputNames[0]!
			]!;
			try {
				const [h, w] = output.dims.slice(-2);
				const canvas = document.createElement("canvas");
				canvas.width = w!;
				canvas.height = h!;
				const context = canvas.getContext("2d")!;
				const pixels = context.createImageData(w!, h!);
				pixels.data.set(normalizeDepthMap(output.data, w!, h!));
				context.putImageData(pixels, 0, 0);
				const elapsedMs = Math.round(performance.now() - started);
				return {
					canvas,
					nearM: 0.4,
					farM: 25,
					kind: "estimated",
					detail: `Depth Anything V2 · ${provider} (${elapsedMs} ms)`,
				};
			} finally {
				output.dispose();
			}
		} finally {
			input.dispose();
		}
	} catch (cause) {
		throw new Error(
			"Depth estimation unavailable. Check your connection or use the distance slider.",
			{ cause },
		);
	}
}
