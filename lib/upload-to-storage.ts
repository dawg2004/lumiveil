import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const BUCKET = "generated-images";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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

  const ext =
    contentType.includes("webp") ? "webp" :
    contentType.includes("png") ? "png" :
    contentType.includes("mp4") ? "mp4" :
    contentType.includes("webm") ? "webm" :
    kind === "video" ? "mp4" : "jpg";

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
