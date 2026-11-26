import { describe, expect, it } from "vitest";
import { extractPhotoInfo, photoSummary } from "../src/metadata";
import {
	extractEmbeddedDepth,
	extractHeicDepth,
	normalizeEmbeddedDepthPixels,
	parseAppleDepthXmp,
	parseGDepthXmp,
} from "../src/photo-depth";

const enc = new TextEncoder();

function concat(...parts: Uint8Array[]) {
	let len = 0;
	for (const p of parts) len += p.length;
	const out = new Uint8Array(len);
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
}

function appSegment(marker: number, payload: Uint8Array) {
	const len = payload.length + 2;
	return concat(
		Uint8Array.of(0xff, marker, (len >>> 8) & 0xff, len & 0xff),
		payload,
	);
}

function minimalJpeg(components: number, ...extraSegments: Uint8Array[]) {
	const sof0 = Uint8Array.of(
		0xff,
		0xc0,
		0,
		8 + components * 3,
		8,
		0,
		16,
		0,
		24,
		components,
		...Array.from({ length: components }, (_, i) => [i + 1, 0x11, 0]).flat(),
	);
	const sos = Uint8Array.of(
		0xff,
		0xda,
		0,
		6 + components * 2,
		components,
		...Array.from({ length: components }, (_, i) => [i + 1, 0]).flat(),
		0,
		63,
		0,
	);
	return concat(
		Uint8Array.of(0xff, 0xd8),
		...extraSegments,
		sof0,
		sos,
		Uint8Array.of(0xff, 0xd9),
	);
}

function buildMpfJpeg(secondaries: Uint8Array[]) {
	const count = 1 + secondaries.length;
	// Build APP2 MPF segment with 3 TIFF entries: MPFVersion, NumberOfImages, MPEntry.
	// TIFF header (8) + IFD count (2) + 3*12 (36) + nextIFD (4) = 50 bytes before MP entries.
	const tiffSize = 50 + count * 16;
	const makeMpf = (primaryLen: number) => {
		const buf = new Uint8Array(4 + tiffSize);
		buf.set(enc.encode("MPF\0"), 0);
		const view = new DataView(buf.buffer, 4);
		view.setUint16(0, 0x4d4d, false); // big-endian MM
		view.setUint16(2, 42, false);
		view.setUint32(4, 8, false);
		view.setUint16(8, 3, false);
		// Tag 0xB000 MPFVersion = "0100"
		view.setUint16(10, 0xb000, false);
		view.setUint16(12, 7, false);
		view.setUint32(14, 4, false);
		buf.set(enc.encode("0100"), 4 + 18);
		// Tag 0xB001 NumberOfImages
		view.setUint16(22, 0xb001, false);
		view.setUint16(24, 4, false);
		view.setUint32(26, 1, false);
		view.setUint32(30, count, false);
		// Tag 0xB002 MPEntry
		view.setUint16(34, 0xb002, false);
		view.setUint16(36, 7, false);
		view.setUint32(38, count * 16, false);
		view.setUint32(42, 50, false);
		view.setUint32(46, 0, false);
		// Entry 0: primary image (offset 0)
		view.setUint32(50, 0x030000, false);
		view.setUint32(54, primaryLen, false);
		view.setUint32(58, 0, false);
		// Secondary entries: offset is relative to TIFF header start (which is at byte 2 + 4 + 4 = 10 in file).
		const tiffStartInFile = 2 + 4 + 4;
		let filePos = primaryLen;
		for (let i = 0; i < secondaries.length; i++) {
			const base = 50 + (i + 1) * 16;
			view.setUint32(base, 0x000000, false);
			view.setUint32(base + 4, secondaries[i]!.length, false);
			view.setUint32(base + 8, filePos - tiffStartInFile, false);
			filePos += secondaries[i]!.length;
		}
		return appSegment(0xe2, buf);
	};
	const dummyPrimary = minimalJpeg(3, makeMpf(0));
	const primary = minimalJpeg(3, makeMpf(dummyPrimary.length));
	return concat(primary, ...secondaries);
}

function isoBox(type: string, payload: Uint8Array) {
	const out = new Uint8Array(8 + payload.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, out.length, false);
	out.set(enc.encode(type), 4);
	out.set(payload, 8);
	return out;
}

function isoFullBox(
	type: string,
	version: number,
	flags: number,
	payload: Uint8Array,
) {
	return isoBox(
		type,
		concat(
			Uint8Array.of(
				version,
				(flags >>> 16) & 0xff,
				(flags >>> 8) & 0xff,
				flags & 0xff,
			),
			payload,
		),
	);
}

describe("embedded photo depth extraction", () => {
	it("parses Apple disparity and linear depth XMP while rejecting mattes and gain maps", () => {
		const disparity = parseAppleDepthXmp(
			'<rdf:Description apdi:DataType="NormalizedDisparity" apdi:FloatMinValue="0.1" apdi:FloatMaxValue="2.0" apdi:IntMinValue="0" apdi:IntMaxValue="255" apdi:Accuracy="absolute"/>',
		);
		expect(disparity).toMatchObject({
			representation: "inverse",
			nearM: 0.5,
			farM: 10,
			metric: true,
			brighterIsNearer: true,
		});

		const linear = parseAppleDepthXmp(
			'<rdf:Description depthData:DataType="Depth" depthData:FloatMinValue="0.6" depthData:FloatMaxValue="8.5" depthData:Accuracy="absolute"/>',
		);
		expect(linear).toMatchObject({
			representation: "linear",
			nearM: 0.6,
			farM: 8.5,
			metric: true,
			brighterIsNearer: false,
		});

		expect(
			parseAppleDepthXmp(
				'<rdf:Description HDRGainMap:HDRGainMapVersion="131072" apdi:FloatMinValue="0" apdi:FloatMaxValue="1"/>',
			),
		).toBeUndefined();
		expect(
			parseAppleDepthXmp(
				'<rdf:Description aux:Type="urn:com:apple:photo:2018:aux:portraiteffectsmatte"/>',
			),
		).toBeUndefined();
	});

	it("extracts iPhone Portrait JPEG MPF depth while skipping an HDR gain map entry", async () => {
		const gainMapXmp = appSegment(
			0xe1,
			enc.encode(
				'http://ns.adobe.com/xap/1.0/\0<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:HDRGainMap="http://ns.apple.com/HDRGainMap/1.0/" HDRGainMap:HDRGainMapVersion="131072" HDRGainMap:HDRGainMapHeadroom="2.0"/></rdf:RDF>',
			),
		);
		const depthXmp = appSegment(
			0xe1,
			enc.encode(
				'http://ns.adobe.com/xap/1.0/\0<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:apdi="http://ns.apple.com/depthData/1.0/" apdi:DataType="Disparity" apdi:FloatMinValue="0.125" apdi:FloatMaxValue="2.5" apdi:Accuracy="absolute"/></rdf:RDF>',
			),
		);
		const gainMapJpeg = minimalJpeg(1, gainMapXmp);
		const depthJpeg = minimalJpeg(1, depthXmp);
		const portraitFile = new Blob([buildMpfJpeg([gainMapJpeg, depthJpeg])], {
			type: "image/jpeg",
		});

		const info = await extractPhotoInfo(portraitFile, 4032, 3024);
		expect(info.gainMap?.format).toBe("apple");
		expect(info.embeddedDepth).toMatchObject({
			format: "apple-jpeg",
			representation: "inverse",
			nearM: 0.4,
			farM: 8,
			metric: true,
			brighterIsNearer: true,
			label: "iPhone depth",
		});
		expect(info.embeddedDepth?.image.size).toBe(depthJpeg.length);
		expect(photoSummary(info)).toContain("iPhone depth (0.4–8.0 m)");
	});

	it("extracts Android GDepth from Extended XMP without confusing GImage:Data", async () => {
		const fakePng = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
		const b64Depth = btoa(String.fromCharCode(...fakePng));
		const b64Image = btoa("not-the-depth-image-payload-0123456789");
		const primaryXmp =
			'<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:GDepth="http://ns.google.com/photos/1.0/depthmap/" GDepth:Format="RangeInverse" GDepth:Near="0.5" GDepth:Far="10.0" GDepth:Mime="image/png"/></rdf:RDF>';
		const extText = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:GImage="http://ns.google.com/photos/1.0/image/" xmlns:GDepth="http://ns.google.com/photos/1.0/depthmap/" GImage:Data="${b64Image}" GDepth:Data="${b64Depth}"/></rdf:RDF>`;
		const extBytes = enc.encode(extText);
		const guid = enc.encode("0123456789ABCDEF0123456789ABCDEF");
		const header = new Uint8Array(8);
		new DataView(header.buffer).setUint32(0, extBytes.length, false);
		new DataView(header.buffer).setUint32(4, 0, false);

		const jpeg = minimalJpeg(
			3,
			appSegment(
				0xe1,
				enc.encode(`http://ns.adobe.com/xap/1.0/\0${primaryXmp}`),
			),
			appSegment(
				0xe1,
				concat(
					enc.encode("http://ns.adobe.com/xmp/extension/\0"),
					guid,
					header,
					extBytes,
				),
			),
		);
		const depth = await extractEmbeddedDepth(
			new Blob([jpeg], { type: "image/jpeg" }),
		);
		expect(depth).toMatchObject({
			format: "gdepth",
			representation: "inverse",
			nearM: 0.5,
			farM: 10,
			metric: true,
			brighterIsNearer: false,
		});
		expect(new Uint8Array(await depth!.image.arrayBuffer())).toEqual(fakePng);

		const linearGDepth = parseGDepthXmp(
			`<rdf:Description GDepth:Format="RangeLinear" GDepth:Near="1" GDepth:Far="20" GDepth:Mime="image/jpeg" GDepth:Data="${b64Depth}"/>`,
		);
		expect(linearGDepth).toMatchObject({
			representation: "linear",
			nearM: 1,
			farM: 20,
			brighterIsNearer: false,
		});
	});

	it("extracts and repackages iPhone Portrait HEIC auxiliary depth items", async () => {
		const ftyp = isoBox("ftyp", enc.encode("heic\0\0\0\0mif1heic"));
		const depthStream = Uint8Array.of(0, 0, 0, 4, 0x26, 0x01, 0xaf, 0x42);
		const xmpBytes = enc.encode(
			'<rdf:Description xmlns:apdi="http://ns.apple.com/depthData/1.0/" apdi:DataType="Disparity" apdi:FloatMinValue="0.2" apdi:FloatMaxValue="2.0" apdi:Accuracy="absolute"/>',
		);

		const infe = (id: number, type: string, mime?: string) => {
			const head = new Uint8Array(8);
			const v = new DataView(head.buffer);
			v.setUint16(0, id, false);
			v.setUint16(2, 0, false);
			head.set(enc.encode(type), 4);
			const tail = mime ? enc.encode(`\0${mime}\0`) : Uint8Array.of(0);
			return isoFullBox("infe", 2, 0, concat(head, tail));
		};
		const iinf = isoFullBox(
			"iinf",
			0,
			0,
			concat(
				Uint8Array.of(0, 3),
				infe(1, "hvc1"),
				infe(2, "hvc1"),
				infe(3, "mime", "application/rdf+xml"),
			),
		);
		const cdscPayload = new Uint8Array(6);
		new DataView(cdscPayload.buffer).setUint16(0, 3, false); // from XMP item 3
		new DataView(cdscPayload.buffer).setUint16(2, 1, false); // ref count 1
		new DataView(cdscPayload.buffer).setUint16(4, 2, false); // describes depth item 2
		const iref = isoFullBox("iref", 0, 0, isoBox("cdsc", cdscPayload));

		const hvcC = isoBox("hvcC", Uint8Array.of(1, 2, 3, 4));
		const ispe = isoFullBox(
			"ispe",
			0,
			0,
			Uint8Array.of(0, 0, 2, 0x40, 0, 0, 3, 0),
		);
		const auxC = isoFullBox(
			"auxC",
			0,
			0,
			enc.encode("urn:mpeg:hevc:2015:auxid:2\0"),
		);
		const ipco = isoBox("ipco", concat(hvcC, ispe, auxC));
		// ipma: item 2 -> props 1 (hvcC, essential), 2 (ispe), 3 (auxC, essential)
		const ipmaPayload = Uint8Array.of(0, 0, 0, 1, 0, 2, 3, 0x81, 0x02, 0x83);
		const ipma = isoFullBox("ipma", 0, 0, ipmaPayload);
		const iprp = isoBox("iprp", concat(ipco, ipma));

		const makeIloc = (depthOff: number, xmpOff: number) => {
			const p = new Uint8Array(4 + 2 * 14);
			const v = new DataView(p.buffer);
			p[0] = 0x44; // offsetSize=4, lengthSize=4
			p[1] = 0x00;
			v.setUint16(2, 2, false); // 2 items
			// item 2 (depth)
			v.setUint16(4, 2, false);
			v.setUint16(6, 0, false);
			v.setUint16(8, 1, false);
			v.setUint32(10, depthOff, false);
			v.setUint32(14, depthStream.length, false);
			// item 3 (xmp)
			v.setUint16(18, 3, false);
			v.setUint16(20, 0, false);
			v.setUint16(22, 1, false);
			v.setUint32(24, xmpOff, false);
			v.setUint32(28, xmpBytes.length, false);
			return isoFullBox("iloc", 0, 0, p);
		};
		const staticMeta = concat(iinf, iref, iprp);
		const metaLen = 12 + staticMeta.length + makeIloc(0, 0).length;
		const mdatStart = ftyp.length + metaLen + 8;
		const meta = isoFullBox(
			"meta",
			0,
			0,
			concat(staticMeta, makeIloc(mdatStart, mdatStart + depthStream.length)),
		);
		const mdat = isoBox("mdat", concat(depthStream, xmpBytes));
		const heicFile = concat(ftyp, meta, mdat);

		const depth = extractHeicDepth(heicFile);
		expect(depth).toMatchObject({
			format: "apple-heic",
			representation: "inverse",
			nearM: 0.5,
			farM: 5,
			metric: true,
			brighterIsNearer: true,
			label: "iPhone depth",
		});
		const repackaged = new Uint8Array(await depth!.image.arrayBuffer());
		const text = new TextDecoder("latin1").decode(repackaged);
		expect(text).toContain("ftypmif1");
		expect(text).toContain("hvcC");
		expect(text).toContain("ispe");
		expect(text).not.toContain("auxC");
		expect(repackaged.slice(-depthStream.length)).toEqual(depthStream);
	});

	it("normalizes Apple disparity, linear depth, and GDepth pixels to canonical inverse depth", () => {
		const pixels = Uint8ClampedArray.of(
			0,
			0,
			0,
			255,
			128,
			128,
			128,
			255,
			255,
			255,
			255,
			255,
		);

		// Apple disparity: 0 -> 0.0 (clamped to 1/100), 255 -> 2.0 (0.5 m).
		// Midpoint pixel 128 (~1.004 1/m) should map to (1.004 - 0.01) / (2.0 - 0.01) ≈ 0.4995 -> ~127.
		const appleDisp = normalizeEmbeddedDepthPixels(pixels, {
			representation: "inverse",
			nearM: 0.5,
			farM: 100,
			brighterIsNearer: true,
			floatMin: 0,
			floatMax: 2,
			intMin: 0,
			intMax: 255,
		});
		expect([appleDisp[0], appleDisp[4], appleDisp[8]]).toEqual([0, 127, 255]);

		// Google GDepth RangeInverse: 0 = near (0.5 m -> 255), 255 = far (10 m -> 0).
		const gInverse = normalizeEmbeddedDepthPixels(pixels, {
			representation: "inverse",
			nearM: 0.5,
			farM: 10,
			brighterIsNearer: false,
			floatMin: 0.1,
			floatMax: 2,
			intMin: 0,
			intMax: 255,
		});
		expect([gInverse[0], gInverse[4], gInverse[8]]).toEqual([255, 127, 0]);

		// Linear depth: 0 = 1 m (near -> 255), 255 = 5 m (far -> 0), 128 = ~3.008 m -> (1/3.008 - 0.2)/(1 - 0.2) ≈ 0.1656 -> 42.
		const linear = normalizeEmbeddedDepthPixels(pixels, {
			representation: "linear",
			nearM: 1,
			farM: 5,
			brighterIsNearer: false,
			floatMin: 1,
			floatMax: 5,
			intMin: 0,
			intMax: 255,
		});
		expect(linear[0]).toBe(255);
		expect(linear[4]).toBe(42);
		expect(linear[8]).toBe(0);
	});
});
