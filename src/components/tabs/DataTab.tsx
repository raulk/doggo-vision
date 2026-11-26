import { useMemo, useRef, useState } from "react";
import { useEngine, useEngineSnapshot } from "../../engine";
import { condHypotheses, EXAMPLE_DETECTOR, profileJSON } from "../../model";

function JsonExport({
	title,
	id,
	json,
}: {
	title: string;
	id: string;
	json: string;
}) {
	const engine = useEngine();
	const preRef = useRef<HTMLPreElement>(null);

	async function copy() {
		const pre = preRef.current;
		if (!pre) return;

		try {
			await navigator.clipboard.writeText(json);
			engine.notifyToast("Copied");
		} catch {
			const selection = window.getSelection();
			if (!selection) return;
			const range = document.createRange();
			range.selectNodeContents(pre);
			selection.removeAllRanges();
			selection.addRange(range);
			engine.notifyToast("Selected. Press Ctrl+C or ⌘C to copy.");
		}
	}

	return (
		<>
			<h3>{title}</h3>
			<div className="jsonbox">
				<button type="button" className="btn" data-copy={id} onClick={copy}>
					Copy
				</button>
				<pre id={id} ref={preRef}>
					{json}
				</pre>
			</div>
		</>
	);
}

export function DataTab() {
	const engine = useEngine();
	const { state, model } = useEngineSnapshot();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [status, setStatus] = useState({ err: false, text: "" });
	const profile = useMemo(
		() => JSON.stringify(profileJSON(state, model), null, 2),
		[state, model],
	);
	const conditions = useMemo(
		() => JSON.stringify(condHypotheses(state), null, 2),
		[state],
	);
	const shader = useMemo(
		() => JSON.stringify(model.shader, null, 2),
		[model.shader],
	);

	// The probe writes to the textarea DOM value before clicking Apply JSON.
	function applyJson() {
		const result = engine.applyImportText(textareaRef.current?.value ?? "");
		setStatus({ err: !result.ok, text: result.message });
	}

	function loadExample() {
		if (!textareaRef.current) return;
		textareaRef.current.value = JSON.stringify(EXAMPLE_DETECTOR, null, 2);
		setStatus({
			err: false,
			text: "Example loaded. Press Apply JSON to map it onto the simulation.",
		});
	}

	return (
		<>
			<h3>Import</h3>
			<p className="lede">
				Paste detector output (schema 0.1), condition hypotheses, or a profile.
				The mapping rules follow Part III §8 of the catalog.
			</p>
			<textarea
				className="imp"
				id="imp"
				ref={textareaRef}
				spellCheck={false}
				aria-label="JSON to import"
				placeholder={'{"schema_version":"0.1","eye":"OD","findings":{...}}'}
			/>
			<div className="row2">
				<button
					type="button"
					className="btn primary"
					id="impApply"
					onClick={applyJson}
				>
					Apply JSON
				</button>
				<button
					type="button"
					className="btn"
					id="impExample"
					onClick={loadExample}
				>
					Load example detector output
				</button>
			</div>
			<div className={status.err ? "msg err" : "msg"} id="impMsg" role="status">
				{status.text}
			</div>
			<JsonExport title="Profile" id="jProfile" json={profile} />
			<JsonExport title="Condition hypotheses" id="jCond" json={conditions} />
			<JsonExport title="Shader parameters" id="jShader" json={shader} />
		</>
	);
}
