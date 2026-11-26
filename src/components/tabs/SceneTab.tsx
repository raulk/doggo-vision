import { useEngine, useEngineSnapshot } from "../../engine";
import { photoSummary } from "../../metadata";
import { CheckboxField, SelectField, SliderField } from "../ui";

function formatLight(value: number) {
	const levels = [
		{ below: -2.5, name: "starlight" },
		{ below: -1.5, name: "moonlight" },
		{ below: -0.3, name: "dusk" },
		{ below: 0.6, name: "street lighting" },
		{ below: 2, name: "indoors" },
	];
	const name = levels.find(({ below }) => value < below)?.name ?? "daylight";
	return `${name} · 10^${value.toFixed(1)} cd/m²`;
}

export function SceneTab() {
	const engine = useEngine();
	const {
		state: { scene },
		source,
		adaptedLogL,
		activePanorama,
	} = useEngineSnapshot();
	const width = source?.canvas.width ?? 0;
	const height = source?.canvas.height ?? 0;
	const metadata =
		source?.kind === "image" && source.photo
			? photoSummary(source.photo, true)
			: "";
	const adaptation =
		scene.adaptMode !== "instant" && Math.abs(adaptedLogL - scene.logL) > 0.01
			? ` Adapting: 10^${adaptedLogL.toFixed(1)} → 10^${scene.logL.toFixed(1)} cd/m²`
			: "";

	return (
		<>
			<h3>Light and geometry</h3>
			<p className="lede">
				These describe the photo. Acuity is drawn to scale for the field of view
				you set, so zoom to 1:1 to judge fine detail.
			</p>
			<div id="sceneCtl">
				<SliderField
					label="Light level"
					conf="P"
					min={-3.5}
					max={3.5}
					step={0.1}
					hint="Below about 10 cd/m² rods take over: colour drains, acuity falls toward 3 cpd, and the dog stays brighter than a human would."
					value={scene.logL}
					onChange={(v) =>
						engine.mutate(
							(draft) => {
								draft.scene.logL = v;
							},
							{ clearPreset: true },
						)
					}
					formatValue={formatLight}
				/>
				<SliderField
					id="imageFov"
					hidden={Boolean(activePanorama)}
					label="Image field of view"
					min={4}
					max={120}
					step={1}
					hint="How much of the world the photo spans. A phone camera is about 65°."
					value={scene.hfov}
					onChange={(v) =>
						engine.mutate(
							(draft) => {
								draft.scene.hfov = v;
							},
							{ clearPreset: true },
						)
					}
					formatValue={(v) => Math.round(v) + "° wide"}
				/>
				<SelectField
					label="Projection"
					options={[
						{ value: "auto", label: "Auto" },
						{ value: "photo", label: "Photo (rectilinear)" },
						{ value: "panorama", label: "Panorama (360° wide-FOV)" },
					]}
					layout="row"
					value={scene.projection}
					onChange={(mode) =>
						engine.mutate((draft) => {
							draft.scene.projection = mode;
						})
					}
				/>
				{activePanorama && (
					<button
						type="button"
						className="pill"
						id="centerView"
						onClick={() => engine.centerView()}
					>
						Center view
					</button>
				)}
				<SelectField
					label="Dark adaptation"
					options={[
						{ value: "instant", label: "Instant (steady state)" },
						{ value: "preview", label: "Fast preview (60×)" },
						{ value: "realtime", label: "Real-time (25–30 min)" },
					]}
					layout="row"
					value={scene.adaptMode}
					onChange={(mode) =>
						engine.mutate((draft) => {
							draft.scene.adaptMode = mode;
						})
					}
				/>
				{scene.adaptMode !== "instant" && (
					<button
						type="button"
						className="pill"
						id="snapAdapted"
						onClick={() => engine.snapAdaptation()}
					>
						Snap adapted
					</button>
				)}
				<CheckboxField
					label="Show muzzle silhouette"
					conf="S"
					checked={scene.nose}
					onChange={(v) =>
						engine.mutate((draft) => {
							draft.scene.nose = v;
						})
					}
				/>
				<CheckboxField
					label="Animate (tear film, particles, noise, video)"
					checked={scene.live}
					onChange={(v) =>
						engine.mutate((draft) => {
							draft.scene.live = v;
						})
					}
				/>
				<CheckboxField
					label="CRT flicker illustration (slowed down)"
					conf="P"
					checked={scene.flicker}
					onChange={(v) =>
						engine.mutate((draft) => {
							draft.scene.flicker = v;
						})
					}
				/>
				<p className="note" id="srcinfo">
					{`Source: ${source?.name || "sample"} · ${width}×${height} px${source?.kind === "video" ? " · video" : ""}${metadata ? ` · ${metadata}` : ""}.${adaptation}`}
				</p>
			</div>
		</>
	);
}
