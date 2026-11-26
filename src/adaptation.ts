export type AdaptMode = "instant" | "preview" | "realtime";

export function stepAdaptation(
	adaptedLogL: number,
	targetLogL: number,
	dt: number,
	mode: AdaptMode,
): number {
	if (mode === "instant") return targetLogL;
	const elapsed = Math.max(0, dt) * (mode === "preview" ? 60 : 1);
	const approach = (from: number, seconds: number, tau: number) =>
		from + (targetLogL - from) * -Math.expm1(-seconds / tau);
	if (targetLogL > adaptedLogL) return approach(adaptedLogL, elapsed, 3);
	if (adaptedLogL <= 0) return approach(adaptedLogL, elapsed, 600);
	// Split a step at the cone-to-rod transition so the result is frame-rate independent.
	const coneSeconds =
		targetLogL < 0 ? 90 * Math.log1p(adaptedLogL / -targetLogL) : Infinity;
	return elapsed <= coneSeconds
		? approach(adaptedLogL, elapsed, 90)
		: approach(0, elapsed - coneSeconds, 600);
}
