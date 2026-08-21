// 実費（ドル）をユーザー表示・課金用クレジット数に自動換算する。
// $0.09まで:1cr / $0.80まで:2cr / $1.30まで:3cr、以降は $0.5 刻みで+1cr。
export function priceToCredits(usd: number): number {
  if (usd <= 0.09) return 1;
  if (usd <= 0.8) return 2;
  if (usd <= 1.3) return 3;
  return 3 + Math.ceil((usd - 1.3) / 0.5);
}

// fal.ai 系動画モデル（grok / grok_v15 / seedance）の推定実費（ドル）。
// フロントの表示・バックエンドのクレジット消費の両方で同じ式を使う。
export function falVideoEstimatedUsd(model: string, duration: number, resolution: string): number {
  const rate =
    model === "grok" ? (resolution === "480p" ? 0.05 : 0.07)
      : model === "grok_v15" ? (resolution === "480p" ? 0.08 : 0.14)
        : 0.2419; // seedance (fast tier rate)
  return duration * rate;
}

export function falVideoCredits(model: string, duration: number, resolution: string): number {
  return priceToCredits(falVideoEstimatedUsd(model, duration, resolution));
}
