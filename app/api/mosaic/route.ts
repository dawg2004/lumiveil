import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const mode = String(formData.get("mode") ?? "モザイク");

    const x = Number(formData.get("x") ?? 0);
    const y = Number(formData.get("y") ?? 0);
    const width = Number(formData.get("width") ?? 0);
    const height = Number(formData.get("height") ?? 0);

    const rawStrength = String(formData.get("strength") ?? "2");
    const strengthMap: Record<string, number> = {
      "1": 1,
      "2": 2,
      "3": 3,
      "4": 4,
      "5": 5,
      "6": 6,
      "7": 7,
      "8": 8,
      "9": 9,
      "10": 10,
      "弱": 1,
      "中": 3,
      "強": 6,
      "最強": 10,
    };
    const parsedStrength = strengthMap[rawStrength] ?? Number(rawStrength);
    const strength = Number.isFinite(parsedStrength)
      ? Math.max(1, Math.min(10, parsedStrength))
      : 3;

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

    const left = Math.max(0, Math.floor(x));
    const top = Math.max(0, Math.floor(y));
    const safeWidth = Math.max(1, Math.min(Math.floor(width), imgW - left));
    const safeHeight = Math.max(1, Math.min(Math.floor(height), imgH - top));

    let region: Buffer;

    if (mode === "ブラー") {
      const sigma = Math.max(3, strength * 3);
      region = await sharp(bytes)
        .extract({ left, top, width: safeWidth, height: safeHeight })
        .blur(sigma)
        .png()
        .toBuffer();

      const maskSvg = Buffer.from(`
        <svg width="${safeWidth}" height="${safeHeight}">
    <defs>
      <filter id="blur"><feGaussianBlur stdDeviation="18"/></filter>
    </defs>
    <ellipse
      cx="${safeWidth / 2}"
      cy="${safeHeight / 2}"
      rx="${safeWidth * 0.36}"
      ry="${safeHeight * 0.42}"
      fill="white"
      filter="url(#blur)"
    />
  </svg>
      `);

      region = await sharp(region)
        .composite([{ input: maskSvg, blend: "dest-in" }])
        .png()
        .toBuffer();
    } else if (mode === "ガウス") {
      const sigma = Math.max(6, strength * 4);
      region = await sharp(bytes)
        .extract({ left, top, width: safeWidth, height: safeHeight })
        .blur(sigma)
        .png()
        .toBuffer();

      const maskSvg = Buffer.from(`
        <svg width="${safeWidth}" height="${safeHeight}">
    <defs>
      <filter id="blur"><feGaussianBlur stdDeviation="18"/></filter>
    </defs>
    <ellipse
      cx="${safeWidth / 2}"
      cy="${safeHeight / 2}"
      rx="${safeWidth * 0.36}"
      ry="${safeHeight * 0.42}"
      fill="white"
      filter="url(#blur)"
    />
  </svg>
      `);

      region = await sharp(region)
        .composite([{ input: maskSvg, blend: "dest-in" }])
        .png()
        .toBuffer();
    } else {
      const block = Math.max(12, Math.floor(18 * strength));
      const downW = Math.max(3, Math.floor(safeWidth / block));
      const downH = Math.max(3, Math.floor(safeHeight / block));

      region = await sharp(bytes)
        .extract({ left, top, width: safeWidth, height: safeHeight })
        .resize(downW, downH, { kernel: "nearest" })
        .resize(safeWidth, safeHeight, { kernel: "nearest" })
        .png()
        .toBuffer();
    }

    const output = await sharp(bytes)
      .composite([{ input: region, left, top }])
      .png()
      .toBuffer();

    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store"
      },
    });
  } catch (error) {
    console.error("mosaic error:", error);
    return NextResponse.json({ error: "mosaic failed" }, { status: 500 });
  }
}
