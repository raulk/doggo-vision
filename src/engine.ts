import { createContext, useContext, useSyncExternalStore } from "react";
import { stepAdaptation } from "./adaptation";
import { estimatePhotoDepth, focusDistanceFromDepth } from "./depth";
import { DogsightGL } from "./gl";
import { DogsightMedia, errorMessage, type MediaSource } from "./media";
import { sourcePanorama } from "./metadata";
import {
	compile,
	panoramaField,
	parseImportJSON,
	STAGES,
	VISION_DEFAULTS,
} from "./model";
import {
	applyImport,
	applyPreset,
	clearActiveConditions,
	copyActiveEyeToOther,
	createState,
	editEye,
	otherEye,
	PRESETS,
	setBinoc,
	setBreed,
} from "./state";
import type {
	AppState,
	BreedId,
	CompiledModel,
	EyeId,
	GainMapInfo,
	PanoramaInfo,
	Preset,
	RendererStats,
	SampleId,
	SceneParams,
	SourceMeta,
	Vec2,
} from "./types";
import { DogsightViewport, type ViewportMetrics } from "./viewport";

export type { ViewportMetrics } from "./viewport";

export interface EngineSnapshot {
	readonly version: number;
	// Viewport gestures are published through the viewport store. State captures
	// their current values when an application action publishes new state.
	readonly state: AppState;
	readonly model: CompiledModel;
	readonly adaptedLogL: number;
	readonly source: MediaSource | undefined;
	readonly activePanorama: PanoramaInfo | undefined;
	readonly depthStatusMessage: string;
	readonly depthBusy: boolean;
	readonly glError: string | null;
	readonly urgentFlags: readonly string[];
	readonly cameraBlocked: boolean;
	readonly cameraLive: boolean;
	readonly videoPaused: boolean;
}

export type StatsSnapshot = Readonly<{
	model: CompiledModel;
	adaptedLogL: number;
	glStats: RendererStats;
}> | null;

class SnapshotStore<T> {
	private listeners = new Set<() => void>();

	constructor(private snapshot: T) {}

	get = () => this.snapshot;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	set(snapshot: T) {
		if (Object.is(this.snapshot, snapshot)) return;
		this.snapshot = snapshot;
		for (const listener of this.listeners) listener();
	}
}

function sameData(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
	const entries = Object.entries(a);
	return (
		entries.length === Object.keys(b).length &&
		entries.every(
			([key, value]) =>
				Object.hasOwn(b, key) && sameData(value, Reflect.get(b, key)),
		)
	);
}

interface RendererBinding {
	renderer: DogsightGL;
	onRestore?: () => void;
	onError?: (error: unknown) => void;
}

// DogsightGL listens for context events for the lifetime of the canvas. Reuse it
// across mounts and release its controller callbacks when the viewport detaches.
const canvasRenderers = new WeakMap<HTMLCanvasElement, RendererBinding>();

function bindRenderer(
	canvas: HTMLCanvasElement,
	onRestore: () => void,
	onError: (error: unknown) => void,
) {
	let binding = canvasRenderers.get(canvas);
	if (!binding) {
		const entry: RendererBinding = {
			renderer: new DogsightGL(
				canvas,
				() => entry.onRestore?.(),
				(error) => entry.onError?.(error),
			),
		};
		canvasRenderers.set(canvas, entry);
		binding = entry;
	}
	binding.onRestore = onRestore;
	binding.onError = onError;
	return binding;
}

export class DogsightController {
	private state = createState();
	private adaptedLogL = this.state.scene.logL;
	private model = compile(this.state);
	private otherModel?: CompiledModel;
	private media = new DogsightMedia(
		(source) => this.sourceChanged(source),
		(message) => this.notifyToast(message),
		() => this.publish({ cameraBlocked: true }),
	);
	private viewport?: DogsightViewport;
	private renderer?: DogsightGL;
	private detachViewport?: () => void;
	private videoEvents?: AbortController;
	private splitElement: HTMLElement | null = null;
	private nativeZoom = false;
	private estimating = new WeakSet<MediaSource>();
	private toastHandler?: (message: string) => void;
	private dirty = true;
	private statsDirty = true;
	private resetHistory = true;
	private sourcePending = true;
	private freezeTime = 3.7;
	private startTime = performance.now();
	private lastTick = 0;
	private lastStatsAt = -Infinity;
	private lastModelAt = -Infinity;
	private smoothedFps = 0;
	private store = new SnapshotStore<EngineSnapshot>({
		version: 0,
		state: structuredClone(this.state),
		model: this.model,
		adaptedLogL: this.adaptedLogL,
		source: undefined,
		activePanorama: undefined,
		depthStatusMessage: "",
		depthBusy: false,
		glError: null,
		urgentFlags: [],
		cameraBlocked: false,
		cameraLive: false,
		videoPaused: false,
	});
	private viewportStore = new SnapshotStore<ViewportMetrics>({
		splitPercent: 50,
		zoomLabel: "Fit",
	});
	private statsStore = new SnapshotStore<StatsSnapshot>(null);

	constructor(options?: { onToast?: (message: string) => void }) {
		this.toastHandler = options?.onToast;
	}

	subscribe = this.store.subscribe;
	getSnapshot = this.store.get;
	subscribeViewport = this.viewportStore.subscribe;
	getViewportMetrics = this.viewportStore.get;
	subscribeStats = this.statsStore.subscribe;
	getStatsSnapshot = this.statsStore.get;

	setToastHandler(fn: (message: string) => void) {
		this.toastHandler = fn;
	}

	notifyToast(message: string) {
		this.toastHandler?.(message);
	}

	setSplitElement(el: HTMLElement | null) {
		this.splitElement = el;
		if (el) el.style.left = `${this.getViewportMetrics().splitPercent}%`;
	}

	attachViewport(host: HTMLElement, canvas: HTMLCanvasElement): () => void {
		this.detachViewport?.();
		const events = new AbortController();
		const onRendererError = (error: unknown) => {
			this.publish({ glError: errorMessage(error) });
			console.error(error);
		};
		let binding: RendererBinding | undefined;
		try {
			binding = bindRenderer(
				canvas,
				() => {
					this.sourcePending = true;
					this.redraw();
					this.publish({ glError: null });
				},
				onRendererError,
			);
			this.renderer = binding.renderer;
			if (this.renderer.available) this.publish({ glError: null });
		} catch (error) {
			onRendererError(error);
		}
		this.sourcePending = true;
		this.lastTick = 0;
		this.smoothedFps = 0;
		this.statsDirty = true;
		const viewport = new DogsightViewport(
			host,
			canvas,
			this.state.view,
			this.redraw,
			{
				panoramaField: () => {
					const source = this.media.current;
					if (!source || !this.getSnapshot().activePanorama) return undefined;
					return panoramaField(
						this.model.derived.field_total_deg,
						source.canvas.width,
						source.canvas.height,
					);
				},
				canFocus: () =>
					this.state.scene.depthEnabled && !!this.media.current?.depth,
				focus: (uv) => this.focusAt(uv),
				onResize: (rect, background) => {
					if (!this.sourcePending)
						this.renderer?.display(this.state, rect, background);
				},
				onMetrics: (metrics) => this.publishViewport(metrics),
			},
		);
		this.viewport = viewport;
		const source = this.media.current;
		if (source) {
			viewport.setSourceSize(
				source.canvas.width,
				source.canvas.height,
				this.nativeZoom ? "native" : "current",
			);
			this.watchVideo();
			this.publishPlayback();
		} else {
			this.applyPresetById("lab");
			this.loadSample("yard");
		}

		document.addEventListener("visibilitychange", this.syncCameraVisibility, {
			signal: events.signal,
		});
		window.addEventListener(
			"paste",
			(event) => {
				const file = event.clipboardData?.files[0];
				if (file) void this.loadFile(file);
			},
			{ signal: events.signal },
		);
		const probe = this.createProbe();
		window.__dogsight = probe;

		let frameId: number;
		const animate = (now: number) => {
			frameId = requestAnimationFrame(animate);
			this.frame(now);
		};
		frameId = requestAnimationFrame(animate);

		const detach = () => {
			if (this.detachViewport !== detach) return;
			this.detachViewport = undefined;
			cancelAnimationFrame(frameId);
			events.abort();
			this.videoEvents?.abort();
			this.videoEvents = undefined;
			this.nativeZoom = viewport.isNativeZoom;
			viewport.dispose();
			this.viewport = undefined;
			this.renderer = undefined;
			if (binding?.onError === onRendererError) {
				binding.onRestore = binding.onError = undefined;
			}
			if (window.__dogsight === probe)
				Reflect.deleteProperty(window, "__dogsight");
			this.statsStore.set(null);
		};
		this.detachViewport = detach;
		return detach;
	}

	mutate(
		fn: (state: AppState) => void,
		options?: { redrawOnly?: boolean; clearPreset?: boolean },
	) {
		const { view } = this.state;
		const before = structuredClone(this.state);
		fn(this.state);
		// The mounted viewport holds the live view object for pointer gestures.
		this.state.view = Object.assign(view, this.state.view);
		if (options?.clearPreset) this.state.preset = null;
		this.validateOverlay();
		if (sameData(before, this.state)) return;
		if (options?.redrawOnly) this.redraw();
		else this.invalidate();
		this.statsDirty = true;
		if (!this.state.view.stats) this.statsStore.set(null);
		this.publishState(before.scene.projection !== this.state.scene.projection);
		if (before.scene.depthEnabled !== this.state.scene.depthEnabled)
			void this.updateDepth();
		this.viewport?.placeControls();
	}

	applyPresetById(id: string) {
		const preset = PRESETS.find((candidate) => candidate.id === id);
		if (preset) this.applyPreset(preset);
	}

	applyPreset(preset: Preset) {
		this.mutate((state) => applyPreset(state, preset));
	}

	setBreed(breed: BreedId) {
		this.mutate((state) => setBreed(state, breed), { clearPreset: true });
	}

	setBinoc(on: boolean) {
		this.mutate((state) => setBinoc(state, on));
	}

	editEye(eye: EyeId) {
		this.mutate((state) => editEye(state, eye));
	}

	copyActiveEyeToOther() {
		this.mutate(copyActiveEyeToOther);
	}

	clearActiveConditions() {
		this.mutate(clearActiveConditions);
	}

	resetVision() {
		this.mutate((state) => {
			state.vision = { ...VISION_DEFAULTS };
		});
	}

	toggleStage(stageIndex: number) {
		const stage = STAGES[stageIndex];
		if (!stage || stage.fixed) return;
		if (stage.n === 11) this.resetHistory = true;
		this.mutate((state) => {
			state.stages[stage.n] = !state.stages[stage.n];
		});
	}

	setViewMode(mode: number) {
		this.mutate(
			(state) => {
				state.view.mode = mode;
			},
			{ redrawOnly: true },
		);
	}

	setOverlay(overlay: number) {
		this.mutate((state) => {
			state.view.overlay = overlay;
		});
	}

	setHud(open: boolean) {
		this.mutate(
			(state) => {
				state.view.hud = open;
			},
			{ redrawOnly: true },
		);
	}

	setStats(open: boolean) {
		this.mutate(
			(state) => {
				state.view.stats = open;
			},
			{ redrawOnly: true },
		);
	}

	setDepthEnabled(enabled: boolean) {
		this.mutate((state) => {
			state.scene.depthEnabled = enabled;
		});
	}

	estimateDepth() {
		if (this.state.scene.depthEnabled) void this.updateDepth();
		else this.setDepthEnabled(true);
	}

	loadSample(id: SampleId) {
		this.media.loadSample(id);
	}

	async loadFile(file: File) {
		try {
			await this.media.loadFile(file);
		} catch (error) {
			this.notifyToast(errorMessage(error));
		}
	}

	async startCamera(flip = false) {
		if (flip || !this.getSnapshot().cameraLive)
			await this.media.startCamera(flip);
	}

	stopMedia() {
		this.loadSample("yard");
	}

	async toggleVideoPlayback() {
		const source = this.media.current;
		if (source?.kind !== "video") return;
		if (source.video.paused)
			await source.video
				.play()
				.catch((error) => this.notifyToast(errorMessage(error)));
		else source.video.pause();
		this.publishPlayback();
	}

	centerView() {
		if (this.viewport) this.viewport.center();
		else
			Object.assign(this.state.view, {
				zoom: 1,
				cx: 0.5,
				cy: 0.5,
				yaw: 0,
				pitch: 0,
			});
		this.nativeZoom = false;
	}

	snapAdaptation() {
		const target = this.state.scene.logL;
		if (this.adaptedLogL === target) return;
		this.adaptedLogL = target;
		this.invalidate();
		this.statsDirty = true;
		this.publish({ model: this.model, adaptedLogL: target });
	}

	zoomIn() {
		this.viewport?.zoomIn();
	}

	zoomOut() {
		this.viewport?.zoomOut();
	}

	zoomFit() {
		this.viewport?.zoomFit();
	}

	zoomNative() {
		this.viewport?.zoomNative();
	}

	async saveCapture() {
		try {
			const data = await this.renderer?.capturePNG();
			if (!data) return;
			const url = URL.createObjectURL(data);
			const link = document.createElement("a");
			link.href = url;
			link.download = `dog-view-${this.state.preset ?? "custom"}.png`;
			document.body.append(link);
			try {
				link.click();
			} finally {
				link.remove();
				window.setTimeout(() => URL.revokeObjectURL(url), 4000);
			}
			this.notifyToast("Saved");
		} catch {
			this.notifyToast("The image could not be saved here.");
		}
	}

	applyImportText(
		text: string,
	): { ok: true; message: string } | { ok: false; message: string } {
		try {
			const data = parseImportJSON(text);
			const before = structuredClone(this.state);
			applyImport(this.state, data);
			const flags = this.getSnapshot().urgentFlags;
			const urgentFlags = sameData(flags, data.urgent) ? flags : data.urgent;
			if (sameData(before, this.state)) this.publish({ urgentFlags });
			else {
				this.invalidate();
				this.statsDirty = true;
				this.publishState(false, { urgentFlags });
			}
			const count = (map: AppState["eyes"][EyeId]) =>
				Object.values(map).filter((condition) => condition.on).length;
			const n = data.eyes
				? count(data.eyes.OS) + count(data.eyes.OD)
				: data.conditions
					? count(data.conditions)
					: 0;
			return {
				ok: true,
				message:
					`Applied ${n} condition${n === 1 ? "" : "s"}${Object.keys(data.profile).length ? " and profile fields" : ""}.` +
					(data.unknown.length
						? ` Ignored unknown: ${data.unknown.join(", ")}.`
						: "") +
					(data.notes.length ? ` ${data.notes.join(" ")}` : ""),
			};
		} catch (error) {
			return { ok: false, message: errorMessage(error) };
		}
	}

	dismissCameraBlocked() {
		this.publish({ cameraBlocked: false });
	}

	private publish(changes: Partial<Omit<EngineSnapshot, "version">>) {
		const previous = this.getSnapshot();
		if (
			Object.entries(changes).some(
				([key, value]) =>
					!Object.is(previous[key as keyof EngineSnapshot], value),
			)
		) {
			this.store.set({
				...previous,
				...changes,
				version: previous.version + 1,
			});
		}
	}

	private publishState(
		updatePanorama = false,
		changes: Partial<Omit<EngineSnapshot, "version">> = {},
	) {
		const source = this.media.current;
		this.publish({
			state: structuredClone(this.state),
			model: this.model,
			adaptedLogL: this.adaptedLogL,
			activePanorama: updatePanorama
				? source && sourcePanorama(this.state.scene.projection, source)
				: this.getSnapshot().activePanorama,
			...changes,
		});
	}

	private publishViewport(metrics: ViewportMetrics) {
		const previous = this.getViewportMetrics();
		if (this.splitElement && previous.splitPercent !== metrics.splitPercent)
			this.splitElement.style.left = `${metrics.splitPercent}%`;
		if (
			previous.splitPercent !== metrics.splitPercent ||
			previous.zoomLabel !== metrics.zoomLabel
		)
			this.viewportStore.set(metrics);
	}

	private redraw = () => {
		this.dirty = true;
	};

	private invalidate() {
		const eye = this.state.profile.eye;
		this.model = compile(this.state, eye, this.adaptedLogL);
		this.otherModel = this.state.binoc.on
			? compile(this.state, otherEye(eye), this.adaptedLogL)
			: undefined;
		this.redraw();
	}

	private sourceChanged(source: MediaSource) {
		const { hfov, dist, logL, depth } = source;
		Object.assign(this.state.scene, {
			hfov,
			dist,
			logL: logL ?? this.state.scene.logL,
			depthEnabled:
				depth?.kind === "embedded" ? true : this.state.scene.depthEnabled,
			depthNearM: depth?.nearM ?? 0.4,
			depthFarM: depth?.farM ?? 25,
			focusPoint: null,
		});
		if (this.viewport)
			this.viewport.setSourceSize(source.canvas.width, source.canvas.height);
		else this.centerView();
		this.sourcePending = this.statsDirty = true;
		this.validateOverlay();
		this.watchVideo();
		this.invalidate();
		this.publishState(true, {
			source: { ...source },
			depthStatusMessage: "",
			depthBusy: false,
			...this.playbackState(),
		});
		void this.updateDepth();
	}

	private validateOverlay() {
		if (this.state.view.overlay === 3 && !this.media.current?.depth)
			this.state.view.overlay = 0;
	}

	private async updateDepth() {
		const source = this.media.current;
		if (!source) return;
		const { depthEnabled } = this.state.scene;
		if (!depthEnabled || source.kind !== "image" || source.depth) {
			this.publish({
				depthStatusMessage:
					depthEnabled && source.kind === "video"
						? "Depth is available for still images."
						: "",
				depthBusy: this.estimating.has(source),
			});
			return;
		}
		if (this.estimating.has(source)) return;
		this.estimating.add(source);
		this.publish({ depthStatusMessage: "", depthBusy: true });
		try {
			const depth = await estimatePhotoDepth(source.canvas, (message) => {
				if (this.media.current === source)
					this.publish({ depthStatusMessage: message });
			});
			source.depth = depth;
			if (this.media.current === source) {
				this.state.scene.depthNearM = depth.nearM;
				this.state.scene.depthFarM = depth.farM;
				if (this.renderer?.available && !this.sourcePending)
					this.renderer.setDepth(depth);
				this.invalidate();
				this.statsDirty = true;
				this.publishState(false, {
					source: { ...source },
					depthStatusMessage: "",
					depthBusy: false,
				});
			}
		} catch (error) {
			if (this.media.current === source)
				this.publish({
					depthStatusMessage: errorMessage(error),
					depthBusy: false,
				});
		} finally {
			this.estimating.delete(source);
		}
	}

	private focusAt(uv: Vec2) {
		if (this.sourcePending || !this.renderer?.available) return;
		const depth = this.renderer.sampleDepth(uv);
		if (depth === undefined) return;
		this.mutate(({ scene }) => {
			scene.focusPoint = uv;
			scene.dist = focusDistanceFromDepth(
				depth,
				scene.depthNearM,
				scene.depthFarM,
			);
		});
	}

	private playbackState() {
		const source = this.media.current;
		return {
			cameraLive: source?.kind === "video" && Boolean(source.stream?.active),
			videoPaused: source?.kind === "video" && source.video.paused,
		};
	}

	private publishPlayback = () => {
		this.publish(this.playbackState());
	};

	private watchVideo() {
		this.videoEvents?.abort();
		this.videoEvents = undefined;
		const source = this.media.current;
		if (!this.viewport || source?.kind !== "video") return;
		this.videoEvents = new AbortController();
		for (const event of ["play", "pause", "ended"]) {
			source.video.addEventListener(event, this.publishPlayback, {
				signal: this.videoEvents.signal,
			});
		}
	}

	private syncCameraVisibility = () => {
		const source = this.media.current;
		if (source?.kind !== "video" || !source.stream) return;
		if (document.hidden) source.video.pause();
		else void source.video.play().catch(() => {});
	};

	private frame(now: number, probe?: { dt: number; upload: boolean }) {
		const elapsed =
			probe?.dt ?? (this.lastTick ? (now - this.lastTick) / 1000 : 1 / 60);
		this.lastTick = now;
		const { scene, view } = this.state;
		const next = stepAdaptation(
			this.adaptedLogL,
			scene.logL,
			elapsed,
			scene.adaptMode,
		);
		const adapted = Math.abs(next - scene.logL) <= 0.01 ? scene.logL : next;
		const previous = this.getSnapshot();
		const sceneChanged = probe && !sameData(previous.state.scene, scene);
		if (sceneChanged || adapted !== this.adaptedLogL) {
			this.adaptedLogL = adapted;
			this.invalidate();
		}
		if (sceneChanged) {
			this.statsDirty = true;
			this.publishState(previous.state.scene.projection !== scene.projection);
		} else if (
			adapted !== previous.adaptedLogL &&
			(probe || adapted === scene.logL || now - this.lastModelAt >= 250)
		) {
			this.lastModelAt = now;
			this.publish({ model: this.model, adaptedLogL: adapted });
		}

		const { renderer, viewport, model, otherModel } = this;
		const source = this.media.current;
		if (!renderer?.available || !viewport || !source) return;
		const wasPending = this.sourcePending;
		const video = source.kind === "video";
		if (wasPending) {
			if (video) this.media.readFrame(true);
			renderer.setSource(
				source.canvas,
				source.kind === "image" ? source.gain : undefined,
				source.equiangular,
			);
			renderer.setDepth(source.depth);
			this.sourcePending = false;
			this.resetHistory = true;
		}
		const animated = scene.live && (model.anim || otherModel?.anim);
		const decoded = probe?.upload
			? source.canvas
			: scene.live && !wasPending
				? this.media.readFrame()
				: undefined;
		if (decoded) renderer.uploadFrame(decoded);
		if (!this.dirty && !animated && !decoded) return;

		const time = scene.live ? (now - this.startTime) / 1000 : this.freezeTime;
		const dt = probe?.dt ?? (scene.live ? Math.min(0.1, elapsed) : 0);
		const renderStart = performance.now();
		renderer.render(
			this.state,
			model,
			otherModel,
			time,
			dt,
			this.resetHistory,
			video || !!probe?.upload,
			this.getSnapshot().activePanorama,
		);
		renderer.display(this.state, viewport.rect, viewport.background);
		const renderMs = performance.now() - renderStart;
		const moving = Boolean(animated || decoded);
		if (moving) {
			const instant = elapsed > 0 ? Math.min(240, 1 / elapsed) : 0;
			this.smoothedFps = this.smoothedFps
				? this.smoothedFps * 0.85 + instant * 0.15
				: instant;
		} else {
			this.smoothedFps = 0;
		}
		this.dirty = this.resetHistory = false;
		if (view.stats && (this.statsDirty || now - this.lastStatsAt >= 250)) {
			this.lastStatsAt = now;
			this.statsDirty = false;
			this.statsStore.set({
				model,
				adaptedLogL: adapted,
				glStats: {
					...renderer.stats,
					renderMs,
					fps: this.smoothedFps,
					animated: moving,
				},
			});
		}
	}

	private createProbe() {
		const isReady = () => !!this.renderer?.available;
		return {
			setImageSource: (
				image: HTMLCanvasElement,
				meta: SourceMeta & {
					gain?: { canvas: HTMLCanvasElement; info: GainMapInfo };
				},
			) => this.media.setImageSource(image, meta),
			loadSample: (id: SampleId) => this.loadSample(id),
			applyPreset: (id: string) => this.applyPresetById(id),
			compile: () =>
				compile(this.state, this.state.profile.eye, this.adaptedLogL),
			setProbeView: (time: number, mode: number, stages?: number[]) => {
				this.freezeTime = time;
				this.redraw();
				this.mutate((state) => {
					state.scene.live = false;
					state.view.mode = mode;
					if (stages)
						state.stages = state.stages.map((_, stage) =>
							stages.includes(stage),
						);
				});
			},
			stepProbeFrame: (
				scene: Partial<SceneParams>,
				dt: number,
				upload = false,
			) => {
				Object.assign(this.state.scene, scene);
				this.redraw();
				this.frame(performance.now(), { dt, upload });
			},
			readFloatBuffer: (buffer?: "view" | "radiance" | "sustained") =>
				this.renderer?.readFloatBuffer(buffer) ?? null,
			capturePNG: () => this.renderer?.capturePNG(),
			get ready() {
				return isReady();
			},
		};
	}
}

declare global {
	interface Window {
		__dogsight: ReturnType<DogsightController["createProbe"]>;
	}
}

export const EngineContext = createContext<DogsightController | null>(null);

export function useEngine(): DogsightController {
	const engine = useContext(EngineContext);
	if (!engine)
		throw new Error("Dogsight hooks require an EngineContext provider.");
	return engine;
}

export function useEngineSnapshot(): EngineSnapshot {
	const engine = useEngine();
	return useSyncExternalStore(
		engine.subscribe,
		engine.getSnapshot,
		engine.getSnapshot,
	);
}

export function useViewportMetrics(): ViewportMetrics {
	const engine = useEngine();
	return useSyncExternalStore(
		engine.subscribeViewport,
		engine.getViewportMetrics,
		engine.getViewportMetrics,
	);
}

export function useStatsSnapshot(): StatsSnapshot {
	const engine = useEngine();
	return useSyncExternalStore(
		engine.subscribeStats,
		engine.getStatsSnapshot,
		engine.getStatsSnapshot,
	);
}
