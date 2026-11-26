import { Toolbar } from "@base-ui/react/toolbar";
import { useEngine, useEngineSnapshot } from "../engine";
import type { MediaSource } from "../media";
import { DepthIcon } from "./Icons";
import { PopoverMenu, SliderField, SwitchField } from "./ui";

interface DepthPopoverProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function describeDepth(source: MediaSource | undefined) {
	const depth = source?.depth;
	if (source?.kind === "video")
		return "Per-pixel depth is available for still images.";
	if (depth?.kind === "embedded") {
		const label = depth.label ?? "Embedded depth";
		return depth.metric
			? `${label} · ${depth.nearM.toFixed(2)}–${depth.farM.toFixed(1)} m (metric)`
			: `${label} · relative`;
	}
	if (depth?.kind === "procedural")
		return `Built-in scene depth · ${depth.nearM.toFixed(2)}–${depth.farM.toFixed(1)} m`;
	if (depth?.kind === "estimated") return "On-device AI depth · relative";
	return "No embedded depth in this photo. Estimate on-device or use focus distance.";
}

export function DepthPopover({ open, onOpenChange }: DepthPopoverProps) {
	const engine = useEngine();
	const { state, source, depthStatusMessage, depthBusy } = useEngineSnapshot();
	const { scene, view } = state;
	const hasDepth = Boolean(source?.depth);

	return (
		<PopoverMenu
			id="depthMenu"
			className="depth-menu"
			align="end"
			ariaLabel="Depth and focus"
			open={open}
			onOpenChange={onOpenChange}
			trigger={
				<Toolbar.Button
					type="button"
					className="ib"
					id="depthBtn"
					title="Depth & focus"
				>
					<DepthIcon />
					<span className="ibl">Depth</span>
					{scene.depthEnabled && <span className="dot" id="depthDot" />}
				</Toolbar.Button>
			}
		>
			<div className="mlabel">Depth &amp; focus</div>
			<p className="note" id="depthSource">
				{describeDepth(source)}
			</p>
			<SwitchField
				label="Per-pixel depth defocus"
				checked={scene.depthEnabled}
				onChange={(checked) => engine.setDepthEnabled(checked)}
			/>
			<SliderField
				label="Focus distance"
				min={0}
				max={1000}
				step={1}
				value={scene.dist}
				toSlider={(distance) =>
					(Math.log(distance / 0.05) / Math.log(50 / 0.05)) * 1000
				}
				fromSlider={(value) => 0.05 * Math.pow(50 / 0.05, value / 1000)}
				formatValue={(value) =>
					value < 1 ? `${Math.round(value * 100)} cm` : `${value.toFixed(1)} m`
				}
				hint="Dogs accommodate only 2 to 3 D, so anything nearer than about 40 cm blurs."
				onChange={(value) =>
					engine.mutate(({ scene: draftScene }) => {
						draftScene.dist = value;
						draftScene.focusPoint = null;
					})
				}
			/>
			{source?.kind === "image" && !hasDepth && (
				<button
					type="button"
					className="pill"
					id="estimateDepth"
					disabled={depthBusy}
					onClick={() => engine.estimateDepth()}
				>
					Estimate depth (on-device AI, ~24 MB)
				</button>
			)}
			{depthStatusMessage && scene.depthEnabled && (
				<p className="note" id="depthStatus" role="status">
					{depthStatusMessage}
				</p>
			)}
			{hasDepth && (
				<SwitchField
					id="depthOverlayToggle"
					label="Show depth map"
					checked={view.overlay === 3}
					onChange={(checked) => engine.setOverlay(checked ? 3 : 0)}
				/>
			)}
			{hasDepth && scene.depthEnabled && (
				<div id="depthCalibration">
					<SliderField
						label="Near depth calibration"
						min={0.1}
						max={10}
						step={0.05}
						value={scene.depthNearM}
						formatValue={(value) => `${value.toFixed(2)} m`}
						onChange={(value) =>
							engine.mutate(({ scene: draftScene }) => {
								draftScene.depthNearM = Math.min(
									value,
									draftScene.depthFarM - 0.05,
								);
							})
						}
					/>
					<SliderField
						label="Far depth calibration"
						min={0.5}
						max={100}
						step={0.5}
						value={scene.depthFarM}
						formatValue={(value) => `${value.toFixed(1)} m`}
						onChange={(value) =>
							engine.mutate(({ scene: draftScene }) => {
								draftScene.depthFarM = Math.max(
									value,
									draftScene.depthNearM + 0.05,
								);
							})
						}
					/>
					<p className="note">Shift-click or tap an object to focus there.</p>
				</div>
			)}
		</PopoverMenu>
	);
}
