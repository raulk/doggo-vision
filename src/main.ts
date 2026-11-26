import { stepAdaptation } from "./adaptation";
import { estimatePhotoDepth, focusDistanceFromDepth } from "./depth";
import { $ } from "./dom";
import { DogsightGL } from "./gl";
import { DogsightMedia, errorMessage, type MediaSource } from "./media";
import { sourcePanorama } from "./metadata";
import { compile, panoramaField } from "./model";
import { applyPreset, createState, otherEye, PRESETS } from "./state";
import type {
	CompiledModel,
	GainMapInfo,
	SampleId,
	SceneParams,
	SourceMeta,
	Vec2,
} from "./types";
import { cameraBlocked, createUI, toast } from "./ui";
import { DogsightViewport } from "./viewport";
import "./styles.css";

const state = createState();
const canvas = $<HTMLCanvasElement>("#gl");
let dirty = true;
let resetHistory = true;
let model: CompiledModel | undefined;
let otherModel: CompiledModel | undefined;
let renderer: DogsightGL | undefined;
let sourcePending = true;
let freezeTime = 3.7;
let lastTick = 0;
let renderMs = 0;
let smoothedFps = 0;
let lastStatsAt = 0;
let adaptedLogL = state.scene.logL;
const estimating = new WeakSet<MediaSource>();
const startTime = performance.now();

function redraw() {
	dirty = true;
}
function invalidate() {
	model = otherModel = undefined;
	redraw();
}
const viewport = new DogsightViewport(canvas, state.view, redraw, {
	panoramaField: () => {
		const source = media.current;
		if (!source || !panorama()) return undefined;
		return panoramaField(
			model?.derived.field_total_deg ?? compile(state).derived.field_total_deg,
			source.canvas.width,
			source.canvas.height,
		);
	},
	canFocus: () => state.scene.depthEnabled && !!media.current?.depth,
	focus: focusAt,
});
const media = new DogsightMedia(sourceChanged, toast, cameraBlocked);
const ui = createUI(state, media, {
	invalidate,
	redraw,
	centerView: () => viewport.center(),
	updateDepth: () => {
		void updateDepth();
	},
	snapAdaptation: () => {
		adaptedLogL = state.scene.logL;
		invalidate();
	},
	resetHistory: () => {
		resetHistory = true;
	},
	capture: () => renderer?.capturePNG() ?? Promise.resolve(null),
});

function panorama() {
	return media.current && sourcePanorama(state.scene.projection, media.current);
}

function sourceChanged(source: MediaSource) {
	const { hfov, dist, logL, depth } = source;
	Object.assign(state.scene, {
		hfov,
		dist,
		logL: logL ?? state.scene.logL,
		depthEnabled: depth?.kind === "embedded" ? true : state.scene.depthEnabled,
		depthNearM: depth?.nearM ?? 0.4,
		depthFarM: depth?.farM ?? 25,
		focusPoint: null,
	});
	viewport.setSourceSize(source.canvas.width, source.canvas.height);
	sourcePending = true;
	ui.sync();
	ui.updateMedia();
	void updateDepth();
	invalidate();
}

async function updateDepth() {
	const source = media.current;
	if (!source) return;
	const { depthEnabled } = state.scene;
	ui.depthStatus(
		depthEnabled && source.kind === "video"
			? "Depth is available for still images."
			: "",
		estimating.has(source),
	);
	if (
		!depthEnabled ||
		source.kind !== "image" ||
		source.depth ||
		estimating.has(source)
	)
		return;
	estimating.add(source);
	const status = (message: string, busy: boolean) => {
		if (media.current === source) ui.depthStatus(message, busy);
	};
	try {
		source.depth = await estimatePhotoDepth(source.canvas, (message) =>
			status(message, true),
		);
		if (media.current === source) {
			state.scene.depthNearM = source.depth.nearM;
			state.scene.depthFarM = source.depth.farM;
			renderer?.setDepth(source.depth);
			ui.sync();
			status("", false);
			invalidate();
		}
	} catch (error) {
		status(errorMessage(error), false);
	} finally {
		estimating.delete(source);
	}
}

function focusAt(uv: Vec2) {
	if (sourcePending) return;
	const depth = renderer?.sampleDepth(uv);
	if (depth === undefined) return;
	const scene = state.scene;
	scene.focusPoint = uv;
	scene.dist = focusDistanceFromDepth(depth, scene.depthNearM, scene.depthFarM);
	ui.sync();
	invalidate();
}

function rendererError(error: unknown) {
	const message = document.createElement("div");
	message.className = "glfail";
	message.textContent = errorMessage(error);
	$("#vp").append(message);
	console.error(error);
}

try {
	renderer = new DogsightGL(
		canvas,
		() => {
			sourcePending = true;
			redraw();
		},
		rendererError,
	);
} catch (error) {
	rendererError(error);
}

function frame(now: number, probe?: { dt: number; upload: boolean }) {
	const elapsed = probe?.dt ?? (lastTick ? (now - lastTick) / 1000 : 1 / 60);
	lastTick = now;
	const scene = state.scene;
	const next = stepAdaptation(
		adaptedLogL,
		scene.logL,
		elapsed,
		scene.adaptMode,
	);
	const adapted = Math.abs(next - scene.logL) <= 0.01 ? scene.logL : next;
	if (adapted !== adaptedLogL) {
		adaptedLogL = adapted;
		invalidate();
	}
	if (!model) {
		model = compile(state, state.profile.eye, adaptedLogL);
		otherModel = state.binoc.on
			? compile(state, otherEye(state.profile.eye), adaptedLogL)
			: undefined;
		ui.update(model, adaptedLogL);
	}
	const source = media.current;
	if (!renderer?.available || !source) return;
	const wasPending = sourcePending;
	const video = source.kind === "video";
	if (wasPending) {
		if (video) media.readFrame(true);
		renderer.setSource(
			source.canvas,
			source.kind === "image" ? source.gain : undefined,
			source.equiangular,
		);
		renderer.setDepth(source.depth);
		sourcePending = false;
		resetHistory = true;
	}
	const animated = scene.live && (model.anim || otherModel?.anim);
	const decoded = probe?.upload
		? source.canvas
		: scene.live && !wasPending
			? media.readFrame()
			: undefined;
	if (decoded) renderer.uploadFrame(decoded);
	if (!dirty && !animated && !decoded) return;
	const time = scene.live ? (now - startTime) / 1000 : freezeTime;
	const dt = probe?.dt ?? (scene.live ? Math.min(0.1, elapsed) : 0);
	const renderStart = performance.now();
	renderer.render(
		state,
		model,
		otherModel,
		time,
		dt,
		resetHistory,
		video || !!probe?.upload,
		panorama(),
	);
	renderer.display(state, viewport.rect, viewport.background);
	renderMs = performance.now() - renderStart;
	if (animated || decoded) {
		const instantFps = elapsed > 0 ? Math.min(240, 1 / elapsed) : 0;
		smoothedFps = smoothedFps
			? smoothedFps * 0.85 + instantFps * 0.15
			: instantFps;
	} else {
		smoothedFps = 0;
	}
	if (state.view.stats && (dirty || now - lastStatsAt >= 250)) {
		lastStatsAt = now;
		ui.updateStats(model, adaptedLogL, {
			...renderer.stats,
			renderMs,
			fps: smoothedFps,
			animated: Boolean(animated || decoded),
		});
	}
	viewport.placeControls();
	dirty = resetHistory = false;
}
function animate(now: number) {
	requestAnimationFrame(animate);
	frame(now);
}

applyPreset(
	state,
	PRESETS.find((preset) => preset.id === "lab") ?? PRESETS[0]!,
);
media.loadSample("yard");
requestAnimationFrame(animate);

const dogsight = {
	setImageSource: (
		image: HTMLCanvasElement,
		meta: SourceMeta & {
			gain?: { canvas: HTMLCanvasElement; info: GainMapInfo };
		},
	) => media.setImageSource(image, meta),
	loadSample: (id: SampleId) => media.loadSample(id),
	applyPreset: (id: string) => {
		applyPreset(state, PRESETS.find((preset) => preset.id === id)!);
		ui.sync();
		invalidate();
	},
	compile: () => compile(state, state.profile.eye, adaptedLogL),
	setProbeView: (time: number, mode: number, stages?: number[]) => {
		freezeTime = time;
		state.scene.live = false;
		state.view.mode = mode;
		if (stages)
			state.stages = state.stages.map((_, stage) => stages.includes(stage));
		ui.sync();
		invalidate();
	},
	stepProbeFrame: (scene: Partial<SceneParams>, dt: number, upload = false) => {
		Object.assign(state.scene, scene);
		invalidate();
		frame(performance.now(), { dt, upload });
	},
	readFloatBuffer: (buffer?: "view" | "radiance" | "sustained") =>
		renderer?.readFloatBuffer(buffer) ?? null,
	capturePNG: () => renderer?.capturePNG(),
	get ready() {
		return !!renderer?.available;
	},
};

declare global {
	interface Window {
		__dogsight: typeof dogsight;
	}
}
window.__dogsight = dogsight;
