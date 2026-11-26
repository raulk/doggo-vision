import { Tabs } from "@base-ui/react/tabs";
import { useEffect } from "react";
import { CloseIcon } from "./Icons";
import { ConditionsTab } from "./tabs/ConditionsTab";
import { DataTab } from "./tabs/DataTab";
import { DogTab } from "./tabs/DogTab";
import { PipelineTab } from "./tabs/PipelineTab";
import { SceneTab } from "./tabs/SceneTab";
import { VisionTab } from "./tabs/VisionTab";

export type DrawerTab = "dog" | "cond" | "scene" | "vision" | "pipe" | "data";

export interface SettingsDrawerProps {
	open: boolean;
	activeTab: DrawerTab;
	onOpenChange: (open: boolean) => void;
	onTabChange: (tab: DrawerTab) => void;
}

const tabs = [
	{ value: "dog", label: "Dog", Panel: DogTab },
	{ value: "cond", label: "Conditions", Panel: ConditionsTab },
	{ value: "scene", label: "Scene", Panel: SceneTab },
	{ value: "vision", label: "Vision", Panel: VisionTab },
	{ value: "pipe", label: "Pipeline", Panel: PipelineTab },
	{ value: "data", label: "Data", Panel: DataTab },
] as const;

export function SettingsDrawer({
	open,
	activeTab,
	onOpenChange,
	onTabChange,
}: SettingsDrawerProps) {
	useEffect(() => {
		if (!open) return;

		function closeOnEscape(event: KeyboardEvent) {
			if (event.key !== "Escape" || event.defaultPrevented || event.repeat)
				return;
			// Check before Base UI dismisses a popup in response to the same key.
			if (document.querySelector("[data-popup-open]")) return;
			onOpenChange(false);
		}

		document.addEventListener("keydown", closeOnEscape, true);
		return () => document.removeEventListener("keydown", closeOnEscape, true);
	}, [open, onOpenChange]);

	if (!open) return null;

	return (
		<aside className="drawer" id="drawer" aria-label="Settings">
			<Tabs.Root
				value={activeTab}
				onValueChange={(value) => onTabChange(value as DrawerTab)}
				className="drawer-tabs"
			>
				<div className="dhead">
					<Tabs.List className="tabs" id="tabs" aria-label="Settings tabs">
						{tabs.map(({ value, label }) => (
							<Tabs.Tab key={value} value={value} data-tab={value}>
								{label}
							</Tabs.Tab>
						))}
						<Tabs.Indicator className="tabs-indicator" />
					</Tabs.List>
					<button
						type="button"
						className="ib sm"
						id="drawerClose"
						aria-label="Close settings"
						onClick={() => onOpenChange(false)}
					>
						<CloseIcon />
					</button>
				</div>
				<div className="dbody">
					{tabs.map(({ value, Panel }) => (
						<Tabs.Panel
							key={value}
							className="pane"
							value={value}
							data-pane={value}
							keepMounted={value === "data"}
						>
							<Panel />
						</Tabs.Panel>
					))}
					<p className="foot">
						Runs locally in your browser—nothing is uploaded. An illustration
						built from the research catalog; not a measured percept and not a
						diagnosis.
					</p>
				</div>
			</Tabs.Root>
		</aside>
	);
}
