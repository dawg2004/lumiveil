import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

type Scope = "face" | "eyes_only" | "bust_up";
type Mode = "ブラー" | "ガウス" | "モザイク";

type Region = {
  left: number;
  top: number;
  width: number;
  height: number;
  ellipseRx: number;
  ellipseRy: number;
  blurMask: number;
};

function clampRegion(
  left: number,
  top: number,
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number
) {
  const safeLeft = Math.max(0, Math.min(Math.floor(left), imageWidth - 1));
  const safeTop = Math.max(0, Math.min(Math.floor(top), imageHeight - 1));
  const safeWidth = Math.max(
    1,
    Math.min(Math.floor(width), imageWidth - safeLeft)
  );
  const safeHeight = Math.max(
    1,
    Math.min(Math.floor(height), imageHeight - safeTop)
  );

  return {
    left: safeLeft,
    top: safeTop,
    width: safeWidth,
    height: safeHeight,
  };
}

function regionFromDirectBox(
  x: number,
  y: number,
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
  scope: Scope
): Region {
  const base = clampRegion(x, y, width, height, imageWidth, imageHeight);

  return {
    ...base,
    ellipseRx: scope === "eyes_only" ? 0.48 : scope === "bust_up" ? 0.46 : 0.44,
    ellipseRy: scope === "eyes_only" ? 0.38 : 0.48,
    blurMask: scope === "eyes_only" ? 10 : scope === "bust_up" ? 18 : 14,
  };
}

function regionFromFaceBox(
  x: number,
  y: number,
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
  scope: Scope
): Region {
  if (scope === "eyes_only") {
    return {
      ...clampRegion(
        x + width * 0.1,
        y + height * 0.18,
        width * 0.8,
        height * 0.3,
        imageWidth,
        imageHeight
      ),
      ellipseRx: 0.48,
      ellipseRy: 0.38,
      blurMask: 10,
    };
  }

  if (scope === "bust_up") {
    return {
      ...clampRegion(
        x - width * 0.45,
        y - height * 0.2,
        width * 1.9,
        height * 2.3,
        imageWidth,
        imageHeight
      ),
      ellipseRx: 0.46,
      ellipseRy: 0.48,
      blurMask: 18,
    };
  }

  return {
    ...clampRegion(
      x - width * 0.18,
      y - height * 0.1,
      width * 1.36,
      height * 1.28,
      imageWidth,
      imageHeight
    ),
    ellipseRx: 0.44,
    ellipseRy: 0.48,
    blurMask: 14,
  };
}

function getStrength(rawStrength: string) {
  const strengthMap: Record<string, number> = {
    "1": 2,
    "2": 4,
    "3": 6,
    "4": 8,
    "5": 10,
    "6": 12,
    "7": 14,
    "8": 16,
    "9": 18,
    "10": 20,
    弱: 3,
    中: 6,
    強: 10,
    最強: 16,
  };

  const parsedStrength = strengthMap[rawStrength] ?? Number(rawStrength);
  return Number.isFinite(parsedStrength)
    ? Math.max(1, Math.min(20, parsedStrength))
    : 6;
}

function buildMaskSvg(region: Region) {
  return Buffer.from(`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${region.width}"
      height="${region.height}"
      viewBox="0 0 ${region.width} ${region.height}"
    >
      <rect width="100%" height="100%" fill="black" fill-opacity="0" />
      <defs>
        <filter id="soft">
          <feGaussianBlur stdDeviation="${region.blurMask}" />
        </filter>
      </defs>
      <ellipse
        cx="${region.width / 2}"
        cy="${region.height / 2}"
        rx="${region.width * region.ellipseRx}"
        ry="${region.height * region.ellipseRy}"
        fill="white"
        filter="url(#soft)"
      />
    </svg>
  `);
}

async function applySoftMask(input: Buffer, region: Region) {
  const alphaMask = await sharp(buildMaskSvg(region))
    .resize(region.width, region.height)
    .ensureAlpha()
    .extractChannel("alpha")
    .toBuffer();

  return sharp(input).ensureAlpha().joinChannel(alphaMask).png().toBuffer();
}

async function processBlur(bytes: Buffer, region: Region, strength: number) {
  const sigma = Math.max(8, strength * 1.8);
  const blurred = await sharp(bytes)
    .extract({
      left: region.left,
      top: region.top,
      width: region.width,
      height: region.height,
    })
    .blur(sigma)
    .png()
    .toBuffer();

  return applySoftMask(blurred, region);
}

async function processGaussian(bytes: Buffer, region: Region, strength: number) {
  const block = Math.max(10, Math.floor(8 + strength * 1.4));
  const downW = Math.max(2, Math.floor(region.width / block));
  const downH = Math.max(2, Math.floor(region.height / block));

  const pixelated = await sharp(bytes)
    .extract({
      left: region.left,
      top: region.top,
      width: region.width,
      height: region.height,
    })
    .resize(downW, downH, { kernel: "nearest" })
    .resize(region.width, region.height, { kernel: "nearest" })
    .blur(Math.max(2, strength * 0.35))
    .png()
    .toBuffer();

  return applySoftMask(pixelated, region);
}

async function processMosaic(bytes: Buffer, region: Region, strength: number) {
  const block = Math.max(12, Math.floor(10 + strength * 1.6));
  const downW = Math.max(2, Math.floor(region.width / block));
  const downH = Math.max(2, Math.floor(region.height / block));

  const pixelated = await sharp(bytes)
    .extract({
      left: region.left,
      top: region.top,
      width: region.width,
      height: region.height,
    })
    .resize(downW, downH, { kernel: "nearest" })
    .resize(region.width, region.height, { kernel: "nearest" })
    .png()
    .toBuffer();

  return applySoftMask(pixelated, region);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const mode = String(formData.get("mode") ?? "モザイク") as Mode;
    const boxMode = String(formData.get("boxMode") ?? "face");
    const scope = String(formData.get("scope") ?? "face") as Scope;

    const x = Number(formData.get("x") ?? 0);
    const y = Number(formData.get("y") ?? 0);
    const width = Number(formData.get("width") ?? 0);
    const height = Number(formData.get("height") ?? 0);
    const strength = getStrength(String(formData.get("strength") ?? "2"));

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(bytes).metadata();
    const imgW = meta.width ?? 0;
    const imgH = meta.height ?? 0;

    if (!imgW || !imgH) {
      return NextResponse.json({ error: "invalid image" }, { status: 400 });
    }

    const region =
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(width) &&
      Number.isFinite(height)
        ? boxMode === "region"
          ? regionFromDirectBox(x, y, width, height, imgW, imgH, scope)
          : regionFromFaceBox(x, y, width, height, imgW, imgH, scope)
        : regionFromDirectBox(
            imgW * 0.2,
            imgH * 0.12,
            imgW * 0.6,
            imgH * 0.62,
            imgW,
            imgH,
            scope
          );

    const regionBuffer =
      mode === "ブラー"
        ? await processBlur(bytes, region, strength)
        : mode === "ガウス"
          ? await processGaussian(bytes, region, strength)
          : await processMosaic(bytes, region, strength);

    const output = await sharp(bytes)
      .composite([{ input: regionBuffer, left: region.left, top: region.top }])
      .png()
      .toBuffer();

    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("mosaic error:", error);
    return NextResponse.json({ error: "mosaic failed" }, { status: 500 });
  }
}
