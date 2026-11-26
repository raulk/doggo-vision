import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

export interface SegmentOption<T extends string> {
	value: T;
	label: string;
	dataAttr?: Record<string, string>;
}

export interface SegmentedControlProps<T extends string> {
	id?: string;
	ariaLabel: string;
	value: T | null;
	onChange: (value: T) => void;
	options: readonly SegmentOption<T>[];
	columns?: number;
	className?: string;
}

export function SegmentedControl<T extends string>({
	id,
	ariaLabel,
	value,
	onChange,
	options,
	columns,
	className,
}: SegmentedControlProps<T>) {
	return (
		<ToggleGroup<T>
			id={id}
			aria-label={ariaLabel}
			className={["seg", columns && "seg-grid", className]
				.filter(Boolean)
				.join(" ")}
			style={
				columns
					? {
							display: "grid",
							gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
						}
					: undefined
			}
			value={value === null ? [] : [value]}
			onValueChange={([next]) => {
				if (next !== undefined) onChange(next);
			}}
			multiple={false}
		>
			{options.map((option) => (
				<Toggle
					{...option.dataAttr}
					key={option.value}
					value={option.value}
					className="seg-btn"
				>
					{option.label}
				</Toggle>
			))}
		</ToggleGroup>
	);
}
