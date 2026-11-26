import {
	type DragEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useEngine, useEngineSnapshot, useViewportMetrics } from "../engine";
import { SplitArrowsIcon } from "./Icons";

export function ViewportStage() {
	const engine = useEngine();
	const { state, glError } = useEngineSnapshot();
	const metrics = useViewportMetrics();
	const hostRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [dragging, setDragging] = useState(false);

	useEffect(
		() => engine.attachViewport(hostRef.current!, canvasRef.current!),
		[engine],
	);

	const setSplit = useCallback(
		(element: HTMLDivElement | null) => engine.setSplitElement(element),
		[engine],
	);

	function showDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		setDragging(true);
	}

	return (
		<div
			className="viewport"
			id="vp"
			ref={hostRef}
			onDragEnter={showDrop}
			onDragOver={showDrop}
			onDragLeave={(event) => {
				const next = event.relatedTarget;
				if (!(next instanceof Node) || !event.currentTarget.contains(next))
					setDragging(false);
			}}
			onDrop={(event) => {
				event.preventDefault();
				setDragging(false);
				const file = event.dataTransfer.files[0];
				if (file) void engine.loadFile(file);
			}}
		>
			<canvas id="gl" ref={canvasRef} />
			<div
				className="split"
				id="split"
				ref={setSplit}
				hidden={state.view.mode !== 0}
				style={{ left: `${metrics.splitPercent}%` }}
			>
				<div className="knob">
					<SplitArrowsIcon />
				</div>
			</div>
			<span className="tag l" id="tagL" hidden={state.view.mode === 1}>
				Human · same light
			</span>
			<span className="tag r" id="tagR" hidden={state.view.mode === 2}>
				{state.binoc.on ? "Dog · both eyes" : "Dog"}
			</span>
			{dragging && (
				<div className="drop" id="drop">
					Drop a photo or video
				</div>
			)}
			{glError && <div className="glfail">{glError}</div>}
		</div>
	);
}
