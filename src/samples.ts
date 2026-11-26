import type { DepthMap, SampleId, SourceMeta } from "./types";

// ---------- Procedural sample scenes (no external images allowed) ----------
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}
function mk(w: number, h: number) {
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	return c;
}
const NEAR = 0.35,
	FAR = 40;

function depthColor(meters: number) {
	const d = Math.round((255 * (1 / meters - 1 / FAR)) / (1 / NEAR - 1 / FAR));
	return `rgb(${d},${d},${d})`;
}

function depthScene(width: number, height: number) {
	const canvas = mk(512, Math.round((512 * height) / width));
	const context = canvas.getContext("2d")!;
	context.scale(canvas.width / width, canvas.height / height);
	context.fillStyle = depthColor(FAR);
	context.fillRect(0, 0, width, height);
	const map: DepthMap = { canvas, nearM: NEAR, farM: FAR, kind: "procedural" };
	return { context, map };
}

function groundDepth(
	x: CanvasRenderingContext2D,
	w: number,
	horizon: number,
	bottom: number,
	far: number,
	near: number,
) {
	// A flat ground plane changes linearly in inverse distance with image height.
	const gradient = x.createLinearGradient(0, horizon, 0, bottom);
	gradient.addColorStop(0, depthColor(far));
	gradient.addColorStop(1, depthColor(near));
	x.fillStyle = gradient;
	x.fillRect(0, horizon, w, bottom - horizon);
}

function ellipse(
	x: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	rx: number,
	ry = rx,
	rotation = 0,
) {
	x.beginPath();
	x.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
	x.fill();
}

function ball(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	r: number,
	base: string,
	hi: string,
	shade: string,
) {
	ctx.save();
	ctx.fillStyle = "rgba(0,0,0,0.28)";
	ctx.beginPath();
	ctx.ellipse(x + r * 0.25, y + r * 0.92, r * 1.05, r * 0.28, 0, 0, 7);
	ctx.fill();
	const g = ctx.createRadialGradient(
		x - r * 0.4,
		y - r * 0.45,
		r * 0.1,
		x,
		y,
		r * 1.05,
	);
	g.addColorStop(0, hi);
	g.addColorStop(0.45, base);
	g.addColorStop(1, shade);
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, 7);
	ctx.fill();
	ctx.restore();
}

function sceneYard() {
	const W = 1600,
		H = 1000,
		c = mk(W, H),
		x = c.getContext("2d")!,
		R = rng(7);
	const { context: d, map } = depthScene(W, H);
	const sky = x.createLinearGradient(0, 0, 0, 470);
	sky.addColorStop(0, "#4f8fdc");
	sky.addColorStop(1, "#cfe2f4");
	x.fillStyle = sky;
	x.fillRect(0, 0, W, 480);
	x.fillStyle = "rgba(255,255,255,0.85)";
	(
		[
			[260, 120, 110, 34],
			[340, 100, 80, 30],
			[980, 90, 130, 36],
			[1080, 115, 90, 28],
			[1400, 170, 100, 26],
		] as const
	).forEach(([a, b, rx, ry]) => {
		x.beginPath();
		x.ellipse(a, b, rx, ry, 0, 0, 7);
		x.fill();
	});
	// tree line
	d.fillStyle = depthColor(25);
	for (let i = 0; i < 160; i++) {
		const tx = R() * W,
			ty = 330 + R() * 120,
			r = 26 + R() * 60;
		const g = Math.floor(70 + R() * 60),
			rC = Math.floor(30 + R() * 35);
		x.fillStyle = `rgb(${rC},${g},${Math.floor(25 + R() * 30)})`;
		x.beginPath();
		x.arc(tx, ty, r, 0, 7);
		x.fill();
		ellipse(d, tx, ty, r);
	}
	x.fillStyle = "#3d5d2c";
	x.fillRect(0, 440, W, 40);
	d.fillRect(0, 440, W, 40);
	// lawn
	const lawn = x.createLinearGradient(0, 470, 0, H);
	lawn.addColorStop(0, "#6aa040");
	lawn.addColorStop(1, "#3a7426");
	x.fillStyle = lawn;
	x.fillRect(0, 470, W, H - 470);
	groundDepth(d, W, 470, H, 8, 0.45);
	for (let i = 0; i < 26000; i++) {
		const gy = 475 + Math.pow(R(), 0.8) * (H - 475),
			depth = (gy - 470) / (H - 470);
		const gx = R() * W,
			len = 3 + depth * 16,
			lean = (R() - 0.5) * depth * 8;
		const v = R();
		x.strokeStyle = v < 0.33 ? "#2f6a1f" : v < 0.66 ? "#5c9a34" : "#86b94e";
		x.lineWidth = 0.6 + depth * 1.6;
		x.beginPath();
		x.moveTo(gx, gy);
		x.lineTo(gx + lean, gy - len);
		x.stroke();
	}
	// fence
	d.fillStyle = depthColor(8);
	for (let fx = -10; fx < W; fx += 46) {
		x.fillStyle = "#f2efe8";
		const picket = new Path2D();
		picket.moveTo(fx, 540);
		picket.lineTo(fx, 425);
		picket.lineTo(fx + 15, 405);
		picket.lineTo(fx + 30, 425);
		picket.lineTo(fx + 30, 540);
		x.fill(picket);
		d.fill(picket);
		x.fillStyle = "rgba(0,0,0,0.12)";
		x.fillRect(fx + 22, 425, 8, 115);
	}
	x.fillStyle = "#e7e3d9";
	x.fillRect(0, 440, W, 12);
	x.fillRect(0, 505, W, 12);
	d.fillRect(0, 440, W, 12);
	d.fillRect(0, 505, W, 12);
	// flower bed
	const fcols = [
		"#d7263d",
		"#f46036",
		"#e8c547",
		"#9b5de5",
		"#ff70a6",
		"#ffffff",
		"#2e86ff",
	];
	for (let i = 0; i < 260; i++) {
		const fx = R() * W,
			fy = 520 + R() * 48,
			r = 4 + R() * 6;
		x.fillStyle = "#2e5a1e";
		x.fillRect(fx - 1, fy, 2, 18);
		x.fillStyle = fcols[Math.floor(R() * fcols.length)]!;
		x.beginPath();
		x.arc(fx, fy, r, 0, 7);
		x.fill();
	}
	// toys
	for (const [cx, cy, radius, base, highlight, shade, meters] of [
		[520, 770, 58, "#d81e1e", "#ff8a7a", "#6a0a0a", 1.5],
		[1090, 700, 44, "#1f5fe0", "#9cc0ff", "#0b2a70", 2.4],
		[820, 845, 32, "#d9e021", "#f6ffb0", "#7a7d00", 0.85],
		[1460, 760, 30, "#3a9a2a", "#a6e07e", "#16400e", 1.7],
	] as const) {
		ball(x, cx, cy, radius, base, highlight, shade);
		d.fillStyle = depthColor(meters);
		ellipse(d, cx, cy, radius);
	}
	x.strokeStyle = "#f7f7f2";
	x.lineWidth = 3;
	x.beginPath();
	x.arc(806, 835, 26, -0.6, 1.1);
	x.stroke();
	x.beginPath();
	x.arc(840, 857, 26, 2.6, 4.2);
	x.stroke();
	x.save();
	x.translate(1300, 860);
	x.rotate(-0.15);
	x.fillStyle = "rgba(0,0,0,0.25)";
	x.beginPath();
	x.ellipse(10, 18, 92, 22, 0, 0, 7);
	x.fill();
	const fg = x.createLinearGradient(0, -30, 0, 30);
	fg.addColorStop(0, "#ff9a3c");
	fg.addColorStop(1, "#c4520c");
	x.fillStyle = fg;
	x.beginPath();
	x.ellipse(0, 0, 90, 26, 0, 0, 7);
	x.fill();
	x.strokeStyle = "#ffd2a3";
	x.lineWidth = 3;
	x.beginPath();
	x.ellipse(0, -2, 62, 16, 0, 0, 7);
	x.stroke();
	x.restore();
	d.fillStyle = depthColor(0.95);
	ellipse(d, 1300, 860, 90, 26, -0.15);
	// striped tug rope
	x.save();
	x.translate(300, 900);
	x.rotate(0.35);
	d.save();
	d.translate(300, 900);
	d.rotate(0.35);
	d.fillStyle = depthColor(0.42);
	d.fillRect(-120, -13, 234, 26);
	ellipse(d, -128, 0, 20);
	ellipse(d, 122, 0, 20);
	d.restore();
	for (let i = 0; i < 9; i++) {
		x.fillStyle = i % 2 ? "#1c4fd8" : "#e0262b";
		x.fillRect(-120 + i * 26, -13, 26, 26);
	}
	x.fillStyle = "#e0262b";
	x.beginPath();
	x.arc(-128, 0, 20, 0, 7);
	x.arc(122, 0, 20, 0, 7);
	x.fill();
	x.restore();
	// Teal ring near the dog neutral point.
	x.strokeStyle = "#00d0c0";
	x.lineWidth = 12;
	x.beginPath();
	x.ellipse(700, 640, 46, 18, 0, 0, 7);
	x.stroke();
	d.strokeStyle = depthColor(3.2);
	d.lineWidth = 12;
	d.beginPath();
	d.ellipse(700, 640, 46, 18, 0, 0, 7);
	d.stroke();
	return {
		canvas: c,
		depth: map,
		name: "Backyard",
		hfov: 50,
		dist: 6,
		logL: 2.8,
	};
}

function sceneStreet() {
	const W = 1600,
		H = 1000,
		c = mk(W, H),
		x = c.getContext("2d")!,
		R = rng(11);
	const { context: d, map } = depthScene(W, H);
	const sky = x.createLinearGradient(0, 0, 0, 620);
	sky.addColorStop(0, "#060a18");
	sky.addColorStop(1, "#1d2546");
	x.fillStyle = sky;
	x.fillRect(0, 0, W, 640);
	for (let i = 0; i < 220; i++) {
		const a = R() * 0.8;
		x.fillStyle = `rgba(255,255,255,${a})`;
		x.fillRect(R() * W, R() * 360, 1.6, 1.6);
	}
	const moon = x.createRadialGradient(1330, 130, 0, 1330, 130, 120);
	moon.addColorStop(0, "rgba(255,250,230,1)");
	moon.addColorStop(0.28, "rgba(255,248,225,1)");
	moon.addColorStop(0.32, "rgba(160,170,210,0.25)");
	moon.addColorStop(1, "rgba(60,70,120,0)");
	x.fillStyle = moon;
	x.beginPath();
	x.arc(1330, 130, 120, 0, 7);
	x.fill();
	// buildings
	d.fillStyle = depthColor(30);
	let bx = -20;
	while (bx < W) {
		const bw = 140 + R() * 170,
			bh = 260 + R() * 300,
			top = 640 - bh;
		x.fillStyle = `rgb(${(12 + R() * 10) | 0},${(14 + R() * 10) | 0},${(22 + R() * 12) | 0})`;
		x.fillRect(bx, top, bw, bh);
		d.fillRect(bx, top, bw, bh);
		for (let wy = top + 24; wy < 600; wy += 42)
			for (let wx = bx + 16; wx < bx + bw - 26; wx += 34) {
				const v = R();
				if (v < 0.32) {
					x.fillStyle = v < 0.05 ? "#8fb6ff" : v < 0.1 ? "#ffe2b0" : "#ffbf5e";
					x.fillRect(wx, wy, 18, 24);
				}
			}
		bx += bw + 6;
	}
	// road and pavement
	x.fillStyle = "#1a1b20";
	x.fillRect(0, 640, W, 60);
	d.fillStyle = depthColor(20);
	d.fillRect(0, 640, W, 60);
	groundDepth(d, W, 700, H, 20, 1.5);
	const road = x.createLinearGradient(0, 700, 0, H);
	road.addColorStop(0, "#16171c");
	road.addColorStop(1, "#0d0e11");
	x.fillStyle = road;
	x.fillRect(0, 700, W, H - 700);
	x.fillStyle = "#6d6a58";
	for (let lx = 20; lx < W; lx += 160) {
		x.beginPath();
		x.moveTo(lx, 850);
		x.lineTo(lx + 90, 850);
		x.lineTo(lx + 96, 862);
		x.lineTo(lx + 6, 862);
		x.fill();
	}
	// street lamps with light pools
	(
		[
			[220, 0.9],
			[720, 1],
			[1220, 0.95],
		] as const
	).forEach(([lx, k], i) => {
		d.fillStyle = depthColor(12 + 3 * i);
		d.fillRect(lx - 5, 380, 10, 330);
		d.fillRect(lx - 5, 380, 60, 8);
		ellipse(d, lx + 52, 394, 14, 8);
		const pool = x.createRadialGradient(lx, 760, 10, lx, 760, 300);
		pool.addColorStop(0, `rgba(255,196,110,${0.35 * k})`);
		pool.addColorStop(1, "rgba(255,196,110,0)");
		x.fillStyle = pool;
		x.beginPath();
		x.ellipse(lx, 760, 300, 90, 0, 0, 7);
		x.fill();
		x.fillStyle = "#262a33";
		x.fillRect(lx - 5, 380, 10, 330);
		x.fillRect(lx - 5, 380, 60, 8);
		const glow = x.createRadialGradient(lx + 52, 396, 0, lx + 52, 396, 70);
		glow.addColorStop(0, "rgba(255,240,200,1)");
		glow.addColorStop(0.18, "rgba(255,225,160,0.9)");
		glow.addColorStop(1, "rgba(255,200,120,0)");
		x.fillStyle = glow;
		x.beginPath();
		x.arc(lx + 52, 396, 70, 0, 7);
		x.fill();
		x.fillStyle = "#fffbea";
		x.beginPath();
		x.ellipse(lx + 52, 394, 14, 8, 0, 0, 7);
		x.fill();
	});
	// car
	x.fillStyle = "#4a1012";
	const car = new Path2D();
	car.moveTo(820, 800);
	car.lineTo(850, 735);
	car.lineTo(1060, 730);
	car.lineTo(1120, 780);
	car.lineTo(1160, 790);
	car.lineTo(1160, 830);
	car.lineTo(820, 830);
	x.fill(car);
	d.fillStyle = depthColor(7);
	d.fill(car);
	ellipse(d, 890, 832, 28);
	ellipse(d, 1100, 832, 28);
	x.fillStyle = "#0d1016";
	x.beginPath();
	x.moveTo(865, 742);
	x.lineTo(1050, 738);
	x.lineTo(1095, 778);
	x.lineTo(860, 782);
	x.fill();
	x.fillStyle = "#050507";
	x.beginPath();
	x.arc(890, 832, 28, 0, 7);
	x.arc(1100, 832, 28, 0, 7);
	x.fill();
	const hl = x.createRadialGradient(1150, 800, 0, 1150, 800, 40);
	hl.addColorStop(0, "#ffffff");
	hl.addColorStop(0.35, "rgba(255,255,240,0.9)");
	hl.addColorStop(1, "rgba(255,255,240,0)");
	x.fillStyle = hl;
	x.beginPath();
	x.arc(1150, 800, 40, 0, 7);
	x.fill();
	x.fillStyle = "#ff2a2a";
	x.fillRect(822, 790, 14, 16);
	// traffic light and street sign
	x.fillStyle = "#20232a";
	x.fillRect(1440, 470, 10, 240);
	x.fillRect(1418, 420, 54, 120);
	x.fillStyle = "#2a0c0c";
	x.beginPath();
	x.arc(1445, 442, 14, 0, 7);
	x.fill();
	x.fillStyle = "#2a250c";
	x.beginPath();
	x.arc(1445, 480, 14, 0, 7);
	x.fill();
	x.fillStyle = "#4dffb0";
	x.beginPath();
	x.arc(1445, 518, 14, 0, 7);
	x.fill();
	x.fillStyle = "#1b6b3a";
	x.fillRect(470, 520, 170, 46);
	x.fillStyle = "#e8efe9";
	x.font = "bold 28px sans-serif";
	x.fillText("ELM ST", 502, 554);
	x.fillStyle = "#262a33";
	x.fillRect(552, 566, 7, 140);
	// hedge with a cat's eyeshine
	d.fillStyle = depthColor(4.5);
	x.fillStyle = "#0b130d";
	for (let i = 0; i < 40; i++) {
		x.beginPath();
		x.arc(20 + i * 12, 690 + Math.sin(i) * 6, 26, 0, 7);
		x.fill();
		ellipse(d, 20 + i * 12, 690 + Math.sin(i) * 6, 26);
	}
	x.fillStyle = "#b6ff6a";
	x.beginPath();
	x.arc(300, 676, 3.2, 0, 7);
	x.arc(316, 676, 3.2, 0, 7);
	x.fill();
	return {
		canvas: c,
		depth: map,
		name: "Night street",
		hfov: 60,
		dist: 15,
		logL: -0.8,
	};
}

function sceneChart() {
	const W = 1600,
		H = 1000,
		c = mk(W, H),
		x = c.getContext("2d")!;
	const hfov = 12,
		ppd = W / hfov; // 133 px per degree
	x.fillStyle = "#f4f4f1";
	x.fillRect(0, 0, W, H);
	x.fillStyle = "#222";
	x.font = "600 30px sans-serif";
	x.fillText("Vision chart", 60, 66);
	x.font = "22px sans-serif";
	x.fillStyle = "#555";
	x.fillText(
		"Viewed from 3 m, the chart spans 12°. Dogs average 20/75.",
		260,
		66,
	);
	// colour swatches (linear sRGB values converted with the exact transfer curve)
	const sw = [
		["Red", [0.85, 0.03, 0.03]],
		["Orange", [0.9, 0.3, 0.02]],
		["Yellow", [0.9, 0.8, 0.02]],
		["Green", [0.03, 0.55, 0.05]],
		["Neutral 480 nm", [0, 0.62, 0.5]],
		["Blue", [0.02, 0.08, 0.8]],
		["Violet", [0.35, 0.05, 0.7]],
		["Grey", [0.38, 0.38, 0.38]],
	] as const;
	const enc = (v: number) =>
		Math.round(
			255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055),
		);
	sw.forEach(([n, v], i) => {
		const sx = 60 + i * 188;
		x.fillStyle = `rgb(${enc(v[0])},${enc(v[1])},${enc(v[2])})`;
		x.fillRect(sx, 100, 168, 150);
		x.fillStyle = "#333";
		x.font = "19px sans-serif";
		x.fillText(n, sx, 278);
	});
	// gratings at known spatial frequency for this viewing geometry
	const cps = [1, 2, 4, 8, 16],
		gw = 250,
		gy = 320;
	const img = x.getImageData(0, 0, W, H),
		d = img.data;
	cps.forEach((cpd, i) => {
		const gx = 60 + i * 300,
			period = ppd / cpd;
		for (let yy = gy; yy < gy + gw; yy++)
			for (let xx = gx; xx < gx + gw; xx++) {
				const lin = 0.5 + 0.48 * Math.sin((2 * Math.PI * (xx - gx)) / period);
				const e = enc(lin),
					k = (yy * W + xx) * 4;
				d[k] = d[k + 1] = d[k + 2] = e;
				d[k + 3] = 255;
			}
	});
	x.putImageData(img, 0, 0);
	x.fillStyle = "#333";
	x.font = "19px sans-serif";
	cps.forEach((cpd, i) =>
		x.fillText(cpd + " cycles per degree", 60 + i * 300, gy + gw + 28),
	);
	// tumbling E rows: a 20/20 letter subtends 5 arcmin
	const rows = [
		["20/200", 200],
		["20/100", 100],
		["20/75", 75],
		["20/50", 50],
		["20/30", 30],
		["20/20", 20],
	] as const;
	let ex = 60;
	const baseY = 960;
	const dirs = [0, 1, 2, 3, 1, 0, 3, 2];
	rows.forEach(([lab, den], ri) => {
		const hPx = (5 / 60) * (den / 20) * ppd; // letter height in px
		for (let j = 0; j < (ri < 2 ? 1 : ri < 4 ? 2 : 3); j++) {
			const cx = ex + hPx / 2,
				cy = baseY - 40 - hPx / 2;
			x.save();
			x.translate(cx, cy);
			x.rotate((dirs[(ri + j) % 8]! * Math.PI) / 2);
			const u = hPx / 5;
			x.fillStyle = "#111";
			x.fillRect(-2.5 * u, -2.5 * u, u, 5 * u);
			x.fillRect(-2.5 * u, -2.5 * u, 5 * u, u);
			x.fillRect(-2.5 * u, -0.5 * u, 5 * u, u);
			x.fillRect(-2.5 * u, 1.5 * u, 5 * u, u);
			x.restore();
			ex += hPx * 1.5;
		}
		x.fillStyle = ri === 2 ? "#1c3fd0" : "#555";
		x.font = (ri === 2 ? "600 " : "") + "19px sans-serif";
		x.fillText(lab, ex - hPx * 1.5 * (ri < 2 ? 1 : ri < 4 ? 2 : 3) + 0, baseY);
		ex += 40;
	});
	const flat = mk(1, 1);
	const depthContext = flat.getContext("2d")!;
	depthContext.fillStyle = "#fff";
	depthContext.fillRect(0, 0, 1, 1);
	const depth: DepthMap = {
		canvas: flat,
		nearM: 3,
		farM: 40,
		kind: "procedural",
	};
	return { canvas: c, depth, name: "Vision chart", hfov, dist: 3, logL: 2.0 };
}
function scenePark360(): Sample {
	const W = 2048,
		H = 1024,
		horizon = H / 2;
	const canvas = mk(W, H),
		x = canvas.getContext("2d")!,
		R = rng(41);
	const { context: d, map } = depthScene(W, H);
	const sky = x.createLinearGradient(0, 0, 0, horizon);
	sky.addColorStop(0, "#386cba");
	sky.addColorStop(1, "#cde9f2");
	x.fillStyle = sky;
	x.fillRect(0, 0, W, horizon);
	x.fillStyle = "#fff4c1";
	ellipse(x, 1240, 345, 29);
	const lawn = x.createLinearGradient(0, horizon, 0, H);
	lawn.addColorStop(0, "#83a359");
	lawn.addColorStop(1, "#3e652d");
	x.fillStyle = lawn;
	x.fillRect(0, horizon, W, H - horizon);
	groundDepth(d, W, horizon, H, 16, 0.45);
	const path = (px: number) =>
		horizon + 62 + 20 * Math.sin((2 * Math.PI * px) / W);
	const trail = new Path2D();
	trail.moveTo(0, path(0));
	for (let px = 16; px <= W; px += 16) trail.lineTo(px, path(px));
	x.lineWidth = 24;
	x.strokeStyle = "#a9916a";
	x.stroke(trail);
	x.lineWidth = 18;
	x.strokeStyle = "#c9af84";
	x.stroke(trail);
	d.fillStyle = depthColor(25);
	for (let i = 0; i < 136; i++) {
		const cx = R() * W,
			cy = 466 + R() * 40;
		const rx = 9 + R() * 28,
			ry = 16 + R() * 25;
		x.fillStyle = `hsl(${96 + R() * 32} 35% ${26 + R() * 20}%)`;
		for (const offset of [-W, 0, W]) {
			ellipse(x, cx + offset, cy, rx, ry);
			ellipse(d, cx + offset, cy, rx, ry);
		}
	}
	x.fillStyle = "#ded1a7";
	d.fillStyle = depthColor(8);
	for (const target of [x, d]) {
		target.fillRect(0, 515, W, 4);
		target.fillRect(0, 527, W, 4);
		for (let px = 0; px < W; px += 32) target.fillRect(px, 508, 5, 33);
	}
	const markerY = horizon - (8 * H) / 180;
	for (const [az, color, meters] of [
		[-115, "#ff03ff", 4],
		[-65, "#f49a0f", 2.5],
		[-25, "#22dcdf", 3.2],
		[0, "#e03637", 1.4],
		[25, "#2275ff", 3.2],
		[65, "#f49a0f", 2.5],
		[115, "#ff03ff", 4],
		[180, "#efdd2d", 5],
	] as const) {
		for (const offset of [-W, 0, W]) {
			const cx = W * (0.5 + az / 360) + offset;
			if (cx < -35 || cx > W + 35) continue;
			x.fillStyle = "#523d2d";
			x.fillRect(cx - 2, markerY, 4, 60);
			x.fillStyle = color;
			ellipse(x, cx, markerY, 28, 20);
			if (Math.abs(az) === 65) {
				for (let i = 0; i < 11; i++) {
					x.fillStyle = i % 2 ? "#141b20" : "#fff4c9";
					x.fillRect(cx - 16.5 + i * 3, markerY - 8, 3, 16);
				}
			} else if (Math.abs(az) !== 115) {
				x.fillStyle = "#fff9e5";
				ellipse(x, cx, markerY, 8, 8);
			}
			d.fillStyle = depthColor(meters);
			d.fillRect(cx - 2, markerY, 4, 60);
			ellipse(d, cx, markerY, 28, 20);
		}
	}
	return {
		canvas,
		depth: map,
		name: "360° park",
		hfov: 65,
		dist: 8,
		logL: 2.8,
		panorama: {
			projection: "equirectangular",
			hfovDeg: 360,
			vfovDeg: 180,
			yawOffsetDeg: 0,
			pitchOffsetDeg: 0,
		},
	};
}

const SAMPLES = {
	yard: sceneYard,
	street: sceneStreet,
	chart: sceneChart,
	park360: scenePark360,
};

type Sample = SourceMeta & { canvas: HTMLCanvasElement };
const cache = new Map<SampleId, Sample>();
export function sample(id: SampleId): Sample {
	const cached = cache.get(id);
	if (cached) return cached;
	const scene = SAMPLES[id]();
	cache.set(id, scene);
	return scene;
}
