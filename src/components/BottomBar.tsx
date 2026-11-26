import { Toolbar } from "@base-ui/react/toolbar";
import {
	type EngineSnapshot,
	useEngine,
	useEngineSnapshot,
	useViewportMetrics,
} from "../engine";

function overlayChip({ state, model, source }: EngineSnapshot) {
	switch (state.view.overlay) {
		case 1:
			return (
				<span className="chip">
					Acuity map: <b>blue</b> 2 cpd or less, <b>gold</b> 16 cpd, a line at
					each doubling
				</span>
			);
		case 2:
			return (
				<span className="chip">
					Dashed lines: binocular zone ±
					{Math.round(model.derived.binocular_overlap_deg / 2)}°
					{model.U.uTunnel[0] < 179 && " · blue ring: remaining field"}
				</span>
			);
		case 3:
			return (
				<span className="chip">
					{source?.depth?.metric ? "Metric depth" : "Relative depth"} · white is
					nearer
				</span>
			);
		default:
			return null;
	}
}

export function BottomBar() {
	const engine = useEngine();
	const snapshot = useEngineSnapshot();
	const { zoomLabel } = useViewportMetrics();
	const {
		state,
		model,
		source,
		activePanorama,
		adaptedLogL,
		cameraLive,
		videoPaused,
	} = snapshot;
	const { scene, view } = state;
	const { m, derived } = model;
	const regime = m < 0.05 ? "Photopic" : m > 0.95 ? "Scotopic" : "Mesopic";
	const cpd = derived.acuity_cpd_centre;
	const hfov = activePanorama ? derived.field_total_deg : scene.hfov;
	const adapting =
		scene.adaptMode !== "instant" && Math.abs(adaptedLogL - scene.logL) > 0.01;
	const overlay = overlayChip(snapshot);

	return (
		<div className="bar bottombar">
			{(view.hud || overlay) && (
				<div className="hud" id="hud">
					{overlay}
					{view.hud && (
						<>
							<span className="chip">
								{regime}
								{m >= 0.05 && (
									<>
										{" "}
										· rods <b>{Math.round(m * 100)}%</b>
									</>
								)}
							</span>
							<span className="chip">
								Centre <b>{cpd} cpd</b> · 20/
								{Math.round(600 / Math.max(cpd, 0.1))}
							</span>
							<span className="chip">
								{((source?.canvas.width ?? 0) / hfov).toFixed(0)} px/°
							</span>
							{adapting && (
								<span className="chip">
									Adapting: 10^{adaptedLogL.toFixed(1)} → 10^
									{scene.logL.toFixed(1)} cd/m²
								</span>
							)}
						</>
					)}
				</div>
			)}
			<div className="media">
				{source?.kind === "video" && (
					<>
						{cameraLive && source.canFlip && (
							<button
								type="button"
								id="camflip"
								className="pill"
								onClick={() => void engine.startCamera(true)}
							>
								Flip
							</button>
						)}
						{!cameraLive && (
							<button
								type="button"
								id="vidplay"
								className="pill"
								onClick={() => void engine.toggleVideoPlayback()}
							>
								{videoPaused ? "Play" : "Pause"}
							</button>
						)}
						<button
							type="button"
							id="camstop"
							className="pill"
							onClick={() => engine.stopMedia()}
						>
							Stop
						</button>
					</>
				)}
			</div>
			<Toolbar.Root className="zoom" aria-label="Zoom">
				<Toolbar.Button
					id="zout"
					aria-label="Zoom out"
					onClick={() => engine.zoomOut()}
				>
					−
				</Toolbar.Button>
				<Toolbar.Button
					id="zlabel"
					title="Fit to view"
					onClick={() => engine.zoomFit()}
				>
					{zoomLabel}
				</Toolbar.Button>
				<Toolbar.Button
					id="z11"
					title="One image pixel per screen pixel"
					onClick={() => engine.zoomNative()}
				>
					1:1
				</Toolbar.Button>
				<Toolbar.Button
					id="zin"
					aria-label="Zoom in"
					onClick={() => engine.zoomIn()}
				>
					+
				</Toolbar.Button>
			</Toolbar.Root>
		</div>
	);
}
