export const ADMIN_ACCESS_COOKIE = "good_time_admin_access";
export const ADMIN_ACCESS_PASSWORD = "1234";

export function getAdminAccessPassword() {
  return process.env.ADMIN_PAGE_PASSWORD || ADMIN_ACCESS_PASSWORD;
}
