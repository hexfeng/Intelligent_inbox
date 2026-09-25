import type { BackgroundResponse } from "./messages.js";

export function createGoogleAuthCoordinator(
  run: (includeCalendar: boolean) => Promise<BackgroundResponse>
): (includeCalendar: boolean) => Promise<BackgroundResponse> {
  let inProgress = false;

  return async (includeCalendar) => {
    if (inProgress) {
      return {
        ok: false,
        error: {
          code: "OAUTH_IN_PROGRESS",
          message: "Google connection is already open. Close the previous authorization window, then try again.",
          retryable: true
        }
      };
    }

    inProgress = true;
    try { return await run(includeCalendar); }
    finally { inProgress = false; }
  };
}
