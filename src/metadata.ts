import { parse } from "exifr";
import {
	type GainMapTriplet,
	inspectHdrJpeg,
	inspectHdrJpegHeader,
} from "purejsimage/hdr";
import { clamp } from "./model";
import { decodeEmbeddedDepth, extractEmbeddedDepth } from "./photo-depth";
import type {
	EmbeddedDepthInfo,
	GainMapInfo,
	Orientation,
	PanoramaInfo,
	PhotoMetadata,
	SceneParams,
} from "./types";

type Tags = Record<string, unknown>;

function tags(value: unknown): Tags {
	return value && typeof value === "object" ? (value as Tags) : {};
}
function finite(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}
function positive(value: unknown): number | undefined {
	const n = finite(Array.isArray(value) ? value[0] : value);
	return n !== undefined && n > 0 ? n : undefined;
}
function text(value: unknown): string | undefined {
	return typeof value === "string" ? value.trim() || undefined : undefined;
}

function cylindricalPanorama(aspect: number): PanoramaInfo {
	const hfovDeg = clamp(aspect * 45, 120, 360);
	return {
		projection: "cylindrical",
		hfovDeg,
		vfovDeg: (360 / Math.PI) * Math.atan((hfovDeg * Math.PI) / (360 * aspect)),
		yawOffsetDeg: 0,
		pitchOffsetDeg: 0,
	};
}

export function sourcePanorama(
	mode: SceneParams["projection"],
	source: { panorama?: PanoramaInfo; canvas: HTMLCanvasElement },
): PanoramaInfo | undefined {
	if (mode === "photo") return undefined;
	if (source.panorama || mode === "auto") return source.panorama;
	const aspect = source.canvas.width / source.canvas.height;
	return Math.abs(aspect - 2) < 0.02
		? {
				projection: "equirectangular",
				hfovDeg: 360,
				vfovDeg: 180,
				yawOffsetDeg: 0,
				pitchOffsetDeg: 0,
			}
		: cylindricalPanorama(aspect);
}

function panoramaMetadata(
	t: Tags,
	width: number,
	height: number,
	hfov?: number,
): PanoramaInfo | undefined {
	const tag = (name: string) => t[name] ?? t[`GPano:${name}`];
	const number = (name: string) => {
		const value = tag(name);
		return finite(typeof value === "string" ? Number(value) : value);
	};
	const viewer = tag("UsePanoramaViewer");
	if (
		tag("ProjectionType") === "equirectangular" ||
		viewer === true ||
		viewer === "True" ||
		viewer === "true"
	) {
		const cropW = Math.max(1, number("CroppedAreaImageWidthPixels") ?? width);
		const cropH = Math.max(1, number("CroppedAreaImageHeightPixels") ?? height);
		const fullW = Math.max(cropW, number("FullPanoWidthPixels") ?? cropW);
		const fullH = Math.max(cropH, number("FullPanoHeightPixels") ?? cropH);
		const left = clamp(
			number("CroppedAreaLeftPixels") ?? (fullW - cropW) / 2,
			0,
			fullW - cropW,
		);
		const top = clamp(
			number("CroppedAreaTopPixels") ?? (fullH - cropH) / 2,
			0,
			fullH - cropH,
		);
		return {
			projection: "equirectangular",
			hfovDeg: (360 * cropW) / fullW,
			vfovDeg: (180 * cropH) / fullH,
			yawOffsetDeg: 360 * ((left + cropW / 2) / fullW - 0.5),
			pitchOffsetDeg: 180 * (0.5 - (top + cropH / 2) / fullH),
		};
	}
	const aspect = width / height;
	return aspect >= 2.2 && (hfov ?? 65) >= 40
		? cylindricalPanorama(aspect)
		: undefined;
}

export function photoMetadata(
	t: Tags,
	width: number,
	height: number,
): PhotoMetadata {
	const rawOrientation = finite(t.Orientation);
	const orientation =
		rawOrientation !== undefined &&
		Number.isInteger(rawOrientation) &&
		rawOrientation >= 1 &&
		rawOrientation <= 8
			? (rawOrientation as Orientation)
			: undefined;
	const f35 = positive(t.FocalLengthIn35mmFormat);
	const zoom = Math.max(1, positive(t.DigitalZoomRatio) ?? 1);
	const focal = positive(t.FocalLength);
	const units: Record<number, number> = { 2: 25.4, 3: 10, 4: 1, 5: 0.001 };
	const unit = units[finite(t.FocalPlaneResolutionUnit) ?? 0];
	const px = positive(t.ExifImageWidth);
	const res = positive(t.FocalPlaneXResolution);
	const orientedWidth =
		Math.hypot(width, height) > 0 ? width / Math.hypot(width, height) : 0;
	let ratio: number | undefined;
	if (f35 && orientedWidth)
		ratio = (43.2666 * orientedWidth) / (2 * f35 * zoom);
	else if (focal && unit && px && res) {
		const rotated = orientation !== undefined && orientation >= 5;
		const sensorWidth = ((px * unit) / res) * (rotated ? width / height : 1);
		ratio = sensorWidth / (2 * focal * zoom);
	}
	const hfovDeg =
		ratio && Number.isFinite(ratio)
			? clamp((2 * Math.atan(ratio) * 180) / Math.PI, 4, 120)
			: undefined;

	const aperture = positive(t.FNumber);
	const exposure = positive(t.ExposureTime);
	const iso = positive(t.ISO) ?? positive(t.ISOSpeedRatings);
	const compensation =
		finite(t.ExposureCompensation) ?? finite(t.ExposureBiasValue) ?? 0;
	const brightness = finite(t.BrightnessValue);
	// Use logs directly so extreme exposure metadata cannot overflow the intermediate luminance.
	const estimate =
		aperture && exposure && iso
			? Math.log10(12.5) +
				2 * Math.log10(aperture) -
				Math.log10(exposure) -
				Math.log10(iso) +
				compensation * Math.LOG10E * Math.LN2
			: brightness === undefined
				? undefined
				: Math.log10(4) + brightness * Math.LOG10E * Math.LN2;
	const logL = estimate === undefined ? undefined : clamp(estimate, -3.5, 3.5);
	const flash = finite(t.Flash);
	const distance = finite(t.SubjectDistance);
	const profile = text(t.ProfileDescription);
	const color = text(t.ColorSpace);
	const colorSpace = /display\s*p3|\bp3\b/i.test(profile ?? color ?? "")
		? "Display P3"
		: /srgb/i.test(profile ?? color ?? "") || t.ColorSpace === 1
			? "sRGB"
			: (profile ?? color);
	return {
		panorama: panoramaMetadata(t, width, height, hfovDeg),
		hfovDeg,
		logL,
		orientation,
		colorSpace,
		flashFired: flash === undefined ? undefined : (flash & 1) === 1,
		distM:
			distance !== undefined && distance >= 0.05 && distance <= 50
				? distance
				: undefined,
		make: text(t.Make),
		model: text(t.Model),
		lensModel: text(t.LensModel),
	};
}

export function gainMapHeadroom(
	info: Pick<
		GainMapInfo,
		"hdrCapacityMin" | "hdrCapacityMax" | "baseRenditionIsHdr"
	>,
) {
	return 2 ** clamp(Math.max(info.hdrCapacityMin, info.hdrCapacityMax), 0, 16);
}

export function appleHeadroom(maker33: number, maker48: number) {
	const stops =
		maker33 < 1
			? maker48 <= 0.01
				? 1.8 - 20 * maker48
				: 1.601 - 0.101 * maker48
			: maker48 <= 0.01
				? 3 - 70 * maker48
				: 2.303 - 0.303 * maker48;
	return 2 ** clamp(stops, 0, 16);
}

function appleMakerHeadroom(note: unknown): number | undefined {
	if (
		!(note instanceof Uint8Array) ||
		note.length < 16 ||
		new TextDecoder().decode(note.subarray(0, 10)) !== "Apple iOS\0"
	)
		return;
	const v = new DataView(note.buffer, note.byteOffset, note.byteLength);
	const order = v.getUint16(12);
	if (order !== 0x4949 && order !== 0x4d4d) return;
	const le = order === 0x4949;
	const count = v.getUint16(14, le);
	const values: Record<number, number> = {};
	for (let i = 16; i + 12 <= v.byteLength && i < 16 + count * 12; i += 12) {
		const tag = v.getUint16(i, le);
		if ((tag !== 33 && tag !== 48) || v.getUint32(i + 4, le) !== 1) continue;
		const type = v.getUint16(i + 2, le);
		if (type === 11) values[tag] = v.getFloat32(i + 8, le);
		if (type === 10) {
			const offset = v.getUint32(i + 8, le);
			if (offset + 8 <= v.byteLength)
				values[tag] = v.getInt32(offset, le) / v.getInt32(offset + 4, le);
		}
	}
	const a = finite(values[33]);
	const b = finite(values[48]);
	if (a !== undefined && b !== undefined) return appleHeadroom(a, b);
}

function triplet(values: readonly number[]): GainMapTriplet {
	return [values[0]!, values[1] ?? values[0]!, values[2] ?? values[0]!];
}

function jpegSource(file: Blob) {
	return {
		size: file.size,
		read: async (offset: number, length: number) =>
			new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
	};
}

// Gain maps always describe SDR → HDR. Store log gains and offsets in the direction the renderer needs.
export function gainMapTransfer(
	info: Pick<
		GainMapInfo,
		| "baseRenditionIsHdr"
		| "gainMapMin"
		| "gainMapMax"
		| "offsetSdr"
		| "offsetHdr"
	>,
) {
	const { baseRenditionIsHdr, gainMapMin, gainMapMax, offsetSdr, offsetHdr } =
		info;
	return baseRenditionIsHdr
		? {
				logGainMin: triplet(gainMapMin.map((value) => -value)),
				logGainMax: triplet(gainMapMax.map((value) => -value)),
				baseOffset: offsetHdr,
				alternateOffset: offsetSdr,
			}
		: {
				logGainMin: gainMapMin,
				logGainMax: gainMapMax,
				baseOffset: offsetSdr,
				alternateOffset: offsetHdr,
			};
}

async function extractGainMap(
	file: Blob,
	makerNote: unknown,
	preloadedJpeg?: Awaited<ReturnType<typeof inspectHdrJpeg>>,
): Promise<GainMapInfo | undefined> {
	const signature = new Uint8Array(await file.slice(0, 2).arrayBuffer());
	if (signature[0] !== 0xff || signature[1] !== 0xd8) return;
	const source = jpegSource(file);
	const jpeg = preloadedJpeg ?? (await inspectHdrJpeg(source));
	const parameters = jpeg.iso ?? jpeg.ultraHdr;
	if (jpeg.gainMap && parameters) {
		const { start, end } = jpeg.gainMap;
		return {
			format: jpeg.iso ? "iso-21496-1" : "ultra-hdr-xmp",
			image: file.slice(start, end, "image/jpeg"),
			gainMapMin: triplet(parameters.minimum),
			gainMapMax: triplet(parameters.maximum),
			gamma: triplet(parameters.gamma),
			offsetSdr: triplet(parameters.offsetSdr),
			offsetHdr: triplet(parameters.offsetHdr),
			hdrCapacityMin: parameters.capacityMinimum,
			hdrCapacityMax: parameters.capacityMaximum,
			baseRenditionIsHdr: parameters.baseRendition === "hdr",
		};
	}
	// Legacy Apple JPEGs identify their luminance map in the secondary MPF image's XMP.
	for (const entry of jpeg.mpf?.images.slice(1) ?? []) {
		const { start, end } = entry.range;
		// oxlint-disable-next-line no-await-in-loop -- Read one MPF candidate at a time, stopping at the Apple auxiliary image.
		const secondary = await inspectHdrJpegHeader(source, start);
		if (secondary.dimensions.components !== 1) continue;
		const xmp = secondary.applicationSegments
			.filter((s) => s.marker === 0xe1)
			.map((s) => new TextDecoder().decode(s.payload))
			.filter((packet) => packet.startsWith("http://ns.adobe.com/xap/1.0/\0"))
			.join("");
		if (!/HDRGainMapVersion|urn:com:apple:photo:2020:aux:hdrgainmap/i.test(xmp))
			continue;
		const explicit = positive(
			Number(/HDRGainMapHeadroom(?:\s*=\s*["']|>)([\d.e+-]+)/i.exec(xmp)?.[1]),
		);
		const headroom = explicit ?? appleMakerHeadroom(makerNote);
		if (headroom === undefined || headroom < 1) continue;
		const stops = clamp(Math.log2(headroom), 0, 16);
		return {
			format: "apple",
			image: file.slice(start, end, "image/jpeg"),
			gainMapMin: [0, 0, 0],
			gainMapMax: [stops, stops, stops],
			gamma: [1, 1, 1],
			offsetSdr: [0, 0, 0],
			offsetHdr: [0, 0, 0],
			hdrCapacityMin: 0,
			hdrCapacityMax: stops,
			baseRenditionIsHdr: false,
		};
	}
}

export async function extractPhotoInfo(
	file: Blob,
	width: number,
	height: number,
): Promise<PhotoMetadata> {
	const input =
		typeof FileReader === "undefined" ? await file.arrayBuffer() : file;
	const parsed: unknown = await parse(input, {
		mergeOutput: false,
		translateValues: false,
		gps: false,
		makerNote: true,
		xmp: { parse: true, multiSegment: true },
		icc: { multiSegment: true },
	}).catch(() => undefined);
	const segments = tags(parsed);
	const combined = {
		...tags(segments.xmp),
		...tags(segments.GPano),
		...tags(segments.ifd0),
		...tags(segments.exif),
	};
	const metadata = photoMetadata(
		{ ...combined, ProfileDescription: tags(segments.icc).ProfileDescription },
		width,
		height,
	);
	const signature = new Uint8Array(await file.slice(0, 2).arrayBuffer());
	const jpeg =
		signature[0] === 0xff && signature[1] === 0xd8
			? await inspectHdrJpeg(jpegSource(file)).catch(() => undefined)
			: undefined;
	metadata.gainMap = await extractGainMap(file, combined.MakerNote, jpeg).catch(
		() => undefined,
	);
	metadata.embeddedDepth = await extractEmbeddedDepth(file, jpeg).catch(
		() => undefined,
	);
	return metadata;
}

export function decodePhotoDepth(
	info: EmbeddedDepthInfo,
	baseOrientation: Orientation | undefined,
	width: number,
	height: number,
) {
	return decodeEmbeddedDepth(
		info,
		baseOrientation,
		width,
		height,
		gainMapRaster,
	);
}

export async function gainMapRaster(
	image: Blob,
	baseOrientation: Orientation,
	width: number,
	height: number,
) {
	const { dimensions, applicationSegments } = await inspectHdrJpegHeader(
		jpegSource(image),
	);
	let transform = baseOrientation;
	const logAspect = Math.log(width / height);
	const mapLogAspect = Math.log(dimensions.width / dimensions.height);
	// A swapped base may already have a map in display orientation.
	if (
		transform >= 5 &&
		Math.abs(mapLogAspect - logAspect) < Math.abs(mapLogAspect + logAspect)
	)
		transform = 1;

	// Browser decoders can apply EXIF even with imageOrientation set to "none".
	const chunks: Blob[] = [];
	let offset = 0;
	const prefix = new TextEncoder().encode("Exif\0\0");
	for (const { marker, range, payload } of applicationSegments) {
		if (marker !== 0xe1 || !prefix.every((byte, i) => payload[i] === byte))
			continue;
		chunks.push(image.slice(offset, range.start));
		offset = range.end;
	}
	if (offset > 0) {
		chunks.push(image.slice(offset));
		image = new Blob(chunks, { type: "image/jpeg" });
	}
	return { image, transform };
}

export async function decodeGainMap(
	info: GainMapInfo,
	baseOrientation: Orientation | undefined,
	width: number,
	height: number,
) {
	const { image, transform } = await gainMapRaster(
		info.image,
		baseOrientation ?? 1,
		width,
		height,
	);
	const bitmap = await createImageBitmap(image, {
		colorSpaceConversion: "none",
	});
	try {
		const rotate = transform >= 5;
		const canvas = document.createElement("canvas");
		const scale = Math.min(
			1,
			width / (rotate ? bitmap.height : bitmap.width),
			height / (rotate ? bitmap.width : bitmap.height),
		);
		const mapWidth = Math.max(1, Math.round(bitmap.width * scale));
		const mapHeight = Math.max(1, Math.round(bitmap.height * scale));
		canvas.width = rotate ? mapHeight : mapWidth;
		canvas.height = rotate ? mapWidth : mapHeight;
		const x = canvas.getContext("2d")!;
		const w = canvas.width,
			h = canvas.height;
		switch (transform) {
			case 2:
				x.setTransform(-1, 0, 0, 1, w, 0);
				break;
			case 3:
				x.setTransform(-1, 0, 0, -1, w, h);
				break;
			case 4:
				x.setTransform(1, 0, 0, -1, 0, h);
				break;
			case 5:
				x.setTransform(0, 1, 1, 0, 0, 0);
				break;
			case 6:
				x.setTransform(0, 1, -1, 0, w, 0);
				break;
			case 7:
				x.setTransform(0, -1, -1, 0, w, h);
				break;
			case 8:
				x.setTransform(0, -1, 1, 0, 0, h);
				break;
		}
		x.drawImage(bitmap, 0, 0, mapWidth, mapHeight);
		return canvas;
	} finally {
		bitmap.close();
	}
}

export function photoSummary(photo: PhotoMetadata, detailed = false) {
	const {
		make,
		model,
		lensModel,
		colorSpace,
		orientation,
		hfovDeg,
		logL,
		flashFired,
		distM,
		gainMap,
		embeddedDepth,
		panorama,
	} = photo;
	const camera = model?.toLowerCase().startsWith(make?.toLowerCase() ?? "")
		? model
		: [make, model].filter(Boolean).join(" ");
	return [
		camera,
		detailed && lensModel,
		detailed && colorSpace,
		detailed &&
			orientation &&
			orientation !== 1 &&
			`EXIF orientation ${orientation}`,
		panorama
			? `${Math.round(panorama.hfovDeg)}° panorama`
			: hfovDeg !== undefined && `${Math.round(hfovDeg)}° FOV`,
		logL !== undefined && `~${Number((10 ** logL).toPrecision(2))} cd/m²`,
		flashFired && "flash fired — light level not auto-set",
		distM !== undefined && `${Number(distM.toPrecision(3))} m subject distance`,
		gainMap && `HDR +${Math.log2(gainMapHeadroom(gainMap)).toFixed(1)} EV`,
		embeddedDepth &&
			(embeddedDepth.metric
				? `${embeddedDepth.label} (${embeddedDepth.nearM.toFixed(1)}–${embeddedDepth.farM.toFixed(1)} m)`
				: embeddedDepth.label),
	]
		.filter(Boolean)
		.join(" · ");
}
