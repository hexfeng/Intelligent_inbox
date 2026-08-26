export type BackgroundRequest =
  | { type: "CONNECT_GOOGLE"; includeCalendar?: boolean }
  | { type: "ACCOUNT_STATUS" }
  | { type: "API_REQUEST"; path: string; method?: "GET" | "POST" | "DELETE"; body?: unknown };

export type BackgroundResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };
