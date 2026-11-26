export function fmtAge(y: number): string {
	return y < 1
		? `${Math.max(0, Math.round(y * 52))} weeks`
		: `${y < 2 ? y.toFixed(1) : Math.round(y)} years`;
}
