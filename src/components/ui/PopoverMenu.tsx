import { Popover } from "@base-ui/react/popover";
import type { ReactElement, ReactNode } from "react";

export interface PopoverMenuProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	trigger: ReactElement;
	align?: "start" | "center" | "end";
	side?: "top" | "bottom" | "left" | "right";
	sideOffset?: number;
	className?: string;
	id?: string;
	ariaLabel?: string;
	children: ReactNode;
}

export function PopoverMenu({
	open,
	onOpenChange,
	trigger,
	align = "end",
	side = "bottom",
	sideOffset = 8,
	className,
	id,
	ariaLabel,
	children,
}: PopoverMenuProps) {
	return (
		<Popover.Root open={open} onOpenChange={onOpenChange}>
			<Popover.Trigger render={trigger} />
			<Popover.Portal>
				<Popover.Positioner
					className="popover-positioner"
					side={side}
					align={align}
					sideOffset={sideOffset}
					collisionPadding={12}
				>
					<Popover.Popup
						id={id}
						className={["menu", className].filter(Boolean).join(" ")}
						aria-label={ariaLabel}
						style={{ position: "static" }}
					>
						{children}
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
