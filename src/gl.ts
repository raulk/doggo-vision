import { gainMapTransfer } from "./metadata";
import { lerp, opticalPenalty, panoramaField, smooth } from "./model";
import {
	FS_BLEND,
	FS_DISPLAY,
	FS_DOWN,
	FS_LINEARIZE,
	FS_MAIN,
	FS_PANO,
	FS_SRGB,
	FS_TEMPORAL,
	VS,
} from "./shaders";

import type {
	AppState,
	CompiledModel,
	DepthMap,
	EyeId,
	GainMapInfo,
	PanoramaInfo,
	Vec2,
	Vec3,
	Vec4,
} from "./types";

interface Program extends WebGLProgram {
	loc(name: string): WebGLUniformLocation | null;
}

interface Programs {
	pano: Program;
	lin: Program;
	down: Program;
	main: Program;
	temp: Program;
	blend: Program;
	display: Program;
	srgb: Program;
}

export class DogsightGL {
	private gl: WebGL2RenderingContext;
	private programs!: Programs;
	private fbo!: WebGLFramebuffer;
	private src!: WebGLTexture;
	private pyramid!: WebGLTexture;
	private dog!: WebGLTexture;
	private dog2!: WebGLTexture;
	private blend!: WebGLTexture;
	private sustained!: [WebGLTexture, WebGLTexture];
	private fast!: [WebGLTexture, WebGLTexture];
	private temporalView!: WebGLTexture;
	private depth?: { map: DepthMap; texture: WebGLTexture };
	private dome?: {
		color: WebGLTexture;
		depth?: WebGLTexture;
		gain?: WebGLTexture;
	};
	private panoKey = "";
	private pyramidDirty = true;
	private lastHdr = NaN;
	private histIndex: 0 | 1 = 0;
	private gainTex?: WebGLTexture;
	private gainMap?: GainMapInfo;
	private levels = 1;
	private floatRT = false;
	private floatReadback = false;
	private inputP3 = false;
	private sourceEquiangular = false;
	private alphaScale = 1;
	private width = 0;
	private height = 0;
	private rendered = false;
	private gpuRenderer = "WebGL2";
	available = false;

	constructor(
		private canvas: HTMLCanvasElement,
		onRestore: () => void,
		onError: (error: unknown) => void,
	) {
		const gl = canvas.getContext("webgl2", {
			antialias: false,
			premultipliedAlpha: false,
			alpha: false,
		});
		if (!gl)
			throw new Error(
				"This browser does not offer WebGL 2, which the simulator needs.",
			);
		this.gl = gl;
		this.initialize();
		canvas.addEventListener("webglcontextlost", (event) => {
			event.preventDefault();
			this.available = false;
		});
		canvas.addEventListener("webglcontextrestored", () => {
			try {
				this.initialize();
				onRestore();
			} catch (error) {
				onError(error);
			}
		});
	}

	private initialize() {
		const { gl } = this;
		const dbg = gl.getExtension("WEBGL_debug_renderer_info");
		const rawRenderer = dbg
			? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
			: gl.getParameter(gl.RENDERER);
		this.gpuRenderer =
			typeof rawRenderer === "string" && rawRenderer.trim()
				? rawRenderer.trim()
				: "WebGL2";
		this.floatReadback = !!gl.getExtension("EXT_color_buffer_float");
		this.floatRT =
			this.floatReadback || !!gl.getExtension("EXT_color_buffer_half_float");
		gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
		this.alphaScale = this.floatRT ? 1 : 4;
		this.programs = {
			pano: this.program(FS_PANO, "panorama"),
			lin: this.program(FS_LINEARIZE, "linearize"),
			down: this.program(FS_DOWN, "downsample"),
			main: this.program(FS_MAIN, "optics"),
			temp: this.program(FS_TEMPORAL, "temporal"),
			blend: this.program(FS_BLEND, "blend"),
			display: this.program(FS_DISPLAY, "display"),
			srgb: this.program(FS_SRGB, "PNG"),
		};
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 3, -1, -1, 3]),
			gl.STATIC_DRAW,
		);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		this.fbo = gl.createFramebuffer()!;
		this.width = 0;
		this.height = 0;
		this.gainTex = undefined;
		this.gainMap = undefined;
		this.depth = this.dome = undefined;
		this.panoKey = "";
		this.pyramidDirty = true;
		this.rendered = false;
		this.available = true;
	}

	get stats() {
		return {
			floatRT: this.floatRT,
			inputP3: this.inputP3,
			levels: this.levels,
			renderer: this.gpuRenderer,
		};
	}

	private program(fragment: string, label: string): Program {
		const { gl } = this;
		const shader = (kind: number, source: string) => {
			const object = gl.createShader(kind)!;
			gl.shaderSource(object, source);
			gl.compileShader(object);
			if (!gl.getShaderParameter(object, gl.COMPILE_STATUS))
				throw new Error(`${label}: ${gl.getShaderInfoLog(object)}`);
			return object;
		};
		const vs = shader(gl.VERTEX_SHADER, VS),
			fs = shader(gl.FRAGMENT_SHADER, fragment);
		const program = gl.createProgram()! as Program;
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		gl.bindAttribLocation(program, 0, "aPos");
		gl.linkProgram(program);
		gl.deleteShader(vs);
		gl.deleteShader(fs);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw new Error(`${label}: ${gl.getProgramInfoLog(program)}`);
		const locations = new Map<string, WebGLUniformLocation | null>();
		program.loc = (name) => {
			if (locations.has(name)) return locations.get(name)!;
			const location = gl.getUniformLocation(program, name);
			locations.set(name, location);
			return location;
		};
		return program;
	}

	private uniform(
		program: Program,
		name: string,
		value: number | readonly number[],
	) {
		const location = program.loc(name);
		if (location === null) return;
		const { gl } = this;
		if (typeof value === "number") gl.uniform1f(location, value);
		else if (value.length === 2) gl.uniform2fv(location, value);
		else if (value.length === 3) gl.uniform3fv(location, value);
		else if (value.length === 4) gl.uniform4fv(location, value);
	}

	private texture(
		program: Program,
		name: string,
		texture: WebGLTexture,
		unit: number,
	) {
		const { gl } = this;
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.uniform1i(program.loc(name), unit);
	}

	private allocateTexture(w: number, h: number, internal: number, levels = 1) {
		const { gl } = this;
		const texture = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(
			gl.TEXTURE_2D,
			gl.TEXTURE_MIN_FILTER,
			levels === 1 ? gl.LINEAR : gl.LINEAR_MIPMAP_NEAREST,
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texStorage2D(gl.TEXTURE_2D, levels, internal, w, h);
		return texture;
	}

	private target(texture: WebGLTexture, level: number, w: number, h: number) {
		const { gl } = this;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			texture,
			level,
		);
		gl.viewport(0, 0, w, h);
	}

	private draw() {
		this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
	}

	private upload(texture: WebGLTexture, canvas: HTMLCanvasElement) {
		const { gl } = this;
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
	}

	setSource(
		canvas: HTMLCanvasElement,
		gain?: { canvas: HTMLCanvasElement; info: GainMapInfo },
		equiangular = false,
	) {
		const { gl } = this;
		const { width: w, height: h } = canvas;
		this.inputP3 =
			canvas.getContext("2d")?.getContextAttributes?.().colorSpace ===
			"display-p3";
		this.sourceEquiangular = equiangular;
		if (w !== this.width || h !== this.height) {
			if (this.width) {
				for (const texture of [
					this.src,
					this.pyramid,
					this.dog,
					this.dog2,
					this.blend,
					this.temporalView,
					...this.sustained,
					...this.fast,
				])
					gl.deleteTexture(texture);
			}
			if (this.dome) {
				gl.deleteTexture(this.dome.color);
				gl.deleteTexture(this.dome.depth ?? null);
				gl.deleteTexture(this.dome.gain ?? null);
				this.dome = undefined;
			}
			this.width = w;
			this.height = h;
			this.levels = Math.floor(Math.log2(Math.max(w, h))) + 1;
			const format = this.floatRT ? gl.RGBA16F : gl.RGBA8;
			const buffer = () => this.allocateTexture(w, h, format);
			this.src = this.allocateTexture(w, h, gl.RGBA8);
			this.pyramid = this.allocateTexture(w, h, format, this.levels);
			this.dog = buffer();
			this.dog2 = buffer();
			this.blend = buffer();
			this.sustained = [buffer(), buffer()];
			this.fast = [buffer(), buffer()];
			this.temporalView = buffer();
			this.histIndex = 0;
		}
		gl.deleteTexture(this.gainTex ?? null);
		this.gainTex = undefined;
		this.gainMap = gain?.info;
		if (gain) {
			this.gainTex = this.allocateTexture(
				gain.canvas.width,
				gain.canvas.height,
				gl.RGBA8,
			);
			this.upload(this.gainTex, gain.canvas);
		}
		this.uploadFrame(canvas);
		this.setDepth();
		this.rendered = false;
	}

	setDepth(map?: DepthMap) {
		if (map === this.depth?.map) return;
		const { gl } = this;
		gl.deleteTexture(this.depth?.texture ?? null);
		this.depth = undefined;
		if (map) {
			const texture = this.allocateTexture(
				map.canvas.width,
				map.canvas.height,
				gl.RGBA8,
			);
			this.upload(texture, map.canvas);
			this.depth = { map, texture };
		}
		this.pyramidDirty = true;
	}

	sampleDepth([u, v]: Vec2) {
		if (!this.depth || !this.rendered) return undefined;
		const { gl, activeDome } = this;
		const texture = activeDome ? activeDome.depth : this.depth.texture;
		if (!texture) return undefined;
		const width = activeDome ? this.width : this.depth.map.canvas.width;
		const height = activeDome ? this.height : this.depth.map.canvas.height;
		const pixel = new Uint8Array(4);
		this.target(texture, 0, width, height);
		gl.readPixels(
			Math.min(width - 1, Math.floor(u * width)),
			Math.min(height - 1, Math.floor(v * height)),
			1,
			1,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			pixel,
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return pixel[3] ? pixel[0]! / 255 : undefined;
	}

	uploadFrame(canvas: HTMLCanvasElement) {
		this.upload(this.src, canvas);
		this.pyramidDirty = true;
	}

	private get activeDome() {
		return this.panoKey ? this.dome : undefined;
	}

	private reproject(panorama: PanoramaInfo, field: Vec2, look: Vec2) {
		const { gl, width, height } = this;
		const target = () => this.allocateTexture(width, height, gl.RGBA8);
		const dome = (this.dome ??= { color: target() });
		const p = this.programs.pano;
		gl.useProgram(p);
		this.uniform(p, "uField", field);
		this.uniform(p, "uLook", look);
		this.uniform(p, "uSpan", [panorama.hfovDeg, panorama.vfovDeg]);
		this.uniform(p, "uOffset", [
			panorama.yawOffsetDeg,
			panorama.pitchOffsetDeg,
		]);
		this.uniform(
			p,
			"uCylindrical",
			Number(panorama.projection === "cylindrical"),
		);
		const copy = (source: WebGLTexture, dest: WebGLTexture) => {
			this.target(dest, 0, width, height);
			this.texture(p, "uSrc", source, 0);
			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_WRAP_S,
				panorama.hfovDeg >= 360 ? gl.REPEAT : gl.CLAMP_TO_EDGE,
			);
			this.draw();
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		};
		copy(this.src, dome.color);
		if (this.depth) copy(this.depth.texture, (dome.depth ??= target()));
		if (this.gainTex) copy(this.gainTex, (dome.gain ??= target()));
	}

	private buildPyramid(pseudoHDR: number) {
		const { gl, width, height } = this;
		const p = this.programs.lin;
		gl.useProgram(p);
		this.target(this.pyramid, 0, width, height);
		const dome = this.activeDome;
		const source = dome?.color ?? this.src;
		const gain = dome ? dome.gain : this.gainTex;
		this.texture(p, "uSrc", source, 0);
		this.texture(p, "uGainMap", this.gainTex && gain ? gain : source, 1);
		this.uniform(p, "uPanorama", Number(!!dome));
		this.uniform(p, "uHdr", pseudoHDR);
		this.uniform(p, "uInputP3", Number(this.inputP3));
		this.uniform(p, "uLinear", Number(this.floatRT));
		this.uniform(p, "uAS", this.alphaScale);
		this.uniform(p, "uHasGainMap", Number(!!this.gainMap));
		const gm = this.gainMap;
		if (gm) {
			const transfer = gainMapTransfer(gm);
			this.uniform(p, "uApple", Number(gm.format === "apple"));
			this.uniform(p, "uBaseHdr", Number(gm.baseRenditionIsHdr));
			this.uniform(p, "uGmMin", transfer.logGainMin);
			this.uniform(p, "uGmMax", transfer.logGainMax);
			this.uniform(p, "uGmGamma", gm.gamma);
			this.uniform(p, "uGmBaseOffset", transfer.baseOffset);
			this.uniform(p, "uGmAltOffset", transfer.alternateOffset);
		}
		this.draw();
		const d = this.programs.down;
		gl.useProgram(d);
		this.texture(d, "uTex", this.pyramid, 0);
		// The sampler's accessible mip range excludes the attached destination level.
		for (let k = 1; k < this.levels; k++) {
			const sw = Math.max(1, width >> (k - 1)),
				sh = Math.max(1, height >> (k - 1));
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, k - 1);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, k - 1);
			this.target(
				this.pyramid,
				k,
				Math.max(1, width >> k),
				Math.max(1, height >> k),
			);
			this.uniform(d, "uTexel", [1 / sw, 1 / sh]);
			this.draw();
		}
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, this.levels - 1);
	}

	render(
		state: AppState,
		comp: CompiledModel,
		other: CompiledModel | undefined,
		t: number,
		dt: number,
		reset: boolean,
		video: boolean,
		panorama?: PanoramaInfo,
	) {
		const { gl, width, height } = this;
		const { scene, view, vision } = state;
		const rectilinear =
			!panorama && (scene.projection === "photo" || !this.sourceEquiangular);
		const radians = Math.PI / 180;
		const photoHeight = rectilinear
			? (2 *
					Math.atan((Math.tan((scene.hfov / 2) * radians) * height) / width)) /
				radians
			: (scene.hfov * height) / width;
		const field: Vec2 = panorama
			? panoramaField(comp.derived.field_total_deg, width, height)
			: [scene.hfov, photoHeight];
		const key = panorama
			? [
					panorama.projection,
					panorama.hfovDeg,
					panorama.vfovDeg,
					panorama.yawOffsetDeg,
					panorama.pitchOffsetDeg,
					view.yaw,
					view.pitch,
					...field,
				].join()
			: "";
		const moved = key !== this.panoKey;
		if (moved || this.pyramidDirty || this.lastHdr !== vision.hdr) {
			if (panorama) this.reproject(panorama, field, [view.yaw, view.pitch]);
			this.panoKey = key;
			this.buildPyramid(vision.hdr);
			this.pyramidDirty = false;
			this.lastHdr = vision.hdr;
		}
		const eye = state.profile.eye;
		this.renderMain(state, t, comp, this.dog, eye, field, rectilinear);
		let current = this.dog;
		if (other) {
			this.renderMain(
				state,
				t,
				other,
				this.dog2,
				eye === "OS" ? "OD" : "OS",
				field,
				rectilinear,
			);
			const p = this.programs.blend;
			gl.useProgram(p);
			this.target(this.blend, 0, this.width, this.height);
			this.texture(p, "uL", eye === "OS" ? this.dog : this.dog2, 0);
			this.texture(p, "uR", eye === "OD" ? this.dog : this.dog2, 1);
			this.uniform(
				p,
				"uWR",
				opticalPenalty(eye === "OD" ? comp : other) <=
					opticalPenalty(eye === "OS" ? comp : other)
					? state.binoc.dom
					: 1 - state.binoc.dom,
			);
			this.uniform(p, "uHalfX", field[0] / 2);
			this.uniform(p, "uRectilinear", Number(rectilinear));
			this.uniform(p, "uBino", comp.derived.binocular_overlap_deg / 2);
			this.uniform(p, "uLinear", Number(this.floatRT));
			this.draw();
			current = this.blend;
		}
		const p = this.programs.temp;
		gl.useProgram(p);
		const next = this.histIndex === 0 ? 1 : 0;
		this.target(this.sustained[next], 0, width, height);
		const attach = (index: number, texture: WebGLTexture | null) =>
			gl.framebufferTexture2D(gl.FRAMEBUFFER, index, gl.TEXTURE_2D, texture, 0);
		attach(gl.COLOR_ATTACHMENT1, this.fast[next]);
		attach(gl.COLOR_ATTACHMENT2, this.temporalView);
		gl.drawBuffers([
			gl.COLOR_ATTACHMENT0,
			gl.COLOR_ATTACHMENT1,
			gl.COLOR_ATTACHMENT2,
		]);
		this.texture(p, "uCur", current, 0);
		this.texture(p, "uPrevSustained", this.sustained[this.histIndex], 1);
		this.texture(p, "uPrevFast", this.fast[this.histIndex], 2);
		let alpha = 1,
			alphaFast = 1,
			salience = 0;
		if (dt > 0 && state.stages[11] && !reset && !moved && this.rendered) {
			const tau = lerp(1 / (2 * Math.PI * comp.fc), comp.rodTau / 1000, comp.m);
			alpha = -Math.expm1(-dt / tau);
			alphaFast = -Math.expm1(-dt / 0.025);
			salience = video ? state.vision.salience : 0;
		}
		this.uniform(p, "uA", alpha);
		this.uniform(p, "uAFast", alphaFast);
		this.uniform(p, "uSal", salience);
		this.uniform(p, "uLinear", Number(this.floatRT));
		this.draw();
		gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
		attach(gl.COLOR_ATTACHMENT1, null);
		attach(gl.COLOR_ATTACHMENT2, null);
		this.histIndex = next;
		this.rendered = true;
	}
	private renderMain(
		state: AppState,
		t: number,
		comp: CompiledModel,
		target: WebGLTexture,
		eye: EyeId,
		field: Vec2,
		rectilinear: boolean,
	) {
		const { gl, width: W, height: H, levels, alphaScale: AS } = this;
		const p = this.programs.main,
			U = comp.U,
			S = state.scene;
		gl.useProgram(p);
		this.target(target, 0, W, H);
		this.texture(p, "uPyr", this.pyramid, 0);
		this.uniform(p, "uLinear", Number(this.floatRT));
		this.uniform(p, "uMeasuredHDR", Number(!!this.gainMap));
		const { depthOptics } = comp;
		const dome = this.activeDome;
		const depth = this.depth && (dome ? dome.depth : this.depth.texture);
		const useDepth = !!depth && S.depthEnabled && state.stages[6];
		this.texture(p, "uDepthTex", depth ?? this.src, 1);
		this.texture(p, "uPanoMask", dome?.color ?? this.src, 2);
		this.uniform(p, "uPanorama", Number(!!dome));
		this.uniform(p, "uHasDepth", Number(useDepth));
		this.uniform(
			p,
			"uDepthOverlay",
			Number(!!depth && state.view.overlay === 3),
		);
		this.uniform(p, "uFocusInvDist", depthOptics.focusInvDist);
		this.uniform(p, "uRefr", depthOptics.refr);
		this.uniform(p, "uAmax", depthOptics.maxAccommodation);
		this.uniform(p, "uPupilMm", depthOptics.pupilMm);
		this.uniform(p, "uDepthInvNear", 1 / S.depthNearM);
		this.uniform(p, "uDepthInvFar", 1 / S.depthFarM);
		this.uniform(p, "uLevels", levels);
		this.uniform(p, "uAS", AS);
		this.uniform(p, "uSize", [W, H]);
		this.uniform(p, "uPPD", W / field[0]);
		this.uniform(p, "uRectilinear", Number(rectilinear));
		this.uniform(p, "uHalf", [field[0] / 2, field[1] / 2]);
		this.uniform(p, "uTime", t);
		this.uniform(p, "uTS", eye === "OD" ? 1 : -1);
		for (const k of [
			"uAcu",
			"uPeri",
			"uTopo",
			"uDev",
			"uAntTrans",
			"uHaze",
			"uCat",
			"uCatTint",
			"uSparkle",
			"uContrast",
			"uLocalDeg",
			"uBloom",
			"uBloomDeg",
			"uHalo",
			"uTint",
			"uRowL",
			"uRod",
			"uM",
			"uDesat",
			"uCsf",
			"uTunnel",
			"uArc",
			"uStreak",
			"uCurtain",
			"uResid",
			"uThird",
			"uThirdTint",
			"uNose",
			"uLower",
			"uNoise",
			"uPart",
			"uZone",
		] as const)
			this.uniform(p, k, U[k]);
		const m = U.uDog;
		gl.uniformMatrix3fv(p.loc("uDog"), false, [
			m[0][0],
			m[1][0],
			m[2][0],
			m[0][1],
			m[1][1],
			m[2][1],
			m[0][2],
			m[1][2],
			m[2][2],
		]);
		const sc = new Float32Array(24);
		U.uScot.slice(0, 6).forEach((s, i) => sc.set(s, i * 4));
		gl.uniform4fv(p.loc("uScot[0]"), sc);
		// time-varying terms: tear film cycle, lens wobble, flicker illustration
		let blurG = useDepth ? depthOptics.blurWithoutDefocus : U.uBlurG,
			mucus = 0,
			blink = 0,
			kdry = 0,
			veil = U.uVeil,
			sigTot = 0;
		const ks = comp.kcsState;
		if (ks) {
			const tempOn = state.stages[11];
			const ph = tempOn ? t % ks.interval : 4.2;
			if (tempOn && ph < 0.22) blink = Math.sin((Math.PI * ph) / 0.22);
			const dry = smooth(ks.tbu, ks.tbu + 3, ph);
			kdry = ks.s * dry;
			const acu = U.uAcu;
			sigTot = Math.sqrt(acu * acu + blurG * blurG) * (1 + 0.6 * kdry);
			blurG = Math.sqrt(Math.max(0, sigTot * sigTot - acu * acu));
			if (state.stages[10]) veil = 1 - (1 - veil) * (1 - 0.08 * kdry);
			mucus = 0.7 * ks.mucus * ks.s * (0.4 + 0.6 * dry);
		}
		this.uniform(p, "uVeil", veil);
		this.uniform(p, "uBlurG", blurG);
		this.uniform(p, "uMucus", mucus);
		const lid: Vec4 = [...U.uLid];
		lid[3] = state.stages[2] ? blink : 0;
		this.uniform(p, "uLid", lid);
		const g: Vec4 = [...U.uGhost];
		if (kdry > 0 && g[0] === 0) {
			const d = 1.5 * sigTot,
				th = 0.8 + 0.15 * t;
			g[0] = 0.25 * kdry;
			g[1] = d * Math.cos(th);
			g[2] = d * Math.sin(th);
			g[3] = sigTot;
		}
		if (comp.lux > 0 && state.stages[11]) {
			g[1] += Math.sin(t * 2 * Math.PI * 3) * 0.4 * comp.lux;
			g[2] += Math.cos(t * 2 * Math.PI * 3) * 0.25 * comp.lux;
		}
		this.uniform(p, "uGhost", g);
		let gain = U.uGain;
		if (S.flicker && state.stages[11])
			gain *= Math.sin(t * 2 * Math.PI * 6) > 0 ? 1 : 0.82;
		this.uniform(p, "uGain", gain);
		this.uniform(p, "uOverlay", state.view.overlay);
		this.draw();
	}

	display(state: AppState, rect: Vec4, background: Vec3) {
		const { gl, canvas } = this;
		const p = this.programs.display;
		gl.useProgram(p);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, canvas.width, canvas.height);
		this.texture(p, "uDogT", this.temporalView, 0);
		this.texture(p, "uSrcT", this.activeDome?.color ?? this.src, 1);
		this.uniform(p, "uPanorama", Number(!!this.activeDome));
		const { view, scene } = state;
		this.uniform(p, "uRect", rect);
		this.uniform(p, "uZoom", view.zoom);
		this.uniform(p, "uCenter", [view.cx, view.cy]);
		this.uniform(p, "uSplitX", rect[0] + view.split * rect[2]);
		this.uniform(p, "uMode", view.mode);
		this.uniform(p, "uBg", background);
		this.uniform(p, "uLinear", Number(this.floatRT));
		this.uniform(p, "uInputP3", Number(this.inputP3));
		this.uniform(p, "uHG", 0.06 + 0.94 * smooth(-3.5, 1.2, scene.logL));
		this.uniform(p, "uHD", 0.85 * (1 - smooth(-3, 0, scene.logL)));
		this.draw();
	}

	// Returns linear RGBA in WebGL readback order (bottom row first).
	readFloatBuffer(buffer: "view" | "radiance" | "sustained" = "view") {
		if (!this.available || !this.rendered || !this.floatReadback) return null;
		const { gl, width, height } = this;
		const data = new Float32Array(width * height * 4);
		this.target(
			buffer === "radiance"
				? this.pyramid
				: buffer === "sustained"
					? this.sustained[this.histIndex]
					: this.temporalView,
			0,
			width,
			height,
		);
		gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, data);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return { width, height, data };
	}

	async capturePNG(): Promise<Blob | null> {
		if (!this.available || !this.rendered) return null;
		const { gl, width: w, height: h } = this;
		const dog = this.temporalView;
		let output: WebGLTexture | undefined;
		if (this.floatRT) {
			const p = this.programs.srgb;
			gl.activeTexture(gl.TEXTURE0);
			output = this.allocateTexture(w, h, gl.RGBA8);
			this.target(output, 0, w, h);
			gl.useProgram(p);
			this.texture(p, "uDogT", dog, 0);
			this.draw();
		} else this.target(dog, 0, w, h);
		const pixels = new Uint8Array(w * h * 4);
		gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		if (output) gl.deleteTexture(output);

		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d")!;
		const image = ctx.createImageData(w, h);
		for (let y = 0; y < h; y++) {
			image.data.set(
				pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4),
				y * w * 4,
			);
		}
		ctx.putImageData(image, 0, 0);
		return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
	}
}
