import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

type Scope = "face" | "eyes_only" | "bust_up";

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
  const safeWidth = Math.max(1, Math.min(Math.floor(width), imageWidth - safeLeft));
  const safeHeight = Math.max(1, Math.min(Math.floor(height), imageHeight - safeTop));

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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const mode = String(formData.get("mode") ?? "モザイク");
    const boxMode = String(formData.get("boxMode") ?? "face");
    const scope = String(formData.get("scope") ?? "face") as Scope;

    const x = Number(formData.get("x") ?? 0);
    const y = Number(formData.get("y") ?? 0);
    const width = Number(formData.get("width") ?? 0);
    const height = Number(formData.get("height") ?? 0);

    const rawStrength = String(formData.get("strength") ?? "2");
    const strengthMap: Record<string, number> = {
      "1": 3,
      "2": 8,
      "3": 12,
      "4": 16,
      "5": 5,
      "6": 6,
      "7": 7,
      "8": 8,
      "9": 9,
      "10": 10,
      "弱": 3,
      "中": 8,
      "強": 12,
      "最強": 16,
    };
    const parsedStrength = strengthMap[rawStrength] ?? Number(rawStrength);
    const strength = Number.isFinite(parsedStrength)
      ? Math.max(1, Math.min(16, parsedStrength))
      : 8;

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
        : regionFromDirectBox(imgW * 0.2, imgH * 0.12, imgW * 0.6, imgH * 0.62, imgW, imgH, scope);

    const makeMask = () => Buffer.from(`
      <svg width="${region.width}" height="${region.height}">
        <defs>
          <filter id="blur"><feGaussianBlur stdDeviation="${region.blurMask}"/></filter>
        </defs>
        <ellipse
          cx="${region.width / 2}"
          cy="${region.height / 2}"
          rx="${region.width * region.ellipseRx}"
          ry="${region.height * region.ellipseRy}"
          fill="white"
          filter="url(#blur)"
        />
      </svg>
    `);

    const whiteOverlayOpacity = Math.min(0.94, 0.5 + strength * 0.028);
    const whiteOverlay = await sharp({
      create: {
        width: region.width,
        height: region.height,
        channels: 4,
        background: {
          r: 255,
          g: 255,
          b: 255,
          alpha: whiteOverlayOpacity,
        },
      },
    })
      .png()
      .toBuffer();

    const applyWhiteFinish = async (input: Buffer) =>
      sharp(input)
        .modulate({
          brightness: Math.min(1.22, 1.04 + strength * 0.01),
          saturation: 0.08,
        })
        .composite([{ input: whiteOverlay, blend: "over" }])
        .png()
        .toBuffer();

    let regionBuffer: Buffer;

    if (mode === "ブラー") {
      const sigma = Math.max(14, strength * 10);
      regionBuffer = await sharp(bytes)
        .extract({ left: region.left, top: region.top, width: region.width, height: region.height })
        .blur(sigma)
        .png()
        .toBuffer();

      regionBuffer = await sharp(regionBuffer)
        .composite([{ input: makeMask(), blend: "dest-in" }])
        .png()
        .toBuffer();
      regionBuffer = await applyWhiteFinish(regionBuffer);
    } else if (mode === "ガウス") {
      const block = Math.max(24, Math.floor(20 * strength));
      const downW = Math.max(2, Math.floor(region.width / block));
      const downH = Math.max(2, Math.floor(region.height / block));

      regionBuffer = await sharp(bytes)
        .extract({ left: region.left, top: region.top, width: region.width, height: region.height })
        .resize(downW, downH, { kernel: "nearest" })
        .resize(region.width, region.height, { kernel: "nearest" })
        .blur(Math.max(4, strength * 2))
        .png()
        .toBuffer();

      regionBuffer = await sharp(regionBuffer)
        .composite([{ input: makeMask(), blend: "dest-in" }])
        .png()
        .toBuffer();
      regionBuffer = await applyWhiteFinish(regionBuffer);
    } else {
      const block = Math.max(26, Math.floor(26 * strength));
      const downW = Math.max(2, Math.floor(region.width / block));
      const downH = Math.max(2, Math.floor(region.height / block));

      regionBuffer = await sharp(bytes)
        .extract({ left: region.left, top: region.top, width: region.width, height: region.height })
        .resize(downW, downH, { kernel: "nearest" })
        .resize(region.width, region.height, { kernel: "nearest" })
        .blur(Math.max(2, strength * 0.8))
        .png()
        .toBuffer();

      regionBuffer = await sharp(regionBuffer)
        .composite([{ input: makeMask(), blend: "dest-in" }])
        .png()
        .toBuffer();
      regionBuffer = await applyWhiteFinish(regionBuffer);
    }

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
