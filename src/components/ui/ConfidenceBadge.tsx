import { Tooltip } from "@base-ui/react/tooltip";

export type Confidence = "E" | "P" | "S" | "";

const descriptions = {
	E: "Established — measured directly in peer-reviewed canine studies",
	P: "Probable — single study or veterinary consensus",
	S: "Speculative — extrapolation or engineering estimate",
};

export interface ConfidenceBadgeProps {
	level?: Confidence;
}

export function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
	if (!level) return null;

	const description = descriptions[level];

	return (
		<Tooltip.Root>
			<Tooltip.Trigger
				render={
					<span
						className={`conf ${level}`}
						tabIndex={0}
						aria-label={description}
					/>
				}
			>
				{level}
			</Tooltip.Trigger>
			<Tooltip.Portal>
				<Tooltip.Positioner className="tooltip-positioner" sideOffset={6}>
					<Tooltip.Popup className="tooltip" role="tooltip">
						{description}
					</Tooltip.Popup>
				</Tooltip.Positioner>
			</Tooltip.Portal>
		</Tooltip.Root>
	);
}
