import { Toggle } from "@base-ui/react/toggle";
import { Tooltip } from "@base-ui/react/tooltip";
import { useEngine, useEngineSnapshot } from "../../engine";
import { STAGES } from "../../model";

export function PipelineTab() {
	const engine = useEngine();
	const { state } = useEngineSnapshot();

	return (
		<>
			<p className="lede">
				The stages run in the order light travels through the eye. Tap one to
				switch it off and see what it contributes.
			</p>
			<div className="pipe" id="pipe">
				{STAGES.map((stage) => {
					const tooltipId = `stage-tip-${stage.n}`;
					const toggle = (
						<Toggle
							pressed={Boolean(state.stages[stage.n])}
							aria-describedby={tooltipId}
							disabled={stage.fixed}
							onPressedChange={() => engine.toggleStage(stage.n)}
							className={stage.fixed ? "st fixed" : "st"}
							style={stage.fixed ? { pointerEvents: "none" } : undefined}
						>
							<span className="n">{stage.n}</span>
							{stage.name}
						</Toggle>
					);

					return (
						<Tooltip.Root key={stage.n}>
							{stage.fixed ? (
								<Tooltip.Trigger render={<div />}>{toggle}</Tooltip.Trigger>
							) : (
								<Tooltip.Trigger render={toggle} />
							)}
							<Tooltip.Portal>
								<Tooltip.Positioner
									className="tooltip-positioner"
									sideOffset={6}
								>
									<Tooltip.Popup
										className="tooltip"
										id={tooltipId}
										role="tooltip"
									>
										{stage.tip}
									</Tooltip.Popup>
								</Tooltip.Positioner>
							</Tooltip.Portal>
						</Tooltip.Root>
					);
				})}
			</div>
		</>
	);
}
