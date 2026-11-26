import { Toolbar } from "@base-ui/react/toolbar";
import { useEngine, useEngineSnapshot } from "../engine";
import { ViewIcon } from "./Icons";
import { PopoverMenu, SegmentedControl, SelectField, SwitchField } from "./ui";

interface ViewPopoverProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ViewPopover({ open, onOpenChange }: ViewPopoverProps) {
	const engine = useEngine();
	const { state, source } = useEngineSnapshot();
	const hasDepth = Boolean(source?.depth);

	return (
		<PopoverMenu
			id="viewMenu"
			align="end"
			ariaLabel="View"
			open={open}
			onOpenChange={onOpenChange}
			trigger={
				<Toolbar.Button type="button" className="ib" id="viewBtn" title="View">
					<ViewIcon />
					<span className="ibl">View</span>
				</Toolbar.Button>
			}
		>
			<div className="mlabel">Compare</div>
			<SegmentedControl
				id="viewmode"
				ariaLabel="View"
				value={String(state.view.mode)}
				onChange={(mode) => engine.setViewMode(Number(mode))}
				options={[
					{ value: "0", label: "Split", dataAttr: { "data-mode": "0" } },
					{ value: "1", label: "Dog", dataAttr: { "data-mode": "1" } },
					{ value: "2", label: "Human", dataAttr: { "data-mode": "2" } },
				]}
			/>
			<div className="mlabel">Overlay</div>
			<SelectField
				id="overlay"
				ariaLabel="Overlay"
				value={String(state.view.overlay)}
				onChange={(value) => engine.setOverlay(Number(value))}
				options={[
					{ value: "0", label: "None" },
					{ value: "1", label: "Acuity map" },
					{ value: "2", label: "Field zones" },
					{ value: "3", label: "Depth map", disabled: !hasDepth },
				]}
			/>
			<SwitchField
				id="hudToggle"
				label="Show readouts"
				checked={state.view.hud}
				onChange={(checked) => engine.setHud(checked)}
			/>
			<SwitchField
				id="statsToggle"
				label="Stats for nerds"
				checked={state.view.stats}
				onChange={(checked) => engine.setStats(checked)}
			/>
		</PopoverMenu>
	);
}
