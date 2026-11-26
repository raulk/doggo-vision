import { clamp } from "./model";
import type { Vec2, Vec3, Vec4, ViewState } from "./types";

export interface ViewportMetrics {
	readonly splitPercent: number;
	readonly zoomLabel: string;
}

export interface ViewportActions {
	panoramaField: () => Vec2 | undefined;
	canFocus: () => boolean;
	focus: (uv: Vec2) => void;
	onResize?: (rect: Vec4, background: Vec3) => void;
	onMetrics?: (metrics: ViewportMetrics) => void;
}

type Gesture =
	| { type: "split" }
	| { type: "pan"; point: Vec2; cx: number; cy: number }
	| { type: "look"; point: Vec2; yaw: number; pitch: number; field: Vec2 }
	| { type: "focus"; point: Vec2 }
	| { type: "pinch"; distance: number; zoom: number };

export class DogsightViewport {
	private events = new AbortController();
	private resizeObserver = new ResizeObserver(() => this.resize());
	private themeObserver = new MutationObserver(() => this.readBackground());
	private pointers = new Map<number, Vec2>();
	private gesture?: Gesture;
	private metrics?: ViewportMetrics;
	private nativePixels = false;
	private sourceWidth = 1;
	private sourceHeight = 1;
	rect: Vec4 = [0, 0, 1, 1];
	background: Vec3 = [0.03, 0.035, 0.05];

	constructor(
		private host: HTMLElement,
		private canvas: HTMLCanvasElement,
		private view: ViewState,
		private changed: () => void,
		private actions: ViewportActions,
	) {
		this.resizeObserver.observe(host);
		matchMedia("(prefers-color-scheme: dark)").addEventListener(
			"change",
			() => this.readBackground(),
			{ signal: this.events.signal },
		);
		this.themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});
		this.bindPointers();
		this.readBackground();
		this.resize();
	}

	dispose() {
		this.events.abort();
		this.resizeObserver.disconnect();
		this.themeObserver.disconnect();
		for (const id of this.pointers.keys()) {
			if (this.host.hasPointerCapture(id)) this.host.releasePointerCapture(id);
		}
		this.pointers.clear();
		this.gesture = undefined;
	}

	get isNativeZoom() {
		return this.nativePixels;
	}

	setSourceSize(
		width: number,
		height: number,
		zoom: "fit" | "current" | "native" = "fit",
	) {
		this.sourceWidth = width;
		this.sourceHeight = height;
		this.nativePixels = zoom === "native";
		this.fitRect();
		if (zoom === "fit") this.center();
		else this.viewChanged();
	}

	center() {
		this.nativePixels = false;
		this.view.zoom = 1;
		this.view.cx = this.view.cy = 0.5;
		this.view.yaw = this.view.pitch = 0;
		this.viewChanged();
	}

	zoomIn() {
		this.zoomAt(this.view.zoom * 1.5);
	}

	zoomOut() {
		this.zoomAt(this.view.zoom / 1.5);
	}

	zoomFit() {
		this.zoomAt(1);
	}

	zoomNative() {
		this.zoomAt(this.nativeZoom(), undefined, undefined, true);
	}

	private viewChanged() {
		this.placeControls();
		this.changed();
	}

	private resize() {
		const css = this.host.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const width = Math.max(1, Math.round(css.width * dpr));
		const height = Math.max(1, Math.round(css.height * dpr));
		const resized =
			this.canvas.width !== width || this.canvas.height !== height;
		if (resized) {
			this.canvas.width = width;
			this.canvas.height = height;
		}
		this.fitRect();
		if (resized) this.actions.onResize?.(this.rect, this.background);
		this.viewChanged();
	}

	private fitRect() {
		const { width, height } = this.canvas;
		const scale = Math.min(
			width / this.sourceWidth,
			height / this.sourceHeight,
		);
		const w = this.sourceWidth * scale,
			h = this.sourceHeight * scale;
		this.rect = [(width - w) / 2, (height - h) / 2, w, h];
		if (this.nativePixels) {
			this.view.zoom = this.nativeZoom();
			this.clampCenter();
		}
	}

	private readBackground() {
		const rgb = getComputedStyle(this.host).backgroundColor.match(
			/\d+(?:\.\d+)?/g,
		);
		if (rgb && rgb.length >= 3)
			this.background = [+rgb[0]! / 255, +rgb[1]! / 255, +rgb[2]! / 255];
		this.changed();
	}

	placeControls() {
		const { width } = this.canvas;
		const { zoom } = this.view;
		const splitPercent = width === 0 ? 50 : (this.splitX() / width) * 100;
		const zoomLabel =
			zoom === 1 && !this.nativePixels
				? "Fit"
				: `${Math.round((zoom / this.nativeZoom()) * 100)}%`;
		if (
			this.metrics?.splitPercent === splitPercent &&
			this.metrics.zoomLabel === zoomLabel
		)
			return;
		this.metrics = { splitPercent, zoomLabel };
		this.actions.onMetrics?.(this.metrics);
	}

	private nativeZoom() {
		if (!this.canvas.width || !this.canvas.clientWidth || !this.rect[2])
			return 1;
		// The backing buffer is capped at 2×, even on higher-density screens.
		const screenScale =
			(this.canvas.clientWidth * (window.devicePixelRatio || 1)) /
			this.canvas.width;
		return this.sourceWidth / (this.rect[2] * screenScale);
	}

	private splitX() {
		return this.rect[0] + this.rect[2] * this.view.split;
	}

	private point(event: MouseEvent): Vec2 {
		const css = this.canvas.getBoundingClientRect();
		return [
			((event.clientX - css.left) * this.canvas.width) / css.width,
			((css.bottom - event.clientY) * this.canvas.height) / css.height,
		];
	}

	private focus([x, y]: Vec2) {
		const [left, bottom, width, height] = this.rect;
		const locX = (x - left) / width,
			locY = (y - bottom) / height;
		if (locX < 0 || locX > 1 || locY < 0 || locY > 1) return;
		const u = (locX - 0.5) / this.view.zoom + this.view.cx;
		const v = (locY - 0.5) / this.view.zoom + this.view.cy;
		if (u >= 0 && u <= 1 && v >= 0 && v <= 1) this.actions.focus([u, v]);
	}

	private setSplit(x: number) {
		this.view.split = clamp((x - this.rect[0]) / this.rect[2], 0, 1);
		this.viewChanged();
	}

	private clampCenter() {
		const view = this.view;
		const half = Math.min(0.5, 0.5 / view.zoom);
		view.cx = clamp(view.cx, half, 1 - half);
		view.cy = clamp(view.cy, half, 1 - half);
	}

	private zoomAt(
		z: number,
		x = this.canvas.width / 2,
		y = this.canvas.height / 2,
		native = false,
	) {
		this.nativePixels = native;
		const [left, bottom, width, height] = this.rect;
		const dx = (x - left) / width - 0.5,
			dy = (y - bottom) / height - 0.5;
		const view = this.view;
		const oneToOne = this.nativeZoom();
		const zoom = clamp(z, Math.min(1, oneToOne), Math.max(16, oneToOne));
		view.cx += dx / view.zoom - dx / zoom;
		view.cy += dy / view.zoom - dy / zoom;
		view.zoom = zoom;
		this.clampCenter();
		this.viewChanged();
	}

	private pinchDistance() {
		const [a, b] = this.pointers.values();
		return Math.hypot(a![0] - b![0], a![1] - b![1]);
	}

	private bindPointers() {
		const vp = this.host,
			view = this.view;
		const { signal } = this.events;
		const down = (event: PointerEvent) => {
			if (this.pointers.size >= 2) return;
			vp.setPointerCapture(event.pointerId);
			const point = this.point(event);
			this.pointers.set(event.pointerId, point);
			const field = this.actions.panoramaField();
			const tapFocus = event.pointerType !== "mouse" && this.actions.canFocus();
			if (this.pointers.size === 2) {
				this.gesture = {
					type: "pinch",
					distance: this.pinchDistance(),
					zoom: view.zoom,
				};
			} else if (event.shiftKey && this.actions.canFocus()) {
				this.gesture = { type: "focus", point };
			} else if (
				view.mode === 0 &&
				((view.zoom <= 1 && !field && !tapFocus) ||
					Math.abs(point[0] - this.splitX()) <
						(22 * this.canvas.width) / vp.clientWidth)
			) {
				this.gesture = { type: "split" };
				this.setSplit(point[0]);
			} else if (field) {
				this.gesture = {
					type: "look",
					point,
					yaw: view.yaw,
					pitch: view.pitch,
					field,
				};
			} else {
				this.gesture = { type: "pan", point, cx: view.cx, cy: view.cy };
			}
		};
		const move = (event: PointerEvent) => {
			if (!this.pointers.has(event.pointerId)) return;
			const [x, y] = this.point(event);
			this.pointers.set(event.pointerId, [x, y]);
			const start = this.gesture;
			if (start?.type === "split") this.setSplit(x);
			else if (start?.type === "look") {
				const yaw =
					start.yaw -
					((x - start.point[0]) * start.field[0]) / (this.rect[2] * view.zoom);
				view.yaw = ((((yaw + 180) % 360) + 360) % 360) - 180;
				view.pitch = clamp(
					start.pitch -
						((y - start.point[1]) * start.field[1]) /
							(this.rect[3] * view.zoom),
					-45,
					45,
				);
				this.changed();
			} else if (start?.type === "pan") {
				view.cx = start.cx - (x - start.point[0]) / (this.rect[2] * view.zoom);
				view.cy = start.cy - (y - start.point[1]) / (this.rect[3] * view.zoom);
				this.clampCenter();
				this.changed();
			} else if (
				start?.type === "pinch" &&
				this.pointers.size === 2 &&
				start.distance > 1
			) {
				this.zoomAt((start.zoom * this.pinchDistance()) / start.distance);
			}
		};
		const end = (event: PointerEvent) => {
			this.pointers.delete(event.pointerId);
			if (this.pointers.size === 0) this.gesture = undefined;
		};
		const up = (event: PointerEvent) => {
			const start = this.gesture;
			if (
				this.actions.canFocus() &&
				start &&
				"point" in start &&
				(start.type === "focus" || event.pointerType !== "mouse")
			) {
				const point = this.point(event);
				const slop = (8 * this.canvas.width) / vp.clientWidth;
				if (
					Math.hypot(point[0] - start.point[0], point[1] - start.point[1]) <=
					slop
				)
					this.focus(point);
			}
			end(event);
		};
		const wheel = (event: WheelEvent) => {
			event.preventDefault();
			const delta =
				event.deltaMode === WheelEvent.DOM_DELTA_LINE
					? event.deltaY * 16
					: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
						? event.deltaY * vp.clientHeight
						: event.deltaY;
			this.zoomAt(view.zoom * Math.exp(-delta * 0.0015), ...this.point(event));
		};
		const doubleClick = (event: MouseEvent) => {
			event.preventDefault();
			if (this.actions.panoramaField()) this.center();
			else this.zoomFit();
		};

		vp.addEventListener("pointerdown", down, { signal });
		vp.addEventListener("pointermove", move, { signal });
		vp.addEventListener("pointerup", up, { signal });
		vp.addEventListener("pointercancel", end, { signal });
		vp.addEventListener("lostpointercapture", end, { signal });
		vp.addEventListener("wheel", wheel, { passive: false, signal });
		vp.addEventListener("dblclick", doubleClick, { signal });
		// Prevent iOS Safari page-level gesture zoom so the fixed chrome cannot get stuck zoomed in.
		document.addEventListener(
			"gesturestart",
			(event) => event.preventDefault(),
			{ passive: false, signal },
		);
	}
}
