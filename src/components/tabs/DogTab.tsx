import { Fragment } from "react";
import { useEngine, useEngineSnapshot } from "../../engine";
import { fmtAge } from "../../format";
import { BREEDS, skullOf } from "../../model";
import { PRESETS } from "../../state";
import type { BreedId } from "../../types";
import { CheckboxField, SelectField, SliderField } from "../ui";
import { VisualFieldDiagram } from "../VisualFieldDiagram";

const breedOptions = (Object.keys(BREEDS) as BreedId[]).map((value) => ({
	value,
	label: BREEDS[value].name,
}));

export function DogTab() {
	const engine = useEngine();
	const { state, model } = useEngineSnapshot();
	const { profile } = state;
	const optics = state.eyeOptics[profile.eye];
	const d = model.derived;
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

	return (
		<>
			<h3>Presets</h3>
			<div className="presets" id="presets">
				{PRESETS.map((pr) => (
					<button
						key={pr.id}
						type="button"
						className="preset"
						data-id={pr.id}
						aria-pressed={state.preset === pr.id}
						onClick={() => engine.applyPreset(pr)}
					>
						<b>{pr.name}</b>
						<span>{pr.note}</span>
					</button>
				))}
			</div>
			<h3>Profile</h3>
			<div id="profileCtl">
				<SelectField
					label="Breed"
					options={breedOptions}
					layout="row"
					value={profile.breed}
					onChange={(value) => engine.setBreed(value)}
				/>
				<SliderField
					label="Age"
					conf="P"
					min={0}
					max={1000}
					step={1}
					hint="Lifespan-scaled: a giant breed ages faster than a toy."
					toSlider={(y) => (y < 1 ? y * 300 : 300 + ((y - 1) * 700) / 15)}
					fromSlider={(s) =>
						s < 300 ? Math.max(1 / 52, s / 300) : 1 + ((s - 300) * 15) / 700
					}
					value={profile.age_years}
					onChange={(v) =>
						engine.mutate(
							(draft) => {
								draft.profile.age_years = v;
							},
							{ clearPreset: true },
						)
					}
					formatValue={fmtAge}
				/>
				<SliderField
					label="Expected lifespan"
					conf="P"
					min={6}
					max={17}
					step={0.5}
					value={profile.lifespan_years}
					onChange={(v) =>
						engine.mutate(
							(draft) => {
								draft.profile.lifespan_years = v;
							},
							{ clearPreset: true },
						)
					}
					formatValue={(v) => v.toFixed(1) + " years"}
				/>
				<SliderField
					label="Cephalic index"
					conf="S"
					min={40}
					max={95}
					step={1}
					hint="Skull width over length. Long noses get a horizontal visual streak; short noses a round area centralis (r = −0.795)."
					value={profile.ci}
					onChange={(v) =>
						engine.mutate(
							(draft) => {
								draft.profile.ci = v;
							},
							{ clearPreset: true },
						)
					}
					formatValue={(v) => v + " · " + skullOf(v)}
				/>
				<SelectField
					label="Coat"
					conf="P"
					options={[
						{ value: "normal", label: "Normal" },
						{ value: "merle_Mm", label: "Merle (Mm)" },
						{ value: "merle_MM", label: "Double merle (MM)" },
						{ value: "dilute", label: "Dilute" },
						{ value: "white", label: "White / subalbinotic" },
					]}
					layout="row"
					value={profile.coat}
					onChange={(v) =>
						engine.mutate(
							(draft) => {
								draft.profile.coat = v;
							},
							{ clearPreset: true },
						)
					}
				/>
				<SelectField
					label="Iris of this eye"
					conf="S"
					hint="Less pigment means more stray light and glare."
					options={[
						{ value: "brown", label: "Brown" },
						{ value: "blue", label: "Blue" },
					]}
					layout="row"
					value={optics.iris}
					onChange={(v) =>
						engine.mutate(
							(draft) => {
								draft.eyeOptics[draft.profile.eye].iris = v;
							},
							{ clearPreset: true },
						)
					}
				/>
				<SelectField
					label="Tapetum"
					conf="S"
					options={[
						{ value: "1", label: "Full" },
						{ value: "0.88", label: "Smaller (small breeds)" },
						{ value: "0", label: "Absent" },
					]}
					layout="row"
					value={String(profile.tapetum)}
					onChange={(v) =>
						engine.mutate(
							(draft) => {
								draft.profile.tapetum = +v;
							},
							{ clearPreset: true },
						)
					}
				/>
				<SliderField
					label="Refraction"
					conf="S"
					min={-3}
					max={2}
					step={0.25}
					hint="Negative is myopic. Rottweilers 64% and German shepherds 53% myopic in one clinic sample."
					value={optics.refraction_D}
					onChange={(v) =>
						engine.mutate(
							(draft) => {
								draft.eyeOptics[draft.profile.eye].refraction_D = v;
							},
							{ clearPreset: true },
						)
					}
					formatValue={(v) => (v > 0 ? "+" : "") + v.toFixed(2) + " D"}
				/>
				<CheckboxField
					label="Measured total refraction (skip NS offset)"
					checked={optics.refractionMeasured}
					onChange={(v) =>
						engine.mutate(
							(draft) => {
								draft.eyeOptics[draft.profile.eye].refractionMeasured = v;
							},
							{ clearPreset: true },
						)
					}
				/>
				<SelectField
					label="Simulated eye"
					hint="Sets which side of the image is temporal for one-sided conditions."
					options={[
						{ value: "OD", label: "Right (OD)" },
						{ value: "OS", label: "Left (OS)" },
					]}
					layout="row"
					value={profile.eye}
					onChange={(value) => engine.editEye(value)}
				/>
				<SliderField
					label="Age-related lens change"
					conf="S"
					min={0}
					max={1}
					step={0.05}
					hint="Scales the typical nuclear sclerosis and lens opacity for this age."
					value={state.vision.ageLens}
					onChange={(v) =>
						engine.mutate(
							(draft) => {
								draft.vision.ageLens = v;
							},
							{ clearPreset: true },
						)
					}
					formatValue={(v) => Math.round(v * 100) + "%"}
				/>
			</div>
			<h3>Visual field</h3>
			<VisualFieldDiagram
				totalFieldDeg={d.field_total_deg}
				binocularOverlapDeg={d.binocular_overlap_deg}
			/>
			<h3>Derived from the profile</h3>
			<dl className="derived" id="derived">
				{rows.map(([label, value]) => (
					<Fragment key={label}>
						<dt>{label}</dt>
						<dd>{value}</dd>
					</Fragment>
				))}
			</dl>
		</>
	);
}
