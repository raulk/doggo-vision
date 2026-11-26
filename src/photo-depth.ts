import { inspectHdrJpeg, inspectHdrJpegHeader } from "purejsimage/hdr";
import { clamp, lerp } from "./model";
import type { DepthMap, EmbeddedDepthInfo, Orientation } from "./types";

const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";
const XMP_EXT_HEADER = "http://ns.adobe.com/xmp/extension/\0";
const HEIC_DEPTH_URNS = new Set([
	"urn:mpeg:hevc:2015:auxid:2",
	"urn:com:apple:photo:2018:aux:depth",
]);
const NON_DEPTH_AUX =
	/HDRGainMapVersion|hdrgainmap|portraiteffectsmatte|semanticsegmentation|glassesmatte|teethmatte|hairmatte|skinmatte|skymatte/i;

function ascii(bytes: Uint8Array, start: number, end: number) {
	let out = "";
	for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]!);
	return out;
}

function u16be(view: DataView, offset: number) {
	return view.getUint16(offset, false);
}

function u32be(view: DataView, offset: number) {
	return view.getUint32(offset, false);
}

function readUintBE(bytes: Uint8Array, offset: number, size: number) {
	let value = 0;
	for (let i = 0; i < size; i++) value = value * 256 + bytes[offset + i]!;
	return value;
}

function writeU16BE(out: Uint8Array, offset: number, value: number) {
	out[offset] = (value >>> 8) & 0xff;
	out[offset + 1] = value & 0xff;
}

function writeU32BE(out: Uint8Array, offset: number, value: number) {
	out[offset] = (value >>> 24) & 0xff;
	out[offset + 1] = (value >>> 16) & 0xff;
	out[offset + 2] = (value >>> 8) & 0xff;
	out[offset + 3] = value & 0xff;
}

function concatBytes(parts: readonly Uint8Array[]) {
	let total = 0;
	for (const part of parts) total += part.length;
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function box(type: string, payload: Uint8Array) {
	const out = new Uint8Array(8 + payload.length);
	writeU32BE(out, 0, out.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(payload, 8);
	return out;
}

function fullBox(
	type: string,
	version: number,
	flags: number,
	payload: Uint8Array,
) {
	const head = new Uint8Array(4);
	head[0] = version & 0xff;
	head[1] = (flags >>> 16) & 0xff;
	head[2] = (flags >>> 8) & 0xff;
	head[3] = flags & 0xff;
	return box(type, concatBytes([head, payload]));
}

function xmpTag(
	xml: string,
	localName: string,
	prefix?: string,
): string | undefined {
	const ns = prefix ? `${prefix}:` : "(?:[\\w-]+:)?";
	const attr = new RegExp(
		`${ns}${localName}\\s*=\\s*["']([^"']+)["']`,
		"i",
	).exec(xml);
	if (attr?.[1] !== undefined) return attr[1].trim();
	const elem = new RegExp(
		`<${ns}${localName}(?:\\s[^>]*)?>([^<]+)</${ns}${localName}>`,
		"i",
	).exec(xml);
	return elem?.[1]?.trim();
}

function finiteNumber(raw: string | undefined): number | undefined {
	if (!raw) return undefined;
	const value = Number(raw);
	return Number.isFinite(value) ? value : undefined;
}

function decodeBase64(encoded: string): Uint8Array {
	const clean = encoded.replace(/\s+/g, "");
	const binary = atob(clean);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

export interface ParsedAppleDepthMeta {
	representation: "inverse" | "linear";
	nearM: number;
	farM: number;
	metric: boolean;
	brighterIsNearer: boolean;
	floatMin?: number;
	floatMax?: number;
	intMin: number;
	intMax: number;
}

export function parseAppleDepthXmp(
	xmp: string,
	allowUnmarked = false,
): ParsedAppleDepthMeta | undefined {
	if (!xmp || NON_DEPTH_AUX.test(xmp)) return undefined;
	const floatMin = finiteNumber(xmpTag(xmp, "FloatMinValue"));
	const floatMax = finiteNumber(xmpTag(xmp, "FloatMaxValue"));
	const intMin = finiteNumber(xmpTag(xmp, "IntMinValue")) ?? 0;
	const intMax = finiteNumber(xmpTag(xmp, "IntMaxValue")) ?? 255;
	const dataType =
		xmpTag(xmp, "DataType") ??
		xmpTag(xmp, "AuxImageType") ??
		xmpTag(xmp, "AuxiliaryImageType") ??
		"";
	const accuracy = (xmpTag(xmp, "Accuracy") ?? "").toLowerCase();
	const hasAppleDepthMarkers =
		(floatMin !== undefined && floatMax !== undefined) ||
		/disparity|depthdata|urn:mpeg:hevc:2015:auxid:2|urn:com:apple:photo:2018:aux:depth/i.test(
			xmp,
		) ||
		/disparity|depth/i.test(dataType);
	if (!hasAppleDepthMarkers && !allowUnmarked) return undefined;

	const isLinearDepth = /depth/i.test(dataType) && !/disparity/i.test(dataType);
	const validRange =
		floatMin !== undefined && floatMax !== undefined && floatMax > floatMin;

	if (isLinearDepth) {
		if (validRange && floatMax > 0.05) {
			const nearM = clamp(Math.max(floatMin, 0.05), 0.1, 10);
			const farM = clamp(Math.max(floatMax, nearM + 0.05), 0.5, 100);
			return {
				representation: "linear",
				nearM,
				farM,
				metric: accuracy !== "relative",
				brighterIsNearer: false,
				floatMin,
				floatMax,
				intMin,
				intMax,
			};
		}
		return {
			representation: "linear",
			nearM: 0.4,
			farM: 25,
			metric: false,
			brighterIsNearer: false,
			intMin,
			intMax,
		};
	}

	// Default Apple auxiliary depth representation: disparity (1/m, brighter = nearer).
	if (validRange && floatMax > 0.02) {
		const invNear = Math.max(floatMax, 0.02);
		const invFar = Math.min(Math.max(floatMin, 0.01), invNear - 0.005);
		const nearM = clamp(1 / invNear, 0.1, 10);
		const farM = clamp(1 / Math.max(invFar, 0.01), nearM + 0.05, 100);
		return {
			representation: "inverse",
			nearM,
			farM,
			metric: accuracy !== "relative",
			brighterIsNearer: true,
			floatMin,
			floatMax,
			intMin,
			intMax,
		};
	}

	return {
		representation: "inverse",
		nearM: 0.4,
		farM: 25,
		metric: false,
		brighterIsNearer: true,
		intMin,
		intMax,
	};
}

export function parseGDepthXmp(
	primaryXmp: string,
	extendedXmp = "",
): EmbeddedDepthInfo | undefined {
	const combined = `${primaryXmp}\n${extendedXmp}`;
	const data = xmpTag(combined, "Data", "GDepth");
	if (!data) return undefined;
	const mime = xmpTag(combined, "Mime", "GDepth") ?? "image/png";
	if (!/^image\/(png|jpeg|jpg|webp)$/i.test(mime)) return undefined;
	const format = (
		xmpTag(combined, "Format", "GDepth") ?? "RangeInverse"
	).toLowerCase();
	const rawNear = finiteNumber(xmpTag(combined, "Near", "GDepth"));
	const rawFar = finiteNumber(xmpTag(combined, "Far", "GDepth"));
	const hasRange =
		rawNear !== undefined &&
		rawFar !== undefined &&
		rawNear > 0 &&
		rawFar > rawNear;
	const nearM = hasRange ? clamp(rawNear, 0.1, 10) : 0.4;
	const farM = hasRange ? clamp(rawFar, nearM + 0.05, 100) : 25;
	let bytes: Uint8Array;
	try {
		bytes = decodeBase64(data);
	} catch {
		return undefined;
	}
	if (bytes.length < 16) return undefined;
	const normalizedMime =
		mime.toLowerCase() === "image/jpg" ? "image/jpeg" : mime.toLowerCase();
	const representation = format.includes("linear") ? "linear" : "inverse";
	return {
		format: "gdepth",
		image: new Blob([bytes.buffer as ArrayBuffer], { type: normalizedMime }),
		representation,
		nearM,
		farM,
		metric: hasRange,
		// Per Google GDepth spec, pixel 0 = Near and pixel 255 = Far for both RangeInverse and RangeLinear.
		brighterIsNearer: false,
		floatMin: hasRange
			? representation === "inverse"
				? 1 / rawFar
				: rawNear
			: undefined,
		floatMax: hasRange
			? representation === "inverse"
				? 1 / rawNear
				: rawFar
			: undefined,
		intMin: 0,
		intMax: 255,
		label: "Portrait depth",
	};
}

function collectJpegXmp(
	segments: ReadonlyArray<{ marker: number; payload: Uint8Array }>,
) {
	const decoder = new TextDecoder();
	const primary: string[] = [];
	const extGroups = new Map<
		string,
		{ total: number; chunks: Array<{ offset: number; data: Uint8Array }> }
	>();
	for (const segment of segments) {
		if (segment.marker !== 0xe1) continue;
		const payload = segment.payload;
		if (
			payload.length > XMP_HEADER.length &&
			ascii(payload, 0, XMP_HEADER.length) === XMP_HEADER
		) {
			primary.push(decoder.decode(payload.subarray(XMP_HEADER.length)));
			continue;
		}
		const extMin = XMP_EXT_HEADER.length + 32 + 8;
		if (
			payload.length > extMin &&
			ascii(payload, 0, XMP_EXT_HEADER.length) === XMP_EXT_HEADER
		) {
			const guid = ascii(
				payload,
				XMP_EXT_HEADER.length,
				XMP_EXT_HEADER.length + 32,
			);
			const view = new DataView(
				payload.buffer,
				payload.byteOffset,
				payload.byteLength,
			);
			const total = u32be(view, XMP_EXT_HEADER.length + 32);
			const offset = u32be(view, XMP_EXT_HEADER.length + 36);
			if (total === 0 || total > 32 * 1024 * 1024) continue;
			const chunk = payload.subarray(extMin);
			const group = extGroups.get(guid) ?? { total, chunks: [] };
			group.chunks.push({ offset, data: chunk });
			extGroups.set(guid, group);
		}
	}
	const extended: string[] = [];
	for (const { total, chunks } of extGroups.values()) {
		const buffer = new Uint8Array(total);
		for (const { offset, data } of chunks) {
			if (offset >= total) continue;
			const length = Math.min(data.length, total - offset);
			buffer.set(data.subarray(0, length), offset);
		}
		extended.push(decoder.decode(buffer));
	}
	return { primary: primary.join("\n"), extended: extended.join("\n") };
}

interface IsoBox {
	type: string;
	start: number;
	end: number;
	payloadStart: number;
}

function iterBoxes(bytes: Uint8Array, start: number, end: number): IsoBox[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const list: IsoBox[] = [];
	let pos = start;
	while (pos + 8 <= end) {
		const rawSize = u32be(view, pos);
		const type = ascii(bytes, pos + 4, pos + 8);
		let size = rawSize;
		let header = 8;
		if (rawSize === 1) {
			if (pos + 16 > end) break;
			size = readUintBE(bytes, pos + 8, 8);
			header = 16;
		} else if (rawSize === 0) {
			size = end - pos;
		}
		if (size < header || pos + size > end) break;
		list.push({
			type,
			start: pos,
			end: pos + size,
			payloadStart: pos + header,
		});
		pos += size;
	}
	return list;
}

interface ItemLocation {
	constructionMethod: number;
	baseOffset: number;
	extents: Array<{ offset: number; length: number }>;
}

function readItemBytes(
	bytes: Uint8Array,
	location: ItemLocation,
	idat?: Uint8Array,
): Uint8Array | undefined {
	const base = location.constructionMethod === 1 ? idat : bytes;
	if (!base || location.constructionMethod > 1) return undefined;
	const parts: Uint8Array[] = [];
	for (const extent of location.extents) {
		const start = location.baseOffset + extent.offset;
		const end = start + extent.length;
		if (start < 0 || end > base.length || extent.length <= 0) return undefined;
		parts.push(base.subarray(start, end));
	}
	return parts.length === 1 ? parts[0]! : concatBytes(parts);
}

function buildSingleImageHeic(
	bitstream: Uint8Array,
	properties: ReadonlyArray<{ essential: boolean; bytes: Uint8Array }>,
): Uint8Array {
	const ftypPayload = new Uint8Array(16);
	for (let i = 0; i < 4; i++) ftypPayload[i] = "mif1".charCodeAt(i);
	for (let i = 0; i < 4; i++) ftypPayload[8 + i] = "mif1".charCodeAt(i);
	for (let i = 0; i < 4; i++) ftypPayload[12 + i] = "heic".charCodeAt(i);
	const ftyp = box("ftyp", ftypPayload);

	const hdlrPayload = new Uint8Array(21);
	for (let i = 0; i < 4; i++) hdlrPayload[4 + i] = "pict".charCodeAt(i);
	const hdlr = fullBox("hdlr", 0, 0, hdlrPayload);

	const pitmPayload = new Uint8Array(2);
	writeU16BE(pitmPayload, 0, 1);
	const pitm = fullBox("pitm", 0, 0, pitmPayload);

	const infePayload = new Uint8Array(9);
	writeU16BE(infePayload, 0, 1);
	writeU16BE(infePayload, 2, 0);
	for (let i = 0; i < 4; i++) infePayload[4 + i] = "hvc1".charCodeAt(i);
	const infe = fullBox("infe", 2, 0, infePayload);

	const iinfCount = new Uint8Array(2);
	writeU16BE(iinfCount, 0, 1);
	const iinf = fullBox("iinf", 0, 0, concatBytes([iinfCount, infe]));

	const ipco = box(
		"ipco",
		concatBytes(properties.map((property) => property.bytes)),
	);
	const wideIndex = properties.length > 127;
	const ipmaPayload = new Uint8Array(
		7 + properties.length * (wideIndex ? 2 : 1),
	);
	writeU32BE(ipmaPayload, 0, 1); // entry_count
	writeU16BE(ipmaPayload, 4, 1); // item_ID
	ipmaPayload[6] = properties.length;
	let cursor = 7;
	for (let i = 0; i < properties.length; i++) {
		const index = i + 1;
		const essential = properties[i]!.essential;
		if (wideIndex) {
			writeU16BE(ipmaPayload, cursor, (essential ? 0x8000 : 0) | index);
			cursor += 2;
		} else {
			ipmaPayload[cursor++] = (essential ? 0x80 : 0) | index;
		}
	}
	const ipma = fullBox("ipma", 0, wideIndex ? 1 : 0, ipmaPayload);
	const iprp = box("iprp", concatBytes([ipco, ipma]));

	const makeIloc = (dataOffset: number) => {
		const payload = new Uint8Array(18);
		payload[0] = 0x44; // offset_size=4, length_size=4
		payload[1] = 0x00; // base_offset_size=0
		writeU16BE(payload, 2, 1); // item_count
		writeU16BE(payload, 4, 1); // item_ID
		writeU16BE(payload, 6, 0); // data_reference_index
		writeU16BE(payload, 8, 1); // extent_count
		writeU32BE(payload, 10, dataOffset);
		writeU32BE(payload, 14, bitstream.length);
		return fullBox("iloc", 0, 0, payload);
	};

	const metaStatic = concatBytes([hdlr, pitm, iinf, iprp]);
	const placeholderIloc = makeIloc(0);
	const metaSize = 12 + metaStatic.length + placeholderIloc.length;
	const mdatDataOffset = ftyp.length + metaSize + 8;
	const meta = fullBox(
		"meta",
		0,
		0,
		concatBytes([metaStatic, makeIloc(mdatDataOffset)]),
	);
	const mdat = box("mdat", bitstream);
	return concatBytes([ftyp, meta, mdat]);
}

export function extractHeicDepth(
	bytes: Uint8Array,
): EmbeddedDepthInfo | undefined {
	if (bytes.length < 16 || ascii(bytes, 4, 8) !== "ftyp") return undefined;
	const topBoxes = iterBoxes(bytes, 0, bytes.length);
	const ftyp = topBoxes.find((b) => b.type === "ftyp");
	if (!ftyp || ftyp.end - ftyp.payloadStart < 8) return undefined;
	const brands: string[] = [
		ascii(bytes, ftyp.payloadStart, ftyp.payloadStart + 4),
	];
	for (let p = ftyp.payloadStart + 8; p + 4 <= ftyp.end; p += 4)
		brands.push(ascii(bytes, p, p + 4));
	if (!brands.some((b) => /^(heic|heix|hevc|hevx|mif1|msf1)$/i.test(b)))
		return undefined;

	const meta = topBoxes.find((b) => b.type === "meta");
	if (!meta || meta.payloadStart + 4 > meta.end) return undefined;
	const metaChildren = iterBoxes(bytes, meta.payloadStart + 4, meta.end);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	// 1. Parse iinf -> item types & MIME types
	const itemTypes = new Map<number, { type: string; mime?: string }>();
	const iinf = metaChildren.find((b) => b.type === "iinf");
	if (iinf && iinf.payloadStart + 6 <= iinf.end) {
		const version = bytes[iinf.payloadStart]!;
		const listStart = iinf.payloadStart + (version === 0 ? 6 : 8);
		for (const infe of iterBoxes(bytes, listStart, iinf.end)) {
			if (infe.type !== "infe" || infe.payloadStart + 12 > infe.end) continue;
			const v = bytes[infe.payloadStart]!;
			if (v !== 2 && v !== 3) continue;
			const id =
				v === 2
					? u16be(view, infe.payloadStart + 4)
					: u32be(view, infe.payloadStart + 4);
			const typePos = infe.payloadStart + (v === 2 ? 8 : 10);
			if (typePos + 4 > infe.end) continue;
			const itemType = ascii(bytes, typePos, typePos + 4);
			let mime: string | undefined;
			if (itemType === "mime") {
				let p = typePos + 4;
				while (p < infe.end && bytes[p] !== 0) p++;
				p++; // skip null after item_name
				const mimeStart = p;
				while (p < infe.end && bytes[p] !== 0) p++;
				if (p > mimeStart) mime = ascii(bytes, mimeStart, p);
			}
			itemTypes.set(id, { type: itemType, mime });
		}
	}

	// 2. Parse iprp -> ipco (1-indexed properties) and ipma (associations)
	const iprp = metaChildren.find((b) => b.type === "iprp");
	if (!iprp) return undefined;
	const iprpChildren = iterBoxes(bytes, iprp.payloadStart, iprp.end);
	const ipco = iprpChildren.find((b) => b.type === "ipco");
	if (!ipco) return undefined;
	const propBoxes = iterBoxes(bytes, ipco.payloadStart, ipco.end);
	const depthPropIndices = new Set<number>();
	for (let i = 0; i < propBoxes.length; i++) {
		const prop = propBoxes[i]!;
		if (prop.type !== "auxC" || prop.payloadStart + 5 > prop.end) continue;
		let p = prop.payloadStart + 4;
		const urnStart = p;
		while (p < prop.end && bytes[p] !== 0) p++;
		const urn = ascii(bytes, urnStart, p);
		if (HEIC_DEPTH_URNS.has(urn)) depthPropIndices.add(i + 1);
	}
	if (depthPropIndices.size === 0) return undefined;

	const itemProps = new Map<
		number,
		Array<{ index: number; essential: boolean }>
	>();
	for (const ipma of iprpChildren.filter((b) => b.type === "ipma")) {
		if (ipma.payloadStart + 8 > ipma.end) continue;
		const version = bytes[ipma.payloadStart]!;
		const flags =
			(bytes[ipma.payloadStart + 1]! << 16) |
			(bytes[ipma.payloadStart + 2]! << 8) |
			bytes[ipma.payloadStart + 3]!;
		const wideProp = (flags & 1) !== 0;
		const entryCount = u32be(view, ipma.payloadStart + 4);
		let pos = ipma.payloadStart + 8;
		for (let e = 0; e < entryCount && pos < ipma.end; e++) {
			const id = version < 1 ? u16be(view, pos) : u32be(view, pos);
			pos += version < 1 ? 2 : 4;
			if (pos >= ipma.end) break;
			const assocCount = bytes[pos++]!;
			const list = itemProps.get(id) ?? [];
			for (let a = 0; a < assocCount && pos < ipma.end; a++) {
				if (wideProp) {
					if (pos + 2 > ipma.end) break;
					const raw = u16be(view, pos);
					pos += 2;
					list.push({ essential: (raw & 0x8000) !== 0, index: raw & 0x7fff });
				} else {
					const raw = bytes[pos++]!;
					list.push({ essential: (raw & 0x80) !== 0, index: raw & 0x7f });
				}
			}
			itemProps.set(id, list);
		}
	}

	// Find the hvc1 item associated with a depth auxC property.
	let depthItemId: number | undefined;
	for (const [id, props] of itemProps) {
		if (itemTypes.get(id)?.type !== "hvc1") continue;
		if (props.some((p) => depthPropIndices.has(p.index))) {
			depthItemId = id;
			break;
		}
	}
	if (depthItemId === undefined) return undefined;

	// 3. Parse iloc + optional idat
	const iloc = metaChildren.find((b) => b.type === "iloc");
	if (!iloc || iloc.payloadStart + 8 > iloc.end) return undefined;
	const locations = new Map<number, ItemLocation>();
	{
		const version = bytes[iloc.payloadStart]!;
		const b4 = bytes[iloc.payloadStart + 4]!;
		const b5 = bytes[iloc.payloadStart + 5]!;
		const offsetSize = b4 >>> 4;
		const lengthSize = b4 & 0xf;
		const baseOffsetSize = b5 >>> 4;
		const indexSize = version === 1 || version === 2 ? b5 & 0xf : 0;
		const itemCount =
			version < 2
				? u16be(view, iloc.payloadStart + 6)
				: u32be(view, iloc.payloadStart + 6);
		let pos = iloc.payloadStart + (version < 2 ? 8 : 10);
		for (let i = 0; i < itemCount && pos < iloc.end; i++) {
			const id = version < 2 ? u16be(view, pos) : u32be(view, pos);
			pos += version < 2 ? 2 : 4;
			let constructionMethod = 0;
			if (version === 1 || version === 2) {
				if (pos + 2 > iloc.end) break;
				constructionMethod = u16be(view, pos) & 0xf;
				pos += 2;
			}
			if (pos + 2 + baseOffsetSize + 2 > iloc.end) break;
			pos += 2; // data_reference_index
			const baseOffset = readUintBE(bytes, pos, baseOffsetSize);
			pos += baseOffsetSize;
			const extentCount = u16be(view, pos);
			pos += 2;
			const extents: Array<{ offset: number; length: number }> = [];
			for (let e = 0; e < extentCount; e++) {
				if (pos + indexSize + offsetSize + lengthSize > iloc.end) break;
				pos += indexSize;
				const offset = readUintBE(bytes, pos, offsetSize);
				pos += offsetSize;
				const length = readUintBE(bytes, pos, lengthSize);
				pos += lengthSize;
				extents.push({ offset, length });
			}
			locations.set(id, { constructionMethod, baseOffset, extents });
		}
	}

	const idatBox = metaChildren.find((b) => b.type === "idat");
	const idat = idatBox
		? bytes.subarray(idatBox.payloadStart, idatBox.end)
		: undefined;
	const depthLoc = locations.get(depthItemId);
	const depthBitstream = depthLoc
		? readItemBytes(bytes, depthLoc, idat)
		: undefined;
	if (!depthBitstream || depthBitstream.length === 0) return undefined;

	// 4. Find XMP metadata describing the depth item via iref (cdsc) or any mime/rdf+xml item.
	const cdscForDepth: number[] = [];
	const iref = metaChildren.find((b) => b.type === "iref");
	if (iref && iref.payloadStart + 4 <= iref.end) {
		const version = bytes[iref.payloadStart]!;
		const idSize = version === 0 ? 2 : 4;
		for (const ref of iterBoxes(bytes, iref.payloadStart + 4, iref.end)) {
			if (ref.type !== "cdsc" || ref.payloadStart + idSize + 2 > ref.end)
				continue;
			const fromId =
				idSize === 2
					? u16be(view, ref.payloadStart)
					: u32be(view, ref.payloadStart);
			const count = u16be(view, ref.payloadStart + idSize);
			let pos = ref.payloadStart + idSize + 2;
			for (let c = 0; c < count && pos + idSize <= ref.end; c++) {
				const toId = idSize === 2 ? u16be(view, pos) : u32be(view, pos);
				pos += idSize;
				if (toId === depthItemId) cdscForDepth.push(fromId);
			}
		}
	}

	const decoder = new TextDecoder();
	let xmpMeta: ParsedAppleDepthMeta | undefined;
	const xmpCandidates = [
		...cdscForDepth,
		...[...itemTypes.entries()]
			.filter(
				([id, info]) =>
					!cdscForDepth.includes(id) &&
					info.type === "mime" &&
					(!info.mime || /rdf\+xml|xmp/i.test(info.mime)),
			)
			.map(([id]) => id),
	];
	for (const xmpId of xmpCandidates) {
		const loc = locations.get(xmpId);
		const raw = loc ? readItemBytes(bytes, loc, idat) : undefined;
		if (!raw) continue;
		const parsed = parseAppleDepthXmp(decoder.decode(raw));
		if (parsed) {
			xmpMeta = parsed;
			break;
		}
	}
	const metaParams = xmpMeta ?? {
		representation: "inverse" as const,
		nearM: 0.4,
		farM: 25,
		metric: false,
		brighterIsNearer: true,
		intMin: 0,
		intMax: 255,
	};

	const keptProps: Array<{ essential: boolean; bytes: Uint8Array }> = [];
	for (const assoc of itemProps.get(depthItemId) ?? []) {
		const prop = propBoxes[assoc.index - 1];
		if (!prop || prop.type === "auxC") continue;
		keptProps.push({
			essential: assoc.essential,
			bytes: bytes.subarray(prop.start, prop.end),
		});
	}
	if (!keptProps.some((p) => ascii(p.bytes, 4, 8) === "hvcC")) return undefined;

	const heic = buildSingleImageHeic(depthBitstream, keptProps);
	return {
		format: "apple-heic",
		image: new Blob([heic.buffer as ArrayBuffer], { type: "image/heic" }),
		...metaParams,
		label: "iPhone depth",
	};
}

export async function extractEmbeddedDepth(
	file: Blob,
	preloadedJpeg?: Awaited<ReturnType<typeof inspectHdrJpeg>>,
): Promise<EmbeddedDepthInfo | undefined> {
	const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	if (head.length < 4) return undefined;

	if (head[0] === 0xff && head[1] === 0xd8) {
		const source = {
			size: file.size,
			read: async (offset: number, length: number) =>
				new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
		};
		const jpeg =
			preloadedJpeg ?? (await inspectHdrJpeg(source).catch(() => undefined));

		// 1. iPhone Portrait JPEG (Apple MPF secondary image + XMP depth/disparity metadata).
		for (const entry of jpeg?.mpf?.images.slice(1) ?? []) {
			const { start, end } = entry.range;
			// oxlint-disable-next-line no-await-in-loop -- Inspect MPF secondary entries until the depth map is found.
			const secondary = await inspectHdrJpegHeader(source, start).catch(
				() => undefined,
			);
			if (!secondary) continue;
			const { primary } = collectJpegXmp(secondary.applicationSegments);
			const parsed = parseAppleDepthXmp(primary);
			if (!parsed) continue;
			return {
				format: "apple-jpeg",
				image: file.slice(start, end, "image/jpeg"),
				...parsed,
				label: "iPhone depth",
			};
		}

		// 2. Android / Pixel Portrait JPEG (Google GDepth XMP + Extended XMP).
		const primaryHeader = await inspectHdrJpegHeader(source, 0).catch(
			() => undefined,
		);
		if (primaryHeader) {
			const { primary, extended } = collectJpegXmp(
				primaryHeader.applicationSegments,
			);
			const gdepth = parseGDepthXmp(primary, extended);
			if (gdepth) return gdepth;
		}
		return undefined;
	}

	if (head.length >= 12 && ascii(head, 4, 8) === "ftyp") {
		const bytes = new Uint8Array(await file.arrayBuffer());
		return extractHeicDepth(bytes);
	}
	return undefined;
}

export function normalizeEmbeddedDepthPixels(
	rgba: Uint8ClampedArray,
	info: Pick<
		EmbeddedDepthInfo,
		| "representation"
		| "nearM"
		| "farM"
		| "brighterIsNearer"
		| "floatMin"
		| "floatMax"
		| "intMin"
		| "intMax"
	>,
): Uint8ClampedArray {
	const out = new Uint8ClampedArray(rgba.length);
	const intSpan = Math.max(1, info.intMax - info.intMin);
	const invFar = 1 / info.farM;
	const invNear = 1 / info.nearM;
	const invSpan = invNear - invFar;
	const hasFloatRange =
		info.floatMin !== undefined &&
		info.floatMax !== undefined &&
		info.floatMax > info.floatMin;

	for (let i = 0; i < rgba.length; i += 4) {
		const luma = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
		const t = clamp((luma - info.intMin) / intSpan, 0, 1);
		let invNorm = 0;
		if (info.representation === "inverse") {
			if (hasFloatRange && invSpan > 0) {
				const disp = lerp(
					info.floatMin!,
					info.floatMax!,
					info.brighterIsNearer ? t : 1 - t,
				);
				invNorm = clamp((disp - invFar) / invSpan, 0, 1);
			} else {
				invNorm = info.brighterIsNearer ? t : 1 - t;
			}
		} else {
			const linearT = info.brighterIsNearer ? 1 - t : t;
			const minD = hasFloatRange ? info.floatMin! : info.nearM;
			const maxD = hasFloatRange ? info.floatMax! : info.farM;
			const d = Math.max(0.05, lerp(minD, maxD, linearT));
			invNorm = invSpan > 0 ? clamp((1 / d - invFar) / invSpan, 0, 1) : 0;
		}
		const value = Math.round(invNorm * 255);
		out[i] = out[i + 1] = out[i + 2] = value;
		out[i + 3] = 255;
	}
	return out;
}

export async function decodeEmbeddedDepth(
	info: EmbeddedDepthInfo,
	baseOrientation: Orientation | undefined,
	width: number,
	height: number,
	stripJpegExif: (
		image: Blob,
		baseOrientation: Orientation,
		width: number,
		height: number,
	) => Promise<{ image: Blob; transform: Orientation }>,
): Promise<DepthMap> {
	let blob = info.image;
	let transform: Orientation = 1;
	if (info.image.type === "image/jpeg") {
		const raster = await stripJpegExif(
			info.image,
			baseOrientation ?? 1,
			width,
			height,
		);
		blob = raster.image;
		transform = raster.transform;
	}
	const bitmap = await createImageBitmap(blob, {
		colorSpaceConversion: "none",
	});
	try {
		if (
			info.image.type !== "image/jpeg" &&
			baseOrientation &&
			baseOrientation >= 5
		) {
			const logAspect = Math.log(width / height);
			const mapLogAspect = Math.log(bitmap.width / bitmap.height);
			if (
				Math.abs(mapLogAspect + logAspect) < Math.abs(mapLogAspect - logAspect)
			)
				transform = baseOrientation;
		}
		const rotate = transform >= 5;
		const scale = Math.min(
			1,
			width / (rotate ? bitmap.height : bitmap.width),
			height / (rotate ? bitmap.width : bitmap.height),
		);
		const mapWidth = Math.max(1, Math.round(bitmap.width * scale));
		const mapHeight = Math.max(1, Math.round(bitmap.height * scale));
		const canvas = document.createElement("canvas");
		canvas.width = rotate ? mapHeight : mapWidth;
		canvas.height = rotate ? mapWidth : mapHeight;
		const ctx = canvas.getContext("2d")!;
		const w = canvas.width;
		const h = canvas.height;
		switch (transform) {
			case 2:
				ctx.setTransform(-1, 0, 0, 1, w, 0);
				break;
			case 3:
				ctx.setTransform(-1, 0, 0, -1, w, h);
				break;
			case 4:
				ctx.setTransform(1, 0, 0, -1, 0, h);
				break;
			case 5:
				ctx.setTransform(0, 1, 1, 0, 0, 0);
				break;
			case 6:
				ctx.setTransform(0, 1, -1, 0, w, 0);
				break;
			case 7:
				ctx.setTransform(0, -1, -1, 0, w, h);
				break;
			case 8:
				ctx.setTransform(0, -1, 1, 0, 0, h);
				break;
		}
		ctx.drawImage(bitmap, 0, 0, mapWidth, mapHeight);
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		const pixels = ctx.getImageData(0, 0, w, h);
		pixels.data.set(normalizeEmbeddedDepthPixels(pixels.data, info));
		ctx.putImageData(pixels, 0, 0);
		return {
			canvas,
			nearM: info.nearM,
			farM: info.farM,
			kind: "embedded",
			metric: info.metric,
			label: info.label,
		};
	} finally {
		bitmap.close();
	}
}
