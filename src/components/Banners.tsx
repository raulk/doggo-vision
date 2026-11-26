import { HOSTED_URL } from "../media";

export function UrgentBanner({ flags }: { flags: readonly string[] }) {
	if (flags.length === 0) return null;
	return (
		<div className="urgent" id="urgent" role="alert">
			{`Seek veterinary care now. The imported record indicates signs that need urgent attention (${flags.join(", ").replace(/_/g, " ")}). The simulation below is only an illustration.`}
		</div>
	);
}

export function CameraBlockedBanner({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	if (!open) return null;
	const message = !window.isSecureContext
		? "Live camera requires HTTPS. Open the hosted site for live mode:"
		: window.top !== window.self
			? "This embedded frame cannot access the camera. Open the standalone site for live mode:"
			: "This browser cannot access the camera here. Open the hosted site for live mode:";
	return (
		<div className="camnote" id="camnote" role="status">
			<span>{message}</span>
			<a href={HOSTED_URL} target="_blank" rel="noopener">
				{HOSTED_URL.replace(/^https:\/\//, "")}
			</a>
			<button type="button" className="btn" onClick={onClose}>
				Close
			</button>
		</div>
	);
}
