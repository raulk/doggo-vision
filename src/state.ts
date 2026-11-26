import { BREEDS, freshConditions, STAGES, VISION_DEFAULTS } from "./model";
import type {
	AppState,
	BreedId,
	ConditionMap,
	DogProfile,
	EyeId,
	EyeOptics,
	Preset,
	PresetConditions,
	StateImport,
} from "./types";

export function breedProfile(breed: BreedId, age_years: number): DogProfile {
	const b = BREEDS[breed];
	return {
		breed,
		age_years,
		lifespan_years: b.L,
		ci: b.ci,
		coat: "normal",
		eye: "OD",
		tapetum: b.tap,
	};
}

function breedOptics(
	breed: BreedId,
	overrides?: Partial<EyeOptics>,
): EyeOptics {
	return {
		refraction_D: BREEDS[breed].dD,
		refractionMeasured: false,
		iris: "brown",
		...overrides,
	};
}

export function setBreed(state: AppState, breed: BreedId) {
	if (breed === state.profile.breed) return;
	const { ci, L, tap, dD } = BREEDS[breed];
	Object.assign(state.profile, { breed, ci, lifespan_years: L, tapetum: tap });
	for (const optics of Object.values(state.eyeOptics)) {
		if (!optics.refractionMeasured) optics.refraction_D = dD;
	}
}

export function createState(): AppState {
	return {
		profile: breedProfile("labrador", 4),
		eyeOptics: { OS: breedOptics("labrador"), OD: breedOptics("labrador") },
		eyes: { OS: freshConditions(), OD: freshConditions() },
		vision: { ...VISION_DEFAULTS },
		scene: {
			projection: "auto",
			depthEnabled: false,
			depthNearM: 0.4,
			depthFarM: 25,
			focusPoint: null,
			adaptMode: "instant",
			logL: 2.8,
			hfov: 50,
			dist: 6,
			nose: false,
			live: true,
			flicker: false,
		},
		stages: STAGES.map(() => true),
		view: {
			yaw: 0,
			pitch: 0,
			mode: 0,
			split: 0.5,
			zoom: 1,
			cx: 0.5,
			cy: 0.5,
			overlay: 0,
			hud: false,
			stats: false,
		},
		preset: "lab",
		binoc: { on: false, dom: 0.75 },
	};
}

export function otherEye(eye: EyeId): EyeId {
	return eye === "OD" ? "OS" : "OD";
}
export function activeConditions(state: AppState): ConditionMap {
	return state.eyes[state.profile.eye];
}
export function setActiveConditions(state: AppState, map: ConditionMap) {
	state.eyes[state.profile.eye] = map;
}
export function clearActiveConditions(state: AppState) {
	setActiveConditions(state, freshConditions());
	state.preset = null;
}
export function copyActiveEyeToOther(state: AppState) {
	const eye = state.profile.eye;
	const fellow = otherEye(eye);
	state.eyes[fellow] = structuredClone(activeConditions(state));
	state.eyeOptics[fellow] = { ...state.eyeOptics[eye] };
	state.preset = null;
}
export function setBinoc(state: AppState, on: boolean) {
	state.binoc.on = on;
	state.preset = null;
}
export function editEye(state: AppState, eye: EyeId) {
	state.profile.eye = eye;
}

export const PRESETS: readonly Preset[] = [
	{
		id: "lab",
		name: "Adult Labrador",
		note: "Baseline: dichromat, 20/75",
		p: ["labrador", 4],
	},
	{
		id: "kcs15both",
		name: "Senior, 15: both eyes",
		note: "Both eyes blended: clearer right eye leads where the fields overlap",
		p: ["mixed", 15],
		prof: { lifespan_years: 14, eye: "OS" },
		eyes: { OS: "kcs15", OD: "kcs15b" },
	},
	{
		id: "kcs15",
		name: "Senior, 15: cloudy left eye",
		note: "Dry eye, corneal scarring and pigment, lens fog",
		p: ["mixed", 15],
		prof: { lifespan_years: 14, eye: "OS" },
		c: {
			kcs: {
				s: 0.6,
				x: { chronic: false, blink: 6, tbu: 4, mucus: 0, squint: 0 },
			},
			corneal_scar: { s: 0.55 },
			pigmentary_keratitis: { s: 0.35, x: { origin: "diffuse" } },
			nuclear_sclerosis: { s: 0.5 },
		},
	},
	{
		id: "kcs15b",
		name: "Senior, 15: clearer right eye",
		note: "Milder dry eye, a few small scars, lens fog",
		p: ["mixed", 15],
		prof: { lifespan_years: 14, eye: "OD" },
		c: {
			kcs: {
				s: 0.4,
				x: { chronic: false, blink: 6, tbu: 6, mucus: 0, squint: 0 },
			},
			corneal_scar: { s: 0.1 },
			nuclear_sclerosis: { s: 0.45 },
		},
	},
	{
		id: "puppy3",
		name: "Puppy, 3 weeks",
		note: "Eyes just open, retina maturing",
		p: ["labrador", 3 / 52],
	},
	{
		id: "puppy10",
		name: "Puppy, 10 weeks",
		note: "Near-adult optics",
		p: ["labrador", 10 / 52],
	},
	{
		id: "greyhound",
		name: "Greyhound",
		note: "Strong visual streak, 270° field",
		p: ["greyhound", 4],
	},
	{
		id: "pug",
		name: "Pug",
		note: "Area centralis, glare, mild pigment",
		p: ["pug", 4],
		c: { pigmentary_keratitis: { s: 0.3, x: { origin: "medial" } } },
	},
	{
		id: "gsd",
		name: "Myopic German shepherd",
		note: "About −1.5 D at distance",
		p: ["gsd", 5],
		optics: { refraction_D: -1.5 },
	},
	{
		id: "senior",
		name: "Senior, 11 years",
		note: "Lens scatter, slower night vision",
		p: ["mixed", 11],
		prof: { lifespan_years: 12.5 },
	},
	{
		id: "cataract",
		name: "Cataract, immature",
		note: "Toy poodle, cortical scatter",
		p: ["poodle_toy", 9],
		c: { cataract: { s: 0.55, x: { type: "cortical" } } },
	},
	{
		id: "diabetic",
		name: "Diabetic cataract",
		note: "Mature, fast onset",
		p: ["labrador", 8],
		c: { cataract: { s: 0.93, x: { type: "diffuse" } } },
	},
	{
		id: "merle",
		name: "Double merle",
		note: "Small eye, colobomas, no tapetum",
		p: ["aussie", 3],
		prof: { coat: "merle_MM", tapetum: 0 },
		optics: { iris: "blue" },
		c: { microphthalmia: { s: 0.45 } },
	},
	{
		id: "pra",
		name: "PRA, mid stage",
		note: "Night loss, closing tunnel",
		p: ["cocker", 7],
		c: { pra: { s: 0.55 } },
	},
	{
		id: "glaucoma",
		name: "Glaucoma",
		note: "Halos now, field loss after",
		p: ["cocker", 8],
		c: { glaucoma: { s: 0.45, x: { damage: 0.55 } } },
	},
	{
		id: "kcs",
		name: "Dry eye, Shih Tzu",
		note: "Tear film breaks up between blinks",
		p: ["shihtzu", 8],
		c: { kcs: { s: 0.6, x: { chronic: true, tbu: 3, blink: 6 } } },
	},
	{
		id: "brachy",
		name: "Brachycephalic senior",
		note: "French bulldog, 9 years",
		p: ["frenchie", 9],
		c: {
			pigmentary_keratitis: { s: 0.45, x: { origin: "medial" } },
			entropion: { s: 0.4 },
		},
	},
];

function presetConditions(conditions?: PresetConditions): ConditionMap {
	const map = freshConditions();
	for (const [id, value] of Object.entries(conditions ?? {})) {
		const condition = map[id as keyof ConditionMap];
		condition.on = true;
		condition.s = value.s;
		Object.assign(condition.x, value.x);
		condition.source = "preset";
	}
	return map;
}

export function applyPreset(state: AppState, preset: Preset) {
	state.profile = { ...breedProfile(...preset.p), ...preset.prof };
	state.binoc = { on: !!preset.eyes, dom: 0.75 };
	state.eyeOptics = {
		OS: breedOptics(preset.p[0], preset.optics),
		OD: breedOptics(preset.p[0], preset.optics),
	};
	if (preset.eyes) {
		for (const eye of ["OS", "OD"] as const) {
			const side = PRESETS.find((p) => p.id === preset.eyes?.[eye])!;
			state.eyes[eye] = presetConditions(side.c);
			state.eyeOptics[eye] = breedOptics(side.p[0], side.optics);
		}
	} else {
		state.eyes = { OS: freshConditions(), OD: freshConditions() };
		setActiveConditions(state, presetConditions(preset.c));
	}
	state.preset = preset.id;
}

export function applyImport(state: AppState, data: StateImport) {
	const p = data.profile;
	if (p.breed) setBreed(state, p.breed);
	Object.assign(state.profile, p);
	Object.assign(state.eyeOptics[state.profile.eye], data.legacyOptics);
	for (const eye of ["OS", "OD"] as const)
		Object.assign(state.eyeOptics[eye], data.eyeOptics?.[eye]);
	if (data.eyes && data.binoc) {
		state.eyes = data.eyes;
		state.binoc = data.binoc;
	} else if (data.conditions) {
		setActiveConditions(state, data.conditions);
	}
	state.preset = null;
}
