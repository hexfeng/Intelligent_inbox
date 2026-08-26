import type { BackgroundRequest, BackgroundResponse } from "./messages.js";

export async function sendBackground<T>(message: BackgroundRequest): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as BackgroundResponse<T>;
  if (!response.ok) throw Object.assign(new Error(response.error.message), { code: response.error.code, retryable: response.error.retryable });
  return response.data;
}

export function api<T>(path: string, method: "GET" | "POST" | "DELETE" = "GET", body?: unknown): Promise<T> {
  return sendBackground<T>({ type: "API_REQUEST", path, method, ...(body === undefined ? {} : { body }) });
}
