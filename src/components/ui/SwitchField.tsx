import { Field } from "@base-ui/react/field";
import { Switch } from "@base-ui/react/switch";
import { useId } from "react";
import { type Confidence, ConfidenceBadge } from "./ConfidenceBadge";

export interface SwitchFieldProps {
	id?: string;
	label: string;
	description?: string;
	conf?: Confidence;
	checked: boolean;
	onChange: (checked: boolean) => void;
	className?: string;
}

export function SwitchField({
	id,
	label,
	description,
	conf,
	checked,
	onChange,
	className,
}: SwitchFieldProps) {
	const labelId = useId();
	const descriptionId = useId();

	return (
		<Field.Root
			className={["switch-field", className].filter(Boolean).join(" ")}
		>
			<label className="mcheck switch-row">
				<span className="switch-copy">
					<span id={labelId}>{label}</span>
					{description && <small id={descriptionId}>{description}</small>}
				</span>
				<Switch.Root
					id={id}
					render={<button type="button" />}
					nativeButton
					checked={checked}
					onCheckedChange={onChange}
					className="switch-root"
					aria-labelledby={labelId}
					aria-describedby={description ? descriptionId : undefined}
				>
					<Switch.Thumb className="switch-thumb" />
				</Switch.Root>
			</label>
			<ConfidenceBadge level={conf} />
		</Field.Root>
	);
}
