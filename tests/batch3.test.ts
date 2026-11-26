import { describe, expect, it } from "vitest";
import { stepAdaptation } from "../src/adaptation";
import {
	focusDistanceFromDepth,
	normalizeDepthMap,
	preprocessDepthInput,
} from "../src/depth";

describe("monocular depth", () => {
	it("resizes RGBA to three ImageNet-normalized CHW planes", () => {
		const input = new Uint8ClampedArray([
			255, 0, 0, 255, 0, 255, 255, 0, 255, 0, 0, 255, 0, 255, 255, 0,
		]);
		const output = preprocessDepthInput(input, 2, 2, 2);
		expect(output).toHaveLength(12);
		expect(output[0]).toBeCloseTo((1 - 0.485) / 0.229);
		expect(output[1]).toBeCloseTo(-0.485 / 0.229);
		expect(output[4]).toBeCloseTo(-0.456 / 0.224);
		expect(output[5]).toBeCloseTo((1 - 0.456) / 0.224);
		expect(output[8]).toBeCloseTo(-0.406 / 0.225);
		expect(output[11]).toBeCloseTo((1 - 0.406) / 0.225);
		const resized = preprocessDepthInput(input, 2, 2, 1);
		expect(resized[0]).toBeCloseTo((0.5 - 0.485) / 0.229);
	});
	it("clips percentile outliers and emits opaque grayscale", () => {
		const raw = Float32Array.from({ length: 101 }, (_, i) => i);
		raw[0] = -1000;
		raw[100] = 1000;
		const result = normalizeDepthMap(raw, 101, 1);
		expect([...result.slice(0, 4)]).toEqual([0, 0, 0, 255]);
		expect([...result.slice(200, 204)]).toEqual([128, 128, 128, 255]);
		expect([...result.slice(392, 396)]).toEqual([255, 255, 255, 255]);
	});
	it("keeps invalid and degenerate maps finite", () => {
		expect([...normalizeDepthMap(Float32Array.of(7, NaN, 7), 3, 1)]).toEqual([
			0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
		]);
		expect([...normalizeDepthMap(Float32Array.of(NaN), 1, 1)]).toEqual([
			0, 0, 0, 255,
		]);
	});
	it.each([0.35, 0.85, 1.5, 10, 40])(
		"round-trips %s m in inverse distance",
		(distance) => {
			const near = 0.35,
				far = 40;
			const normalized = (1 / distance - 1 / far) / (1 / near - 1 / far);
			expect(focusDistanceFromDepth(normalized, near, far)).toBeCloseTo(
				distance,
				8,
			);
		},
	);
});

describe("retinal adaptation", () => {
	it("snaps to the new level in instant mode and holds at zero elapsed time otherwise", () => {
		expect(stepAdaptation(2.5, -1.5, 0, "instant")).toBe(-1.5);
		expect(stepAdaptation(2.5, -1.5, 0, "realtime")).toBe(2.5);
	});
	it("adapts quickly to bright light", () => {
		expect(stepAdaptation(-1.5, 2.5, 3, "realtime")).toBeCloseTo(
			2.5 - 4 / Math.E,
		);
	});
	it("crosses the cone-to-rod boundary continuously and more slowly", () => {
		const coneTime = 90 * Math.log(4 / 1.5);
		expect(stepAdaptation(2.5, -1.5, coneTime, "realtime")).toBeCloseTo(0);
		expect(stepAdaptation(2.5, -1.5, coneTime + 600, "realtime")).toBeCloseTo(
			-1.5 + 1.5 / Math.E,
		);
	});
	it("advances 60 times faster in preview and converges monotonically", () => {
		expect(stepAdaptation(2.5, -1.5, 10, "preview")).toBeCloseTo(
			stepAdaptation(2.5, -1.5, 600, "realtime"),
			10,
		);
		let adapted = 2.5;
		for (let i = 0; i < 75; i++) {
			const next = stepAdaptation(adapted, -1.5, 1, "preview");
			expect(next).toBeLessThan(adapted);
			expect(next).toBeGreaterThan(-1.5);
			adapted = next;
		}
		expect(adapted).toBeCloseTo(-1.5);
	});
});
