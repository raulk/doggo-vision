import { Checkbox } from "@base-ui/react/checkbox";
import { Collapsible } from "@base-ui/react/collapsible";
import { useEngine, useEngineSnapshot } from "../../engine";
import { CONDS, catStage, compile, GROUPS, opticalPenalty } from "../../model";
import { activeConditions } from "../../state";
import type { ConditionState, Extra, ExtraValue } from "../../types";
import { CheckIcon } from "../Icons";
import {
	CheckboxField,
	SegmentedControl,
	SelectField,
	SliderField,
} from "../ui";

type Condition = (typeof CONDS)[number];

function ConditionExtra({
	extra,
	value,
	onChange,
}: {
	extra: Extra;
	value: ExtraValue | undefined;
	onChange: (value: ExtraValue) => void;
}) {
	switch (extra.t) {
		case "bool":
			return (
				<CheckboxField
					label={extra.label}
					checked={Boolean(value)}
					onChange={onChange}
				/>
			);
		case "sel":
			return (
				<SelectField
					label={extra.label}
					layout="row"
					options={extra.opts.map(([option, label]) => ({
						value: option,
						label,
					}))}
					value={String(value)}
					onChange={onChange}
				/>
			);
		case "num":
			return (
				<SliderField
					label={extra.label}
					conf="S"
					min={extra.min}
					max={extra.max}
					step={extra.step}
					value={Number(value)}
					onChange={onChange}
					formatValue={(v) =>
						extra.unit ? Math.round(v) + extra.unit : v.toFixed(2)
					}
				/>
			);
	}
}

function ConditionCard({
	condition,
	state,
}: {
	condition: Condition;
	state: ConditionState;
}) {
	const engine = useEngine();
	const { id, name, photo, extras, d } = condition;
	const panelId = `cond_${id}_body`;
	const update = (edit: (condition: ConditionState) => void) =>
		engine.mutate((draft) => edit(activeConditions(draft)[id]), {
			clearPreset: true,
		});

	function formatSeverity(value: number) {
		const formatted = value.toFixed(2);
		switch (id) {
			case "cataract":
				return `${formatted} · ${catStage(value, state.x.hypermature)}`;
			case "pigmentary_keratitis":
				return `${formatted} · Maini ≈ ${(value * 14).toFixed(1)}`;
			default:
				return formatted;
		}
	}

	return (
		<Collapsible.Root open={state.on} className={state.on ? "cond on" : "cond"}>
			<Checkbox.Root
				id={`cond_${id}`}
				className="chead"
				render={<button type="button" />}
				nativeButton
				checked={state.on}
				aria-label={name}
				aria-controls={panelId}
				onCheckedChange={(on) =>
					update((draft) => {
						draft.on = on;
						draft.source = "manual";
					})
				}
			>
				<span
					className="checkbox-root"
					data-checked={state.on ? "" : undefined}
					aria-hidden="true"
				>
					<Checkbox.Indicator style={{ width: 14, height: 14 }}>
						<CheckIcon />
					</Checkbox.Indicator>
				</span>
				<span className="nm">{name}</span>
				<span className="sv">{state.on ? state.s.toFixed(2) : ""}</span>
				<span className={`photo ${photo}`}>Photo: {photo}</span>
			</Checkbox.Root>
			<Collapsible.Panel className="cbody" id={panelId} keepMounted>
				<div className="cbody-inner">
					<SliderField
						label={id === "glaucoma" ? "Pressure (acute)" : "Severity"}
						conf="S"
						min={0}
						max={1}
						step={0.01}
						value={state.s}
						onChange={(value) =>
							update((draft) => {
								draft.s = value;
							})
						}
						formatValue={formatSeverity}
					/>
					{extras?.map((extra) => (
						<ConditionExtra
							key={extra.k}
							extra={extra}
							value={state.x[extra.k]}
							onChange={(value) =>
								update((draft) => {
									draft.x[extra.k] = value;
								})
							}
						/>
					))}
					<p>{d}</p>
				</div>
			</Collapsible.Panel>
		</Collapsible.Root>
	);
}

function BinocularControls() {
	const engine = useEngine();
	const { state, model } = useEngineSnapshot();
	const better =
		opticalPenalty(compile(state, "OD")) <= opticalPenalty(compile(state, "OS"))
			? "right"
			: "left";
	const eye = state.profile.eye === "OS" ? "left" : "right";
	const overlap = Math.round(model.derived.binocular_overlap_deg / 2);

	return (
		<div id="binoCtl">
			<SegmentedControl
				id="eyeSeg"
				ariaLabel="Eye being edited"
				value={state.profile.eye}
				onChange={(nextEye) => engine.editEye(nextEye)}
				options={[
					{ value: "OS", label: "Left eye", dataAttr: { "data-eye": "OS" } },
					{ value: "OD", label: "Right eye", dataAttr: { "data-eye": "OD" } },
				]}
			/>
			<button
				type="button"
				className="btn"
				id="copyEye"
				onClick={() => engine.copyActiveEyeToOther()}
			>
				Copy to other eye
			</button>
			<div id="binoSliders">
				<SliderField
					label="Clearer-eye dominance"
					conf="S"
					min={0.5}
					max={1}
					step={0.01}
					value={state.binoc.dom}
					onChange={(dom) =>
						engine.mutate(
							(draft) => {
								draft.binoc.dom = dom;
							},
							{ clearPreset: true },
						)
					}
					formatValue={(v) => Math.round(v * 100) + "%"}
					hint="How much the clearer eye leads where the two fields overlap. 50% is an even mix."
				/>
			</div>
			<p className="lede" id="binoNote">
				{`Editing the ${eye} eye. The ${better} eye currently looks clearer, so it leads in the binocular zone (±${overlap}°). Each side crescent shows only that eye. A photo narrower than the overlap sits entirely in the blended zone.`}
			</p>
		</div>
	);
}

export function ConditionsTab() {
	const engine = useEngine();
	const { state } = useEngineSnapshot();
	const conditions = activeConditions(state);

	return (
		<>
			<p className="lede">
				Grouped in the order light passes through the eye. Severity runs 0 to 1,
				as in the detector schema. &quot;Photo&quot; shows whether a macro photo
				of the eye can reveal it.
			</p>
			<CheckboxField
				id="binoOn"
				boxed
				label="Both eyes"
				description="Give each eye its own conditions and blend them by visual-field zone"
				checked={state.binoc.on}
				onChange={(on) => engine.setBinoc(on)}
			/>
			{state.binoc.on && <BinocularControls />}
			<div className="row2">
				<button
					type="button"
					className="btn"
					id="condClear"
					onClick={() => engine.clearActiveConditions()}
				>
					Clear all conditions
				</button>
			</div>
			<div id="condList">
				{GROUPS.map(([group, label]) => (
					<div className="cgroup" key={group}>
						<h4>
							<span>{label}</span>
						</h4>
						{CONDS.filter((condition) => condition.g === group).map(
							(condition) => (
								<ConditionCard
									key={condition.id}
									condition={condition}
									state={conditions[condition.id]}
								/>
							),
						)}
					</div>
				))}
			</div>
		</>
	);
}
