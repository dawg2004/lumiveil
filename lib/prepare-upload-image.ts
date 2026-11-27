// Vercel のサーバーレス関数はリクエスト本文が約 4.5MB を超えると
// 413 (FUNCTION_PAYLOAD_TOO_LARGE) を JSON ではない本文で返す。
// モザイク結果（フル解像度 PNG）などをそのまま送るとこの上限を超えるため、
// 送信前にブラウザ側で JPEG に再圧縮・縮小する。

export const SINGLE_UPLOAD_BUDGET_BYTES = 3_500_000;
export const PAIR_UPLOAD_BUDGET_BYTES = 2_000_000;
const MAX_LONG_SIDE = 3072;
const MIN_LONG_SIDE = 768;

export type PreparedUpload = {
  file: File;
  /** 元画像に対する縮小率（1 = そのまま）。座標を送る処理で使う。 */
  scale: number;
};

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("画像の圧縮に失敗しました。"))),
      "image/jpeg",
      quality
    );
  });
}

function jpegName(name: string) {
  const base = name.replace(/\.[^.]+$/, "") || "upload";
  return `${base}.jpg`;
}

export async function prepareImageForUpload(
  file: File,
  maxBytes: number = SINGLE_UPLOAD_BUDGET_BYTES
): Promise<PreparedUpload> {
  if (file.size <= maxBytes) {
    return { file, scale: 1 };
  }

  const bitmap = await createImageBitmap(file);
  try {
    const longSide = Math.max(bitmap.width, bitmap.height);
    let scale = Math.min(1, MAX_LONG_SIDE / longSide);
    let lastBlob: Blob | null = null;

    while (true) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("画像の圧縮に失敗しました。");
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.92, 0.85, 0.75]) {
        lastBlob = await canvasToJpeg(canvas, quality);
        if (lastBlob.size <= maxBytes) {
          return { file: new File([lastBlob], jpegName(file.name), { type: "image/jpeg" }), scale };
        }
      }

      if (longSide * scale <= MIN_LONG_SIDE) break;
      scale *= 0.8;
    }

    // ここまで来ることはほぼないが、最後に作った一番小さい画像を返す
    return { file: new File([lastBlob!], jpegName(file.name), { type: "image/jpeg" }), scale };
  } finally {
    bitmap.close();
  }
}
