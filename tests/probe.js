import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Usage: node tests/probe.js <outdir> [page.html]
const { chromium } = createRequire(import.meta.url)("playwright");
const out = process.argv[2] || "tests/out";
const pagePath =
	process.argv[3] || resolve(import.meta.dirname, "../site/index.html");
const browser = await chromium.launch({
	args: [
		"--use-gl=angle",
		"--use-angle=swiftshader",
		"--enable-unsafe-swiftshader",
	],
});
try {
	const page = await browser.newPage({
		viewport: { width: 1200, height: 900 },
		deviceScaleFactor: 1,
	});
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (
			message.type() === "error" &&
			/WebGL|GL_INVALID|shader/i.test(message.text())
		)
			errors.push(message.text());
	});
	await page.goto(pathToFileURL(pagePath).href);
	await page.waitForFunction(
		() => window.__dogsight?.ready || document.querySelector(".glfail"),
	);
	if (!(await page.evaluate(() => window.__dogsight?.ready))) {
		throw new Error(await page.locator(".glfail").textContent());
	}
	await page.evaluate(() => {
		window.probeFrame = () =>
			new Promise((ready) =>
				requestAnimationFrame(() => requestAnimationFrame(ready)),
			);
		window.probeFloat = (target) => {
			const buffer = window.__dogsight.readFloatBuffer(target);
			if (!buffer)
				throw new Error(
					"Linear float readback requires EXT_color_buffer_float.",
				);
			return buffer;
		};
		window.probeLight = (data, i) =>
			0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
		window.probeImport = (record) => {
			document.querySelector("#imp").value = JSON.stringify(record);
			document.querySelector("#impApply").click();
		};
		window.probeCanvas = (width, height, colorSpace = "srgb") => {
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			return { canvas, context: canvas.getContext("2d", { colorSpace }) };
		};
		// PSF probe: black field with a bright 0.5 deg disc, 50 deg wide
		const p = document.createElement("canvas");
		p.width = 1200;
		p.height = 900;
		const x = p.getContext("2d");
		x.fillStyle = "#000";
		x.fillRect(0, 0, 1200, 900);
		x.fillStyle = "#fff";
		x.beginPath();
		x.arc(600, 450, 6, 0, 7);
		x.fill();
		window.probePsf = p;
		// gratings: 20 deg wide (60 px/deg); rows of sine gratings at 50% contrast around mid-grey
		const g = document.createElement("canvas");
		g.width = 1200;
		g.height = 900;
		const y = g.getContext("2d");
		const id = y.createImageData(1200, 900);
		const F = [1, 2, 3, 4, 6, 8, 12, 16];
		for (let r = 0; r < 900; r++) {
			const band = Math.floor(r / (900 / F.length));
			const f = F[band];
			for (let col = 0; col < 1200; col++) {
				const lin =
					0.2 * (1 + 0.5 * Math.sin((2 * Math.PI * f * (col - 600)) / 60));
				const s =
					lin <= 0.0031308
						? lin * 12.92
						: 1.055 * Math.pow(lin, 1 / 2.4) - 0.055;
				const i = (r * 1200 + col) * 4;
				id.data[i] = id.data[i + 1] = id.data[i + 2] = Math.round(s * 255);
				id.data[i + 3] = 255;
			}
		}
		y.putImageData(id, 0, 0);
		window.probeGrat = g;
	});

	const captureStyle = await page.addStyleTag({
		content: ".bar,#hud,.split,.tag { visibility: hidden !important; }",
	});
	mkdirSync(out, { recursive: true });

	async function run(options, filename) {
		await page.evaluate(({ preset, target, logL, hfov, time, mode }) => {
			const dogsight = window.__dogsight;
			dogsight.setImageSource(
				target === "psf" ? window.probePsf : window.probeGrat,
				{
					name: target,
					equiangular: true,
					hfov,
					dist: 6,
					logL,
				},
			);
			dogsight.applyPreset(preset);
			dogsight.setProbeView(time, mode);
			return new Promise((ready) =>
				requestAnimationFrame(() => requestAnimationFrame(ready)),
			);
		}, options);
		await page.screenshot({ path: `${out}/${filename}.png` });
	}

	const presets = ["lab", "kcs15b", "kcs15", "kcs15both"];
	// 1.2 s after a blink and 5.8 s after a blink, just before the next one.
	for (const preset of presets) {
		for (const [time, phase] of [
			[1.2, "fresh"],
			[5.8, "dry"],
		]) {
			// oxlint-disable-next-line no-await-in-loop -- Each probe changes the same canvas and captures its own frame.
			await run(
				{ preset, target: "psf", logL: 2, hfov: 50, time, mode: 1 },
				`psf-${preset}-${phase}`,
			);
			// oxlint-disable-next-line no-await-in-loop -- Each probe changes the same canvas and captures its own frame.
			await run(
				{ preset, target: "grat", logL: 2.5, hfov: 20, time, mode: 1 },
				`grat-${preset}-${phase}`,
			);
		}
	}
	await run(
		{ preset: "lab", target: "grat", logL: 2.5, hfov: 20, time: 1.2, mode: 2 },
		"grat-src",
	);
	await run(
		{ preset: "lab", target: "psf", logL: 2, hfov: 50, time: 1.2, mode: 2 },
		"psf-src",
	);

	const info = await page.evaluate(
		(ids) =>
			ids.map((id) => {
				window.__dogsight.applyPreset(id);
				const { derived, U, kcsState } = window.__dogsight.compile();
				return { id, derived, U: { veil: U.uVeil }, ks: kcsState };
			}),
		presets.slice(0, 3),
	);
	writeFileSync(`${out}/info.json`, JSON.stringify(info, null, 2));
	const floatPsf = {};
	for (const preset of presets.slice(0, 3)) {
		// oxlint-disable-next-line no-await-in-loop -- Each profile reads the current rendered preset.
		floatPsf[preset] = await page.evaluate(async (id) => {
			const app = window.__dogsight;
			app.setImageSource(window.probePsf, {
				name: "PSF",
				hfov: 50,
				dist: 6,
				logL: 2,
				equiangular: true,
			});
			app.applyPreset(id);
			app.setProbeView(1.2, 1);
			await window.probeFrame();
			const { width, height, data } = window.probeFloat();
			const source = window.probeFloat("radiance").data;
			const ppd = width / 50;
			const step = 0.1;
			const rings = Array.from({ length: 100 }, () => ({
				energy: 0,
				count: 0,
			}));
			let total = 0;
			let input = 0;
			let core = 0;
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const i = (y * width + x) * 4;
					const radius =
						Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2) / ppd;
					const light = window.probeLight(data, i);
					total += light;
					input += window.probeLight(source, i);
					if (radius <= 0.25) core += light;
					const ring = rings[Math.floor(radius / step)];
					if (ring) {
						ring.energy += light;
						ring.count++;
					}
				}
			}
			let enclosed = 0;
			return {
				input,
				total,
				coreFraction: core / total,
				radial: rings.map(({ energy, count }, k) => {
					enclosed += energy;
					return {
						radius: (k + 0.5) * step,
						mean: energy / count,
						enclosed: enclosed / total,
					};
				}),
			};
		}, preset);
	}
	writeFileSync(`${out}/psf-float.json`, JSON.stringify(floatPsf, null, 2));

	const gaussian = await page.evaluate(async () => {
		const app = window.__dogsight;
		const frequencies = Array.from({ length: 17 }, (_, i) => 6 + i / 5);
		const results = [];
		for (const hfov of [20, 40]) {
			const { canvas, context } = window.probeCanvas(
				1200,
				68 * frequencies.length,
			);
			const { width, height } = canvas;
			const ppd = width / hfov;
			const image = context.createImageData(width, height);
			for (let y = 0; y < height; y++) {
				const f = frequencies[Math.floor(y / 68)];
				for (let x = 0; x < width; x++) {
					const light =
						0.2 *
						(1 +
							0.5 * Math.sin((2 * Math.PI * f * (x + 0.5 - width / 2)) / ppd));
					const value = Math.round(255 * (1.055 * light ** (1 / 2.4) - 0.055));
					const index = (y * width + x) * 4;
					image.data[index] =
						image.data[index + 1] =
						image.data[index + 2] =
							value;
					image.data[index + 3] = 255;
				}
			}
			context.putImageData(image, 0, 0);
			app.setImageSource(canvas, {
				name: "Gaussian grating",
				hfov,
				dist: 6,
				logL: 2.5,
				equiangular: true,
			});
			app.applyPreset("lab");
			app.setProbeView(1.2, 1, [0, 6, 12]);
			// oxlint-disable-next-line no-await-in-loop -- Read the control at each FOV before changing its source.
			await window.probeFrame();
			const source = window.probeFloat("radiance").data;
			const output = window.probeFloat().data;
			function harmonic(buffer, band, frequency) {
				let sin = 0;
				let cos = 0;
				let light = 0;
				for (
					let y = height - (band + 1) * 68 + 25;
					y < height - band * 68 - 25;
					y++
				) {
					for (let x = width / 2 - 5 * ppd; x < width / 2 + 5 * ppd; x++) {
						const sample = buffer[(y * width + x) * 4];
						const phase =
							(2 * Math.PI * frequency * (x + 0.5 - width / 2)) / ppd;
						sin += sample * Math.sin(phase);
						cos += sample * Math.cos(phase);
						light += sample;
					}
				}
				return Math.hypot(sin, cos) / light;
			}
			results.push({
				hfov,
				sigma: app.compile().U.uAcu,
				mtf: frequencies.map((f, k) => [
					f,
					harmonic(output, k, f) / harmonic(source, k, f),
				]),
			});
		}
		return results;
	});
	writeFileSync(
		`${out}/gaussian-float.json`,
		JSON.stringify(gaussian, null, 2),
	);

	await captureStyle.evaluate((style) => style.remove());
	await page.evaluate(() =>
		window.__dogsight.setProbeView(
			1.2,
			1,
			Array.from({ length: 13 }, (_, i) => i),
		),
	);
	await page.locator("#menuBtn").click();
	// Exercise the clinical import, eye copy and measured-refraction controls in the running app.
	await page.locator('[data-tab="data"]').click();
	await page.locator("#imp").fill(
		JSON.stringify({
			eye: "OS",
			image_quality: { usable: false },
			findings: { lens_opacity: { p: 1 } },
			metadata_optional: { IOP_mmHg: 60 },
		}),
	);
	await page.locator("#impApply").click();
	const urgent = await page.locator("#urgent").textContent();
	if (
		!urgent.includes("The imported record indicates") ||
		!urgent.includes("elevated iop")
	)
		throw new Error(urgent);
	if (
		!(await page.locator("#impMsg").textContent()).includes(
			"Photo marked unusable",
		)
	)
		throw new Error("Missing unusable-photo import note");
	await page.locator('[data-tab="cond"]').click();
	await page.locator("#binoOn").check();
	if (
		(await page
			.locator('#eyeSeg [data-eye="OS"]')
			.getAttribute("aria-pressed")) !== "true"
	)
		throw new Error("Detector laterality did not select OS");
	await page.locator("#copyEye").click();
	await page.locator('#eyeSeg [data-eye="OD"]').click();
	if (!(await page.evaluate(() => window.__dogsight.compile().U.uHalo[0] > 0)))
		throw new Error("Copy to OD did not copy glaucoma");
	await page.locator('[data-tab="dog"]').click();
	await page.getByLabel("Measured total refraction (skip NS offset)").check();
	await page.locator('[data-tab="data"]').click();

	const black = await page.evaluate(async () => {
		const app = window.__dogsight;
		const { canvas, context } = window.probeCanvas(480, 360);
		function maximum() {
			const { data } = window.probeFloat();
			let peak = 0;
			for (let i = 0; i < data.length; i += 4)
				peak = Math.max(peak, Math.abs(window.probeLight(data, i)));
			return peak;
		}
		const opacities = {
			cataract: { s: 0.85, hypermature: true },
			asteroid_hyalosis: { s: 1 },
		};
		app.applyPreset("lab");
		app.setProbeView(
			1.2,
			1,
			Array.from({ length: 13 }, (_, i) => i),
		);
		context.fillStyle = "black";
		context.fillRect(0, 0, canvas.width, canvas.height);
		const meta = { name: "Zero light", hfov: 20, logL: -2.5, dist: 6 };
		app.setImageSource(canvas, meta);
		window.probeImport({ conditions: opacities });
		await window.probeFrame();
		const sightedBlack = maximum();
		window.probeImport({ conditions: { ...opacities, sards: { s: 1 } } });
		await window.probeFrame();
		const blindBlack = maximum();
		context.fillStyle = "white";
		context.fillRect(0, 0, canvas.width, canvas.height);
		app.setImageSource(canvas, { ...meta, logL: 2.5 });
		await window.probeFrame();
		const blindWhite = maximum();
		window.probeImport({ conditions: opacities });
		await window.probeFrame();
		return { sightedBlack, blindBlack, blindWhite, sightedWhite: maximum() };
	});

	const radiance = await page.evaluate(async () => {
		const app = window.__dogsight;
		app.applyPreset("lab");
		app.setProbeView(1.2, 1, [0, 10, 12]);
		const { canvas, context } = window.probeCanvas(64, 64);
		const gain = {
			canvas,
			info: {
				format: "iso-21496-1",
				gainMapMin: [1, 1, 1],
				gainMapMax: [1, 1, 1],
				gamma: [1, 1, 1],
				offsetSdr: [0, 0, 0],
				offsetHdr: [0, 0, 0],
				baseRenditionIsHdr: true,
			},
		};
		const meta = { name: "Radiance", hfov: 50, dist: 6, logL: 2.5 };
		const center = (target) => {
			const { width, height, data } = window.probeFloat(target);
			const offset =
				(Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
			return Array.from(data.subarray(offset, offset + 4));
		};
		context.fillStyle = "rgb(170 170 170)";
		context.fillRect(0, 0, 64, 64);
		app.setImageSource(canvas, { ...meta, gain });
		await window.probeFrame();
		const hdrBase = center("radiance");
		context.fillStyle = "rgb(204 204 204)";
		context.fillRect(0, 0, 64, 64);
		gain.info.baseRenditionIsHdr = false;
		app.setImageSource(canvas, { ...meta, gain });
		await window.probeFrame();
		const sdrBase = center("radiance");
		const afterGlare = center("view");
		app.setProbeView(1.2, 1, [0, 3, 10, 12]);
		window.probeImport({
			conditions: { pigmentary_keratitis: { s: 0.35, origin: "diffuse" } },
		});
		await window.probeFrame();
		const attenuated = center("view");
		app.applyPreset("lab");
		const p3 = window.probeCanvas(64, 64, "display-p3");
		p3.context.fillStyle = "color(display-p3 1 0 0)";
		p3.context.fillRect(0, 0, 64, 64);
		app.setImageSource(p3.canvas, meta);
		await window.probeFrame();
		const p3Red = center("radiance");
		p3.context.fillStyle = "white";
		p3.context.fillRect(0, 0, 64, 64);
		app.setImageSource(p3.canvas, meta);
		await window.probeFrame();
		return {
			hdrBase,
			sdrBase,
			afterGlare,
			attenuated,
			p3Red,
			p3White: center("radiance"),
		};
	});
	const projection = await page.evaluate(async () => {
		const app = window.__dogsight;
		const { canvas, context } = window.probeCanvas(480, 360);
		context.fillStyle = "white";
		context.fillRect(0, 0, canvas.width, canvas.height);
		app.applyPreset("lab");
		app.setProbeView(1.2, 1, [0, 9, 12]);
		window.probeImport({
			eyes: { OS: { sards: { s: 1 } }, OD: {} },
			binocular: { enabled: true, dominance: 0.75 },
		});
		const half = app.compile().derived.binocular_overlap_deg / 2;
		const meta = { name: "Binocular zone", hfov: 120, dist: 6, logL: 2.5 };
		const sample = () => {
			const { width, height, data } = window.probeFloat();
			const edge = Math.round(width * (0.5 - (half - 4) / meta.hfov));
			const offset = (height / 2) * width * 4;
			return {
				center: data[offset + width * 2],
				edge: data[offset + edge * 4],
			};
		};
		app.setImageSource(canvas, meta);
		await window.probeFrame();
		const rectilinear = sample();
		app.setImageSource(canvas, { ...meta, equiangular: true });
		await window.probeFrame();
		return { rectilinear, equiangular: sample() };
	});
	writeFileSync(
		`${out}/radiance-float.json`,
		JSON.stringify({ black, radiance, projection }, null, 2),
	);

	const batch3 = await page.evaluate(async () => {
		const app = window.__dogsight;
		const { canvas, context } = window.probeCanvas(720, 240);
		const map = window.probeCanvas(720, 240);
		map.context.fillStyle = "#fff";
		map.context.fillRect(0, 0, 720, 120);
		map.context.fillStyle = "#000";
		map.context.fillRect(0, 120, 720, 120);
		for (let x = 0; x < 720; x++) {
			const v = Math.round(132 + 32 * Math.sin((2 * Math.PI * x) / 12));
			context.fillStyle = `rgb(${v},${v},${v})`;
			context.fillRect(x, 0, 1, 240);
		}
		app.setImageSource(canvas, {
			name: "split depth grating",
			hfov: 20,
			dist: 10,
			logL: 2.5,
			equiangular: true,
			depth: { canvas: map.canvas, nearM: 0.35, farM: 10, kind: "procedural" },
		});
		app.applyPreset("lab");
		app.setProbeView(1.2, 1, [6]);
		await window.probeFrame();
		const modulation = (data, row) => {
			let dc = 0,
				re = 0,
				im = 0;
			for (let x = 240; x < 480; x++) {
				const value = window.probeLight(data, (row * 720 + x) * 4);
				const phase = (2 * Math.PI * x) / 12;
				dc += value;
				re += value * Math.cos(phase);
				im += value * Math.sin(phase);
			}
			return (2 * Math.hypot(re, im)) / dc;
		};
		const depthFrame = (dist, depthEnabled) => {
			app.stepProbeFrame({ dist, depthEnabled }, 0);
			const { data } = window.probeFloat();
			return { near: modulation(data, 180), far: modulation(data, 60) };
		};
		const depth = {
			disabled: depthFrame(10, false),
			far: depthFrame(10, true),
			near: depthFrame(0.35, true),
		};
		app.stepProbeFrame({ depthEnabled: false }, 0);

		app.loadSample("park360");
		app.setProbeView(1.2, 1, []);
		await window.probeFrame();
		const landmarks = (preset) => {
			app.applyPreset(preset);
			app.stepProbeFrame({}, 0);
			const field = app.compile().derived.field_total_deg;
			const { width, height, data } = window.probeFloat();
			const elevation = field / 2;
			const row = Math.floor(height * (0.5 + 8 / elevation));
			const signature = (az) => {
				let peak = 0;
				for (let x = 0; x < width; x++) {
					const deg = ((x + 0.5) / width - 0.5) * field;
					if (Math.abs(deg - az) > 3) continue;
					const i = (row * width + x) * 4;
					peak = Math.max(peak, Math.min(data[i], data[i + 2]) - data[i + 1]);
				}
				return peak;
			};
			return { field, left: signature(-115), right: signature(115) };
		};
		const pug = landmarks("pug"),
			greyhound = landmarks("greyhound");
		app.applyPreset("kcs15both");
		app.setProbeView(
			1.2,
			1,
			Array.from({ length: 12 }, (_, i) => i),
		);
		app.stepProbeFrame({}, 0);
		const frame = window.probeFloat();
		const crescent = (az) => {
			const field = app.compile().derived.field_total_deg;
			const x0 = Math.floor(frame.width * (0.5 + az / field));
			const y0 = Math.floor(frame.height * (0.5 + 8 / (field / 2)));
			const values = [];
			for (let x = x0 - 18; x <= x0 + 18; x++) {
				values.push(window.probeLight(frame.data, (y0 * frame.width + x) * 4));
			}
			return Math.max(...values) - Math.min(...values);
		};
		const panorama = {
			pug,
			greyhound,
			leftContrast: crescent(-65),
			rightContrast: crescent(65),
		};

		const moving = window.probeCanvas(320, 128);
		const fill = (shade) => {
			moving.context.fillStyle = shade;
			moving.context.fillRect(0, 0, 320, 128);
		};
		const edge = (x) => {
			fill("#333");
			moving.context.fillStyle = "#ccc";
			moving.context.fillRect(x, 0, 320 - x, 128);
		};
		fill("#333");
		app.setImageSource(moving.canvas, {
			name: "temporal field",
			hfov: 50,
			dist: 6,
			logL: 2.5,
		});
		app.applyPreset("lab");
		app.setProbeView(1.2, 1, [11]);
		await window.probeFrame();
		const accent = (lo, hi) => {
			const { width, data } = window.probeFloat();
			const sustained = window.probeFloat("sustained").data;
			let difference = 0;
			for (let x = lo; x < hi; x++) {
				const i = (64 * width + x) * 4;
				difference = Math.max(difference, Math.abs(data[i] - sustained[i]));
			}
			return difference;
		};
		fill("#ccc");
		app.stepProbeFrame({}, 0.016, true);
		const uniform = accent(0, 320);
		edge(120);
		app.stepProbeFrame({}, 0, true);
		edge(132);
		app.stepProbeFrame({}, 0.016, true);
		const motion = accent(118, 135),
			outside = Math.max(accent(0, 115), accent(138, 320));
		fill("#aaa");
		app.setProbeView(1.2, 1, [6, 7, 10]);
		app.stepProbeFrame({ adaptMode: "preview" }, 0, true);
		app.stepProbeFrame({ logL: -1.5 }, 0);
		const brightness = () => {
			const { width, data } = window.probeFloat();
			return window.probeLight(data, (64 * width + 160) * 4);
		};
		const darkStart = brightness();
		app.stepProbeFrame({}, 25);
		const darkLater = brightness();
		app.stepProbeFrame({ adaptMode: "instant" }, 0);
		const darkSteady = brightness();
		return {
			depth,
			panorama,
			temporal: { uniform, motion, outside, darkStart, darkLater, darkSteady },
		};
	});
	writeFileSync(`${out}/batch3-float.json`, JSON.stringify(batch3, null, 2));

	if (errors.length) throw new Error(errors.join("\n"));
	console.log(`Rendered 18 PNGs and float-buffer probe results in ${out}.`);
} finally {
	await browser.close();
}
