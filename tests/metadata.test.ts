import { describe, expect, it } from "vitest";
import {
	appleHeadroom,
	extractPhotoInfo,
	gainMapHeadroom,
	gainMapRaster,
	gainMapTransfer,
	photoMetadata,
} from "../src/metadata";
import { P3_TO_SRGB } from "../src/shaders";

describe("photo metadata", () => {
	it.each([
		[3000, 2000, 73.74],
		[4000, 3000, 71.59],
		[3000, 4000, 56.81],
	])("uses the oriented aspect ratio at %s × %s", (width, height, expected) => {
		expect(
			photoMetadata({ FocalLengthIn35mmFormat: 24 }, width, height).hfovDeg,
		).toBeCloseTo(expected, 0);
	});
	it("accounts for digital zoom and falls back to physical sensor tags", () => {
		expect(
			photoMetadata(
				{ FocalLengthIn35mmFormat: 24, DigitalZoomRatio: 2 },
				3000,
				2000,
			).hfovDeg,
		).toBeCloseTo(41.11, 0);
		expect(
			photoMetadata(
				{
					FocalLength: 4,
					FocalPlaneXResolution: 1000,
					FocalPlaneResolutionUnit: 4,
					ExifImageWidth: 4000,
				},
				4000,
				3000,
			).hfovDeg,
		).toBeCloseTo(53.13);
		expect(
			photoMetadata(
				{
					FocalLength: 4,
					FocalPlaneXResolution: 1000,
					FocalPlaneResolutionUnit: 4,
					ExifImageWidth: 4000,
					Orientation: 6,
				},
				3000,
				4000,
			).hfovDeg,
		).toBeCloseTo(41.11, 0);
	});
	it("estimates Sunny 16, night lighting and flash exposure", () => {
		expect(
			photoMetadata({ FNumber: 16, ExposureTime: 0.01, ISO: 100 }, 100, 100)
				.logL,
		).toBeCloseTo(3.5);
		expect(
			photoMetadata(
				{ FNumber: 2, ExposureTime: 1 / 8, ISOSpeedRatings: [1000] },
				100,
				100,
			).logL,
		).toBeCloseTo(-0.398);
		expect(photoMetadata({ BrightnessValue: -3 }, 100, 100).logL).toBeCloseTo(
			Math.log10(0.5),
		);
		const flash = photoMetadata(
			{
				FNumber: 4,
				ExposureTime: 0.01,
				ISO: 100,
				ExposureCompensation: 1,
				Flash: 5,
			},
			100,
			100,
		);
		expect(flash.flashFired).toBe(true);
		expect(flash.logL).toBeCloseTo(2.60206);
		expect(flash.logL).toBeCloseTo(
			photoMetadata({ FNumber: 4, ExposureTime: 0.005, ISO: 100 }, 100, 100)
				.logL!,
		);
	});
	it("validates distance, orientation and colour profile", () => {
		expect(photoMetadata({ SubjectDistance: 0.05 }, 1, 1).distM).toBe(0.05);
		expect(photoMetadata({ SubjectDistance: 50 }, 1, 1).distM).toBe(50);
		expect(
			photoMetadata({ SubjectDistance: 51, Orientation: 9 }, 1, 1),
		).toMatchObject({ distM: undefined, orientation: undefined });
		expect(
			photoMetadata(
				{ ProfileDescription: "Display P3", ColorSpace: 1, Orientation: 6 },
				1,
				1,
			),
		).toMatchObject({ colorSpace: "Display P3", orientation: 6 });
	});
	it("converts HDR capacity and Apple headroom to physical ratios", () => {
		expect(
			gainMapHeadroom({
				hdrCapacityMin: 0,
				hdrCapacityMax: 2.6,
				baseRenditionIsHdr: false,
			}),
		).toBeCloseTo(6.0629);
		expect(appleHeadroom(1, 0)).toBe(8);
		expect(appleHeadroom(0.5, 0.01)).toBeCloseTo(2 ** 1.6);
	});
	it("keeps the gain-map raster in the base image's orientation", async () => {
		// JPEG header with a 60×40 one-component frame, an EXIF APP1, and a separate XMP APP1.
		const soi = [0xff, 0xd8];
		const exif = [
			0xff, 0xe1, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1,
			0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
		];
		const xmp = [0xff, 0xe1, 0, 5, 88, 77, 80];
		const frame = [0xff, 0xc0, 0, 11, 8, 0, 40, 0, 60, 1, 1, 0x11, 0];
		const scan = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0xff, 0xd9];
		const image = new Blob(
			[Uint8Array.from([...soi, ...exif, ...xmp, ...frame, ...scan])],
			{ type: "image/jpeg" },
		);

		const raw = await gainMapRaster(image, 6, 40, 60);
		expect(raw.transform).toBe(6);
		expect([...new Uint8Array(await raw.image.arrayBuffer())]).toEqual([
			...soi,
			...xmp,
			...frame,
			...scan,
		]);
		const alreadyOriented = await gainMapRaster(image, 6, 60, 40);
		expect(alreadyOriented.transform).toBe(1);
	});

	it("derives inverse gain and the corresponding offsets from an HDR base", () => {
		const grey = (value: number): [number, number, number] => [
			value,
			value,
			value,
		];
		const hdrBase = {
			baseRenditionIsHdr: true,
			gainMapMin: grey(0),
			gainMapMax: grey(2),
			offsetHdr: grey(0),
			offsetSdr: grey(0),
		};
		const transfer = gainMapTransfer(hdrBase);
		const midpointGain =
			2 ** ((transfer.logGainMin[0] + transfer.logGainMax[0]) / 2);
		expect(
			(0.4 + transfer.baseOffset[0]) * midpointGain -
				transfer.alternateOffset[0],
		).toBeCloseTo(0.2);
		const shifted = gainMapTransfer({
			...hdrBase,
			offsetHdr: grey(0.1),
			offsetSdr: grey(0.02),
		});
		expect(shifted.baseOffset).toEqual(grey(0.1));
		expect(shifted.alternateOffset).toEqual(grey(0.02));
	});

	it("uses a white-preserving linear P3 matrix", () => {
		for (const row of P3_TO_SRGB)
			expect(row.reduce<number>((sum, value) => sum + value, 0)).toBeCloseTo(
				1,
				6,
			);
	});

	it("degrades gracefully when metadata cannot be read", async () => {
		expect(await extractPhotoInfo(new Blob(["plain"]), 100, 100)).toMatchObject(
			{ hfovDeg: undefined, gainMap: undefined },
		);
	});
});

describe("panorama metadata", () => {
	it("recognizes a full-sphere GPano", () => {
		expect(
			photoMetadata({ ProjectionType: "equirectangular" }, 4096, 2048).panorama,
		).toEqual({
			projection: "equirectangular",
			hfovDeg: 360,
			vfovDeg: 180,
			yawOffsetDeg: 0,
			pitchOffsetDeg: 0,
		});
	});
	it("extracts the angular extent and center of a GPano crop from JPEG XMP", async () => {
		const xmp = new TextEncoder().encode(
			"http://ns.adobe.com/xap/1.0/\0" +
				'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
				'<rdf:Description xmlns:GPano="http://ns.google.com/photos/1.0/panorama/" GPano:UsePanoramaViewer="True" ' +
				'GPano:FullPanoWidthPixels="4000" GPano:FullPanoHeightPixels="2000" ' +
				'GPano:CroppedAreaImageWidthPixels="2000" GPano:CroppedAreaImageHeightPixels="1000" ' +
				'GPano:CroppedAreaLeftPixels="1500" GPano:CroppedAreaTopPixels="250"/></rdf:RDF></x:xmpmeta>',
		);
		const length = xmp.length + 2;
		const file = new Blob(
			[
				Uint8Array.of(0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff),
				xmp,
				Uint8Array.of(0xff, 0xd9),
			],
			{ type: "image/jpeg" },
		);
		const photo = await extractPhotoInfo(file, 2000, 1000);
		expect(photo.panorama).toEqual({
			projection: "equirectangular",
			hfovDeg: 180,
			vfovDeg: 90,
			yawOffsetDeg: 45,
			pitchOffsetDeg: 22.5,
		});
	});

	it("infers wide-angle phone panoramas and excludes telephoto crops", () => {
		expect(
			photoMetadata({ FocalLengthIn35mmFormat: 26 }, 6000, 2000).panorama,
		).toMatchObject({ projection: "cylindrical", hfovDeg: 135 });
		expect(
			photoMetadata({ FocalLengthIn35mmFormat: 150 }, 6000, 2000).panorama,
		).toBeUndefined();
	});
	it.each([
		[4000, 3000],
		[3000, 2000],
	])("leaves ordinary %s × %s photos rectilinear", (w, h) => {
		expect(
			photoMetadata({ FocalLengthIn35mmFormat: 26 }, w, h).panorama,
		).toBeUndefined();
	});
});
