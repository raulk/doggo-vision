import { $, $$ } from "./dom";
import {
	COARSE,
	type DogsightMedia,
	errorMessage,
	HOSTED_URL,
	inArtifact,
} from "./media";
import { photoSummary, sourcePanorama } from "./metadata";
import {
	BREEDS,
	CONDS,
	catStage,
	clamp,
	compile,
	condHypotheses,
	dogMatrix,
	EXAMPLE_DETECTOR,
	GROUPS,
	opticalPenalty,
	parseImportJSON,
	profileJSON,
	STAGES,
	skullOf,
	VISION_DEFAULTS,
} from "./model";
import {
	activeConditions,
	applyImport,
	applyPreset,
	clearActiveConditions,
	copyActiveEyeToOther,
	editEye,
	PRESETS,
	setBinoc,
	setBreed,
} from "./state";
import type {
	AppState,
	BreedId,
	CompiledModel,
	EyeId,
	SampleId,
	Vec2,
	Vec3,
} from "./types";

type Confidence = "E" | "P" | "S" | "";
interface Control<T> {
	label: string;
	conf?: Confidence;
	get: () => T;
	set: (value: T) => void;
	keepPreset?: boolean;
}
interface Slider extends Control<number> {
	min: number;
	max: number;
	step: number;
	fmt: (value: number) => string;
	hint?: string;
	toSlider?: (value: number) => number;
	fromSlider?: (value: number) => number;
	after?: () => void;
}
interface Select<T extends string> extends Control<T> {
	opts: ReadonlyArray<readonly [T, string]>;
	hint?: string;
	after?: () => void;
}
type Check = Control<boolean>;
interface Actions {
	invalidate: () => void;
	redraw: () => void;
	centerView: () => void;
	updateDepth: () => void;
	snapAdaptation: () => void;
	resetHistory: () => void;
	capture: () => Promise<Blob | null>;
}

export function createUI(
	state: AppState,
	media: DogsightMedia,
	actions: Actions,
) {
	const { invalidate } = actions;
	let controls: (() => void)[] = [];
	const baseControls = controls;
	let condControls: (() => void)[] = [];
	function fmtAge(y: number) {
		return y < 1
			? Math.max(0, Math.round(y * 52)) + " weeks"
			: (y < 2 ? y.toFixed(1) : Math.round(y)) + " years";
	}
	function confBadge(c?: Confidence) {
		const t = c && { E: "Established", P: "Probable", S: "Speculative" }[c];
		return c ? `<span class="conf ${c}" title="${t}">${c}</span>` : "";
	}
	let uid = 0;
	function slider(host: HTMLElement, d: Slider) {
		const id = "c" + uid++;
		const wrap = document.createElement("div");
		wrap.className = "ctl";
		wrap.innerHTML = `<label for="${id}">${d.label}${confBadge(d.conf)}</label><output for="${id}"></output><input type="range" id="${id}" min="${d.min}" max="${d.max}" step="${d.step}">${d.hint ? `<div class="hint">${d.hint}</div>` : ""}`;
		host.appendChild(wrap);
		const inp = $("input", wrap) as HTMLInputElement,
			out = $("output", wrap);
		const toS = d.toSlider || ((v) => v),
			fromS = d.fromSlider || ((v) => v);
		inp.addEventListener("input", () => {
			d.set(fromS(+inp.value));
			sync();
			if (d.after) d.after();
			if (!d.keepPreset) {
				state.preset = null;
				markPreset();
			}
			invalidate();
		});
		const sync = () => {
			inp.value = String(toS(d.get()));
			out.textContent = d.fmt(d.get());
		};
		controls.push(sync);
		sync();
		return wrap;
	}
	function select<T extends string>(host: HTMLElement, d: Select<T>) {
		const id = "c" + uid++;
		const wrap = document.createElement("div");
		wrap.className = "ctl";
		wrap.innerHTML = `<label for="${id}">${d.label}${confBadge(d.conf)}</label><select id="${id}">${d.opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>${d.hint ? `<div class="hint">${d.hint}</div>` : ""}`;
		host.appendChild(wrap);
		const sel = $<HTMLSelectElement>("select", wrap);
		sel.addEventListener("change", () => {
			d.set(sel.value as T);
			if (d.after) d.after();
			if (!d.keepPreset) {
				state.preset = null;
				markPreset();
			}
			invalidate();
		});
		const sync = () => {
			sel.value = d.get();
		};
		controls.push(sync);
		sync();
	}
	function check(host: HTMLElement, d: Check) {
		const id = "c" + uid++;
		const wrap = document.createElement("label");
		wrap.className = "check";
		wrap.htmlFor = id;
		wrap.innerHTML = `<input type="checkbox" id="${id}"><span>${d.label}</span>${confBadge(d.conf)}`;
		host.appendChild(wrap);
		const cb = $<HTMLInputElement>("input", wrap);
		cb.addEventListener("change", () => {
			d.set(cb.checked);
			if (!d.keepPreset) {
				state.preset = null;
				markPreset();
			}
			invalidate();
		});
		const sync = () => {
			cb.checked = d.get();
		};
		controls.push(sync);
		sync();
	}
	function buildPanels() {
		slider($("#binoSliders"), {
			label: "Clearer-eye dominance",
			conf: "S",
			min: 0.5,
			max: 1,
			step: 0.01,
			get: () => state.binoc.dom,
			set: (v) => (state.binoc.dom = v),
			fmt: (v) => Math.round(v * 100) + "%",
			hint: "How much the clearer eye leads where the two fields overlap. 50% is an even mix.",
		});
		// presets
		const ph = $("#presets");
		PRESETS.forEach((pr) => {
			const b = document.createElement("button");
			b.type = "button";
			b.className = "preset";
			b.dataset.id = pr.id;
			b.innerHTML = `<b>${pr.name}</b><span>${pr.note}</span>`;
			b.onclick = () => {
				applyPreset(state, pr);
				syncAll();
				invalidate();
			};
			ph.appendChild(b);
		});
		const P = () => state.profile,
			O = () => state.eyeOptics[P().eye],
			pc = $("#profileCtl");
		select(pc, {
			label: "Breed",
			opts: (Object.keys(BREEDS) as BreedId[]).map((k) => [k, BREEDS[k].name]),
			get: () => P().breed,
			set: (v) => setBreed(state, v),
			after: syncAll,
		});
		slider(pc, {
			label: "Age",
			min: 0,
			max: 1000,
			step: 1,
			conf: "P",
			get: () => P().age_years,
			set: (v) => (P().age_years = v),
			fmt: fmtAge,
			toSlider: (y) => (y < 1 ? y * 300 : 300 + ((y - 1) * 700) / 15),
			fromSlider: (s) =>
				s < 300 ? Math.max(1 / 52, s / 300) : 1 + ((s - 300) * 15) / 700,
			hint: "Lifespan-scaled: a giant breed ages faster than a toy.",
		});
		slider(pc, {
			label: "Expected lifespan",
			min: 6,
			max: 17,
			step: 0.5,
			conf: "P",
			get: () => P().lifespan_years,
			set: (v) => (P().lifespan_years = v),
			fmt: (v) => v.toFixed(1) + " years",
		});
		slider(pc, {
			label: "Cephalic index",
			min: 40,
			max: 95,
			step: 1,
			conf: "S",
			get: () => P().ci,
			set: (v) => (P().ci = v),
			fmt: (v) => v + " · " + skullOf(v),
			hint: "Skull width over length. Long noses get a horizontal visual streak; short noses a round area centralis (r = −0.795).",
		});
		select(pc, {
			label: "Coat",
			opts: [
				["normal", "Normal"],
				["merle_Mm", "Merle (Mm)"],
				["merle_MM", "Double merle (MM)"],
				["dilute", "Dilute"],
				["white", "White / subalbinotic"],
			],
			get: () => P().coat,
			set: (v) => (P().coat = v),
			conf: "P",
		});
		select(pc, {
			label: "Iris of this eye",
			opts: [
				["brown", "Brown"],
				["blue", "Blue"],
			],
			get: () => O().iris,
			set: (v) => (O().iris = v),
			conf: "S",
			hint: "Less pigment means more stray light and glare.",
		});
		select(pc, {
			label: "Tapetum",
			opts: [
				["1", "Full"],
				["0.88", "Smaller (small breeds)"],
				["0", "Absent"],
			],
			get: () => String(P().tapetum),
			set: (v) => (P().tapetum = +v),
			conf: "S",
		});
		slider(pc, {
			label: "Refraction",
			min: -3,
			max: 2,
			step: 0.25,
			conf: "S",
			get: () => O().refraction_D,
			set: (v) => (O().refraction_D = v),
			fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(2) + " D",
			hint: "Negative is myopic. Rottweilers 64% and German shepherds 53% myopic in one clinic sample.",
		});
		check(pc, {
			label: "Measured total refraction (skip NS offset)",
			get: () => O().refractionMeasured,
			set: (v) => (O().refractionMeasured = v),
		});
		select(pc, {
			label: "Simulated eye",
			opts: [
				["OD", "Right (OD)"],
				["OS", "Left (OS)"],
			],
			get: () => P().eye,
			set: (v) => editEye(state, v),
			after: syncAll,
			hint: "Sets which side of the image is temporal for one-sided conditions.",
		});
		slider(pc, {
			label: "Age-related lens change",
			min: 0,
			max: 1,
			step: 0.05,
			conf: "S",
			get: () => state.vision.ageLens,
			set: (v) => (state.vision.ageLens = v),
			fmt: (v) => Math.round(v * 100) + "%",
			hint: "Scales the typical nuclear sclerosis and lens opacity for this age.",
		});

		const sc = $("#sceneCtl"),
			S = () => state.scene;
		slider(sc, {
			label: "Light level",
			min: -3.5,
			max: 3.5,
			step: 0.1,
			conf: "P",
			get: () => S().logL,
			set: (v) => (S().logL = v),
			fmt: (v) => {
				const n =
					v < -2.5
						? "starlight"
						: v < -1.5
							? "moonlight"
							: v < -0.3
								? "dusk"
								: v < 0.6
									? "street lighting"
									: v < 2
										? "indoors"
										: "daylight";
				return `${n} · 10^${v.toFixed(1)} cd/m²`;
			},
			hint: "Below about 10 cd/m² rods take over: colour drains, acuity falls toward 3 cpd, and the dog stays brighter than a human would.",
		});
		const imageFov = slider(sc, {
			label: "Image field of view",
			min: 4,
			max: 120,
			step: 1,
			conf: "",
			get: () => S().hfov,
			set: (v) => (S().hfov = v),
			fmt: (v) => Math.round(v) + "° wide",
			hint: "How much of the world the photo spans. A phone camera is about 65°.",
		});
		imageFov.id = "imageFov";
		select(sc, {
			label: "Projection",
			opts: [
				["auto", "Auto"],
				["photo", "Photo (rectilinear)"],
				["panorama", "Panorama (360° wide-FOV)"],
			],
			get: () => S().projection,
			set: (mode) => (S().projection = mode),
			keepPreset: true,
			after: syncSourceControls,
		});
		$("#centerView").onclick = actions.centerView;
		sc.append($("#centerView"));
		select(sc, {
			label: "Dark adaptation",
			opts: [
				["instant", "Instant (steady state)"],
				["preview", "Fast preview (60×)"],
				["realtime", "Real-time (25–30 min)"],
			],
			get: () => S().adaptMode,
			set: (mode) => (S().adaptMode = mode),
			keepPreset: true,
			after: syncSourceControls,
		});
		$("#snapAdapted").onclick = actions.snapAdaptation;
		sc.append($("#snapAdapted"));

		const dc = $("#depthCtl");
		check(dc, {
			label: "Per-pixel depth defocus",
			get: () => S().depthEnabled,
			set: (enabled) => {
				S().depthEnabled = enabled;
				syncSourceControls();
				actions.updateDepth();
			},
			keepPreset: true,
		});
		slider(dc, {
			label: "Focus distance",
			min: 0,
			max: 1000,
			step: 1,
			get: () => S().dist,
			set: (v) => {
				S().dist = v;
				S().focusPoint = null;
			},
			toSlider: (d) => (Math.log(d / 0.05) / Math.log(50 / 0.05)) * 1000,
			fromSlider: (s) => 0.05 * Math.pow(50 / 0.05, s / 1000),
			fmt: (v) => (v < 1 ? Math.round(v * 100) + " cm" : v.toFixed(1) + " m"),
			hint: "Dogs accommodate only 2 to 3 D, so anything nearer than about 40 cm blurs.",
			keepPreset: true,
		});
		const estimate = $("#estimateDepth");
		estimate.onclick = () => {
			S().depthEnabled = true;
			actions.updateDepth();
			syncAll();
			invalidate();
		};
		slider($("#depthCalibration"), {
			label: "Near depth calibration",
			min: 0.1,
			max: 10,
			step: 0.05,
			get: () => S().depthNearM,
			set: (v) => (S().depthNearM = Math.min(v, S().depthFarM - 0.05)),
			fmt: (v) => `${v.toFixed(2)} m`,
			keepPreset: true,
		});
		slider($("#depthCalibration"), {
			label: "Far depth calibration",
			min: 0.5,
			max: 100,
			step: 0.5,
			get: () => S().depthFarM,
			set: (v) => (S().depthFarM = Math.max(v, S().depthNearM + 0.05)),
			fmt: (v) => `${v.toFixed(1)} m`,
			keepPreset: true,
		});
		check(sc, {
			label: "Show muzzle silhouette",
			keepPreset: true,
			get: () => S().nose,
			set: (v) => (S().nose = v),
			conf: "S",
		});
		check(sc, {
			label: "Animate (tear film, particles, noise, video)",
			keepPreset: true,
			get: () => S().live,
			set: (v) => (S().live = v),
		});
		check(sc, {
			label: "CRT flicker illustration (slowed down)",
			keepPreset: true,
			get: () => S().flicker,
			set: (v) => (S().flicker = v),
			conf: "P",
		});
		const info = document.createElement("p");
		info.className = "note";
		info.id = "srcinfo";
		sc.appendChild(info);

		const vc = $("#visionCtl"),
			V = () => state.vision;
		slider(vc, {
			label: "Colour separation",
			min: 0.5,
			max: 1,
			step: 0.05,
			conf: "P",
			get: () => V().chroma,
			set: (v) => (V().chroma = v),
			fmt: (v) => "k = " + v.toFixed(2),
		});
		slider(vc, {
			label: "Peak acuity",
			min: 4,
			max: 19,
			step: 0.5,
			conf: "E",
			get: () => V().cpd,
			set: (v) => (V().cpd = v),
			fmt: (v) => `${v} cpd · 20/${Math.round(600 / v)}`,
			hint: "Typical dogs 6 to 12 cycles per degree; humans 30 to 60.",
		});
		slider(vc, {
			label: "Peripheral blur growth",
			min: 0,
			max: 12,
			step: 0.5,
			conf: "S",
			get: () => V().periph,
			set: (v) => (V().periph = v),
			fmt: (v) => "×" + (1 + v).toFixed(1) + " at edge",
		});
		slider(vc, {
			label: "Contrast threshold",
			min: 0,
			max: 0.15,
			step: 0.005,
			conf: "S",
			get: () => V().csf,
			set: (v) => (V().csf = v),
			fmt: (v) => (v * 100).toFixed(1) + "%",
			hint: "No dog contrast sensitivity curve has been measured.",
		});
		slider(vc, {
			label: "Night gain",
			min: 1,
			max: 5,
			step: 0.1,
			conf: "S",
			get: () => V().nightGain,
			set: (v) => (V().nightGain = v),
			fmt: (v) => "×" + v.toFixed(1),
			hint: "Extrapolated from cats; the catalog suggests 2.5×.",
		});
		slider(vc, {
			label: "Tapetal lower-field boost",
			min: 0,
			max: 0.5,
			step: 0.01,
			conf: "S",
			get: () => V().lower,
			set: (v) => (V().lower = v),
			fmt: (v) => "+" + Math.round(v * 100) + "%",
		});
		slider(vc, {
			label: "Rod noise",
			min: 0,
			max: 1.5,
			step: 0.05,
			conf: "S",
			get: () => V().noise,
			set: (v) => (V().noise = v),
			fmt: (v) => v.toFixed(2),
		});
		slider(vc, {
			label: "Rod integration time",
			min: 20,
			max: 250,
			step: 5,
			conf: "P",
			get: () => V().rodTau,
			set: (v) => (V().rodTau = v),
			fmt: (v) => v + " ms",
			hint: "Rods follow flicker to about 20 Hz, so dim scenes smear motion.",
		});
		slider(vc, {
			label: "Veiling glare",
			min: 0,
			max: 0.2,
			step: 0.005,
			conf: "S",
			get: () => V().veil,
			set: (v) => (V().veil = v),
			fmt: (v) => v.toFixed(3),
		});
		slider(vc, {
			label: "Highlight energy",
			min: 0,
			max: 10,
			step: 0.5,
			conf: "S",
			get: () => V().hdr,
			set: (v) => (V().hdr = v),
			fmt: (v) => v.toFixed(1),
			hint: "Restores brightness to clipped lights in ordinary photos so glare can spread.",
		});
		slider(vc, {
			label: "Motion salience (video)",
			min: 0,
			max: 0.5,
			step: 0.01,
			conf: "S",
			get: () => V().salience,
			set: (v) => (V().salience = v),
			fmt: (v) => "+" + Math.round(v * 100) + "%",
		});
		$("#visReset").onclick = () => {
			state.vision = { ...VISION_DEFAULTS };
			syncAll();
			invalidate();
		};

		buildConditions();
		buildPipeline();
		drawSpectra();
	}
	function buildConditions() {
		const host = $("#condList");
		host.innerHTML = "";
		condControls = [];
		const saved = controls;
		controls = condControls;
		GROUPS.forEach(([g, gname]) => {
			const sec = document.createElement("div");
			sec.className = "cgroup";
			sec.innerHTML = `<h4><span>${gname}</span></h4>`;
			CONDS.filter((c) => c.g === g).forEach((c) => {
				const st = activeConditions(state)[c.id];
				const el = document.createElement("div");
				el.className = "cond" + (st.on ? " on" : "");
				const id = "cond_" + c.id;
				el.innerHTML = `<label class="chead" for="${id}"><input type="checkbox" id="${id}" ${st.on ? "checked" : ""}><span class="nm">${c.name}</span><span class="sv">${st.on ? st.s.toFixed(2) : ""}</span><span class="photo ${c.photo}">Photo: ${c.photo}</span></label>`;
				const body = document.createElement("div");
				body.className = "cbody";
				body.hidden = !st.on;
				el.appendChild(body);
				const cb = $<HTMLInputElement>("input", el);
				cb.addEventListener("change", () => {
					st.on = cb.checked;
					st.source = "manual";
					el.classList.toggle("on", st.on);
					body.hidden = !st.on;
					$(".sv", el).textContent = st.on ? st.s.toFixed(2) : "";
					state.preset = null;
					markPreset();
					invalidate();
				});
				slider(body, {
					label: c.id === "glaucoma" ? "Pressure (acute)" : "Severity",
					conf: "S",
					min: 0,
					max: 1,
					step: 0.01,
					get: () => st.s,
					set: (v) => {
						st.s = v;
						$(".sv", el).textContent = v.toFixed(2);
					},
					fmt: (v) =>
						c.id === "cataract"
							? `${v.toFixed(2)} · ${catStage(v, st.x.hypermature)}`
							: c.id === "pigmentary_keratitis"
								? `${v.toFixed(2)} · Maini ≈ ${(v * 14).toFixed(1)}`
								: v.toFixed(2),
				});
				(c.extras || []).forEach((e) => {
					if (e.t === "bool")
						check(body, {
							label: e.label,
							get: () => Boolean(st.x[e.k]),
							set: (v) => {
								st.x[e.k] = v;
								condControls.forEach((f) => f());
							},
						});
					if (e.t === "sel")
						select(body, {
							label: e.label,
							opts: e.opts,
							get: () => String(st.x[e.k]),
							set: (v) => (st.x[e.k] = v),
						});
					if (e.t === "num")
						slider(body, {
							label: e.label,
							conf: "S",
							min: e.min,
							max: e.max,
							step: e.step,
							get: () => Number(st.x[e.k]),
							set: (v) => (st.x[e.k] = v),
							fmt: (v) => (e.unit ? Math.round(v) + e.unit : v.toFixed(2)),
						});
				});
				const pd = document.createElement("p");
				pd.textContent = c.d;
				body.appendChild(pd);
				sec.appendChild(el);
			});
			host.appendChild(sec);
		});
		controls = saved;
	}
	function buildPipeline() {
		const host = $("#pipe");
		host.innerHTML = "";
		STAGES.forEach((s) => {
			const b = document.createElement("button");
			b.type = "button";
			b.className = "st" + (s.fixed ? " fixed" : "");
			b.title = s.tip;
			b.innerHTML = `<span class="n">${s.n}</span>${s.name}`;
			b.setAttribute("aria-pressed", String(state.stages[s.n]));
			if (!s.fixed)
				b.onclick = () => {
					state.stages[s.n] = !state.stages[s.n];
					b.setAttribute("aria-pressed", String(state.stages[s.n]));
					if (s.n === 11) actions.resetHistory();
					invalidate();
				};
			else b.disabled = true;
			host.appendChild(b);
		});
	}
	function syncBino(comp = compile(state)) {
		const B = state.binoc;
		$<HTMLInputElement>("#binoOn").checked = B.on;
		$("#binoCtl").hidden = !B.on;
		$$("#eyeSeg button").forEach((x) =>
			x.setAttribute(
				"aria-pressed",
				String(x.dataset.eye === state.profile.eye),
			),
		);
		if (B.on) {
			const better =
				opticalPenalty(compile(state, "OD")) <=
				opticalPenalty(compile(state, "OS"))
					? "right"
					: "left";
			$("#binoNote").textContent =
				`Editing the ${state.profile.eye === "OS" ? "left" : "right"} eye. The ${better} eye currently looks clearer, so it leads in the binocular zone (±${Math.round(comp.derived.binocular_overlap_deg / 2)}°). Each side crescent shows only that eye. A photo narrower than the overlap sits entirely in the blended zone.`;
		}
		$("#tagR").textContent = B.on ? "Dog · both eyes" : "Dog";
	}
	function markPreset() {
		syncBino();
		$$("#presets .preset").forEach((b) =>
			b.setAttribute("aria-pressed", String(b.dataset.id === state.preset)),
		);
		const pr = PRESETS.find((p) => p.id === state.preset),
			b = BREEDS[state.profile.breed];
		$("#presetName").textContent = pr
			? pr.name
			: `${b ? b.name : "Custom dog"}, ${fmtAge(state.profile.age_years)}`;
	}
	function syncAll() {
		baseControls.forEach((f) => f());
		syncSourceControls();
		buildConditions();
		markPreset();
	}

	// spectrum strips: approximate spectral colours, then the dog matrix
	function wl2rgb(l: number): Vec3 {
		let r = 0,
			g = 0,
			b = 0;
		if (l < 440) {
			r = -(l - 440) / 60;
			b = 1;
		} else if (l < 490) {
			g = (l - 440) / 50;
			b = 1;
		} else if (l < 510) {
			g = 1;
			b = -(l - 510) / 20;
		} else if (l < 580) {
			r = (l - 510) / 70;
			g = 1;
		} else if (l < 645) {
			r = 1;
			g = -(l - 645) / 65;
		} else r = 1;
		const f =
			l < 420
				? 0.3 + (0.7 * (l - 380)) / 40
				: l > 645
					? 0.3 + (0.7 * (700 - l)) / 55
					: 1;
		const lin = (v: number) => {
			v = Math.max(0, v * f);
			return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
		};
		return [lin(r), lin(g), lin(b)];
	}
	function drawSpectra() {
		const enc = (v: number) =>
			Math.round(
				255 *
					clamp(
						v <= 0.0031308
							? 12.92 * v
							: 1.055 * Math.pow(clamp(v, 0, 1), 1 / 2.4) - 0.055,
						0,
						1,
					),
			);
		const M = dogMatrix(state.vision.chroma);
		["specH", "specD"].forEach((id) => {
			const c = $<HTMLCanvasElement>("#" + id),
				x = c.getContext("2d")!,
				w = c.width,
				h = c.height;
			for (let i = 0; i < w; i++) {
				const l = 400 + (300 * i) / w;
				let rgb = wl2rgb(l);
				if (id === "specD") {
					const dot = (row: Vec3) =>
						row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2];
					rgb = [dot(M[0]), dot(M[1]), dot(M[2])];
				}
				x.fillStyle = `rgb(${rgb.map(enc).join(",")})`;
				x.fillRect(i, 0, 1, h);
			}
		});
		$("#ticks").innerHTML = [400, 480, 555, 620, 700]
			.map(
				(l) =>
					`<span style="left:${(l - 400) / 3}%" class="${l === 480 ? "np" : ""}">${l === 480 ? "480 neutral" : l}</span>`,
			)
			.join("");
	}

	// derived panel, field diagram, HUD, JSON views
	function updateUI(comp: CompiledModel, adaptedLogL: number) {
		syncBino(comp);
		const source = media.current;
		const W = source?.canvas.width ?? 0,
			H = source?.canvas.height ?? 0;
		const d = comp.derived;
		const scene = state.scene;
		const panorama = activePanorama();
		const hfov = panorama ? d.field_total_deg : scene.hfov;
		const adaptation =
			scene.adaptMode !== "instant" && Math.abs(adaptedLogL - scene.logL) > 0.01
				? `Adapting: 10^${adaptedLogL.toFixed(1)} → 10^${scene.logL.toFixed(1)} cd/m²`
				: "";
		const rows = [
			["Skull type", d.skull],
			["Visual streak strength", d.streak_strength],
			["Normalised age (age ÷ lifespan)", d.a],
			["Nuclear sclerosis", d.nuclear_sclerosis],
			["Typical lens opacity", d.age_lens_opacity],
			["Accommodation range", d.accommodation_max_D + " D"],
			["Effective refraction", d.refraction_D + " D"],
			["Defocus at subject", d.defocus_D + " D"],
			["Pupil", d.pupil_mm + " mm"],
			[
				"Retinal gain, day / night",
				d.retina_gain_photopic + " / " + d.retina_gain_scotopic,
			],
			["Glare multiplier", "×" + d.glare_multiplier],
			["Flicker fusion", "≈ " + d.temporal_cutoff_Hz + " Hz"],
			["Development", d.development],
		];
		$("#derived").innerHTML = rows
			.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
			.join("");
		drawFov(d.field_total_deg, d.binocular_overlap_deg);
		const m = comp.m,
			regime = m < 0.05 ? "Photopic" : m > 0.95 ? "Scotopic" : "Mesopic";
		const cpd = d.acuity_cpd_centre;
		const ov =
			state.view.overlay === 1
				? `<span class="chip">Acuity map: <b>blue</b> 2 cpd or less, <b>gold</b> 16 cpd, a line at each doubling</span>`
				: state.view.overlay === 2
					? `<span class="chip">Dashed lines: binocular zone ±${Math.round(d.binocular_overlap_deg / 2)}°${comp.U.uTunnel[0] < 179 ? " · blue ring: remaining field" : ""}</span>`
					: state.view.overlay === 3
						? `<span class="chip">${source?.depth?.metric ? "Metric depth" : "Relative depth"} · white is nearer</span>`
						: "";
		const hud = $("#hud");
		hud.hidden = !(state.view.hud || ov);
		hud.innerHTML =
			ov +
			(!state.view.hud
				? ""
				: `<span class="chip">${regime}${m >= 0.05 ? ` · rods <b>${Math.round(m * 100)}%</b>` : ""}</span><span class="chip">Centre <b>${cpd} cpd</b> · 20/${Math.round(600 / Math.max(cpd, 0.1))}</span><span class="chip">${(W / hfov).toFixed(0)} px/°</span>${adaptation ? `<span class="chip">${adaptation}</span>` : ""}`);
		const count = (eye: EyeId) =>
			CONDS.filter((c) => state.eyes[eye][c.id].on).length;
		const n = state.binoc.on
			? count("OS") + count("OD")
			: count(state.profile.eye);
		$("#ccount").hidden = n === 0;
		$("#ccount").textContent = String(n);
		const metadata =
			source?.kind === "image" && source.photo
				? photoSummary(source.photo, true)
				: "";
		$("#srcinfo").textContent =
			`Source: ${source?.name || "sample"} · ${W}×${H} px${source?.kind === "video" ? " · video" : ""}${metadata ? ` · ${metadata}` : ""}.${adaptation ? ` ${adaptation}` : ""}`;
		if (!$('[data-pane="data"]').hidden) renderJSON(comp);
		if (lastChroma !== state.vision.chroma) {
			lastChroma = state.vision.chroma;
			drawSpectra();
		}
	}
	let lastChroma = 1;
	function renderJSON(comp = compile(state)) {
		$("#jProfile").textContent = JSON.stringify(
			profileJSON(state, comp),
			null,
			2,
		);
		$("#jCond").textContent = JSON.stringify(condHypotheses(state), null, 2);
		$("#jShader").textContent = JSON.stringify(comp.shader, null, 2);
	}
	function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
		// angles in degrees, 0 = straight ahead (up), clockwise positive
		const p = (a: number): Vec2 => [
			cx + r * Math.sin((a * Math.PI) / 180),
			cy - r * Math.cos((a * Math.PI) / 180),
		];
		const [x0, y0] = p(a0),
			[x1, y1] = p(a1),
			large = a1 - a0 > 180 ? 1 : 0;
		return `M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`;
	}
	function drawFov(F: number, B: number) {
		const svg = $("#fovsvg"),
			cx = 80,
			cy = 84,
			r = 70;
		svg.innerHTML = `
    <path d="${arcPath(cx, cy, r, F / 2, 360 - F / 2)}" fill="var(--glass-2)" stroke="var(--line)"/>
    <path d="${arcPath(cx, cy, r, -F / 2, F / 2)}" fill="var(--fg)" fill-opacity="0.12" stroke="var(--fg)" stroke-opacity="0.35"/>
    <path d="${arcPath(cx, cy, r, -B / 2, B / 2)}" fill="var(--fg)" fill-opacity="0.55"/>
    <ellipse cx="${cx}" cy="${cy + 4}" rx="11" ry="15" fill="var(--fg)"/>
    <ellipse cx="${cx}" cy="${cy - 12}" rx="5" ry="7" fill="var(--fg)"/>`;
		$("#fovlegend").innerHTML =
			`<div><i style="background:var(--fg);opacity:.55"></i>Binocular ${B}°</div><div><i style="background:var(--fg);opacity:.15;border:1px solid var(--fg)"></i>Total field ${F}°</div><div><i style="background:var(--glass-2);border:1px solid var(--line)"></i>Blind behind ${360 - F}°</div><div style="color:var(--muted)">Field sizes by skull type are working values with no primary source.</div>`;
	}

	const menus = {
		srcBtn: "srcMenu",
		viewBtn: "viewMenu",
		depthBtn: "depthMenu",
	};
	function closeMenus(except?: string) {
		for (const [button, menu] of Object.entries(menus)) {
			if (button === except) continue;
			$(`#${menu}`).hidden = true;
			$(`#${button}`).setAttribute("aria-expanded", "false");
		}
	}

	function setDrawer(open: boolean, tab?: string) {
		$("#drawer").hidden = !open;
		$("#menuBtn").setAttribute("aria-expanded", String(open));
		$("#app").classList.toggle("drawer-open", open);
		if (open) {
			closeMenus();
			if (tab) $(`#tabs button[data-tab="${tab}"]`).click();
		}
	}

	function bindControls() {
		const tabs = $$("#tabs button");
		for (const button of tabs)
			button.onclick = () => {
				for (const tab of tabs)
					tab.setAttribute("aria-selected", String(tab === button));
				for (const pane of $$(".pane"))
					pane.hidden = pane.dataset.pane !== button.dataset.tab;
				if (button.dataset.tab === "data") renderJSON();
			};
		const viewButtons = $$("#viewmode button");
		for (const button of viewButtons)
			button.onclick = () => {
				state.view.mode = Number(button.dataset.mode);
				for (const b of viewButtons)
					b.setAttribute("aria-pressed", String(b === button));
				actions.redraw();
			};
		const overlay = $<HTMLSelectElement>("#overlay");
		const depthOverlayToggle = $<HTMLInputElement>("#depthOverlayToggle");
		overlay.onchange = () => {
			state.view.overlay = Number(overlay.value);
			depthOverlayToggle.checked = state.view.overlay === 3;
			invalidate();
		};
		depthOverlayToggle.onchange = () => {
			state.view.overlay = depthOverlayToggle.checked ? 3 : 0;
			overlay.value = String(state.view.overlay);
			invalidate();
		};
		for (const b of $$("#samples button"))
			b.onclick = () => media.loadSample(b.dataset.sample as SampleId);
		for (const input of $$<HTMLInputElement>("#file, #cam"))
			input.onchange = () => {
				const file = input.files?.[0];
				if (file) void loadFile(file);
				input.value = "";
				closeMenus();
			};
		$("#camlabel").hidden = !COARSE;
		for (const [button, menu] of Object.entries(menus))
			$(`#${button}`).onclick = (event) => {
				event.stopPropagation();
				const panel = $(`#${menu}`);
				const open = panel.hidden;
				closeMenus(button);
				panel.hidden = !open;
				$(`#${button}`).setAttribute("aria-expanded", String(open));
				if (open && matchMedia("(max-width:700px)").matches) setDrawer(false);
			};
		$("#menuBtn").onclick = () => setDrawer(Boolean($("#drawer").hidden));
		$("#presetBtn").onclick = () => {
			const dog = $('#tabs button[data-tab="dog"]');
			setDrawer(
				Boolean($("#drawer").hidden) ||
					dog.getAttribute("aria-selected") !== "true",
				"dog",
			);
		};
		$("#drawerClose").onclick = () => setDrawer(false);
		document.addEventListener("pointerdown", (event) => {
			if (
				!(event.target instanceof Element) ||
				!event.target.closest(".menu, #srcBtn, #viewBtn, #depthBtn")
			)
				closeMenus();
		});
		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				closeMenus();
				setDrawer(false);
			}
		});
		$("#srcMenu").onclick = (event) => {
			if (
				event.target instanceof Element &&
				event.target.closest("#samples button, #camlive")
			)
				closeMenus();
		};

		const binocular = $<HTMLInputElement>("#binoOn");
		binocular.onchange = () => {
			setBinoc(state, binocular.checked);
			syncAll();
			invalidate();
		};
		$("#copyEye").onclick = () => {
			copyActiveEyeToOther(state);
			syncAll();
			invalidate();
		};
		for (const button of $$("#eyeSeg button"))
			button.onclick = () => {
				editEye(state, button.dataset.eye as EyeId);
				syncAll();
				invalidate();
			};
		const hud = $<HTMLInputElement>("#hudToggle");
		hud.onchange = () => {
			state.view.hud = hud.checked;
			invalidate();
		};
		$("#camlive").onclick = () => {
			if (!cameraLive()) void media.startCamera();
		};
		$("#camflip").onclick = () => {
			void media.startCamera(true);
		};
		$("#camstop").onclick = () => media.loadSample("yard");
		$("#vidplay").onclick = async () => {
			const source = media.current;
			if (source?.kind !== "video") return;
			if (source.video.paused)
				await source.video.play().catch((error) => toast(errorMessage(error)));
			else source.video.pause();
			updateMediaUI();
		};
		document.addEventListener("visibilitychange", () => {
			const source = media.current;
			if (source?.kind !== "video" || !source.stream) return;
			if (document.hidden) source.video.pause();
			else void source.video.play().catch(() => {});
		});
		$("#condClear").onclick = () => {
			clearActiveConditions(state);
			syncAll();
			invalidate();
		};
		for (const b of $$("[data-copy]"))
			b.onclick = async () => {
				const pre = $(`#${b.dataset.copy}`);
				try {
					await navigator.clipboard.writeText(pre.textContent ?? "");
					toast("Copied");
				} catch {
					const range = document.createRange();
					range.selectNodeContents(pre);
					const selection = getSelection()!;
					selection.removeAllRanges();
					selection.addRange(range);
					toast("Selected. Press Ctrl+C or ⌘C to copy.");
				}
			};
		bindDrop();
		bindImport();
	}

	async function loadFile(file: File) {
		try {
			await media.loadFile(file);
		} catch (error) {
			toast(errorMessage(error));
		}
	}

	function bindDrop() {
		const vp = $("#vp");
		const drop = $("#drop");
		for (const event of ["dragenter", "dragover"] as const)
			vp.addEventListener(event, (e) => {
				e.preventDefault();
				drop.hidden = false;
			});
		vp.addEventListener("dragleave", (e) => {
			if (!(e.relatedTarget instanceof Node) || !vp.contains(e.relatedTarget))
				drop.hidden = true;
		});
		vp.addEventListener("drop", (e) => {
			e.preventDefault();
			drop.hidden = true;
			const file = e.dataTransfer?.files[0];
			if (file) void loadFile(file);
		});
		window.addEventListener("paste", (e) => {
			const file = e.clipboardData?.files[0];
			if (file) void loadFile(file);
		});
	}

	function bindImport() {
		const input = $<HTMLTextAreaElement>("#imp");
		const message = $("#impMsg");
		$("#impExample").onclick = () => {
			input.value = JSON.stringify(EXAMPLE_DETECTOR, null, 2);
			message.className = "msg";
			message.textContent =
				"Example loaded. Press Apply JSON to map it onto the simulation.";
		};
		$("#impApply").onclick = () => {
			message.className = "msg";
			try {
				const data = parseImportJSON(input.value);
				applyImport(state, data);
				syncAll();
				invalidate();
				const urgent = $("#urgent");
				urgent.hidden = data.urgent.length === 0;
				urgent.textContent = urgent.hidden
					? ""
					: `Seek veterinary care now. The imported record indicates signs that need urgent attention (${data.urgent.join(", ").replace(/_/g, " ")}). The simulation below is only an illustration.`;
				const count = (map: AppState["eyes"][EyeId]) =>
					Object.values(map).filter((c) => c.on).length;
				const n = data.eyes
					? count(data.eyes.OS) + count(data.eyes.OD)
					: data.conditions
						? count(data.conditions)
						: 0;
				message.textContent =
					`Applied ${n} condition${n === 1 ? "" : "s"}${Object.keys(data.profile).length ? " and profile fields" : ""}.` +
					(data.unknown.length
						? ` Ignored unknown: ${data.unknown.join(", ")}.`
						: "") +
					(data.notes.length ? ` ${data.notes.join(" ")}` : "");
			} catch (error) {
				message.className = "msg err";
				message.textContent = errorMessage(error);
			}
		};
	}

	function cameraLive() {
		const source = media.current;
		return source?.kind === "video" && Boolean(source.stream?.active);
	}

	function activePanorama() {
		return (
			media.current && sourcePanorama(state.scene.projection, media.current)
		);
	}

	function syncSourceControls() {
		const { current } = media;
		const depth = current?.depth;
		const hasDepth = !!depth;
		$("#centerView").hidden = !activePanorama();
		$("#imageFov").hidden = !$("#centerView").hidden;
		$("#snapAdapted").hidden = state.scene.adaptMode === "instant";
		$("#depthDot").hidden = !state.scene.depthEnabled;
		$("#estimateDepth").hidden = current?.kind !== "image" || hasDepth;
		$("#depthOverlayWrap").hidden = !hasDepth;
		$("#depthCalibration").hidden = !hasDepth || !state.scene.depthEnabled;
		const sourceNote = $("#depthSource");
		if (current?.kind === "video") {
			sourceNote.textContent = "Per-pixel depth is available for still images.";
		} else if (depth?.kind === "embedded") {
			const label = depth.label ?? "Embedded depth";
			sourceNote.textContent = depth.metric
				? `${label} · ${depth.nearM.toFixed(2)}–${depth.farM.toFixed(1)} m (metric)`
				: `${label} · relative`;
		} else if (depth?.kind === "procedural") {
			sourceNote.textContent = `Built-in scene depth · ${depth.nearM.toFixed(2)}–${depth.farM.toFixed(1)} m`;
		} else if (depth?.kind === "estimated") {
			sourceNote.textContent = "On-device AI depth · relative";
		} else {
			sourceNote.textContent =
				"No embedded depth in this photo. Estimate on-device or use focus distance.";
		}
		$<HTMLOptionElement>('#overlay option[value="3"]').disabled = !hasDepth;
		if (!hasDepth && state.view.overlay === 3) {
			state.view.overlay = 0;
			$<HTMLSelectElement>("#overlay").value = "0";
		}
		$<HTMLInputElement>("#depthOverlayToggle").checked =
			state.view.overlay === 3;
	}

	function depthStatus(message: string, busy: boolean) {
		const status = $("#depthStatus");
		status.textContent = message;
		status.hidden = !message || !state.scene.depthEnabled;
		$<HTMLButtonElement>("#estimateDepth").disabled = busy;
		syncSourceControls();
	}

	function updateMediaUI() {
		const source = media.current;
		const live = cameraLive();
		const video = source?.kind === "video" ? source.video : undefined;
		$("#camflip").hidden = !live;
		$("#camstop").hidden = !video;
		$("#vidplay").hidden = !video || live;
		if (video && !live)
			$("#vidplay").textContent = video.paused ? "Play" : "Pause";
		$("#camlive").setAttribute("aria-pressed", String(live));
		for (const button of $$("#samples button")) {
			button.setAttribute(
				"aria-pressed",
				String(
					Boolean(
						source?.kind === "image" && source.sample === button.dataset.sample,
					),
				),
			);
		}
	}

	buildPanels();
	bindControls();
	void bindSave(state, actions.capture);
	return {
		update: updateUI,
		sync: syncAll,
		updateMedia: updateMediaUI,
		depthStatus,
	};
}

export function cameraBlocked() {
	const note = $("#camnote");
	const message = document.createElement("span");
	message.textContent =
		"This preview cannot use the camera. Open the standalone version for live mode:";
	const link = document.createElement("a");
	link.href = HOSTED_URL;
	link.target = "_blank";
	link.rel = "noopener";
	link.textContent = HOSTED_URL.replace(/^https:\/\//, "");
	const close = document.createElement("button");
	close.type = "button";
	close.className = "btn";
	close.textContent = "Close";
	close.onclick = () => {
		note.hidden = true;
	};
	note.replaceChildren(message, link, close);
	note.hidden = false;
}

let toastTimer = 0;
export function toast(message: string) {
	const el = $("#toast");
	el.textContent = message;
	el.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = window.setTimeout(() => {
		el.hidden = true;
	}, 2600);
}

interface Download {
	save: (item: { filename: string; data: Blob }) => void | Promise<void>;
}
type PreviewWindow = Window & {
	claude?: { use: (capability: "downloads") => Promise<Download | null> };
};

function download({ filename, data }: { filename: string; data: Blob }) {
	const url = URL.createObjectURL(data);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function bindSave(state: AppState, capture: Actions["capture"]) {
	let save: Download["save"] = download;
	if (inArtifact()) {
		const preview = window as PreviewWindow;
		try {
			for (let i = 0; i < 30 && !preview.claude?.use; i++)
				// oxlint-disable-next-line no-await-in-loop -- Preview capabilities can arrive after initial page load.
				await new Promise((resolve) => setTimeout(resolve, 100));
			const capability = await preview.claude?.use("downloads");
			if (!capability) return;
			save = (item) => capability.save(item);
		} catch {
			return;
		}
	}
	const button = $("#save");
	button.hidden = false;
	button.onclick = async () => {
		try {
			const data = await capture();
			if (!data) return;
			await save({
				filename: `dog-view-${state.preset ?? "custom"}.png`,
				data,
			});
			toast("Saved");
		} catch (error) {
			if (
				!(
					error &&
					typeof error === "object" &&
					"code" in error &&
					error.code === "declined"
				)
			) {
				toast("The image could not be saved here.");
			}
		}
	};
}
