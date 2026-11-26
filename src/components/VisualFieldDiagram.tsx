import type { Vec2 } from "../types";

interface VisualFieldDiagramProps {
	totalFieldDeg: number;
	binocularOverlapDeg: number;
}

const CX = 80;
const CY = 84;
const R = 70;

// angles in degrees, 0 = straight ahead (up), clockwise positive
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
	const p = (a: number): Vec2 => [
		cx + r * Math.sin((a * Math.PI) / 180),
		cy - r * Math.cos((a * Math.PI) / 180),
	];
	const [x0, y0] = p(a0),
		[x1, y1] = p(a1),
		large = a1 - a0 > 180 ? 1 : 0;
	return `M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`;
}

export function VisualFieldDiagram({
	totalFieldDeg: F,
	binocularOverlapDeg: B,
}: VisualFieldDiagramProps) {
	return (
		<div className="fov">
			<svg
				id="fovsvg"
				viewBox="0 0 160 160"
				role="img"
				aria-label="Top-down visual field"
			>
				<path
					d={arcPath(CX, CY, R, F / 2, 360 - F / 2)}
					fill="var(--glass-2)"
					stroke="var(--line)"
				/>
				<path
					d={arcPath(CX, CY, R, -F / 2, F / 2)}
					fill="var(--fg)"
					fillOpacity={0.12}
					stroke="var(--fg)"
					strokeOpacity={0.35}
				/>
				<path
					d={arcPath(CX, CY, R, -B / 2, B / 2)}
					fill="var(--fg)"
					fillOpacity={0.55}
				/>
				<ellipse cx={CX} cy={CY + 4} rx={11} ry={15} fill="var(--fg)" />
				<ellipse cx={CX} cy={CY - 12} rx={5} ry={7} fill="var(--fg)" />
			</svg>
			<div className="legend" id="fovlegend">
				<div>
					<i style={{ background: "var(--fg)", opacity: 0.55 }} />
					Binocular {B}°
				</div>
				<div>
					<i
						style={{
							background: "var(--fg)",
							opacity: 0.15,
							border: "1px solid var(--fg)",
						}}
					/>
					Total field {F}°
				</div>
				<div>
					<i
						style={{
							background: "var(--glass-2)",
							border: "1px solid var(--line)",
						}}
					/>
					Blind behind {360 - F}°
				</div>
				<div style={{ color: "var(--muted)" }}>
					Field sizes by skull type are working values with no primary source.
				</div>
			</div>
		</div>
	);
}
