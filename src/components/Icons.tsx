import type { ReactNode, SVGProps } from "react";

interface IconProps {
	className?: string;
}

type StrokeIconProps = IconProps & {
	children: ReactNode;
	strokeWidth?: number;
} & Omit<SVGProps<SVGSVGElement>, "children">;

function StrokeIcon({
	className,
	children,
	strokeWidth = 1.7,
	...rest
}: StrokeIconProps) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className={className}
			{...rest}
		>
			{children}
		</svg>
	);
}

export function SourceIcon({ className }: IconProps) {
	return (
		<StrokeIcon className={className}>
			<rect x="3" y="5" width="18" height="14" rx="2" />
			<circle cx="9" cy="10" r="1.6" />
			<path d="m21 16-5-5-8 8" />
		</StrokeIcon>
	);
}

export function ViewIcon({ className }: IconProps) {
	return (
		<StrokeIcon className={className}>
			<rect x="3" y="5" width="18" height="14" rx="2" />
			<path d="M12 5v14" />
		</StrokeIcon>
	);
}

export function DepthIcon({ className }: IconProps) {
	return (
		<StrokeIcon className={className}>
			<path d="M12 3 3 7.5 12 12l9-4.5Z" />
			<path d="m3 12 9 4.5 9-4.5" />
			<path d="m3 16.5 9 4.5 9-4.5" />
		</StrokeIcon>
	);
}

export function SaveIcon({ className }: IconProps) {
	return (
		<StrokeIcon className={className}>
			<path d="M12 4v11" />
			<path d="m7 10 5 5 5-5" />
			<path d="M5 20h14" />
		</StrokeIcon>
	);
}

export function SettingsIcon({ className }: IconProps) {
	return (
		<StrokeIcon className={className}>
			<path d="M4 7h10" />
			<path d="M18 7h2" />
			<circle cx="16" cy="7" r="2" />
			<path d="M4 17h4" />
			<path d="M12 17h8" />
			<circle cx="10" cy="17" r="2" />
		</StrokeIcon>
	);
}

export function CloseIcon({ className }: IconProps) {
	return (
		<StrokeIcon className={className}>
			<path d="M6 6l12 12M18 6 6 18" />
		</StrokeIcon>
	);
}

export function UploadIcon({ className }: IconProps) {
	return (
		<StrokeIcon className={className}>
			<path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
			<path d="M12 4v12" />
			<path d="m7 9 5-5 5 5" />
		</StrokeIcon>
	);
}

export function CameraIcon({ className }: IconProps) {
	return (
		<StrokeIcon className={className}>
			<path d="M4 8h3l2-3h6l2 3h3v11H4z" />
			<circle cx="12" cy="13" r="3.5" />
		</StrokeIcon>
	);
}

export function LiveCameraIcon({ className }: IconProps) {
	return (
		<StrokeIcon className={className}>
			<rect x="3" y="6" width="13" height="12" rx="2" />
			<path d="m16 10 5-3v10l-5-3z" />
		</StrokeIcon>
	);
}

export function SplitArrowsIcon({ className }: IconProps) {
	return (
		<StrokeIcon className={className} strokeWidth={2}>
			<path d="m9 7-5 5 5 5" />
			<path d="m15 7 5 5-5 5" />
		</StrokeIcon>
	);
}

export function CheckIcon({ className }: IconProps) {
	return (
		<StrokeIcon className={className} strokeWidth={2}>
			<path d="m5 12 5 5 9-10" />
		</StrokeIcon>
	);
}

export function ChevronDownIcon({ className }: IconProps) {
	return (
		<StrokeIcon className={className} strokeWidth={2}>
			<path d="m6 9 6 6 6-6" />
		</StrokeIcon>
	);
}
