import { useEffect, useRef } from "react";
import { clamp, dogMatrix } from "../model";
import type { Mat3, Vec3 } from "../types";

const TICKS = [400, 480, 555, 620, 700];
const WIDTH = 560;
const HEIGHT = 22;

// approximate spectral colours, then the dog matrix
function wl2rgb(l: number): Vec3 {
	let r = 0,
		g = 0,
		b = 0;
	if (l < 440) {
		r = -(l - 440) / 60;
		b = 1;
	} else if (l < 490) {
		g = (l - 440) / 50;
		b = 1;
	} else if (l < 510) {
		g = 1;
		b = -(l - 510) / 20;
	} else if (l < 580) {
		r = (l - 510) / 70;
		g = 1;
	} else if (l < 645) {
		r = 1;
		g = -(l - 645) / 65;
	} else r = 1;
	const f =
		l < 420
			? 0.3 + (0.7 * (l - 380)) / 40
			: l > 645
				? 0.3 + (0.7 * (700 - l)) / 55
				: 1;
	const lin = (v: number) => {
		v = Math.max(0, v * f);
		return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
	};
	return [lin(r), lin(g), lin(b)];
}

const encode = (v: number) =>
	Math.round(
		255 *
			clamp(
				v <= 0.0031308
					? 12.92 * v
					: 1.055 * Math.pow(clamp(v, 0, 1), 1 / 2.4) - 0.055,
				0,
				1,
			),
	);

function paintStrip(canvas: HTMLCanvasElement | null, matrix: Mat3 | null) {
	const x = canvas?.getContext("2d");
	if (!canvas || !x) return;
	const w = canvas.width,
		h = canvas.height;
	for (let i = 0; i < w; i++) {
		const l = 400 + (300 * i) / w;
		let rgb = wl2rgb(l);
		if (matrix) {
			const dot = (row: Vec3) =>
				row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2];
			rgb = [dot(matrix[0]), dot(matrix[1]), dot(matrix[2])];
		}
		x.fillStyle = `rgb(${rgb.map(encode).join(",")})`;
		x.fillRect(i, 0, 1, h);
	}
}

export function SpectrumPreview({ chroma }: { chroma: number }) {
	const humanRef = useRef<HTMLCanvasElement>(null);
	const dogRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		paintStrip(humanRef.current, null);
	}, []);

	useEffect(() => {
		paintStrip(dogRef.current, dogMatrix(chroma));
	}, [chroma]);

	return (
		<div className="spec">
			<div className="row">
				<span>Human</span>
				<canvas id="specH" ref={humanRef} width={WIDTH} height={HEIGHT} />
			</div>
			<div className="row">
				<span>Dog</span>
				<canvas id="specD" ref={dogRef} width={WIDTH} height={HEIGHT} />
			</div>
			<div className="ticks" id="ticks">
				{TICKS.map((l) => (
					<span
						key={l}
						style={{ left: `${(l - 400) / 3}%` }}
						className={l === 480 ? "np" : undefined}
					>
						{l === 480 ? "480 neutral" : l}
					</span>
				))}
			</div>
		</div>
	);
}
