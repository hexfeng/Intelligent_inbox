import type { ApiError } from "@intelligent-inbox/contracts";
import type { BackgroundRequest, BackgroundResponse } from "./messages.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse: (response: BackgroundResponse) => void) => {
  handleMessage(message).then(sendResponse).catch((error: unknown) => {
    sendResponse({ ok: false, error: { code: "EXTENSION_ERROR", message: error instanceof Error ? error.message : "Unexpected extension error", retryable: true } });
  });
  return true;
});

async function handleMessage(message: BackgroundRequest): Promise<BackgroundResponse> {
  if (message.type === "CONNECT_GOOGLE") return connectGoogle(Boolean(message.includeCalendar));
  if (message.type === "ACCOUNT_STATUS") return apiRequest("/v1/account/status", "GET");
  return apiRequest(message.path, message.method ?? "GET", message.body);
}

async function connectGoogle(includeCalendar: boolean): Promise<BackgroundResponse> {
  const redirectUri = chrome.identity.getRedirectURL("google");
  const begin = await fetch(`${API_BASE_URL}/v1/auth/google/connect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uri: redirectUri, include_calendar: includeCalendar })
  });
  if (!begin.ok) return failureFromResponse(begin);
  const { authorization_url } = await begin.json() as { authorization_url: string };
  const finalUrl = await chrome.identity.launchWebAuthFlow({ url: authorization_url, interactive: true });
  if (!finalUrl) return { ok: false, error: { code: "OAUTH_CANCELLED", message: "Google connection was cancelled", retryable: false } };
  const url = new URL(finalUrl);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return { ok: false, error: { code: "OAUTH_CALLBACK_INVALID", message: "Google did not return a valid authorization response", retryable: false } };
  const exchange = await fetch(`${API_BASE_URL}/v1/auth/google/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, state, redirect_uri: redirectUri })
  });
  if (!exchange.ok) return failureFromResponse(exchange);
  const data = await exchange.json() as { session_token: string; email: string; scopes: string[] };
  await chrome.storage.local.set({ session_token: data.session_token });
  return { ok: true, data: { email: data.email, scopes: data.scopes } };
}

async function apiRequest(path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<BackgroundResponse> {
  const { session_token } = await chrome.storage.local.get("session_token") as { session_token?: string };
  if (!session_token) return { ok: false, error: { code: "AUTH_REQUIRED", message: "Connect your Google account first", retryable: false } };
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { authorization: `Bearer ${session_token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) return failureFromResponse(response);
  return { ok: true, data: await response.json() };
}

async function failureFromResponse(response: Response): Promise<BackgroundResponse> {
  const fallback: ApiError = { code: "API_ERROR", message: `API request failed (${response.status})`, request_id: "unknown", retryable: response.status >= 500 };
  const error = await response.json().catch(() => fallback) as ApiError;
  return { ok: false, error: { code: error.code, message: error.message, retryable: error.retryable } };
}
