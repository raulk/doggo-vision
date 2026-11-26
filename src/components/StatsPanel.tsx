import { Fragment } from "react";
import {
	type EngineSnapshot,
	type StatsSnapshot,
	useEngine,
	useEngineSnapshot,
	useStatsSnapshot,
} from "../engine";
import { gainMapHeadroom } from "../metadata";

function statsRows(
	{ state, source, activePanorama: pano }: EngineSnapshot,
	{ model: comp, adaptedLogL, glStats }: NonNullable<StatsSnapshot>,
): ReadonlyArray<readonly [label: string, value: string, warn?: boolean]> {
	const W = source?.canvas.width ?? 0;
	const H = source?.canvas.height ?? 0;
	const photo = source?.kind === "image" ? source.photo : undefined;
	const gain = source?.kind === "image" ? source.gain : undefined;
	const depth = source?.depth;
	const d = comp.derived;
	const scene = state.scene;
	const hfov = pano ? d.field_total_deg : scene.hfov;
	const projLabel = pano
		? `${pano.projection === "equirectangular" ? "Equirectangular" : "Cylindrical"} (${Math.round(pano.hfovDeg)}°×${Math.round(pano.vfovDeg)}°)`
		: source?.equiangular
			? "Equiangular"
			: "Rectilinear";
	const sourceDesc = [
		source?.name || "sample",
		`${W}×${H}`,
		glStats.inputP3 ? "Display P3" : photo?.colorSpace || "sRGB",
		photo?.orientation && photo.orientation !== 1
			? `EXIF orient ${photo.orientation}`
			: "",
	]
		.filter(Boolean)
		.join(" · ");
	const cameraDesc = [
		photo?.model?.toLowerCase().startsWith(photo?.make?.toLowerCase() ?? "")
			? photo.model
			: [photo?.make, photo?.model].filter(Boolean).join(" "),
		photo?.lensModel,
	]
		.filter(Boolean)
		.join(" · ");
	const radianceDesc = [
		gain
			? `HDR (${gain.info.format}, +${Math.log2(gainMapHeadroom(gain.info)).toFixed(1)} EV${gain.info.baseRenditionIsHdr ? ", HDR base" : ""})`
			: "SDR",
		glStats.floatRT ? "RGBA16F linear" : "RGBA8",
		`${glStats.levels} mips`,
	].join(" · ");

	let depthSourceDesc = "None (no embedded depth)";
	let depthDecodeDesc = "—";
	let depthWarn = false;
	if (source?.kind === "video") {
		depthSourceDesc = "Unavailable (video)";
	} else if (depth?.kind === "embedded") {
		depthSourceDesc = `${depth.label ?? "Embedded"} · ${depth.metric ? "metric" : "relative"}`;
		depthDecodeDesc = depth.detail ?? "Embedded auxiliary map";
	} else if (depth?.kind === "estimated") {
		depthSourceDesc = "On-device AI · relative";
		depthDecodeDesc = depth.detail ?? "Depth Anything V2 Small";
	} else if (depth?.kind === "procedural") {
		depthSourceDesc = "Built-in scene map";
		depthDecodeDesc = `Analytic inverse depth (${depth.nearM.toFixed(2)}–${depth.farM.toFixed(1)} m)`;
	} else if (photo?.depthError) {
		depthSourceDesc = "Embedded decode failed";
		depthDecodeDesc = photo.depthError;
		depthWarn = true;
	}
	const focusStr =
		scene.dist < 1
			? `${Math.round(scene.dist * 100)} cm`
			: `${scene.dist.toFixed(2)} m`;
	const depthMapDesc = depth
		? [
				`${depth.canvas.width}×${depth.canvas.height}`,
				scene.depthEnabled ? "active" : "off",
				`${scene.depthNearM.toFixed(2)}–${scene.depthFarM.toFixed(1)} m`,
				`focus ${focusStr}`,
				scene.focusPoint
					? `@(${scene.focusPoint[0].toFixed(2)},${scene.focusPoint[1].toFixed(2)})`
					: "",
			]
				.filter(Boolean)
				.join(" · ")
		: `off · uniform focus ${focusStr}`;

	const m = comp.m;
	const regime = m < 0.05 ? "Photopic" : m > 0.95 ? "Scotopic" : "Mesopic";
	const lightDesc = [
		regime,
		Math.abs(adaptedLogL - scene.logL) > 0.01
			? `10^${adaptedLogL.toFixed(1)}→10^${scene.logL.toFixed(1)} cd/m²`
			: `10^${scene.logL.toFixed(1)} cd/m²`,
		`rods ${Math.round(m * 100)}%`,
	].join(" · ");
	const opticsDesc = [
		`${d.acuity_cpd_centre} cpd (20/${Math.round(600 / Math.max(d.acuity_cpd_centre, 0.1))})`,
		`pupil ${d.pupil_mm} mm`,
		`acc ${d.accommodation_max_D} D`,
		`defocus ${d.defocus_D} D`,
	].join(" · ");
	const scatterDesc = [
		`veil ${(comp.U.uVeil * 100).toFixed(1)}%`,
		`ant. trans ${Math.round(comp.U.uAntTrans[1] * 100)}%`,
		state.binoc.on
			? `binoc ±${Math.round(d.binocular_overlap_deg / 2)}°`
			: state.profile.eye,
	].join(" · ");
	const canvasEl = document.querySelector<HTMLCanvasElement>("#gl");
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const perfDesc = [
		`${canvasEl?.width ?? 0}×${canvasEl?.height ?? 0} @${dpr}×`,
		`${glStats.renderMs.toFixed(1)} ms`,
		glStats.animated && glStats.fps > 0
			? `${Math.round(glStats.fps)} fps`
			: "idle",
	].join(" · ");

	return [
		["Source", sourceDesc],
		...(cameraDesc ? [["Camera", cameraDesc] as const] : []),
		[
			"Projection",
			`${projLabel} · ${hfov.toFixed(0)}° · ${(W / Math.max(hfov, 1)).toFixed(1)} px/°`,
		],
		["Radiance", radianceDesc],
		["Depth source", depthSourceDesc, depthWarn],
		["Depth decode", depthDecodeDesc, depthWarn],
		["Depth map", depthMapDesc],
		["Optics", opticsDesc],
		["Light", lightDesc],
		["Scatter", scatterDesc],
		["Viewport", perfDesc],
		["GPU", glStats.renderer],
	];
}

export function StatsPanel() {
	const engine = useEngine();
	const snapshot = useEngineSnapshot();
	const stats = useStatsSnapshot();
	if (!snapshot.state.view.stats || !stats) return null;

	const rows = statsRows(snapshot, stats);

	async function copyStats() {
		const lines = rows.map(([label, value]) => `${label}: ${value}`);
		try {
			await navigator.clipboard.writeText(lines.join("\n"));
			engine.notifyToast("Stats copied");
		} catch {
			engine.notifyToast("Could not copy stats here.");
		}
	}

	return (
		<aside className="stats" id="statsPanel" aria-label="Stats for nerds">
			<div className="stats-head">
				<span>Stats for nerds</span>
				<div className="stats-actions">
					<button
						type="button"
						id="statsCopy"
						title="Copy stats"
						onClick={() => void copyStats()}
					>
						Copy
					</button>
					<button
						type="button"
						id="statsClose"
						aria-label="Close stats"
						onClick={() => engine.setStats(false)}
					>
						×
					</button>
				</div>
			</div>
			<dl className="stats-grid" id="statsGrid">
				{rows.map(([label, value, warn]) => (
					<Fragment key={label}>
						<dt>{label}</dt>
						<dd className={warn ? "warn" : undefined}>{value}</dd>
					</Fragment>
				))}
			</dl>
		</aside>
	);
}
