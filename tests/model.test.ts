import { describe, expect, it } from "vitest";
import {
	CONDS,
	compile,
	condHypotheses,
	defocusErrorD,
	dogMatrix,
	mapDetector,
	opticalPenalty,
	parseImportJSON,
	profileJSON,
} from "../src/model";
import {
	activeConditions,
	applyImport,
	applyPreset,
	clearActiveConditions,
	copyActiveEyeToOther,
	createState,
	editEye,
	PRESETS,
	setBinoc,
} from "../src/state";

function assertFinite(value: unknown) {
	if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
	else if (value && typeof value === "object")
		Object.values(value).forEach(assertFinite);
}

describe("optics", () => {
	it("compiles all 17 presets for both eyes and defaults to Adult Labrador", () => {
		const state = createState();
		expect(PRESETS).toHaveLength(17);
		expect(PRESETS[0]?.id).toBe("lab");
		for (const preset of PRESETS) {
			applyPreset(state, preset);
			for (const eye of ["OS", "OD"] as const)
				assertFinite(compile(state, eye));
		}
	});

	it("keeps adjacent severity steps continuous across all 25 conditions", () => {
		const state = createState();
		expect(CONDS).toHaveLength(25);
		for (const { id } of CONDS) {
			clearActiveConditions(state);
			const condition = activeConditions(state)[id];
			condition.on = true;
			condition.s = 0;
			let previous = compile(state).U;
			for (let step = 1; step <= 50; step++) {
				condition.s = step / 50;
				const result = compile(state);
				assertFinite(result);
				const { uBlurG, uContrast, uGain } = result.U;
				expect(Math.abs(uBlurG - previous.uBlurG), id).toBeLessThan(0.22);
				expect(Math.abs(uContrast - previous.uContrast), id).toBeLessThan(0.1);
				expect(Math.abs(uGain - previous.uGain), id).toBeLessThan(0.12);
				previous = result.U;
			}
		}
	});

	it("ramps axial pigment continuously through 0.70", () => {
		const state = createState();
		const pigment = activeConditions(state).pigmentary_keratitis;
		pigment.on = true;
		pigment.s = 0.7;
		pigment.x.origin = "diffuse";
		const before = compile(state).U;
		pigment.s = 0.71;
		const after = compile(state).U;
		expect(after.uBlurG - before.uBlurG).toBeLessThan(0.02);
		expect(before.uContrast - after.uContrast).toBeCloseTo(0.03);
		expect(before.uAntTrans[0] - after.uAntTrans[0]).toBeLessThan(0.04);
	});

	it("scales age-related optics continuously from zero", () => {
		const state = createState();
		state.profile.age_years = state.profile.lifespan_years;
		state.vision.ageLens = 0;
		expect(compile(state).derived.refraction_D).toBe(0);
		state.vision.ageLens = 0.01;
		expect(Math.abs(compile(state).derived.refraction_D)).toBeLessThan(0.02);
		state.vision.ageLens = 0.5;
		const halfway = compile(state).derived;
		state.vision.ageLens = 1;
		const full = compile(state).derived;
		expect(halfway.nuclear_sclerosis * 2).toBe(full.nuclear_sclerosis);
		expect(halfway.pupil_mm).toBeLessThan(full.pupil_mm);
	});

	it("weights cortical scatter toward wider pupils and central cataract toward smaller pupils", () => {
		const state = createState();
		const cat = activeConditions(state).cataract;
		Object.assign(cat, { on: true, s: 0.5 });
		for (const type of [
			"cortical",
			"nuclear",
			"posterior_subcapsular",
			"diffuse",
		]) {
			cat.x.type = type;
			state.scene.logL = 2.5;
			const bright = compile(state).U;
			state.scene.logL = -2.5;
			const dim = compile(state).U;
			if (type === "cortical") {
				expect(dim.uCat[1]).toBeGreaterThan(bright.uCat[1]);
				expect(dim.uVeil).toBeGreaterThan(bright.uVeil);
			} else if (type === "diffuse") {
				expect(dim.uCat[1]).toBe(bright.uCat[1]);
			} else {
				expect(dim.uCat[1]).toBeLessThan(bright.uCat[1]);
				expect(dim.uVeil).toBeLessThan(bright.uVeil);
			}
		}
	});

	it("lights hypermature cataract crystals only with the lens stage enabled", () => {
		const state = createState();
		applyPreset(state, PRESETS.find((p) => p.id === "cataract")!);
		expect(compile(state).U.uSparkle).toBe(0);
		activeConditions(state).cataract.x.hypermature = true;
		expect(compile(state).U.uSparkle).toBeCloseTo(0.775);
		state.stages[5] = false;
		expect(compile(state).U.uSparkle).toBe(0);
	});

	it("preserves the calibrated pigment effect below the axial threshold", () => {
		const state = createState();
		applyPreset(state, PRESETS.find((p) => p.id === "kcs15")!);
		const withPigment = compile(state).U;
		activeConditions(state).pigmentary_keratitis.on = false;
		const clear = compile(state).U;
		expect(withPigment.uBlurG).toBe(clear.uBlurG);
		expect(withPigment.uContrast).toBe(clear.uContrast);
		expect(withPigment.uAntTrans[0] / clear.uAntTrans[0]).toBeCloseTo(
			1 - 0.3 * 0.35,
		);
	});
});

describe("eye state and imports", () => {
	it("preserves both condition maps across toggles and copies only on request", () => {
		const state = createState();
		state.eyes.OD.kcs.on = true;
		state.eyes.OS.cataract.on = true;
		const eyes = structuredClone(state.eyes);
		setBinoc(state, true);
		setBinoc(state, false);
		setBinoc(state, true);
		expect(state.eyes).toEqual(eyes);
		copyActiveEyeToOther(state);
		expect(state.eyes.OS).toEqual(state.eyes.OD);
		editEye(state, "OS");
		clearActiveConditions(state);
		expect(activeConditions(state).kcs.on).toBe(false);
		expect(state.eyes.OD.kcs.on).toBe(true);
		state.binoc.dom = 0.83;
		applyPreset(state, PRESETS.find((p) => p.id === "kcs15both")!);
		expect(state.binoc.dom).toBe(0.75);
	});

	it("routes an unusable detector photo to OS and still applies clinical metadata", () => {
		const state = createState();
		const data = parseImportJSON(
			JSON.stringify({
				eye: "OS",
				image_quality: { usable: false },
				findings: { lens_opacity: { p: 1 }, aphakic_crescent: { p: 1 } },
				metadata_optional: {
					IOP_mmHg: 60,
					STT_mm_per_min: 4,
					PRA_genotype: "at-risk",
					vet_diagnoses: ["optic neuritis"],
					sudden_blindness: true,
				},
				urgent_flags: ["reported_by_clinic"],
			}),
		);
		applyImport(state, data);
		expect(state.profile.eye).toBe("OS");
		expect(state.eyes.OS.cataract.on).toBe(false);
		expect(state.eyes.OD.glaucoma.on).toBe(false);
		expect(state.eyes.OS.glaucoma.s).toBe(1);
		expect(state.eyes.OS.kcs.on).toBe(true);
		expect(state.eyes.OS.pra.on).toBe(true);
		expect(state.eyes.OS.optic_neuritis.on).toBe(true);
		expect(data.notes.join(" ")).toContain("Photo marked unusable");
		expect(data.urgent).toEqual([
			"reported_by_clinic",
			"elevated_iop",
			"sudden_blindness",
		]);
	});

	it.each([
		"unaffected",
		"non-affected",
		"clear",
		"normal",
		"carrier",
		"homozygous normal",
	])("does not infer PRA from %s", (PRA_genotype) => {
		expect(
			mapDetector({
				findings: {},
				metadata_optional: { PRA_genotype },
			}).conditions.pra,
		).toBeUndefined();
	});

	it("flags visible deep ulcer, hyphema and possible lens luxation", () => {
		expect(
			mapDetector({
				findings: {
					corneal_ulcer_visible: { depth: "deep", p: 0.8 },
					hypopyon_or_hyphema: { type: "hyphema", p: 0.8 },
					aphakic_crescent: { p: 0.8 },
				},
			}).urgent,
		).toEqual(["deep_corneal_ulcer", "hyphema", "possible_lens_luxation"]);
	});

	it("uses exclusive Maini bonuses and retains tear instability at normal STT", () => {
		const findings = {
			corneal_pigment: {
				p: 1,
				clock_hours: 12,
				crosses_pupil: false,
				reaches_pupil: true,
			},
			tear_film_irregular: { p: 1, severity: 0.6 },
		};
		expect(
			mapDetector({ findings }).conditions.pigmentary_keratitis
				?.maini_score_est,
		).toBe(13);
		findings.corneal_pigment.crosses_pupil = true;
		const result = mapDetector({
			findings,
			metadata_optional: { STT_mm_per_min: 16 },
		});
		expect(result.conditions.pigmentary_keratitis?.maini_score_est).toBe(14);
		expect(result.conditions.kcs?.s).toBe(0.6);
		expect(result.notes.join(" ")).toContain("Normal STT");
	});

	it("favours an eye with mild cherry eye over complete SARDS", () => {
		const state = createState();
		Object.assign(state.eyes.OD.sards, { on: true, s: 1 });
		Object.assign(state.eyes.OS.cherry_eye, { on: true, s: 0.2 });
		const blind = compile(state, "OD");
		expect(blind.U.uGain).toBe(0);
		expect(blind.U.uResid).toBe(0);
		expect(opticalPenalty(blind)).toBeGreaterThan(
			opticalPenalty(compile(state, "OS")),
		);
	});

	it("keeps adult Lab retinal gain and reaches breakup in the Shih Tzu preset", () => {
		const state = createState();
		expect(compile(state).derived).toMatchObject({
			retina_gain_photopic: 1,
			retina_gain_scotopic: 1,
		});
		applyPreset(state, PRESETS.find((p) => p.id === "kcs")!);
		const tear = compile(state).kcsState!;
		expect(tear.tbu).toBeLessThan(tear.interval);
	});

	it("keeps measured refraction and iris independent for each eye", () => {
		const state = createState();
		const seniorBoth = PRESETS.find((p) => p.id === "kcs15both")!;
		applyPreset(state, seniorBoth);
		state.eyeOptics.OS = {
			refraction_D: -1.25,
			refractionMeasured: true,
			iris: "blue",
		};
		state.eyeOptics.OD = {
			refraction_D: -1.25,
			refractionMeasured: false,
			iris: "brown",
		};
		expect(compile(state, "OS").derived).toMatchObject({
			refraction_D: -1.25,
			pigment: 0.5,
		});
		expect(compile(state, "OD").derived.refraction_D).toBeLessThan(-1.25);
		setBinoc(state, false);
		const copy = createState();
		applyImport(
			copy,
			parseImportJSON(JSON.stringify(profileJSON(state, compile(state)))),
		);
		expect(copy.eyeOptics).toEqual(state.eyeOptics);
		applyImport(
			copy,
			parseImportJSON(
				'{"profile":{"eye":"OD","refraction_D":0.75,"iris":{"OD":"blue"}}}',
			),
		);
		expect(copy.eyeOptics.OD).toEqual({
			refraction_D: 0.75,
			refractionMeasured: false,
			iris: "blue",
		});
		expect(copy.eyeOptics.OS).toEqual(state.eyeOptics.OS);
		applyPreset(copy, seniorBoth);
		expect(copy.eyeOptics.OS.refractionMeasured).toBe(false);
	});

	it("preserves photopic white across chroma settings", () => {
		for (const chroma of [0, 0.5, 1]) {
			for (const row of dogMatrix(chroma))
				expect(row.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 3);
		}
	});

	it("round-trips binocular hypotheses and profiles with all KCS extras", () => {
		const state = createState();
		applyPreset(state, PRESETS.find((p) => p.id === "kcs15both")!);
		state.binoc.dom = 0.92;
		Object.assign(state.eyes.OS.kcs.x, {
			tbu: 3,
			blink: 8,
			mucus: 0.24,
			squint: 0.7,
			chronic: true,
		});
		for (const output of [
			condHypotheses(state),
			profileJSON(state, compile(state)),
		]) {
			const copy = createState();
			applyImport(copy, parseImportJSON(JSON.stringify(output)));
			expect(condHypotheses(copy)).toEqual(condHypotheses(state));
			expect(copy.eyes.OS.kcs.x).toEqual(state.eyes.OS.kcs.x);
		}
	});

	it("keeps zero fill fraction and passes through urgent flags", () => {
		const result = mapDetector({
			findings: {
				hypopyon_or_hyphema: { type: "hyphema", fill_fraction: 0, p: 1 },
			},
			urgent_flags: ["possible_descemetocele"],
		});
		expect(result.conditions.hyphema).toBeUndefined();
		expect(result.urgent).toEqual(["possible_descemetocele", "hyphema"]);
	});

	it.each([
		"null",
		"[]",
		"bad",
		'{"findings":[]}',
		'{"conditions":{"kcs":null}}',
		'{"profile":{"eye":"X"}}',
		'{"conditions":{"kcs":{"s":1e400}}}',
		'{"eyes":{"OS":{},"OD":[]},"binocular":{"enabled":true,"dominance":0.8}}',
	])("rejects malformed input %s", (json) => {
		expect(() => parseImportJSON(json)).toThrow();
	});
});

describe("accommodated depth optics", () => {
	it.each([
		["lab", 2.5, 0.357, 0],
		["gsd", 2.434, 0, 1.4],
		["kcs15", 0.5, 2.033, 0.224],
	] as const)(
		"%s resolves near/far defocus with its own optical limits",
		(id, amax, nearError, farError) => {
			const state = createState();
			applyPreset(state, PRESETS.find((preset) => preset.id === id)!);
			state.scene.dist = 0.35;
			const { depthOptics, U } = compile(state);
			const { focusInvDist, refr, maxAccommodation, blurWithoutDefocus } =
				depthOptics;
			expect(maxAccommodation).toBeCloseTo(amax, 3);
			expect(
				defocusErrorD(1 / 0.35, focusInvDist, refr, maxAccommodation),
			).toBeCloseTo(nearError, 3);
			expect(defocusErrorD(1 / 10, 1 / 10, refr, maxAccommodation)).toBeCloseTo(
				farError,
				1,
			);
			expect(blurWithoutDefocus).toBeLessThanOrEqual(U.uBlurG);
		},
	);
});
