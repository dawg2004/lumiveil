/** fal FLUX.2 edit の image_size は 512〜2048。16 の倍数に揃える。 */
export const FLUX2_IMAGE_SIZE_MIN = 512;
export const FLUX2_IMAGE_SIZE_MAX = 2048;
export const FLUX2_IMAGE_SIZE_STEP = 16;
/** 縦長（2:3）だと長辺 1248 → 832×1248 で約 1MP になる。 */
export const FLUX2_TARGET_LONG_SIDE = 1248;

export type Flux2ImageSize = {
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundToStep(value: number): number {
  const rounded = Math.round(value / FLUX2_IMAGE_SIZE_STEP) * FLUX2_IMAGE_SIZE_STEP;
  return clamp(rounded, FLUX2_IMAGE_SIZE_MIN, FLUX2_IMAGE_SIZE_MAX);
}

/**
 * 入力写真の縦横比を保ったまま、約 1MP（長辺おおよそ 1248）の出力サイズを返す。
 * 極端に細長い画像は短辺 512・長辺 2048 の範囲に収める。
 */
export function computeFlux2ImageSize(srcWidth: number, srcHeight: number): Flux2ImageSize {
  if (!Number.isFinite(srcWidth) || !Number.isFinite(srcHeight) || srcWidth <= 0 || srcHeight <= 0) {
    return { width: 1024, height: 1024 };
  }

  const longSide = Math.max(srcWidth, srcHeight);
  let width = (srcWidth / longSide) * FLUX2_TARGET_LONG_SIDE;
  let height = (srcHeight / longSide) * FLUX2_TARGET_LONG_SIDE;

  const shortSide = Math.min(width, height);
  if (shortSide < FLUX2_IMAGE_SIZE_MIN) {
    const bump = FLUX2_IMAGE_SIZE_MIN / shortSide;
    width *= bump;
    height *= bump;
  }

  const longOut = Math.max(width, height);
  if (longOut > FLUX2_IMAGE_SIZE_MAX) {
    const shrink = FLUX2_IMAGE_SIZE_MAX / longOut;
    width *= shrink;
    height *= shrink;
  }

  return {
    width: roundToStep(width),
    height: roundToStep(height),
  };
}
