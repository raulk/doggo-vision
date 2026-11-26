import type { AdaptMode } from "./adaptation";
import type { BREEDS, CONDS, compile, VISION_DEFAULTS } from "./model";

export type EyeId = "OS" | "OD";
export type BreedId = keyof typeof BREEDS;
export type SkullType = "brachycephalic" | "dolichocephalic" | "mesocephalic";
export type CoatType = "normal" | "merle_Mm" | "merle_MM" | "dilute" | "white";
export type IrisColor = "brown" | "blue";
export type ConditionId = (typeof CONDS)[number]["id"];
export type Extra = { k: string; label: string } & (
	| { t: "bool" }
	| { t: "sel"; opts: ReadonlyArray<readonly [string, string]> }
	| {
			t: "num";
			min: number;
			max: number;
			step: number;
			def: number;
			unit?: string;
	  }
);
export interface ConditionDefinition {
	id: string;
	g: string;
	name: string;
	photo: "yes" | "partly" | "no";
	d: string;
	s: number;
	extras?: readonly Extra[];
}
export type ExtraValue = number | boolean | string;
export interface ConditionState {
	on: boolean;
	s: number;
	x: Record<string, ExtraValue>;
	source?: string;
}
export type ConditionMap = Record<ConditionId, ConditionState>;
export interface EyeOptics {
	refraction_D: number;
	refractionMeasured: boolean;
	iris: IrisColor;
}
export interface DogProfile {
	breed: BreedId;
	age_years: number;
	lifespan_years: number;
	ci: number;
	coat: CoatType;
	eye: EyeId;
	tapetum: number;
}
export type VisionParams = typeof VISION_DEFAULTS;
export interface SceneParams {
	projection: "auto" | "photo" | "panorama";
	depthEnabled: boolean;
	depthNearM: number;
	depthFarM: number;
	focusPoint: Vec2 | null;
	adaptMode: AdaptMode;
	logL: number;
	hfov: number;
	dist: number;
	nose: boolean;
	live: boolean;
	flicker: boolean;
}
export interface ViewState {
	yaw: number;
	pitch: number;
	mode: number;
	split: number;
	zoom: number;
	cx: number;
	cy: number;
	overlay: number;
	hud: boolean;
}
export interface BinocState {
	on: boolean;
	dom: number;
}
export interface AppState {
	profile: DogProfile;
	eyes: Record<EyeId, ConditionMap>;
	eyeOptics: Record<EyeId, EyeOptics>;
	vision: VisionParams;
	scene: SceneParams;
	stages: boolean[];
	view: ViewState;
	preset: string | null;
	binoc: BinocState;
}
export type PresetConditions = Partial<
	Record<ConditionId, { s: number; x?: Record<string, ExtraValue> }>
>;
export interface Preset {
	id: string;
	name: string;
	note: string;
	p: [BreedId, number];
	prof?: Partial<DogProfile>;
	optics?: Partial<EyeOptics>;
	c?: PresetConditions;
	eyes?: Record<EyeId, string>;
}
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];
export type CompiledModel = ReturnType<typeof compile>;
export type Uniforms = CompiledModel["U"];
export interface Finding {
	p?: number;
	severity?: number;
	pattern?: string;
	clock_hours?: number;
	reaches_pupil?: boolean;
	crosses_pupil?: boolean;
	origin?: string;
	depth?: string;
	type?: string;
	fill_fraction?: number;
	diameter_rel?: number;
}
export interface DetectorMetadata {
	breed?: string;
	age_years?: number;
	STT_mm_per_min?: number;
	IOP_mmHg?: number;
	vet_diagnoses?: string[];
	PRA_genotype?: string;
	sudden_blindness?: boolean;
}
export interface DetectorOutput {
	image_quality?: { usable?: boolean };
	eye?: EyeId;
	findings: Record<string, Finding | undefined>;
	metadata_optional?: DetectorMetadata;
	urgent_flags?: string[];
}
export interface ConditionHypothesis {
	s: number;
	source: string;
	stage?: string;
	type?: string;
	damage?: number;
	acute?: boolean;
	origin?: string;
	maini_score_est?: number;
	chronic?: boolean;
	tear_breakup_s?: number;
	blink_interval_s?: number;
	mucus?: number;
	squint?: number;
	dir_deg?: number;
}
export interface StateImport {
	profile: Partial<DogProfile>;
	legacyOptics?: Partial<EyeOptics>;
	eyeOptics?: Partial<Record<EyeId, Partial<EyeOptics>>>;
	conditions?: ConditionMap;
	eyes?: Record<EyeId, ConditionMap>;
	binoc?: BinocState;
	unknown: string[];
	notes: string[];
	urgent: string[];
}
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export interface GainMapInfo {
	format: "iso-21496-1" | "ultra-hdr-xmp" | "apple";
	image: Blob;
	gainMapMin: readonly [number, number, number];
	gainMapMax: readonly [number, number, number];
	gamma: readonly [number, number, number];
	offsetSdr: readonly [number, number, number];
	offsetHdr: readonly [number, number, number];
	hdrCapacityMin: number;
	hdrCapacityMax: number;
	baseRenditionIsHdr: boolean;
}
export interface PanoramaInfo {
	projection: "equirectangular" | "cylindrical";
	hfovDeg: number;
	vfovDeg: number;
	yawOffsetDeg: number;
	pitchOffsetDeg: number;
}
export interface DepthMap {
	canvas: HTMLCanvasElement;
	nearM: number;
	farM: number;
	kind: "procedural" | "embedded" | "estimated";
	metric?: boolean;
	label?: string;
}
export interface EmbeddedDepthInfo {
	format: "apple-jpeg" | "apple-heic" | "gdepth";
	image: Blob;
	representation: "inverse" | "linear";
	nearM: number;
	farM: number;
	metric: boolean;
	brighterIsNearer: boolean;
	floatMin?: number;
	floatMax?: number;
	intMin: number;
	intMax: number;
	label: string;
}
export interface PhotoMetadata {
	panorama?: PanoramaInfo;
	hfovDeg?: number;
	logL?: number;
	distM?: number;
	flashFired?: boolean;
	make?: string;
	model?: string;
	lensModel?: string;
	colorSpace?: string;
	orientation?: Orientation;
	gainMap?: GainMapInfo;
	embeddedDepth?: EmbeddedDepthInfo;
}
export interface SourceMeta {
	panorama?: PanoramaInfo;
	depth?: DepthMap;
	equiangular?: boolean;
	name: string;
	hfov: number;
	dist: number;
	logL?: number;
}
export type SampleId = "yard" | "street" | "chart" | "park360";
