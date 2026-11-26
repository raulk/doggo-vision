export function $<T extends Element = HTMLElement>(
	selector: string,
	root: ParentNode = document,
): T {
	return root.querySelector<T>(selector)!;
}

export function $$<T extends HTMLElement = HTMLElement>(selector: string): T[] {
	return Array.from(document.querySelectorAll<T>(selector));
}
