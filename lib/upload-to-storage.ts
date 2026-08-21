import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const BUCKET = "generated-images";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function extensionForContentType(contentType: string, kind: "image" | "video"): string {
  return (
    contentType.includes("webp") ? "webp" :
    contentType.includes("png") ? "png" :
    contentType.includes("mp4") ? "mp4" :
    contentType.includes("webm") ? "webm" :
    kind === "video" ? "mp4" : "jpg"
  );
}

async function uploadBlobToStorage(
  blob: Blob,
  contentType: string,
  kind: "image" | "video"
): Promise<string> {
  const ext = extensionForContentType(contentType, kind);
  const folder = kind === "video" ? "videos" : "images";
  const path = `${folder}/${randomUUID()}.${ext}`;

  const { error } = await getAdminClient()
    .storage
    .from(BUCKET)
    .upload(path, blob, { contentType, upsert: false });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = getAdminClient()
    .storage
    .from(BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

export async function uploadToStorage(
  sourceUrl: string,
  kind: "image" | "video"
): Promise<string> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch source file: ${response.status}`);
  }

  const blob = await response.blob();
  const contentType = blob.type || (kind === "video" ? "video/mp4" : "image/jpeg");

  return uploadBlobToStorage(blob, contentType, kind);
}

// サーバー側で生成した画像/動画バイト列（Buffer）を直接アップロードする。
// mosaic のように外部URLを持たず、その場で生成したバイナリを保存する場合に使う。
export async function uploadBufferToStorage(
  buffer: Buffer,
  contentType: string,
  kind: "image" | "video"
): Promise<string> {
  const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
  return uploadBlobToStorage(blob, contentType, kind);
}
