export const VIDEO_ACCESS_COOKIE = "good_time_video_access";
export const VIDEO_ACCESS_FALLBACK_PASSWORD = "goodtime-video";

export function getVideoAccessPassword() {
  return process.env.VIDEO_ARCHIVE_PASSWORD || VIDEO_ACCESS_FALLBACK_PASSWORD;
}
