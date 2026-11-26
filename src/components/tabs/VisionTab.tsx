import { useEngine, useEngineSnapshot } from "../../engine";
import type { VisionParams } from "../../types";
import { SpectrumPreview } from "../SpectrumPreview";
import { ConfidenceBadge, SliderField, type SliderFieldProps } from "../ui";

const controls = [
	{
		key: "chroma",
		label: "Colour separation",
		min: 0.5,
		max: 1,
		step: 0.05,
		conf: "P",
		formatValue: (v) => "k = " + v.toFixed(2),
	},
	{
		key: "cpd",
		label: "Peak acuity",
		min: 4,
		max: 19,
		step: 0.5,
		conf: "E",
		formatValue: (v) => `${v} cpd · 20/${Math.round(600 / v)}`,
		hint: "Typical dogs 6 to 12 cycles per degree; humans 30 to 60.",
	},
	{
		key: "periph",
		label: "Peripheral blur growth",
		min: 0,
		max: 12,
		step: 0.5,
		conf: "S",
		formatValue: (v) => "×" + (1 + v).toFixed(1) + " at edge",
	},
	{
		key: "csf",
		label: "Contrast threshold",
		min: 0,
		max: 0.15,
		step: 0.005,
		conf: "S",
		formatValue: (v) => (v * 100).toFixed(1) + "%",
		hint: "No dog contrast sensitivity curve has been measured.",
	},
	{
		key: "nightGain",
		label: "Night gain",
		min: 1,
		max: 5,
		step: 0.1,
		conf: "S",
		formatValue: (v) => "×" + v.toFixed(1),
		hint: "Extrapolated from cats; the catalog suggests 2.5×.",
	},
	{
		key: "lower",
		label: "Tapetal lower-field boost",
		min: 0,
		max: 0.5,
		step: 0.01,
		conf: "S",
		formatValue: (v) => "+" + Math.round(v * 100) + "%",
	},
	{
		key: "noise",
		label: "Rod noise",
		min: 0,
		max: 1.5,
		step: 0.05,
		conf: "S",
		formatValue: (v) => v.toFixed(2),
	},
	{
		key: "rodTau",
		label: "Rod integration time",
		min: 20,
		max: 250,
		step: 5,
		conf: "P",
		formatValue: (v) => v + " ms",
		hint: "Rods follow flicker to about 20 Hz, so dim scenes smear motion.",
	},
	{
		key: "veil",
		label: "Veiling glare",
		min: 0,
		max: 0.2,
		step: 0.005,
		conf: "S",
		formatValue: (v) => v.toFixed(3),
	},
	{
		key: "hdr",
		label: "Highlight energy",
		min: 0,
		max: 10,
		step: 0.5,
		conf: "S",
		formatValue: (v) => v.toFixed(1),
		hint: "Restores brightness to clipped lights in ordinary photos so glare can spread.",
	},
	{
		key: "salience",
		label: "Motion salience (video)",
		min: 0,
		max: 0.5,
		step: 0.01,
		conf: "S",
		formatValue: (v) => "+" + Math.round(v * 100) + "%",
	},
] satisfies (Omit<SliderFieldProps, "value" | "onChange"> & {
	key: keyof VisionParams;
})[];

export function VisionTab() {
	const engine = useEngine();
	const {
		state: { vision },
	} = useEngineSnapshot();
	return (
		<>
			<h3>Colour</h3>
			<SpectrumPreview chroma={vision.chroma} />
			<p className="lede">
				Two cone types peak near 430 and 555 nm. Reds collapse onto dark olive,
				greens onto mustard, and blue-green near 480 nm turns grey.
			</p>
			<div id="visionCtl">
				{controls.map(({ key, ...control }) => (
					<SliderField
						key={key}
						{...control}
						value={vision[key]}
						onChange={(value) =>
							engine.mutate(
								(draft) => {
									draft.vision[key] = value;
								},
								{ clearPreset: true },
							)
						}
					/>
				))}
			</div>
			<div className="row2">
				<button
					type="button"
					className="btn"
					id="visReset"
					onClick={() => engine.resetVision()}
				>
					Reset baseline values
				</button>
			</div>
			<p className="note">
				Badges show the catalog's confidence: <ConfidenceBadge level="E" />{" "}
				established, <ConfidenceBadge level="P" /> probable,{" "}
				<ConfidenceBadge level="S" /> speculative. Nearly every disease
				magnitude is speculative.
			</p>
		</>
	);
}
