import { Field } from "@base-ui/react/field";
import { Slider } from "@base-ui/react/slider";
import { type Confidence, ConfidenceBadge } from "./ConfidenceBadge";

export interface SliderFieldProps {
	id?: string;
	label: string;
	conf?: Confidence;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (value: number) => void;
	formatValue: (value: number) => string;
	toSlider?: (value: number) => number;
	fromSlider?: (sliderVal: number) => number;
	hint?: string;
	hidden?: boolean;
}

export function SliderField({
	id,
	label,
	conf,
	value,
	min,
	max,
	step,
	onChange,
	formatValue,
	toSlider,
	fromSlider,
	hint,
	hidden,
}: SliderFieldProps) {
	const formattedValue = formatValue(value);
	const rawSliderValue = toSlider ? toSlider(value) : value;
	const sliderValue = Math.min(max, Math.max(min, rawSliderValue));

	return (
		<Field.Root className="ctl" id={id} hidden={hidden}>
			<div className="ctl-label">
				<Field.Label>{label}</Field.Label>
				<ConfidenceBadge level={conf} />
			</div>
			<output className="ctl-out">{formattedValue}</output>
			<Slider.Root
				className="slider-root"
				min={min}
				max={max}
				step={step}
				value={sliderValue}
				onValueChange={(next) => onChange(fromSlider ? fromSlider(next) : next)}
			>
				<Slider.Control className="slider-control">
					<Slider.Track className="slider-track">
						<Slider.Indicator className="slider-indicator" />
					</Slider.Track>
					<Slider.Thumb
						className="slider-thumb"
						aria-label={label}
						aria-valuetext={formattedValue}
					/>
				</Slider.Control>
			</Slider.Root>
			{hint && (
				<Field.Description render={<div />} className="hint">
					{hint}
				</Field.Description>
			)}
		</Field.Root>
	);
}
