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
  scope: Scope;
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
    ellipseRx: scope === "eyes_only" ? 0.46 : scope === "bust_up" ? 0.47 : 0.4,
    ellipseRy: scope === "eyes_only" ? 0.32 : scope === "bust_up" ? 0.5 : 0.5,
    blurMask: scope === "eyes_only" ? 16 : scope === "bust_up" ? 24 : 22,
    scope,
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
        x + width * 0.12,
        y + height * 0.2,
        width * 0.76,
        height * 0.24,
        imageWidth,
        imageHeight
      ),
      ellipseRx: 0.46,
      ellipseRy: 0.32,
      blurMask: 16,
      scope,
    };
  }

  if (scope === "bust_up") {
    return {
      ...clampRegion(
        x - width * 0.42,
        y - height * 0.18,
        width * 1.84,
        height * 2.2,
        imageWidth,
        imageHeight
      ),
      ellipseRx: 0.47,
      ellipseRy: 0.5,
      blurMask: 24,
      scope,
    };
  }

  return {
    ...clampRegion(
      x - width * 0.16,
      y - height * 0.08,
      width * 1.32,
      height * 1.3,
      imageWidth,
      imageHeight
    ),
    ellipseRx: 0.4,
    ellipseRy: 0.5,
    blurMask: 22,
    scope,
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

function buildMaskShape(region: Region) {
  if (region.scope === "eyes_only") {
    const rx = region.width * region.ellipseRx;
    const ry = Math.max(region.height * region.ellipseRy, region.height * 0.34);
    const x = region.width / 2 - rx;
    const y = region.height / 2 - ry;
    const width = rx * 2;
    const height = ry * 2;
    const rounded = Math.min(height * 0.95, width * 0.28);

    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rounded}" ry="${rounded}" fill="white" filter="url(#soft)" />`;
  }

  if (region.scope === "bust_up") {
    return `<ellipse cx="${region.width / 2}" cy="${region.height / 2}" rx="${region.width * region.ellipseRx}" ry="${region.height * region.ellipseRy}" fill="white" filter="url(#soft)" />`;
  }

  const w = region.width;
  const h = region.height;
  const path = [
    `M ${w * 0.24} ${h * 0.18}`,
    `C ${w * 0.16} ${h * 0.28}, ${w * 0.12} ${h * 0.46}, ${w * 0.16} ${h * 0.64}`,
    `C ${w * 0.2} ${h * 0.82}, ${w * 0.34} ${h * 0.95}, ${w * 0.5} ${h * 0.98}`,
    `C ${w * 0.66} ${h * 0.95}, ${w * 0.8} ${h * 0.82}, ${w * 0.84} ${h * 0.64}`,
    `C ${w * 0.88} ${h * 0.46}, ${w * 0.84} ${h * 0.28}, ${w * 0.76} ${h * 0.18}`,
    `C ${w * 0.68} ${h * 0.08}, ${w * 0.32} ${h * 0.08}, ${w * 0.24} ${h * 0.18}`,
    "Z",
  ].join(" ");

  return `<path d="${path}" fill="white" filter="url(#soft)" />`;
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
      ${buildMaskShape(region)}
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
