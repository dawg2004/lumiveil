import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

type Scope = "face" | "eyes_only" | "bust_up";
type Style = "blur" | "lens" | "mosaic";

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

function regionForScope(scope: Scope, width: number, height: number): Region {
  if (scope === "eyes_only") {
    return {
      left: Math.floor(width * 0.2),
      top: Math.floor(height * 0.22),
      width: Math.max(1, Math.floor(width * 0.6)),
      height: Math.max(1, Math.floor(height * 0.22)),
      ellipseRx: 0.46,
      ellipseRy: 0.4,
      blurMask: 12,
    };
  }

  if (scope === "bust_up") {
    return {
      left: Math.floor(width * 0.14),
      top: Math.floor(height * 0.08),
      width: Math.max(1, Math.floor(width * 0.72)),
      height: Math.max(1, Math.floor(height * 0.68)),
      ellipseRx: 0.48,
      ellipseRy: 0.48,
      blurMask: 16,
    };
  }

  return {
    left: Math.floor(width * 0.2),
    top: Math.floor(height * 0.12),
    width: Math.max(1, Math.floor(width * 0.6)),
    height: Math.max(1, Math.floor(height * 0.62)),
    ellipseRx: 0.42,
    ellipseRy: 0.46,
    blurMask: 14,
  };
}

function regionForFaceBox(
  scope: Scope,
  imageWidth: number,
  imageHeight: number,
  x: number,
  y: number,
  width: number,
  height: number
): Region {
  const padX = width * 0.08;
  const padY = height * 0.1;
  const faceX = x - padX;
  const faceY = y - padY;
  const faceWidth = width + padX * 2;
  const faceHeight = height + padY * 1.5;

  if (scope === "eyes_only") {
    return {
      ...clampRegion(
        faceX + faceWidth * 0.14,
        faceY + faceHeight * 0.2,
        faceWidth * 0.72,
        faceHeight * 0.2,
        imageWidth,
        imageHeight
      ),
      ellipseRx: 0.36,
      ellipseRy: 0.42,
      blurMask: 18,
    };
  }

  if (scope === "bust_up") {
    return {
      ...clampRegion(
        faceX + faceWidth * 0.22,
        faceY + faceHeight * 0.62,
        faceWidth * 0.56,
        faceHeight * 0.16,
        imageWidth,
        imageHeight
      ),
      ellipseRx: 0.36,
      ellipseRy: 0.42,
      blurMask: 18,
    };
  }

  return {
    ...clampRegion(faceX, faceY, faceWidth, faceHeight, imageWidth, imageHeight),
    ellipseRx: 0.36,
    ellipseRy: 0.42,
    blurMask: 18,
  };
}

function parseStrength(rawStrength: string) {
  const strengthMap: Record<string, number> = {
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    弱: 1,
    中: 3,
    強: 4,
    最強: 5,
  };

  const parsedStrength = strengthMap[rawStrength] ?? Number(rawStrength);
  return Number.isFinite(parsedStrength)
    ? Math.max(1, Math.min(5, parsedStrength))
    : 3;
}

function parseStyle(formData: FormData): Style {
  const style = String(formData.get("style") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const raw = style || mode;

  if (raw === "blur" || raw === "ブラー") {
    return "blur";
  }

  if (raw === "lens" || raw === "gaussian" || raw === "ガウス") {
    return "lens";
  }

  return "mosaic";
}

async function applyBlur(
  source: Buffer,
  style: Style,
  strength: number,
  width: number,
  height: number,
  ellipseRx: number,
  ellipseRy: number,
  blurMask: number
) {
  const sigma = style === "lens" ? Math.max(6, strength * 4) : Math.max(3, strength * 3);

  const region = await sharp(source).blur(sigma).ensureAlpha().png().toBuffer();

  const maskSvg = Buffer.from(`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}"
    >
      <rect width="100%" height="100%" fill="black" fill-opacity="0" />
      <defs>
        <filter id="soft">
          <feGaussianBlur stdDeviation="${blurMask}" />
        </filter>
      </defs>
      <ellipse
        cx="${width / 2}"
        cy="${height / 2}"
        rx="${width * ellipseRx}"
        ry="${height * ellipseRy}"
        fill="white"
        filter="url(#soft)"
      />
    </svg>
  `);

  const alphaMask = await sharp(maskSvg)
    .resize(width, height)
    .ensureAlpha()
    .extractChannel("alpha")
    .toBuffer();

  return sharp(region).joinChannel(alphaMask).png().toBuffer();
}

async function applyPixelate(source: Buffer, strength: number, width: number, height: number) {
  const block = Math.max(12, Math.floor(16 * strength));
  const downW = Math.max(3, Math.floor(width / block));
  const downH = Math.max(3, Math.floor(height / block));

  return sharp(source)
    .resize(downW, downH, { kernel: "nearest" })
    .resize(width, height, { kernel: "nearest" })
    .png()
    .toBuffer();
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const scope = String(formData.get("scope") ?? "face") as Scope;
    const style = parseStyle(formData);
    const boxMode = String(formData.get("boxMode") ?? "");
    const x = Number(formData.get("x"));
    const y = Number(formData.get("y"));
    const width = Number(formData.get("width"));
    const height = Number(formData.get("height"));
    const strength = parseStrength(String(formData.get("strength") ?? "3"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(bytes).metadata();
    const imageWidth = meta.width ?? 0;
    const imageHeight = meta.height ?? 0;

    if (!imageWidth || !imageHeight) {
      return NextResponse.json({ error: "invalid image" }, { status: 400 });
    }

    const region =
      Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height)
        ? boxMode === "region"
          ? {
              ...clampRegion(x, y, width, height, imageWidth, imageHeight),
              ellipseRx: 0.36,
              ellipseRy: 0.42,
              blurMask: 18,
            }
          : regionForFaceBox(scope, imageWidth, imageHeight, x, y, width, height)
        : regionForScope(scope, imageWidth, imageHeight);

    const extracted = await sharp(bytes)
      .extract({
        left: region.left,
        top: region.top,
        width: region.width,
        height: region.height,
      })
      .png()
      .toBuffer();

    const regionOutput =
      style === "mosaic"
        ? await applyPixelate(extracted, strength, region.width, region.height)
        : await applyBlur(
            extracted,
            style,
            strength,
            region.width,
            region.height,
            region.ellipseRx,
            region.ellipseRy,
            region.blurMask
          );

    const output = await sharp(bytes)
      .composite([
        {
          input: regionOutput,
          left: region.left,
          top: region.top,
        },
      ])
      .png()
      .toBuffer();

    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("mosaic route failed", error);
    return NextResponse.json({ error: "mosaic failed" }, { status: 500 });
  }
}
