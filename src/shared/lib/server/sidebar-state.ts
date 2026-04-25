import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

const SIDEBAR_STATE_COOKIE_NAME = "sidebar_state";
const DEFAULT_SIDEBAR_OPEN = true;

function parseSidebarOpenCookie(value: string | undefined): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return DEFAULT_SIDEBAR_OPEN;
}

export const getDefaultSidebarOpen = createServerFn({ method: "GET" }).handler(
  async () => parseSidebarOpenCookie(getCookie(SIDEBAR_STATE_COOKIE_NAME)),
);
