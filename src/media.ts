import {
	decodeGainMap,
	decodePhotoDepth,
	extractPhotoInfo,
	photoSummary,
} from "./metadata";
import { sample } from "./samples";
import type {
	DepthMap,
	GainMapInfo,
	PhotoMetadata,
	SampleId,
	SourceMeta,
} from "./types";

const MAX_SIDE = 1600;
export const COARSE = matchMedia("(pointer: coarse)").matches;
const VIDEO_SIDE = COARSE ? 960 : 1280;
export const HOSTED_URL = "https://raulk.github.io/dogsight/";

export function inArtifact() {
	return window.top !== window.self;
}

interface ImageSource extends SourceMeta {
	kind: "image";
	canvas: HTMLCanvasElement;
	sample?: SampleId;
	photo?: PhotoMetadata;
	gain?: { canvas: HTMLCanvasElement; info: GainMapInfo };
}
interface VideoSource extends SourceMeta {
	kind: "video";
	canvas: HTMLCanvasElement;
	video: HTMLVideoElement;
	stream?: MediaStream;
	mirror: boolean;
	newFrame: boolean;
}
export type MediaSource = ImageSource | VideoSource;

function canvasSized(width: number, height: number, limit: number) {
	const scale = Math.min(1, limit / Math.max(width, height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(width * scale));
	canvas.height = Math.max(1, Math.round(height * scale));
	return canvas;
}

function stopVideo(video: HTMLVideoElement) {
	video.pause();
	if (video.srcObject instanceof MediaStream) {
		for (const track of video.srcObject.getTracks()) track.stop();
	}
	if (video.src.startsWith("blob:")) URL.revokeObjectURL(video.src);
	video.srcObject = null;
	video.removeAttribute("src");
	video.load();
	video.remove();
}

function prepareVideo(
	video: HTMLVideoElement,
	signal: AbortSignal,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const events = new AbortController();
		const finish = (error?: unknown) => {
			clearTimeout(timeout);
			events.abort();
			if (error) reject(error);
			else resolve();
		};
		const ready = () => {
			if (
				video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
				video.videoWidth > 0 &&
				video.videoHeight > 0
			)
				finish();
		};
		const timeout = window.setTimeout(
			() => finish(new Error("Timed out waiting for a decoded video frame.")),
			15000,
		);
		for (const event of ["loadeddata", "canplay", "playing"])
			video.addEventListener(event, ready, { signal: events.signal });
		video.addEventListener(
			"error",
			() => finish(new Error(video.error?.message || "Video decoding failed.")),
			{ signal: events.signal },
		);
		signal.addEventListener("abort", () => finish(signal.reason), {
			signal: events.signal,
		});
		if (signal.aborted) finish(signal.reason);
		else {
			ready();
			// Some WebKit versions wait for play() before decoding a local file.
			void video.play().catch(() => {});
		}
	});
}

export function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export class DogsightMedia {
	current?: MediaSource;
	private token = 0;
	private pending = new AbortController();
	private facing: "environment" | "user" = "environment";
	private videoHost?: HTMLDivElement;

	constructor(
		private changed: (source: MediaSource) => void,
		private toast: (message: string) => void,
		private cameraBlocked: () => void,
	) {}

	private begin() {
		this.pending.abort();
		this.pending = new AbortController();
		return { token: ++this.token, signal: this.pending.signal };
	}

	private replace(source: MediaSource) {
		if (this.current?.kind === "video") stopVideo(this.current.video);
		this.current = source;
		this.changed(source);
	}

	loadSample(id: SampleId) {
		this.begin();
		this.replace({ ...sample(id), kind: "image", sample: id });
	}

	setImageSource(
		canvas: HTMLCanvasElement,
		meta: SourceMeta & Pick<ImageSource, "gain">,
	) {
		this.begin();
		this.replace({ ...meta, canvas, kind: "image" });
	}

	async loadFile(file: File) {
		const { token, signal } = this.begin();
		const isVideo =
			/^video\//.test(file.type) ||
			(!file.type && /\.(mov|mp4|m4v|webm|3gp)$/i.test(file.name));
		if (isVideo) {
			this.toast(`Opening ${file.name || "video"}…`);
			try {
				const video = await this.openVideo(file, signal);
				if (token !== this.token) {
					stopVideo(video);
					return;
				}
				this.useVideo(video, file.name || "Video");
				this.toast(`Playing ${file.name || "video"}`);
			} catch (error) {
				if (token === this.token) this.toast(errorMessage(error));
			}
			return;
		}

		let bitmap: ImageBitmap;
		try {
			bitmap = await createImageBitmap(file, {
				imageOrientation: "from-image",
			});
		} catch {
			if (token === this.token)
				this.toast(
					"That image could not be opened in this browser. Try JPEG, PNG or WebP.",
				);
			return;
		}
		const { width, height } = bitmap;
		const canvas = canvasSized(width, height, MAX_SIDE);
		let photo: PhotoMetadata;
		try {
			photo = await extractPhotoInfo(file, width, height);
			if (token !== this.token) return;
			const p3 =
				photo.colorSpace === "Display P3"
					? canvas.getContext("2d", { colorSpace: "display-p3" })
					: null;
			const context =
				p3?.getContextAttributes?.().colorSpace === "display-p3"
					? p3
					: canvas.getContext("2d")!;
			context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		} finally {
			bitmap.close();
		}
		let gain: ImageSource["gain"];
		if (photo.gainMap) {
			try {
				gain = {
					canvas: await decodeGainMap(
						photo.gainMap,
						photo.orientation,
						canvas.width,
						canvas.height,
					),
					info: photo.gainMap,
				};
			} catch {
				photo.gainMap = undefined;
			}
		}
		let depth: DepthMap | undefined;
		if (photo.embeddedDepth) {
			try {
				depth = await decodePhotoDepth(
					photo.embeddedDepth,
					photo.orientation,
					canvas.width,
					canvas.height,
				);
			} catch (error) {
				photo.depthError = `${photo.embeddedDepth.label} (${photo.embeddedDepth.format}) decode failed: ${errorMessage(error)}`;
				photo.embeddedDepth = undefined;
			}
		}
		if (token !== this.token) return;
		this.replace({
			kind: "image",
			name: file.name,
			canvas,
			photo,
			panorama: photo.panorama,
			gain,
			depth,
			hfov: photo.hfovDeg ?? 65,
			dist: photo.distM ?? 3,
			logL: photo.flashFired ? undefined : photo.logL,
		});
		const summary = photoSummary(photo);
		this.toast(summary || `Opened ${file.name || "photo"}`);
	}

	private videoElement() {
		if (!this.videoHost) {
			this.videoHost = document.createElement("div");
			this.videoHost.className = "video-host";
			document.body.append(this.videoHost);
		}
		const video = document.createElement("video");
		video.muted =
			video.defaultMuted =
			video.playsInline =
			video.autoplay =
				true;
		video.setAttribute("webkit-playsinline", "");
		video.preload = "auto";
		this.videoHost.append(video);
		return video;
	}

	private async openVideo(file: File, signal: AbortSignal) {
		const routes: (() => string | Promise<string>)[] = [
			() => URL.createObjectURL(file),
		];
		const mp4 =
			file.type === "video/quicktime"
				? new Blob([file], { type: "video/mp4" })
				: file;
		if (file.type !== "video/mp4")
			routes.push(() =>
				URL.createObjectURL(new Blob([file], { type: "video/mp4" })),
			);
		if (file.size < 80e6)
			routes.push(
				() =>
					new Promise((resolve, reject) => {
						const reader = new FileReader();
						reader.onload = () => resolve(reader.result as string);
						reader.onerror = () => reject(reader.error);
						reader.readAsDataURL(mp4);
					}),
			);
		const errors: string[] = [];
		for (const route of routes) {
			signal.throwIfAborted();
			const video = this.videoElement();
			video.loop = true;
			try {
				// oxlint-disable-next-line no-await-in-loop -- Each fallback owns its video until it succeeds or is disposed.
				video.src = await route();
				// oxlint-disable-next-line no-await-in-loop -- Only try the next decoder route if this one fails.
				await prepareVideo(video, signal);
				return video;
			} catch (error) {
				stopVideo(video);
				errors.push(errorMessage(error));
			}
		}
		throw new Error(
			`This video could not be played here (${errors.join(", ")}).`,
		);
	}

	async startCamera(flip = false) {
		if (!navigator.mediaDevices?.getUserMedia) {
			this.cameraBlocked();
			return;
		}
		if (flip)
			this.facing = this.facing === "environment" ? "user" : "environment";
		const requested = this.facing;
		const { token, signal } = this.begin();
		// Release the previous camera before requesting a different lens on mobile.
		if (this.current?.kind === "video" && this.current.stream) {
			const { canvas, name, hfov, dist } = this.current;
			this.replace({ kind: "image", canvas, name, hfov, dist });
		}
		let video: HTMLVideoElement | undefined;
		let stream: MediaStream | undefined;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: {
					facingMode: { ideal: requested },
					width: { ideal: 1280 },
					height: { ideal: 720 },
					frameRate: { ideal: 30 },
				},
			});
			if (token !== this.token) {
				for (const track of stream.getTracks()) track.stop();
				return;
			}
			video = this.videoElement();
			video.srcObject = stream;
			await prepareVideo(video, signal);
			if (token !== this.token) {
				stopVideo(video);
				return;
			}
			const front =
				(stream.getVideoTracks()[0]?.getSettings().facingMode ?? requested) ===
				"user";
			this.useVideo(video, front ? "Front camera" : "Camera", stream, front);
		} catch (error) {
			if (video) stopVideo(video);
			else for (const track of stream?.getTracks() ?? []) track.stop();
			if (token !== this.token) return;
			if (inArtifact() || !window.isSecureContext) this.cameraBlocked();
			else if (
				error instanceof DOMException &&
				error.name === "NotAllowedError"
			)
				this.toast(
					"Camera permission was refused. Allow it in your browser's site settings to use live mode.",
				);
			else if (error instanceof DOMException && error.name === "NotFoundError")
				this.toast("No camera was found on this device.");
			else this.toast(`The camera could not start: ${errorMessage(error)}`);
		}
	}

	private useVideo(
		video: HTMLVideoElement,
		name: string,
		stream?: MediaStream,
		mirror = false,
	) {
		const canvas = canvasSized(video.videoWidth, video.videoHeight, VIDEO_SIDE);
		const source: VideoSource = {
			kind: "video",
			canvas,
			video,
			stream,
			mirror,
			newFrame: true,
			name,
			hfov: 68,
			dist: 3,
		};
		this.replace(source);
		if (video.requestVideoFrameCallback) {
			const tick = () => {
				if (this.current !== source || !video.isConnected) return;
				source.newFrame = true;
				video.requestVideoFrameCallback(tick);
			};
			video.requestVideoFrameCallback(tick);
		}
	}

	readFrame(force = false) {
		const src = this.current;
		if (
			src?.kind !== "video" ||
			src.video.readyState < 2 ||
			src.video.videoWidth <= 0
		)
			return;
		if (
			!force &&
			!src.newFrame &&
			typeof src.video.requestVideoFrameCallback === "function"
		)
			return;
		src.newFrame = false;
		const { canvas, mirror, video } = src;
		const ctx = canvas.getContext("2d")!;
		ctx.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? canvas.width : 0, 0);
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
		return canvas;
	}
}
