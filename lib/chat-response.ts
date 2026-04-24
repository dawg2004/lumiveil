import type { ChatResponse, EditSession } from "@/types/chat";

export function buildResponse(session: EditSession): ChatResponse {
  switch (session.step) {
    case "waiting_user_photo":
      return {
        state: session.step,
        message: "人物写真をアップロードしてください。",
        session,
      };

    case "photo_uploaded_menu":
      return {
        state: session.step,
        menu: [
          "1. モザイク処理",
          "2. 背景変更",
          "3. 美肌補正",
          "4. 明るさ調整",
          "5. ポーズ変更",
        ],
        session,
      };

    case "mosaic_menu":
      return {
        state: session.step,
        menu: [
          "範囲: 顔全体 / 目元のみ / バストアップ",
          "種類: ブラー / ガウス / モザイク",
          "強度: 弱い / やや弱い / 標準 / やや強い / 強い",
        ],
        session,
        next: {
          endpoint: "/api/mosaic",
          method: "POST",
        },
      };

    case "background_menu":
      return {
        state: session.step,
        message: "背景の候補を選んでください。",
        menu: [
          "1. フォトスタジオ風",
          "2. ホテルラウンジ風",
          "3. 公園",
          "4. 室内ラグジュアリー風",
          "5. 背景を合成する",
        ],
        session,
      };

    case "waiting_background_photo":
      return {
        state: session.step,
        message: "背景に使いたい画像をアップロードしてください。",
        session,
      };

    case "waiting_background_confirm":
      return {
        state: session.step,
        message:
          "背景画像を受け取りました。\nこのまま処理を実行しますか？\n1. Go!\n2. 修正する",
        session,
      };

    case "beauty_menu":
      return {
        state: session.step,
        menu: [
          "1. ナチュラル",
          "2. しっかり補正",
          "3. クマ・ニキビのみ除去",
        ],
        session,
      };

    case "brightness_menu":
      return {
        state: session.step,
        menu: ["1. 自然補正", "2. 明るめ", "3. 落ち着いたトーン"],
        session,
      };

    case "pose_menu":
      return {
        state: session.step,
        menu: [
          "1. エレガント",
          "2. 顔を片手で隠す",
          "3. ソファに座る",
          "4. 立ち姿を整える",
        ],
        session,
      };

    case "processing":
      return {
        state: session.step,
        message: "処理中です…",
        session,
      };

    case "completed":
      return {
        state: session.step,
        menu: [
          "1. 調整して別の写真に変更",
          "2. 新規修正",
          "3. このまま続ける",
        ],
        session,
      };

    default:
      return {
        state: "rejected",
        message: "処理を続けられませんでした。",
        session,
      };
  }
}
