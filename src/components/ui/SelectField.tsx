import { Field } from "@base-ui/react/field";
import { Select } from "@base-ui/react/select";
import { type Confidence, ConfidenceBadge } from "./ConfidenceBadge";

export interface SelectOption<T extends string> {
	value: T;
	label: string;
	disabled?: boolean;
}

export interface SelectFieldProps<T extends string> {
	id?: string;
	label?: string;
	ariaLabel?: string;
	conf?: Confidence;
	value: T;
	onChange: (value: T) => void;
	options: readonly SelectOption<T>[];
	hint?: string;
	layout?: "row" | "stacked";
}

export function SelectField<T extends string>({
	id,
	label,
	ariaLabel,
	conf,
	value,
	onChange,
	options,
	hint,
	layout = "stacked",
}: SelectFieldProps<T>) {
	return (
		<Field.Root className={`select-field select-field-${layout}`}>
			{(label || conf) && (
				<div className="select-label">
					{label && <Field.Label>{label}</Field.Label>}
					<ConfidenceBadge level={conf} />
				</div>
			)}
			<Select.Root<T>
				value={value}
				items={options}
				onValueChange={(next) => {
					if (next !== null) onChange(next);
				}}
			>
				<Select.Trigger
					id={id}
					className="select-trigger"
					aria-label={ariaLabel}
				>
					<Select.Value />
					<Select.Icon aria-hidden="true">
						<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
							<path
								d="m3 4.5 3 3 3-3"
								stroke="currentColor"
								strokeWidth="1.5"
							/>
						</svg>
					</Select.Icon>
				</Select.Trigger>
				<Select.Portal>
					<Select.Positioner
						className="select-positioner"
						sideOffset={6}
						alignItemWithTrigger={false}
						collisionPadding={12}
					>
						<Select.Popup className="select-popup">
							<Select.List>
								{options.map((option) => (
									<Select.Item
										key={option.value}
										value={option.value}
										disabled={option.disabled}
										className="select-item"
									>
										<Select.ItemText>{option.label}</Select.ItemText>
										<Select.ItemIndicator>
											<svg
												aria-hidden="true"
												width="12"
												height="12"
												viewBox="0 0 12 12"
												fill="none"
											>
												<path
													d="m2.5 6 2.3 2.3 4.7-4.7"
													stroke="currentColor"
													strokeWidth="1.5"
												/>
											</svg>
										</Select.ItemIndicator>
									</Select.Item>
								))}
							</Select.List>
						</Select.Popup>
					</Select.Positioner>
				</Select.Portal>
			</Select.Root>
			{hint && (
				<Field.Description render={<div />} className="hint">
					{hint}
				</Field.Description>
			)}
		</Field.Root>
	);
}
