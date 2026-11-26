import { Checkbox } from "@base-ui/react/checkbox";
import { Field } from "@base-ui/react/field";
import { useId } from "react";
import { type Confidence, ConfidenceBadge } from "./ConfidenceBadge";

export interface CheckboxFieldProps {
	id?: string;
	label: string;
	description?: string;
	conf?: Confidence;
	checked: boolean;
	onChange: (checked: boolean) => void;
	boxed?: boolean;
	className?: string;
}

export function CheckboxField({
	id,
	label,
	description,
	conf,
	checked,
	onChange,
	boxed,
	className,
}: CheckboxFieldProps) {
	const labelId = useId();
	const descriptionId = useId();

	return (
		<Field.Root
			className={["check-field", boxed && "check-field-boxed", className]
				.filter(Boolean)
				.join(" ")}
		>
			<Field.Label className={boxed ? "mcheck boxed" : "mcheck"}>
				<Checkbox.Root
					id={id}
					render={<button type="button" />}
					nativeButton
					className="checkbox-root"
					checked={checked}
					onCheckedChange={onChange}
					aria-labelledby={labelId}
					aria-describedby={description ? descriptionId : undefined}
				>
					<Checkbox.Indicator>
						<svg
							aria-hidden="true"
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
						>
							<path
								d="m3 7 2.5 2.5L11 4"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</Checkbox.Indicator>
				</Checkbox.Root>
				<span>
					<span id={labelId}>{label}</span>
					{description && <small id={descriptionId}>{description}</small>}
				</span>
			</Field.Label>
			<ConfidenceBadge level={conf} />
		</Field.Root>
	);
}
