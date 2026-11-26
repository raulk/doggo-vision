import type {
	AppState,
	BreedId,
	CoatType,
	ConditionDefinition,
	ConditionHypothesis,
	ConditionId,
	ConditionMap,
	ConditionState,
	DetectorMetadata,
	DetectorOutput,
	DogProfile,
	ExtraValue,
	EyeId,
	EyeOptics,
	Finding,
	Mat3,
	SkullType,
	StateImport,
	Vec2,
	Vec3,
	Vec4,
} from "./types";

// ---------- Model: catalog values, profile -> derived -> condition hypotheses -> shader parameters ----------
export const clamp = (x: number, a: number, b: number) =>
	Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number) => {
	const t = clamp((x - e0) / (e1 - e0), 0, 1);
	return t * t * (3 - 2 * t);
};
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const REF_FOV = 120; // catalog Part III expresses image fractions for a ~120 degree image
const frac = (f: number) => f * REF_FOV; // fraction of image width -> degrees, for geometry (radii, field positions)
// Part III blur fractions are calibrated against its baseline acuity_sigma_frac = 0.002, which Part I puts at about
// 3 arcmin. Converting them with a 25 degree reference keeps condition blur in proportion to normal dog acuity.
const REF_BLUR = 25;
const fracB = (f: number) => f * REF_BLUR;

// Part I §1.5: linear sRGB -> dog cone catches, and the display axis for the single opponent channel
const L_DOG: Vec3 = [0.1824, 0.6697, 0.1478];
const S_DOG: Vec3 = [0.0367, 0.0656, 0.8977];
const ROD: Vec3 = [-0.0508, 0.6586, 0.3922];
const B_AXIS: Vec3 = [-0.19, -0.0445, 1.0];
export function dogMatrix(k: number): Mat3 {
	const row = (axis: number): Vec3 => [
		L_DOG[0] + k * axis * (S_DOG[0] - L_DOG[0]),
		L_DOG[1] + k * axis * (S_DOG[1] - L_DOG[1]),
		L_DOG[2] + k * axis * (S_DOG[2] - L_DOG[2]),
	];
	return [row(B_AXIS[0]), row(B_AXIS[1]), row(B_AXIS[2])];
}

// Breed table: cephalic index (anchors Speculative), lifespan, refraction offset (Part II A5), cataract multiplier, tapetum
export const BREEDS = {
	mixed: { name: "Mixed breed", ci: 62, L: 13, dD: 0, cat: 1, tap: 1 },
	labrador: {
		name: "Labrador retriever",
		ci: 62,
		L: 12.5,
		dD: 0,
		cat: 1.2,
		tap: 1,
	},
	golden: { name: "Golden retriever", ci: 60, L: 12, dD: 0, cat: 1.2, tap: 1 },
	gsd: { name: "German shepherd", ci: 56, L: 11, dD: -1, cat: 1, tap: 1 },
	rottweiler: { name: "Rottweiler", ci: 62, L: 10, dD: -1, cat: 1, tap: 1 },
	greyhound: { name: "Greyhound", ci: 46, L: 12.5, dD: 0, cat: 1, tap: 1 },
	whippet: { name: "Whippet", ci: 48, L: 13.5, dD: 0, cat: 1, tap: 1 },
	collie: { name: "Rough collie", ci: 48, L: 13, dD: 0, cat: 1, tap: 1 },
	aussie: {
		name: "Australian shepherd",
		ci: 60,
		L: 13,
		dD: 0.75,
		cat: 2,
		tap: 1,
	},
	husky: { name: "Siberian husky", ci: 60, L: 13, dD: 0, cat: 2, tap: 1 },
	malamute: {
		name: "Alaskan malamute",
		ci: 60,
		L: 11,
		dD: 0.75,
		cat: 1,
		tap: 1,
	},
	poodle_toy: {
		name: "Toy poodle",
		ci: 60,
		L: 14.5,
		dD: -1,
		cat: 3,
		tap: 0.88,
	},
	schnauzer: {
		name: "Miniature schnauzer",
		ci: 62,
		L: 13.5,
		dD: -1,
		cat: 2,
		tap: 0.88,
	},
	cocker: { name: "Cocker spaniel", ci: 64, L: 12.5, dD: 0, cat: 2, tap: 1 },
	bichon: { name: "Bichon frise", ci: 66, L: 14, dD: 0, cat: 3, tap: 0.88 },
	boston: { name: "Boston terrier", ci: 82, L: 12, dD: 0, cat: 3, tap: 0.88 },
	pug: { name: "Pug", ci: 88, L: 13, dD: 0, cat: 1, tap: 0.88 },
	frenchie: { name: "French bulldog", ci: 86, L: 11, dD: 0, cat: 1, tap: 0.88 },
	shihtzu: { name: "Shih Tzu", ci: 85, L: 13.5, dD: 0, cat: 1, tap: 0.88 },
	chihuahua: { name: "Chihuahua", ci: 78, L: 14.5, dD: 0, cat: 1, tap: 0.88 },
	greatdane: { name: "Great Dane", ci: 58, L: 7.5, dD: 0, cat: 1, tap: 1 },
};

// Conditions, grouped along the light path. photo = detectability from a macro eye photo (Part III / S5).
export const GROUPS = [
	["adnexa", "Lids and third eyelid"],
	["cornea", "Tear film and cornea"],
	["uvea", "Chamber, iris and pressure"],
	["lens", "Lens"],
	["retina", "Vitreous, retina and optic nerve"],
	["globe", "Whole globe"],
];
function defineConditions<const Id extends string>(
	conditions: readonly (ConditionDefinition & { id: Id })[],
) {
	return conditions;
}

export const CONDS = defineConditions([
	{
		id: "cherry_eye",
		g: "adnexa",
		name: "Cherry eye",
		photo: "yes",
		d: "Prolapsed third-eyelid gland. A small soft occluder low on the nasal side.",
		s: 0.5,
	},
	{
		id: "entropion",
		g: "adnexa",
		name: "Entropion",
		photo: "yes",
		d: "Inrolled lid. Indirect effects: squint, tearing and a wet blur.",
		s: 0.5,
	},
	{
		id: "horner",
		g: "adnexa",
		name: "Horner syndrome",
		photo: "yes",
		d: "Small pupil, drooping upper lid and a raised third eyelid.",
		s: 0.6,
	},
	{
		id: "kcs",
		g: "cornea",
		name: "Dry eye (KCS)",
		photo: "partly",
		d: "Between blinks, tear-film break-up increases blur and forward scatter. Mucus smears detail and bright light can trigger squinting.",
		s: 0.5,
		extras: [
			{
				k: "tbu",
				t: "num",
				label: "Tear break-up time",
				min: 1,
				max: 30,
				step: 1,
				def: 10,
				unit: " s",
			},
			{
				k: "blink",
				t: "num",
				label: "Time between blinks",
				min: 2,
				max: 15,
				step: 1,
				def: 6,
				unit: " s",
			},
			{
				k: "mucus",
				t: "num",
				label: "Mucus smear",
				min: 0,
				max: 1,
				step: 0.01,
				def: 0,
			},
			{
				k: "squint",
				t: "num",
				label: "Squint in bright light",
				min: 0,
				max: 1,
				step: 0.01,
				def: 0,
			},
			{ k: "chronic", t: "bool", label: "Chronic (adds corneal pigment)" },
		],
	},
	{
		id: "pigmentary_keratitis",
		g: "cornea",
		name: "Pigmentary keratitis",
		photo: "yes",
		d: "Corneal melanin absorbs and scatters light at the pupil. Dense pigment over the pupil also softens detail.",
		s: 0.35,
		extras: [
			{
				k: "origin",
				t: "sel",
				label: "Starts from",
				opts: [
					["medial", "Nasal cornea"],
					["temporal", "Temporal cornea"],
					["diffuse", "Diffuse"],
				],
			},
		],
	},
	{
		id: "corneal_edema",
		g: "cornea",
		name: "Corneal edema",
		photo: "yes",
		d: "Blue-white corneal haze with coloured halos around lights.",
		s: 0.5,
	},
	{
		id: "corneal_ulcer",
		g: "cornea",
		name: "Corneal ulcer",
		photo: "partly",
		d: "Corneal surface damage adds blur and forward scatter. Bright light can trigger squinting.",
		s: 0.5,
	},
	{
		id: "pannus",
		g: "cornea",
		name: "Pannus (CSK)",
		photo: "yes",
		d: "Vascular tissue on the cornea adds warm attenuation, haze and contrast loss.",
		s: 0.4,
	},
	{
		id: "corneal_scar",
		g: "cornea",
		name: "Corneal scarring",
		photo: "yes",
		d: "Grey-blue fibrous haze from long-term irritation such as dry eye. The cornea sits almost at the pupil, so the dog never sees it as patches or spots: it scatters light forward into a veil over the whole view, lowers contrast, softens detail and makes bright lights glare.",
		s: 0.4,
	},
	{
		id: "lipid_dystrophy",
		g: "cornea",
		name: "Corneal lipid deposits",
		photo: "yes",
		d: "White crystalline deposits. Too close to the pupil to be seen as points: they add a soft veil and glare.",
		s: 0.4,
	},
	{
		id: "glaucoma",
		g: "uvea",
		name: "Glaucoma",
		photo: "partly",
		d: "Pressure causes edema, halos and dimming. Nerve damage closes the field with arc-shaped gaps.",
		s: 0.4,
		extras: [
			{
				k: "damage",
				t: "num",
				label: "Nerve damage",
				min: 0,
				max: 1,
				step: 0.01,
				def: 0.4,
			},
		],
	},
	{
		id: "uveitis",
		g: "uvea",
		name: "Uveitis",
		photo: "partly",
		d: "Aqueous flare and inflammatory material scatter light at the pupil. A small pupil dims the view and floaters can drift across it.",
		s: 0.45,
	},
	{
		id: "hyphema",
		g: "uvea",
		name: "Hyphema",
		photo: "yes",
		d: "Blood in the chamber absorbs green and blue light and adds a red veil.",
		s: 0.4,
	},
	{
		id: "iris_atrophy",
		g: "uvea",
		name: "Iris atrophy",
		photo: "yes",
		d: "The pupil cannot close fully: glare, light sensitivity and faint ghosts.",
		s: 0.5,
	},
	{
		id: "nuclear_sclerosis",
		g: "lens",
		name: "Nuclear sclerosis",
		photo: "partly",
		d: "Normal ageing of the lens core. Small effects: slight blur, contrast loss and bloom, mild myopic shift. Owners see blue haze; the dog does not.",
		s: 0.6,
	},
	{
		id: "cataract",
		g: "lens",
		name: "Cataract",
		photo: "yes",
		d: "Lens opacity adds haze, glare and blur. A small pupil emphasizes central opacities, while a wide pupil exposes more cortical opacity.",
		s: 0.5,
		extras: [
			{
				k: "type",
				t: "sel",
				label: "Type",
				opts: [
					["cortical", "Cortical spokes"],
					["nuclear", "Nuclear"],
					["posterior_subcapsular", "Posterior subcapsular"],
					["diffuse", "Diffuse"],
				],
			},
			{ k: "hypermature", t: "bool", label: "Hypermature (crystals)" },
		],
	},
	{
		id: "lens_luxation",
		g: "lens",
		name: "Lens luxation",
		photo: "partly",
		d: "Displaced lens: a doubled ghost image that wobbles, plus blur.",
		s: 0.5,
	},
	{
		id: "asteroid_hyalosis",
		g: "retina",
		name: "Asteroid hyalosis",
		photo: "partly",
		d: "Small bright particles that swirl in the vitreous. Usually minimal effect.",
		s: 0.5,
	},
	{
		id: "pra",
		g: "retina",
		name: "Progressive retinal atrophy",
		photo: "no",
		d: "Night vision fails first, then the field closes to a tunnel, then blindness. Often a secondary cataract late.",
		s: 0.5,
	},
	{
		id: "sards",
		g: "retina",
		name: "SARDS",
		photo: "no",
		d: "Sudden acquired retinal degeneration: global loss of light and contrast within days.",
		s: 0.6,
	},
	{
		id: "cea",
		g: "retina",
		name: "Collie eye anomaly",
		photo: "no",
		d: "Usually silent; colobomas make small blind spots; severe cases detach.",
		s: 0.5,
	},
	{
		id: "retinal_detachment",
		g: "retina",
		name: "Retinal detachment",
		photo: "partly",
		d: "A curtain of lost field moving in from one side.",
		s: 0.4,
		extras: [
			{
				k: "dir_deg",
				t: "num",
				label: "Curtain from",
				min: 0,
				max: 359,
				step: 1,
				def: 90,
				unit: "°",
			},
		],
	},
	{
		id: "retinal_dysplasia",
		g: "retina",
		name: "Retinal dysplasia",
		photo: "no",
		d: "Retinal folds and geographic patches become streaky blind spots.",
		s: 0.5,
	},
	{
		id: "optic_neuritis",
		g: "retina",
		name: "Optic neuritis",
		photo: "no",
		d: "Central blind spot, faded colour and lower contrast (human analogue).",
		s: 0.5,
	},
	{
		id: "microphthalmia",
		g: "globe",
		name: "Microphthalmia (merle)",
		photo: "partly",
		d: "Small eye from double merle: blur, smaller field and coloboma gaps.",
		s: 0.5,
	},
]);
export const COND_BY_ID = Object.fromEntries(
	CONDS.map((c) => [c.id, c]),
) as Record<ConditionId, ConditionDefinition>;

export function freshConditions(): ConditionMap {
	return Object.fromEntries(
		CONDS.map((c) => {
			const x: ConditionState["x"] = {};
			for (const extra of c.extras ?? []) {
				x[extra.k] =
					extra.t === "bool"
						? false
						: extra.t === "sel"
							? extra.opts[0]![0]
							: extra.def;
			}
			return [c.id, { on: false, s: c.s, x }];
		}),
	) as ConditionMap;
}

export const VISION_DEFAULTS = {
	cpd: 8,
	chroma: 1,
	csf: 0.03,
	periph: 3,
	nightGain: 2.5,
	lower: 0.18,
	noise: 0.5,
	veil: 0.05,
	salience: 0.2,
	rodTau: 100,
	ageLens: 0.5,
	hdr: 4,
};

export function catStage(s: number, hyper: unknown) {
	if (hyper) return "hypermature";
	return s < 0.15 ? "incipient" : s < 0.85 ? "immature" : "mature";
}
export function skullOf(ci: number): SkullType {
	return ci >= 80
		? "brachycephalic"
		: ci <= 52
			? "dolichocephalic"
			: "mesocephalic";
}

// Stage ids in the order the catalog's S3 table lists them
export const STAGES: readonly {
	n: number;
	name: string;
	fixed?: boolean;
	tip: string;
}[] = [
	{ n: 0, name: "Decode", fixed: true, tip: "sRGB to linear light" },
	{ n: 1, name: "Geometry", tip: "Muzzle silhouette and field zones" },
	{ n: 2, name: "Lids", tip: "Squint, ptosis, third eyelid, blinks" },
	{
		n: 3,
		name: "Tear film & cornea",
		tip: "Tear break-up, pigment, pannus, edema, ulcers",
	},
	{
		n: 4,
		name: "Chamber & iris",
		tip: "Pupil size and glare, hyphema, uveitis",
	},
	{ n: 5, name: "Lens", tip: "Nuclear sclerosis, cataract, luxation" },
	{ n: 6, name: "Optics", tip: "Base acuity, defocus, puppy development" },
	{ n: 7, name: "Colour", tip: "Dichromat matrix and rod mixing" },
	{
		n: 8,
		name: "Retinal acuity",
		tip: "Visual streak or area centralis, contrast sensitivity",
	},
	{ n: 9, name: "Field loss", tip: "Tunnel vision, scotomas, curtains" },
	{
		n: 10,
		name: "Gain, glare, noise",
		tip: "Night gain, tapetum, veiling glare, bloom, noise",
	},
	{
		n: 11,
		name: "Temporal",
		tip: "Rod integration, motion salience, blinks, particles",
	},
	{ n: 12, name: "Encode", fixed: true, tip: "Linear to sRGB" },
];

export function panoramaField(
	hfov: number,
	width: number,
	height: number,
): Vec2 {
	return [hfov, clamp((hfov * height) / width, 70, 140)];
}

export function defocusErrorD(
	invDist: number,
	focusInvDist: number,
	refr: number,
	maxAccommodation: number,
) {
	return Math.abs(
		invDist + refr - clamp(focusInvDist + refr, 0, maxAccommodation),
	);
}

// Compile state -> {derived, hyp, shader (schema §8 part 3), U (uniforms), anim}
export function compile(
	state: AppState,
	eye = state.profile.eye,
	adaptedLogL = state.scene.logL,
) {
	const P = state.profile,
		V = state.vision,
		S = state.scene,
		on = state.stages;
	const br = BREEDS[P.breed] || BREEDS.mixed;
	const age = P.age_years,
		L = P.lifespan_years,
		a = age / L;
	const s = clamp((80 - P.ci) / 30, 0, 1);
	const brachy = P.ci >= 80;
	const F = lerp(200, 270, s),
		B = lerp(60, 30, s),
		noseW = lerp(3, 22, s);
	const topoH = lerp(15, 45, s),
		topoV = lerp(15, 10, s);
	const tw = age * 52,
		closed = tw < 2;
	const dev = closed ? 0 : smooth(2, 7, tw) * smooth(4, 14, tw);
	const NS = smooth(0.45, 0.85, a) * V.ageLens;
	const catAge = clamp(sigmoid((a - 0.75) / 0.12) * br.cat, 0, 1) * V.ageLens;
	const accommodationReserve = 1 - smooth(0.4, 0.9, a);
	const Amax = 2.5 * accommodationReserve + 0.5;
	const agePast = Math.max(0, ((age - 0.35 * L) * 12.5) / L);
	const Rp = clamp(1 - 0.028 * agePast, 0.2, 1),
		Rs = clamp(1 - 0.035 * agePast, 0.1, 1);
	const fc = lerp(75, 58, smooth(0.5, 1.0, a));
	const coat = P.coat;
	const { iris, refraction_D, refractionMeasured } = state.eyeOptics[eye];
	let pig = 1;
	if (coat === "merle_MM" || coat === "white") pig = 0.2;
	else if (coat === "merle_Mm" || iris === "blue") pig = 0.5;
	else if (coat === "dilute") pig = 0.8;
	const T = coat === "merle_MM" ? 0 : P.tapetum;
	const adaptDelta = S.logL - adaptedLogL;
	const m = 1 - smooth(-2, 1, Math.max(S.logL, adaptedLogL)); // mesopic weight, shifted ~0.5 log up from human (Coile 1989)

	// condition severities
	const C = state.eyes[eye];
	const sv = (id: ConditionId) => (C[id].on ? C[id].s : 0);
	const ex = <T extends ExtraValue>(
		id: ConditionId,
		key: string,
		fallback: T,
	): T => (C[id].x[key] ?? fallback) as T;
	const pra = sv("pra");
	let cat = sv("cataract");
	if (pra > 0.7) cat = Math.max(cat, (0.3 * (pra - 0.7)) / 0.3);
	const kcs = sv("kcs");
	let pk = sv("pigmentary_keratitis");
	if (kcs > 0 && ex("kcs", "chronic", false)) pk = Math.max(pk, 0.5 * kcs);
	const pkOrigin =
		sv("pigmentary_keratitis") > 0
			? ex<string>("pigmentary_keratitis", "origin", "medial")
			: "medial";
	const cea = sv("cea");
	let rd = sv("retinal_detachment");
	if (cea > 0.8) rd = Math.max(rd, ((cea - 0.8) / 0.2) * 0.6);
	const glS = sv("glaucoma"),
		glD = C.glaucoma && C.glaucoma.on ? ex("glaucoma", "damage", 0.4) : 0;
	const uve = sv("uveitis"),
		hyp = sv("hyphema"),
		ia = clamp(
			0.3 * smooth(0.6, 1.0, a) * V.ageLens + sv("iris_atrophy"),
			0,
			1,
		);
	const nsC = sv("nuclear_sclerosis"),
		lux = sv("lens_luxation"),
		edema = sv("corneal_edema"),
		ulcer = sv("corneal_ulcer");
	const scar = sv("corneal_scar");
	const pannus = sv("pannus"),
		lipid = sv("lipid_dystrophy"),
		horner = sv("horner"),
		cherry = sv("cherry_eye"),
		entro = sv("entropion");
	const sards = sv("sards"),
		neuritis = sv("optic_neuritis"),
		ast = sv("asteroid_hyalosis"),
		dys = sv("retinal_dysplasia"),
		micro = sv("microphthalmia");
	const NSall = Math.max(NS, nsC);

	// pupil (Mills 2022: max 6-11 mm), glare ∝ (d/dref)^2
	let dmin = 4.0,
		dmax = 9.0;
	dmin = dmin + 0.6 * ia * (dmax - dmin);
	dmin = lerp(dmin, dmax, Math.max(0.6 * glS, 0.5 * pra, 0.7 * sards));
	const pupil = lerp(dmin, dmax, m) * (1 - 0.4 * uve) * (1 - 0.35 * horner);
	const glarePupil = on[4] ? (pupil / 6.5) ** 2 : 1;
	const catType = ex<string>("cataract", "type", "cortical");
	const widePupil = on[4] ? smooth(3, 9, pupil) : 0.5;
	const catImpact =
		catType === "cortical"
			? lerp(0.65, 1.4, widePupil)
			: catType === "nuclear"
				? lerp(1.3, 0.75, widePupil)
				: catType === "posterior_subcapsular"
					? lerp(1.55, 0.65, widePupil)
					: 1;
	const catOptical = cat * lerp(catImpact, 1, smooth(0.7, 1, cat));

	// ---- blur buckets (degrees)
	const q = (x: number) => x * x;
	let corneaB2 = 0,
		lensB2 = 0,
		retinaB2 = 0;
	const pkAx = clamp((pk - 0.7) / 0.3, 0, 1);
	if (on[3]) {
		corneaB2 +=
			q(fracB(0.06) * pkAx * pkAx) +
			q(fracB(0.015) * edema) +
			q(fracB(0.015) * glS) +
			q(fracB(0.003) * lipid) +
			q(pannus > 0.6 ? (fracB(0.03) * (pannus - 0.6)) / 0.4 : 0) +
			q(fracB(0.006) * entro) +
			q(fracB(0.018) * ulcer);
	}
	if (on[5]) {
		// Nuclear sclerosis changes the lens index (a myopic shift, below) and yellows it; it barely blurs.
		// The age 'cataract risk' (catAge) is a population prior, not a finding, so it no longer blurs.
		const scatter = fracB(
			0.005 * Math.min(catOptical / 0.15, 1) + 0.035 * catOptical ** 1.5,
		);
		lensB2 += q(lerp(scatter, fracB(0.06), smooth(0.75, 0.96, cat)));
		lensB2 += q(fracB(0.01) * lux);
	}
	if (on[4]) lensB2 += q(fracB(0.01) * uve) + q(fracB(0.006) * hyp);
	// defocus: refraction, accommodation and object distance
	const nsOffset = 1.75 * lerp(0.07, 0.3, NSall) * smooth(0, 0.15, NSall);
	const refr = refractionMeasured ? refraction_D : refraction_D - nsOffset;
	const focusInvDist = 1 / Math.max(S.dist, 0.05);
	const err = defocusErrorD(focusInvDist, focusInvDist, refr, Amax);
	const defocusDeg = 0.25 * (pupil / 1000) * err * 57.2958;
	const scalarDefocusB2 = on[6] ? q(defocusDeg) : 0;
	const closedB2 = on[6] && closed ? q(10) : 0;
	if (on[9]) {
		retinaB2 +=
			q(pra > 0.6 ? (fracB(0.03) * (pra - 0.6)) / 0.4 : 0) +
			q(fracB(0.03) * micro);
	}
	const devMult = on[6] ? (closed ? 1 : 1 / Math.max(dev, 0.1)) : 1;
	const cpdEff = V.cpd * lerp(1, 0.36, m); // scotopic acuity ~2-3.5 cpd (Lind 2017)
	const acuDeg = on[6] ? 0.389 / cpdEff : 0;
	// Acuity penalties in logMAR, turned into extra blur in quadrature against the baseline:
	// optical/neural ageing ~0.1 logMAR at end of life; grade-2 stromal haze ~0.25 (post-PRK haze grading)
	const dLogMAR =
		(on[5] || on[8] ? 0.11 * smooth(0.4, 1.1, a) : 0) +
		(on[3] ? 0.15 * scar + 0.15 * lipid : 0); // haze mostly costs contrast, via straylight
	const ageAcuityB2 =
		dLogMAR > 0 && acuDeg > 0
			? q(acuDeg * Math.pow(10, dLogMAR)) - q(acuDeg)
			: 0;

	// ---- haze (additive, capped at 0.95)
	const hz: [number, Vec3][] = []; // [amount, rgb]
	if (on[3]) {
		hz.push([brachy ? 0.07 : 0, [1, 0.98, 0.95]]); // brachycephalic exposure keratopathy; ageing and dry eye act through straylight
		hz.push([0.55 * edema + 0.55 * glS, [0.86, 0.93, 1]]);
		hz.push([0.2 * pannus, [1, 0.85, 0.8]]);
	}
	if (on[4]) {
		hz.push([0.45 * uve, [1, 0.97, 0.9]]);
		hz.push([0.35 * hyp, [1, 0.55, 0.5]]);
	}
	let hAmt = 0;
	let hCol: Vec3 = [0, 0, 0];
	hz.forEach(([v, col]) => {
		if (v > 0) {
			hAmt += v;
			hCol = [hCol[0] + v * col[0], hCol[1] + v * col[1], hCol[2] + v * col[2]];
		}
	});
	hCol =
		hAmt > 0 ? [hCol[0] / hAmt, hCol[1] / hAmt, hCol[2] / hAmt] : [1, 1, 1];
	hAmt = Math.min(0.95, hAmt);

	const hyper = !!ex("cataract", "hypermature", false);
	const catH = on[5]
		? Math.min(
				0.95,
				0.05 * smooth(0, 0.15, catOptical) + 0.85 * catOptical ** 1.3,
			)
		: 0;
	const catC = on[5] ? Math.min(0.95, 0.9 * catOptical) : 0;

	// Pupil-weighted transmission applies equally to image-forming light and glare.
	const pigmentTrans =
		(1 - 0.8 * pkAx) *
		(1 - (pkOrigin === "diffuse" ? 0.3 : 0.45) * pk * (1 - pkAx));
	const antTrans: Vec3 = [1, 1, 1];
	if (on[3]) {
		antTrans[0] *= pigmentTrans * (1 - 0.25 * pannus);
		antTrans[1] *= pigmentTrans * (1 - 0.45 * pannus);
		antTrans[2] *= pigmentTrans * (1 - 0.5 * pannus);
	}
	if (on[4]) {
		const chamberTrans =
			(1 - 0.6 * glS) * (1 - 0.35 * horner) * (1 - 0.3 * uve);
		antTrans[0] *= chamberTrans * (1 - 0.3 * hyp);
		antTrans[1] *= chamberTrans * (1 - 0.78 * hyp);
		antTrans[2] *= chamberTrans * (1 - 0.85 * hyp);
	}

	// ---- contrast and luminance multipliers
	let contrast = 1,
		lum = 1,
		desat = 0;
	if (on[8]) contrast *= 1 - 0.15 * smooth(0.6, 1.0, a); // retinal/neural ageing (aged beagles: raised contrast thresholds)
	if (on[3]) {
		contrast *=
			(1 - 0.9 * pkAx) *
			(1 - 0.3 * pannus) *
			(1 - 0.3 * edema) *
			(1 - 0.25 * glS);
	}
	if (on[4]) {
		contrast *= (1 - 0.35 * uve) * (1 - 0.35 * hyp);
		desat += 0.2 * uve;
	}
	if (on[6]) contrast *= 0.3 + 0.7 * (closed ? 0 : dev);
	if (on[9]) {
		contrast *=
			(1 - 0.7 * glD) *
			(1 - (pra > 0.6 ? (0.6 * (pra - 0.6)) / 0.4 : 0)) *
			(1 - sards) *
			(1 - 0.5 * neuritis);
		lum *=
			(sards >= 0.99 ? 0 : 1 - 0.97 * sards) *
			(1 - 0.3 * neuritis) *
			(1 - 0.3 * micro) *
			(1 - smooth(0.75, 1.0, pra)) *
			(glD > 0.97 ? 0.05 : 1);
		desat += 0.4 * glD + 0.6 * neuritis;
	}
	const sN = clamp(pra * 2.5, 0, 1); // PRA: night loss saturates early
	if (on[9]) desat += 0.5 * sN * m;
	desat = clamp(desat, 0, 1);

	// ---- glare terms (multiply: pigment × lens × pupil × brachycephalic)
	// Straylight, CIE glare spread function: L_veil/E = s/theta^2. log(s) ~0.9 young, +0.13 per human-decade after ~40
	// (a dog at age/lifespan a ~ a human of 75a years). Scattered fraction eta = 1 - exp(-0.0086 s).
	const humanYears = 75 * a;
	let logS = 0.9 + 0.013 * Math.max(0, humanYears - 40);
	if (on[5]) logS += 0.6 * catOptical; // nuclear sclerosis scatter is already in the age term
	if (on[3])
		logS +=
			0.7 * scar +
			0.4 * lipid +
			0.3 * edema +
			0.2 * pannus +
			0.4 * ulcer +
			0.12 * pk;
	if (on[4]) logS += 0.25 * hyp + 0.3 * uve;
	logS += Math.log10((1 + 2 * (1 - pig)) * (brachy ? 1.2 : 1));
	const glareMult = (1 + 2 * (1 - pig)) * glarePupil * (brachy ? 1.2 : 1);
	const pupilBloom = Math.sqrt(glarePupil);
	const centralCat =
		catType === "nuclear" || catType === "posterior_subcapsular";
	const lensBloom = on[5]
		? (0.2 * smooth(0, 0.15, catOptical) + 1.5 * catOptical) *
			(centralCat ? 1 : pupilBloom)
		: 0;
	const otherBloom =
		(on[3] ? 0.4 * edema + 0.5 * glS : 0) +
		(on[4] ? ia : 0) +
		(on[9] ? 0.4 * pra : 0);
	const bloom = on[10]
		? Math.min(
				3,
				(lensBloom + otherBloom * pupilBloom) *
					(1 + 2 * (1 - pig)) *
					(brachy ? 1.2 : 1),
			)
		: 0;
	const bloomDeg = on[5] && cat > 0 ? lerp(frac(0.03), frac(0.15), cat) : 4;
	const halo = on[3] ? Math.min(2, 0.8 * edema + 0.8 * glS) : 0;
	const sStray = Math.pow(10, logS) * (V.veil / 0.05);
	const veil = on[10] ? clamp(1 - Math.exp(-0.0086 * sStray), 0, 0.9) : 0;

	// ---- ghost
	let ghost: Vec4 = [0, 0, 0, 0];
	if (on[5] && lux > 0)
		ghost = [0.4 * lux, 1.5 + 2.5 * lux, -(0.8 + 1.2 * lux), 0.6];
	else if (on[4] && ia > 0.2) ghost = [0.1 * ia, 1.0, -0.4, 0.4];

	// ---- apertures (lids)
	const bright = 0.4 + 0.6 * (1 - m);
	const sq =
		Math.max(
			kcs * ex("kcs", "squint", 0),
			0.5 * ulcer,
			0.35 * uve,
			0.3 * entro,
			0.3 * glS,
			0.25 * ia * (1 - m),
		) * bright;
	let lidTop = 0,
		lidBot = 0,
		third = 0;
	let thirdTint: Vec3 = [0.95, 0.7, 0.7];
	if (on[2]) {
		lidTop = sq * 0.55 + 0.3 * horner;
		lidBot = sq * 0.45;
		third = Math.max(0.35 * horner, cherry > 0 ? 0.18 + 0.25 * cherry : 0);
		if (cherry > 0 && 0.18 + 0.25 * cherry >= 0.35 * horner)
			thirdTint = [0.95, 0.42, 0.42];
		if (micro > 0) third = Math.max(third, 0.25 * micro);
	}

	// ---- field masks
	let tunnel = 180,
		tsoft = 10;
	if (on[9]) {
		if (pra > 0) {
			const th = Math.max(6, 120 * (1 - smooth(0.25, 0.9, pra)));
			if (th < tunnel) {
				tunnel = th;
				tsoft = lerp(15, 5, pra);
			}
		}
		if (glD > 0) {
			const th = 65 * (1 - 0.9 * glD);
			if (th < tunnel) {
				tunnel = th;
				tsoft = 10;
			}
		}
		if (micro > 0) {
			const th = lerp(120, 30, micro);
			if (th < tunnel) {
				tunnel = th;
				tsoft = 12;
			}
		}
	}
	const scot: Vec4[] = [];
	if (on[9]) {
		if (cea > 0) {
			scot.push([14, -2, 2 + 5 * cea, 0.5 + 0.5 * cea]);
			if (cea > 0.4) scot.push([20, -8, 1.5 + 3 * cea, 0.7]);
		}
		if (neuritis > 0)
			scot.push([0, 0, 1.5 + 10 * neuritis, 0.35 + 0.6 * neuritis]);
		if (micro > 0.25) scot.push([0, -16, 3 + 8 * micro, 0.8]);
		if (dys > 0.3) scot.push([-8, 6, 2 + 4 * dys, 0.7]);
	}
	const arc = on[9] && glD > 0.2 ? (glD - 0.2) / 0.8 : 0;
	const streak = on[9] ? dys * 0.9 : 0;
	const rdDir = (ex("retinal_detachment", "dir_deg", 90) * Math.PI) / 180;
	const curtain: Vec4 =
		on[9] && rd > 0
			? [Math.cos(rdDir), Math.sin(rdDir), lerp(90, -90, rd), 6]
			: [0, 0, 0, 0];
	const resid =
		on[9] && sards >= 0.99
			? 0
			: sards > 0.9 || glD > 0.97 || pra > 0.98
				? 0.03
				: 0.06;

	// ---- tear film
	const kcsOn = on[3] && kcs > 0;

	// ---- gain: human brightness at this light level, dog advantage from rods + tapetum, minus retinal ageing and disease
	const humanB = 0.06 + 0.94 * smooth(-3.5, 1.2, S.logL);
	const ng = V.nightGain * (on[9] ? 1 - sN : 1);
	const night = on[10] ? lerp(1, Math.max(ng * (0.6 + 0.4 * T) * Rs, 0), m) : 1;
	const ret = on[10] ? lerp(Rp, 1, m) : 1;
	const ev = on[4] ? (0.7 * ia + 0.5 * uve + 0.4 * (1 - pig)) * (1 - m) : 0;
	let gain = Math.min(1, humanB * night) * ret * lum * 2 ** ev;
	if (adaptDelta < 0) gain *= 10 ** clamp(0.45 * adaptDelta, -1.6, 0);
	if (adaptDelta > 0) gain *= Math.min(2.5, 10 ** (0.35 * adaptDelta));
	if (closed && on[6]) gain *= 0.12;
	const tint: Vec3 = [1, 1, 1];
	// Lens yellowing: the visual system renormalises to its own lens (Delahunt et al. 2004), so whites stay white;
	// what remains is a little less blue-yellow contrast.
	const yellow = on[5] ? (1 - 0.15 * NS) * (1 - 0.1 * nsC) : 1;
	if (closed && on[6]) {
		tint[0] *= 1;
		tint[1] *= 0.35;
		tint[2] *= 0.3;
	}
	const noise = on[10]
		? V.noise * Math.pow(m, 1.2) * 0.12 + (on[9] ? 0.1 * sN * m : 0)
		: 0;
	const lower = on[10] ? V.lower * T * m : 0;

	// ---- colour
	const k = V.chroma;
	const dm: Mat3 = on[7]
		? dogMatrix(k * yellow)
		: [
				[1, 0, 0],
				[0, 1, 0],
				[0, 0, 1],
			];
	const rowL: Vec3 = on[7] ? L_DOG : [0.2126, 0.7152, 0.0722];
	const mU = on[7] ? m : 0;

	// particles
	let part: Vec2 = [0, 0];
	if (on[11]) {
		if (ast > 0) part = [0.15 + 0.5 * ast, 0];
		else if (uve > 0.2) part = [0.08 + 0.3 * uve, 1];
	}
	const sparkle = on[5] && cat > 0 && hyper ? 0.5 + 0.5 * cat : 0;

	const blurG = Math.sqrt(
		corneaB2 + lensB2 + (scalarDefocusB2 + closedB2 + ageAcuityB2) + retinaB2,
	);
	const csf = on[8] ? V.csf * (1 + 1.5 * m) : 0;

	const anim =
		kcsOn ||
		(on[5] && lux > 0) ||
		part[0] > 0 ||
		noise > 0.004 ||
		sparkle > 0 ||
		!!S.flicker;

	const U = {
		uAcu: acuDeg,
		uPeri: on[8] ? V.periph : 0,
		uTopo: [topoH, topoV],
		uBlurG: blurG,
		uDev: devMult,
		uAntTrans: antTrans,
		uHaze: [...hCol, hAmt],
		uCat: [catH, catC] as Vec2,
		uCatTint: catType === "nuclear" ? [1.0, 0.96, 0.88] : [1, 0.99, 0.96],
		uSparkle: sparkle,
		uContrast: contrast,
		uLocalDeg: 3,
		uVeil: veil,
		uBloom: bloom,
		uBloomDeg: bloomDeg,
		uHalo: [halo, frac(0.06), frac(0.01), 1],
		uGhost: ghost,
		uTint: tint,
		uDog: dm,
		uRowL: rowL,
		uRod: ROD,
		uM: mU,
		uDesat: desat,
		uCsf: csf,
		uTunnel: [tunnel, tsoft] as Vec2,
		uScot: scot,
		uArc: arc,
		uStreak: streak,
		uCurtain: curtain,
		uResid: resid,
		uLid: [lidTop, lidBot, 0, 0] as Vec4,
		uThird: 65 * third,
		uThirdTint: thirdTint,
		uNose: [noseW, on[1] && S.nose ? 1 : 0],
		uGain: gain,
		uLower: lower,
		uNoise: noise,
		uPart: [part[0], part[1], 0],
		uZone: [B / 2, F / 2],
	};
	const kcsState = kcsOn
		? {
				s: kcs,
				tbu: ex("kcs", "tbu", 20 * (1 - kcs) + kcs),
				interval: ex("kcs", "blink", 6),
				mucus: ex("kcs", "mucus", 0),
				eta: veil,
			}
		: null;

	const derived = {
		straylight_log_s: +logS.toFixed(2),
		straylight_eta: +veil.toFixed(2),
		a: +a.toFixed(3),
		streak_strength: +s.toFixed(2),
		skull: skullOf(P.ci),
		field_total_deg: Math.round(F),
		binocular_overlap_deg: Math.round(B),
		nose_mask_width_deg: +noseW.toFixed(1),
		refraction_D: +refr.toFixed(2),
		accommodation_max_D: +Amax.toFixed(2),
		nuclear_sclerosis: +NS.toFixed(2),
		age_lens_opacity: +catAge.toFixed(2),
		retina_gain_photopic: +Rp.toFixed(2),
		retina_gain_scotopic: +Rs.toFixed(2),
		pigment: pig,
		tapetum: T,
		glare_multiplier: +glareMult.toFixed(2),
		pupil_mm: +pupil.toFixed(1),
		temporal_cutoff_Hz: Math.round(fc),
		development: closed ? "eyes closed" : +dev.toFixed(2),
		mesopic_rod_weight: +m.toFixed(2),
		acuity_cpd_centre: +(
			0.389 / Math.max(Math.sqrt(q(acuDeg) + q(blurG)) * devMult, 1e-4)
		).toFixed(1),
		defocus_D: +err.toFixed(2),
	};

	// Shader parameters in the shape of Part III §8 (3). Fractions are of a 120° reference image.
	const shader = {
		reference_fov_deg: { blur: REF_BLUR, geometry: REF_FOV },
		baseline: {
			dichromat: !!on[7],
			chroma_k: k,
			acuity_sigma_frac: +(acuDeg / REF_BLUR).toFixed(5),
			night_gain: +V.nightGain.toFixed(2),
		},
		field_mask: {
			tunnel_r_in: +Math.min(1, tunnel / REF_FOV).toFixed(3),
			edge_soft: +(tsoft / REF_FOV).toFixed(3),
			scotomas: scot.map(([x, y, r, d]) => ({
				x: +(x / REF_FOV).toFixed(3),
				y: +(y / REF_FOV).toFixed(3),
				radius: +(r / REF_FOV).toFixed(3),
				depth: +d.toFixed(2),
				shape: "disc",
			})),
			arcuate: +arc.toFixed(2),
			streaks: +streak.toFixed(2),
			curtain:
				rd > 0
					? {
							dir_deg: ex("retinal_detachment", "dir_deg", 90),
							fraction: +rd.toFixed(2),
						}
					: null,
		},
		night: {
			gain_mult: +(ng / V.nightGain || 0).toFixed(2),
			noise_sigma: +noise.toFixed(3),
			desat: +(0.5 * sN * m).toFixed(2),
		},
		global: {
			lum_mult: +lum.toFixed(3),
			contrast_mult: +contrast.toFixed(3),
			saturation_mult: +(1 - desat).toFixed(2),
			tint_rgb: tint.map((v) => +v.toFixed(3)),
		},
		haze: {
			amount: +hAmt.toFixed(3),
			color: hCol.map((v) => +v.toFixed(3)),
			cataract:
				catH > 0
					? {
							amount: +catH.toFixed(3),
							contrast_loss: +catC.toFixed(2),
							type: catType,
						}
					: null,
		},
		blur: {
			sigma_frac: +(blurG / REF_BLUR).toFixed(4),
			spatial_mask: "topography",
			topography: {
				sigma_h_deg: +topoH.toFixed(1),
				sigma_v_deg: +topoV.toFixed(1),
				peripheral_gain: on[8] ? V.periph : 0,
			},
			defocus_D: +err.toFixed(2),
		},
		bloom: {
			intensity: +bloom.toFixed(2),
			radius_frac: +(bloomDeg / REF_FOV).toFixed(3),
			threshold: 0.8,
			veiling: +veil.toFixed(3),
		},
		halos: {
			intensity: +halo.toFixed(2),
			radius_frac: 0.06,
			width_frac: 0.01,
			chromatic: true,
		},
		anterior_transmission_rgb: antTrans.map((v) => +v.toFixed(3)),

		ghost: {
			alpha: +ghost[0].toFixed(2),
			offset_frac: [
				+(ghost[1] / REF_FOV).toFixed(3),
				+(ghost[2] / REF_FOV).toFixed(3),
			],
			blur_frac: +(ghost[3] / REF_BLUR).toFixed(4),
			wobble_hz: lux > 0 ? 3 : 0,
		},
		tear_film: kcsState
			? {
					enabled: true,
					breakup_time_s: +kcsState.tbu.toFixed(1),
					blink_interval_s: kcsState.interval,
					added_straylight_eta: +(0.08 * kcs).toFixed(3),
					blur_scale_max: +(1 + 0.6 * kcs).toFixed(2),
					mucus_alpha: +(0.7 * kcsState.mucus * kcs).toFixed(2),
				}
			: { enabled: false },
		aperture: {
			top: +lidTop.toFixed(2),
			bottom: +lidBot.toFixed(2),
			nasal_inferior: +third.toFixed(2),
			bright_squint: +sq.toFixed(2),
		},
		particles: {
			count: Math.round(part[0] * 200),
			kind: part[0] > 0 ? (part[1] > 0.5 ? "floater" : "asteroid") : null,
			settle_s: 2.0,
		},
		photophobia: { exposure_ev_bright: +ev.toFixed(2) },
	};
	return {
		derived,
		shader,
		U,
		anim,
		kcsState,
		depthOptics: {
			focusInvDist,
			refr,
			maxAccommodation: 2 * accommodationReserve + 0.5,
			pupilMm: pupil,
			blurWithoutDefocus: Math.sqrt(
				corneaB2 + lensB2 + (closedB2 + ageAcuityB2) + retinaB2,
			),
		},
		lux: on[5] ? lux : 0,
		m,
		cpdEff,
		rodTau: V.rodTau,
		fc,
	};
}

export function opticalPenalty({ U }: ReturnType<typeof compile>) {
	const blur = (Math.hypot(U.uAcu, U.uBlurG) * U.uDev) / Math.max(U.uAcu, 1e-4);
	const field = Math.min(1, U.uTunnel[0] / 90);
	const curtain = U.uCurtain[3] > 0 ? smooth(-90, 90, U.uCurtain[2]) : 1;
	const transmission =
		(((1 - U.uVeil) *
			U.uContrast *
			(1 - U.uCat[1]) *
			U.uGain *
			(U.uAntTrans[0] + U.uAntTrans[1] + U.uAntTrans[2])) /
			3) *
		field *
		curtain;
	return Math.log1p(blur) - Math.log(Math.max(transmission, 1e-8));
}

export function profileJSON(state: AppState, comp: ReturnType<typeof compile>) {
	const P = state.profile;
	const hypotheses = condHypotheses(state);
	const optics = state.eyeOptics[P.eye];
	return {
		profile: {
			skull: skullOf(P.ci),
			cephalic_index: P.ci,
			breed: P.breed,
			coat: P.coat,
			iris: { OS: state.eyeOptics.OS.iris, OD: state.eyeOptics.OD.iris },
			eye: P.eye,
			age_years: +P.age_years.toFixed(2),
			lifespan_years: P.lifespan_years,
			refraction_D: optics.refraction_D,
			refractionMeasured: optics.refractionMeasured,
			tapetum: P.tapetum,
			conditions: hypotheses.conditions,
		},
		...("eyes" in hypotheses
			? { eyes: hypotheses.eyes, binocular: hypotheses.binocular }
			: {}),
		eyeOptics: state.eyeOptics,
		derived: comp.derived,
	};
}

function hypothesesFor(map: ConditionMap) {
	const out: Partial<Record<ConditionId, ConditionHypothesis>> = {};
	for (const { id } of CONDS) {
		const st = map[id];
		if (!st.on) continue;
		const x = st.x;
		const o: ConditionHypothesis = {
			s: +st.s.toFixed(2),
			source: st.source ?? "manual",
		};
		if (id === "cataract") {
			o.stage = catStage(st.s, x.hypermature);
			o.type = String(x.type);
		}
		if (id === "glaucoma") {
			o.damage = +Number(x.damage).toFixed(2);
			o.acute = st.s > 0.5;
		}
		if (id === "pigmentary_keratitis") {
			o.origin = String(x.origin);
			o.maini_score_est = +(st.s * 14).toFixed(1);
		}
		if (id === "kcs") {
			o.chronic = !!x.chronic;
			o.tear_breakup_s = Number(x.tbu);
			o.blink_interval_s = Number(x.blink);
			o.mucus = Number(x.mucus);
			o.squint = Number(x.squint);
		}
		if (id === "retinal_detachment") o.dir_deg = Number(x.dir_deg);
		out[id] = o;
	}
	return out;
}
export function condHypotheses(state: AppState) {
	const basic = {
		conditions: hypothesesFor(state.eyes[state.profile.eye]),
		disclaimer:
			"Not a veterinary diagnosis. Retinal disease, glaucoma (IOP) and tear production cannot be measured from a photo.",
	};
	if (!state.binoc.on) return basic;
	return {
		...basic,
		eye: state.profile.eye,
		eyes: {
			OS: hypothesesFor(state.eyes.OS),
			OD: hypothesesFor(state.eyes.OD),
		},
		binocular: { enabled: state.binoc.on, dominance: state.binoc.dom },
	};
}

// Detector output (schema 0.1) -> condition hypotheses. s = p * severity unless stated.
export function mapDetector(det: DetectorOutput) {
	const usable = det.image_quality?.usable !== false;
	const f = usable ? det.findings : {},
		md = det.metadata_optional ?? {};
	const conds: Partial<Record<ConditionId, ConditionHypothesis>> = {};
	const notes: string[] = [];
	if (!usable)
		notes.push(
			"Photo marked unusable: visual findings skipped; metadata and history still applied.",
		);
	const ps = (o: Finding | undefined, d = 0.5) =>
		o ? clamp((o.p ?? 0) * (o.severity ?? d), 0, 1) : 0;
	const put = (
		id: ConditionId,
		s: number,
		extra: Partial<ConditionHypothesis> = {},
	) => {
		if (s > 0.02)
			conds[id] = Object.assign({ s: +s.toFixed(2), source: "photo" }, extra);
	};
	if (f.lens_opacity) {
		const pat = f.lens_opacity.pattern ?? "";
		put("cataract", ps(f.lens_opacity), {
			type: [
				"cortical",
				"nuclear",
				"diffuse",
				"posterior_subcapsular",
			].includes(pat)
				? pat
				: "cortical",
		});
	}
	put("nuclear_sclerosis", ps(f.nuclear_haze_reflex_passes, 0.3));
	const crescent = f.aphakic_crescent?.p ?? 0;
	if (crescent > 0.5) put("lens_luxation", 0.6 * crescent);
	if (f.corneal_pigment) {
		const cp = f.corneal_pigment;
		const score =
			(cp.clock_hours || 0) + (cp.crosses_pupil ? 2 : cp.reaches_pupil ? 1 : 0);
		put("pigmentary_keratitis", (cp.p ?? 1) * clamp(score / 14, 0, 1), {
			origin: cp.origin || "medial",
			maini_score_est: +score.toFixed(1),
		});
	}
	put("corneal_edema", ps(f.corneal_edema));
	put("pannus", ps(f.corneal_vascularization));
	put("lipid_dystrophy", ps(f.corneal_white_crystalline));
	if (f.corneal_ulcer_visible) {
		const dmap: Record<string, number> = {
			superficial: 0.3,
			deep: 0.6,
			descemetocele: 0.85,
		};
		put(
			"corneal_ulcer",
			(f.corneal_ulcer_visible.p ?? 0) *
				(dmap[f.corneal_ulcer_visible.depth ?? ""] || 0),
		);
	}
	const photoKcs = Math.max(
		ps(f.tear_film_irregular),
		0.8 * ps(f.mucoid_discharge),
	);
	const stt = md.STT_mm_per_min;
	const sttKcs = stt === undefined ? 0 : clamp((15 - stt) / 15, 0, 1);
	const kcs = Math.max(photoKcs, sttKcs);
	if (stt !== undefined && stt >= 15 && photoKcs > 0.02)
		notes.push(
			"Normal STT measured; photo signs of tear-film instability still applied.",
		);
	if (kcs > 0.02)
		conds.kcs = {
			s: +kcs.toFixed(2),
			chronic:
				(f.corneal_pigment?.p || 0) > 0.5 ||
				(f.corneal_vascularization?.p || 0) > 0.5,
			source: sttKcs >= photoKcs ? "metadata:STT=" + stt : "photo",
		};
	if (f.hypopyon_or_hyphema) {
		const h = f.hypopyon_or_hyphema;
		if (h.type === "hyphema")
			put(
				"hyphema",
				(h.p ?? 0) *
					(h.fill_fraction != null ? clamp(h.fill_fraction * 2, 0, 1) : 0.5),
			);
		if (h.type === "hypopyon") put("uveitis", (h.p ?? 0) * 0.7);
	}
	if (
		f.conjunctival_hyperemia &&
		f.conjunctival_hyperemia.pattern === "ciliary_flush" &&
		(f.pupil?.diameter_rel ?? 1) < 0.4
	)
		put(
			"uveitis",
			Math.max(conds.uveitis?.s || 0, ps(f.conjunctival_hyperemia)),
		);
	if (f.iris_atrophy) put("iris_atrophy", (f.iris_atrophy.p ?? 0) * 0.7);
	put("cherry_eye", (f.third_eyelid_gland_prolapse?.p || 0) * 0.7);
	const hornerP = Math.min(f.ptosis?.p || 0, f.third_eyelid_protrusion?.p || 0);
	put("horner", hornerP * 0.7);
	if (f.entropion) put("entropion", (f.entropion.p ?? 0) * 0.6);
	put("microphthalmia", (f.microphthalmia_coloboma?.p || 0) * 0.6);
	let glS = 0,
		glD = 0;
	if (typeof md.IOP_mmHg === "number") {
		glS = clamp((md.IOP_mmHg - 20) / 40, 0, 1);
	} else if (
		f.conjunctival_hyperemia?.pattern === "episcleral" &&
		(f.pupil?.diameter_rel || 0) > 0.8 &&
		(f.corneal_edema?.p || 0) > 0.5
	) {
		glS = 0.5;
		notes.push("Possible glaucoma signs: pressure needs tonometry.");
	}
	if ((f.globe_enlarged?.p || 0) > 0.5) {
		glD = Math.max(glD, 0.7);
		glS = Math.max(glS, 0.3);
	}
	if (glS > 0 || glD > 0)
		conds.glaucoma = {
			s: +glS.toFixed(2),
			damage: +glD.toFixed(2),
			acute: glS > 0.5,
			source: typeof md.IOP_mmHg === "number" ? "metadata:IOP" : "photo",
		};
	// vet-entered diagnoses for what a photo cannot see
	const dx = (md.vet_diagnoses || []).map((s) => String(s).toLowerCase());
	const dxMap: Record<string, ConditionId> = {
		pra: "pra",
		"prcd-pra": "pra",
		sards: "sards",
		cea: "cea",
		"collie eye anomaly": "cea",
		kcs: "kcs",
		"dry eye": "kcs",
		glaucoma: "glaucoma",
		"optic neuritis": "optic_neuritis",
		"retinal dysplasia": "retinal_dysplasia",
		"retinal detachment": "retinal_detachment",
	};
	dx.forEach((d) => {
		const id = Object.hasOwn(dxMap, d) ? dxMap[d] : undefined;
		if (id && !conds[id]) conds[id] = { s: 0.5, source: "metadata:vet" };
	});
	if (
		md.PRA_genotype &&
		!conds.pra &&
		!/\b(?:(?:un|non)[-\s]?affected|not\s+affected|clear|normal|carrier)\b/i.test(
			md.PRA_genotype,
		) &&
		/\b(?:affected|homozygous|at[-\s]?risk)\b/i.test(md.PRA_genotype)
	)
		conds.pra = { s: 0.3, source: "metadata:genotype" };
	if (md.sudden_blindness && !conds.sards)
		notes.push("Sudden blindness reported: see a vet urgently.");
	const urgent = [...(det.urgent_flags || [])];
	if (
		(f.conjunctival_hyperemia?.p || 0) > 0.5 &&
		(f.corneal_edema?.p || 0) > 0.5 &&
		(f.pupil?.diameter_rel || 0) > 0.8
	)
		urgent.push("red_eye+cloudy_cornea+dilated_pupil");
	if (
		f.corneal_ulcer_visible?.depth === "descemetocele" &&
		(f.corneal_ulcer_visible?.p || 0) > 0.5
	)
		urgent.push("possible_descemetocele");
	if (typeof md.IOP_mmHg === "number" && md.IOP_mmHg >= 30)
		urgent.push("elevated_iop");
	if (
		f.corneal_ulcer_visible?.depth === "deep" &&
		(f.corneal_ulcer_visible.p ?? 0) > 0.5
	)
		urgent.push("deep_corneal_ulcer");
	if (
		f.hypopyon_or_hyphema?.type === "hyphema" &&
		(f.hypopyon_or_hyphema.p ?? 0) > 0.5
	)
		urgent.push("hyphema");
	if (crescent > 0.5) urgent.push("possible_lens_luxation");
	if (md.sudden_blindness) urgent.push("sudden_blindness");
	return { conditions: conds, urgent, notes, metadata: md };
}

export const EXAMPLE_DETECTOR = {
	schema_version: "0.1",
	eye: "OD",
	image_quality: {
		usable: true,
		focus: 0.82,
		glare_fraction: 0.04,
		pupil_visible: true,
		flash_retroillumination: true,
		both_eyes_in_frame: false,
	},
	findings: {
		lens_opacity: {
			p: 0.9,
			severity: 0.6,
			pattern: "cortical",
			tapetal_reflex_blocked_fraction: 0.55,
		},
		nuclear_haze_reflex_passes: { p: 0.2, severity: 0.3 },
		aphakic_crescent: { p: 0.0, direction_deg: null },
		corneal_pigment: {
			p: 0.8,
			clock_hours: 4.5,
			reaches_pupil: false,
			crosses_pupil: false,
			origin: "medial",
		},
		corneal_edema: { p: 0.1, severity: 0.0, region: "diffuse" },
		corneal_vascularization: { p: 0.3, severity: 0.2, origin: "temporal" },
		corneal_white_crystalline: { p: 0.0, severity: 0.0 },
		corneal_ulcer_visible: { p: 0.05, depth: "none" },
		tear_film_irregular: { p: 0.4, severity: 0.4 },
		mucoid_discharge: { p: 0.6, severity: 0.5 },
		conjunctival_hyperemia: { p: 0.5, severity: 0.4, pattern: "superficial" },
		pupil: { diameter_rel: 0.7, anisocoria: false, shape_irregular: false },
		globe_enlarged: { p: 0.0 },
		hypopyon_or_hyphema: { p: 0.0, type: "none", fill_fraction: 0.0 },
		iris_cyst: { p: 0.0, count: 0 },
		iris_atrophy: { p: 0.1 },
		ppm_strands: { p: 0.0 },
		third_eyelid_gland_prolapse: { p: 0.0 },
		third_eyelid_protrusion: { p: 0.0 },
		ptosis: { p: 0.0 },
		entropion: { p: 0.3, location: "medial_lower" },
		ectropion: { p: 0.0 },
		tear_staining: { p: 0.7, severity: 0.6 },
		eyelid_mass: { p: 0.0 },
		microphthalmia_coloboma: { p: 0.0 },
		tapetal_reflex_hyperreflective: { p: 0.1 },
	},
	metadata_optional: {
		age_years: 9,
		breed: "pug",
		diabetic: false,
		night_blindness_reported: false,
		sudden_blindness: false,
		vet_diagnoses: ["KCS"],
		STT_mm_per_min: 8,
		IOP_mmHg: null,
		PRA_genotype: null,
	},
	urgent_flags: [],
};

function object(value: unknown, field: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error(`Expected an object for "${field}".`);
	return value as Record<string, unknown>;
}

function number(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isFinite(value))
		throw new Error(`Expected a finite number for "${field}".`);
	return value;
}

function choice<T extends string>(
	value: unknown,
	options: readonly T[],
	field: string,
): T {
	const match = options.find((option) => option === value);
	if (match === undefined) throw new Error(`Invalid "${field}".`);
	return match;
}

function flag(value: unknown, field: string): boolean {
	if (typeof value !== "boolean")
		throw new Error(`Expected a boolean for "${field}".`);
	return value;
}

function strings(value: unknown, field: string): string[] {
	if (
		!Array.isArray(value) ||
		!value.every((item) => typeof item === "string")
	) {
		throw new Error(`Expected a list of strings for "${field}".`);
	}
	return value;
}

const exportKeys: Readonly<Record<string, string>> = {
	tbu: "tear_breakup_s",
	blink: "blink_interval_s",
};

function importConditions(input: unknown, unknown: string[]): ConditionMap {
	const result = freshConditions();
	for (const [id, raw] of Object.entries(object(input, "conditions"))) {
		if (!Object.hasOwn(COND_BY_ID, id)) {
			unknown.push(id);
			continue;
		}
		const key = id as ConditionId;
		const v = object(raw, id);
		const condition = result[key];
		condition.on = true;
		condition.s = clamp(number(v.s, `${id}.s`), 0, 1);
		condition.source = typeof v.source === "string" ? v.source : "import";
		for (const extra of COND_BY_ID[key].extras ?? []) {
			const value = Object.hasOwn(exportKeys, extra.k)
				? v[exportKeys[extra.k]!]
				: v[extra.k];
			if (value === undefined) continue;
			condition.x[extra.k] =
				extra.t === "num"
					? clamp(number(value, extra.k), extra.min, extra.max)
					: extra.t === "bool"
						? flag(value, extra.k)
						: choice(
								value,
								extra.opts.map(([option]) => option),
								extra.k,
							);
		}
		if (key === "cataract" && v.stage === "hypermature")
			condition.x.hypermature = true;
	}
	return result;
}

function importProfile(value: unknown, eye?: unknown): Partial<DogProfile> {
	const raw = value === undefined ? {} : object(value, "profile");
	const profile: Partial<DogProfile> = {};
	if (raw.breed !== undefined)
		profile.breed = choice(
			raw.breed,
			Object.keys(BREEDS) as BreedId[],
			"breed",
		);
	const coat: CoatType[] = [
		"normal",
		"merle_Mm",
		"merle_MM",
		"dilute",
		"white",
	];
	if (raw.coat !== undefined) profile.coat = choice(raw.coat, coat, "coat");
	const selected = raw.eye ?? eye;
	if (selected !== undefined)
		profile.eye = choice<EyeId>(selected, ["OS", "OD"], "eye");
	const ranges = [
		["age_years", "age_years", 0, 30],
		["lifespan_years", "lifespan_years", 1, 30],
		["cephalic_index", "ci", 0, 100],
		["tapetum", "tapetum", 0, 1],
	] as const;
	for (const [field, key, min, max] of ranges) {
		if (raw[field] !== undefined)
			profile[key] = clamp(number(raw[field], field), min, max);
	}
	return profile;
}

function importEyeOptics(raw: Record<string, unknown>): Partial<EyeOptics> {
	const optics: Partial<EyeOptics> = {};
	if (raw.iris !== undefined)
		optics.iris = choice(raw.iris, ["brown", "blue"] as const, "iris");
	if (raw.refraction_D !== undefined) {
		optics.refraction_D = clamp(
			number(raw.refraction_D, "refraction_D"),
			-20,
			20,
		);
		optics.refractionMeasured = false;
	}
	if (raw.refractionMeasured !== undefined)
		optics.refractionMeasured = flag(
			raw.refractionMeasured,
			"refractionMeasured",
		);
	return optics;
}

function importDetector(raw: Record<string, unknown>): DetectorOutput {
	const quality =
		raw.image_quality == null ? {} : object(raw.image_quality, "image_quality");
	const usable =
		quality.usable == null
			? undefined
			: flag(quality.usable, "image_quality.usable");
	const findings: DetectorOutput["findings"] = Object.create(null);
	for (const [key, value] of Object.entries(
		usable === false || raw.findings === undefined
			? {}
			: object(raw.findings, "findings"),
	)) {
		const row = object(value, key);
		const finding: Finding = {};
		for (const field of [
			"p",
			"severity",
			"fill_fraction",
			"diameter_rel",
			"clock_hours",
		] as const) {
			if (row[field] != null)
				finding[field] = clamp(
					number(row[field], field),
					0,
					field === "clock_hours" ? 12 : 1,
				);
		}
		for (const field of ["reaches_pupil", "crosses_pupil"] as const) {
			if (row[field] != null) finding[field] = flag(row[field], field);
		}
		for (const field of ["origin", "pattern", "depth", "type"] as const) {
			const v = row[field];
			if (typeof v === "string") finding[field] = v;
		}
		findings[key] = finding;
	}
	const md =
		raw.metadata_optional == null
			? {}
			: object(raw.metadata_optional, "metadata_optional");
	const metadata_optional: DetectorMetadata = {};
	for (const key of ["age_years", "STT_mm_per_min", "IOP_mmHg"] as const) {
		if (md[key] != null) metadata_optional[key] = number(md[key], key);
	}
	if (typeof md.breed === "string") metadata_optional.breed = md.breed;
	if (typeof md.PRA_genotype === "string")
		metadata_optional.PRA_genotype = md.PRA_genotype;
	if (md.vet_diagnoses != null)
		metadata_optional.vet_diagnoses = strings(
			md.vet_diagnoses,
			"vet_diagnoses",
		);
	if (md.sudden_blindness != null)
		metadata_optional.sudden_blindness = flag(
			md.sudden_blindness,
			"sudden_blindness",
		);
	return {
		findings,
		image_quality: { usable },
		metadata_optional,
		eye:
			raw.eye == null ? undefined : choice<EyeId>(raw.eye, ["OS", "OD"], "eye"),
		urgent_flags:
			raw.urgent_flags == null ? [] : strings(raw.urgent_flags, "urgent_flags"),
	};
}

export function parseImportJSON(text: string): StateImport {
	const raw = object(JSON.parse(text), "import");
	const unknown: string[] = [];
	if (
		raw.findings !== undefined ||
		raw.image_quality !== undefined ||
		raw.metadata_optional !== undefined
	) {
		const detector = importDetector(raw);
		const { conditions, urgent, notes, metadata } = mapDetector(detector);
		const breed = metadata.breed?.toLowerCase();
		const profile = importProfile({
			breed: breed && Object.hasOwn(BREEDS, breed) ? breed : undefined,
			age_years: metadata.age_years,
			eye: detector.eye,
		});
		return {
			profile,
			conditions: importConditions(conditions, unknown),
			unknown,
			notes,
			urgent,
		};
	}

	const profile = importProfile(raw.profile, raw.eye);
	const result: StateImport = { profile, unknown, notes: [], urgent: [] };
	if (raw.profile !== undefined) {
		const fields = object(raw.profile, "profile");
		const { iris, ...legacy } = fields;
		result.legacyOptics = importEyeOptics(legacy);
		if (iris !== undefined) {
			if (typeof iris === "string")
				result.legacyOptics.iris = importEyeOptics({ iris }).iris;
			else {
				const eyes = object(iris, "iris");
				result.legacyOptics.iris = importEyeOptics({
					iris: eyes[profile.eye ?? "OD"] ?? eyes.OS ?? eyes.OD,
				}).iris;
				result.eyeOptics = {
					OS: importEyeOptics({ iris: eyes.OS }),
					OD: importEyeOptics({ iris: eyes.OD }),
				};
			}
		}
	}
	if (raw.eyeOptics !== undefined) {
		const eyes = object(raw.eyeOptics, "eyeOptics");
		result.eyeOptics ??= {};
		for (const eye of ["OS", "OD"] as const) {
			if (eyes[eye] !== undefined)
				result.eyeOptics[eye] = {
					...result.eyeOptics[eye],
					...importEyeOptics(object(eyes[eye], "eyeOptics." + eye)),
				};
		}
	}

	if (raw.eyes !== undefined || raw.binocular !== undefined) {
		const eyes = object(raw.eyes, "eyes");
		const binoc = object(raw.binocular, "binocular");
		result.eyes = {
			OS: importConditions(eyes.OS, unknown),
			OD: importConditions(eyes.OD, unknown),
		};
		result.binoc = {
			on: flag(binoc.enabled, "enabled"),
			dom: clamp(number(binoc.dominance, "dominance"), 0.5, 1),
		};
	} else {
		const conditions =
			(raw.profile && object(raw.profile, "profile").conditions) ??
			raw.conditions;
		if (conditions !== undefined)
			result.conditions = importConditions(conditions, unknown);
		else if (raw.profile === undefined)
			throw new Error(
				'Expected detector "findings", "conditions", or a "profile".',
			);
	}
	return result;
}
