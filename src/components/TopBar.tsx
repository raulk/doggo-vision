import { Toolbar } from "@base-ui/react/toolbar";
import { Tooltip } from "@base-ui/react/tooltip";
import { useEngine, useEngineSnapshot } from "../engine";
import { fmtAge } from "../format";
import { BREEDS, CONDS } from "../model";
import { PRESETS } from "../state";
import type { EyeId } from "../types";
import { DepthPopover } from "./DepthPopover";
import { SaveIcon, SettingsIcon } from "./Icons";
import { SourcePopover } from "./SourcePopover";
import { ViewPopover } from "./ViewPopover";

export type DrawerTab = "dog" | "cond" | "scene" | "vision" | "pipe" | "data";
export type MenuId = "src" | "view" | "depth" | null;

export interface TopBarProps {
	drawerOpen: boolean;
	activeTab: DrawerTab;
	openMenu: MenuId;
	onOpenMenuChange: (menu: MenuId) => void;
	onToggleDrawer: () => void;
	onOpenDogTab: () => void;
}

export function TopBar({
	drawerOpen,
	openMenu,
	onOpenMenuChange,
	onToggleDrawer,
	onOpenDogTab,
}: TopBarProps) {
	const engine = useEngine();
	const { state } = useEngineSnapshot();
	const preset = PRESETS.find((candidate) => candidate.id === state.preset);
	const breed = BREEDS[state.profile.breed];
	const presetLabel =
		preset?.name ??
		`${breed?.name ?? "Custom dog"}, ${fmtAge(state.profile.age_years)}`;
	const count = (eye: EyeId) =>
		CONDS.filter((condition) => state.eyes[eye][condition.id].on).length;
	const condCount = state.binoc.on
		? count("OS") + count("OD")
		: count(state.profile.eye);

	return (
		<header className="bar topbar">
			<button
				type="button"
				className="title"
				id="presetBtn"
				aria-label="Choose a dog"
				onClick={onOpenDogTab}
			>
				<small>Dogsight</small>
				<span id="presetName">{presetLabel}</span>
			</button>
			<Toolbar.Root className="icons" aria-label="Primary actions">
				<SourcePopover
					open={openMenu === "src"}
					onOpenChange={(open) => onOpenMenuChange(open ? "src" : null)}
				/>
				<ViewPopover
					open={openMenu === "view"}
					onOpenChange={(open) => onOpenMenuChange(open ? "view" : null)}
				/>
				<DepthPopover
					open={openMenu === "depth"}
					onOpenChange={(open) => onOpenMenuChange(open ? "depth" : null)}
				/>
				<Tooltip.Root>
					<Tooltip.Trigger
						render={<Toolbar.Button />}
						id="save"
						aria-label="Save dog view"
						className="ib"
						onClick={() => void engine.saveCapture()}
					>
						<SaveIcon />
						<span className="ibl">Save</span>
					</Tooltip.Trigger>
					<Tooltip.Portal>
						<Tooltip.Positioner
							className="tooltip-positioner"
							side="bottom"
							sideOffset={8}
						>
							<Tooltip.Popup className="tooltip" role="tooltip">
								Save dog view
							</Tooltip.Popup>
						</Tooltip.Positioner>
					</Tooltip.Portal>
				</Tooltip.Root>
				<Tooltip.Root>
					<Tooltip.Trigger
						render={<Toolbar.Button />}
						id="menuBtn"
						aria-label="Settings"
						className="ib"
						aria-expanded={drawerOpen}
						aria-controls="drawer"
						onClick={onToggleDrawer}
					>
						<SettingsIcon />
						<span className="ibl">Settings</span>
						{condCount > 0 && (
							<span className="dot" id="ccount">
								{condCount}
							</span>
						)}
					</Tooltip.Trigger>
					<Tooltip.Portal>
						<Tooltip.Positioner
							className="tooltip-positioner"
							side="bottom"
							sideOffset={8}
						>
							<Tooltip.Popup className="tooltip" role="tooltip">
								Settings
							</Tooltip.Popup>
						</Tooltip.Positioner>
					</Tooltip.Portal>
				</Tooltip.Root>
			</Toolbar.Root>
		</header>
	);
}
