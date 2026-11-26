import { Toolbar } from "@base-ui/react/toolbar";
import { type ChangeEvent, useRef } from "react";
import { useEngine, useEngineSnapshot } from "../engine";
import { COARSE } from "../media";
import type { SampleId } from "../types";
import { CameraIcon, LiveCameraIcon, SourceIcon, UploadIcon } from "./Icons";
import { PopoverMenu, SegmentedControl } from "./ui";

interface SourcePopoverProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SourcePopover({ open, onOpenChange }: SourcePopoverProps) {
	const engine = useEngine();
	const { source, cameraLive } = useEngineSnapshot();
	const fileRef = useRef<HTMLInputElement>(null);
	const cameraRef = useRef<HTMLInputElement>(null);
	const activeSample =
		source?.kind === "image" ? (source.sample ?? null) : null;

	function loadFile({ currentTarget: input }: ChangeEvent<HTMLInputElement>) {
		const file = input.files?.[0];
		if (!file) return;
		void engine.loadFile(file);
		input.value = "";
		onOpenChange(false);
	}

	return (
		<PopoverMenu
			id="srcMenu"
			align="end"
			ariaLabel="Image source"
			className="source-menu"
			open={open}
			onOpenChange={onOpenChange}
			trigger={
				<Toolbar.Button
					type="button"
					className="ib"
					id="srcBtn"
					title="Image source"
				>
					<SourceIcon />
					<span className="ibl">Source</span>
				</Toolbar.Button>
			}
		>
			<div className="mlabel">Sample scenes</div>
			<SegmentedControl<SampleId>
				id="samples"
				ariaLabel="Sample scenes"
				columns={2}
				value={activeSample}
				onChange={(sample) => {
					engine.loadSample(sample);
					onOpenChange(false);
				}}
				options={[
					{
						value: "yard",
						label: "Backyard",
						dataAttr: { "data-sample": "yard" },
					},
					{
						value: "street",
						label: "Night street",
						dataAttr: { "data-sample": "street" },
					},
					{
						value: "chart",
						label: "Vision chart",
						dataAttr: { "data-sample": "chart" },
					},
					{
						value: "park360",
						label: "360° park",
						dataAttr: { "data-sample": "park360" },
					},
				]}
			/>
			<div className="mlabel">Your own</div>
			<button
				type="button"
				className="mi"
				onClick={() => fileRef.current!.click()}
			>
				<UploadIcon />
				Photo or video
			</button>
			<input
				type="file"
				id="file"
				accept="image/*,video/*"
				className="vh"
				tabIndex={-1}
				ref={fileRef}
				onChange={loadFile}
			/>
			{COARSE && (
				<>
					<button
						type="button"
						className="mi"
						id="camlabel"
						onClick={() => cameraRef.current!.click()}
					>
						<CameraIcon />
						Take a photo
					</button>
					<input
						type="file"
						id="cam"
						accept="image/*"
						capture="environment"
						className="vh"
						tabIndex={-1}
						ref={cameraRef}
						onChange={loadFile}
					/>
				</>
			)}
			<button
				type="button"
				className="mi"
				id="camlive"
				aria-pressed={cameraLive}
				onClick={() => {
					if (!cameraLive) void engine.startCamera();
					onOpenChange(false);
				}}
			>
				<LiveCameraIcon />
				Live camera
			</button>
			<p className="mnote">
				Runs locally in your browser. Nothing is uploaded—photos, videos and
				camera frames never leave your device.
			</p>
		</PopoverMenu>
	);
}
