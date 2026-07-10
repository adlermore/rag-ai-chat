import type { AuthTokens } from "@rag/shared";
import { tokenStorage } from "@/lib/auth/storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Ошибка API с кодом и армянским сообщением (совместимо с ApiError). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Требуется повторный вход (refresh не удался). */
export class UnauthorizedError extends ApiError {}

// Один общий refresh в полёте — чтобы параллельные 401 не гоняли refresh дважды.
let refreshInFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = tokenStorage.refresh;
  if (!refreshToken) return false;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    tokenStorage.clear();
    return false;
  }
  const tokens = (await res.json()) as AuthTokens;
  tokenStorage.set(tokens);
  return true;
}

function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean; // прикреплять ли access-токен (по умолчанию да)
}

async function raw(path: string, options: RequestOptions): Promise<Response> {
  const { body, auth = true, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  if (body !== undefined) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (auth && tokenStorage.access) {
    finalHeaders.set("Authorization", `Bearer ${tokenStorage.access}`);
  }
  return fetch(`${API_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Типизированный запрос к API. На 401 один раз пытается refresh и повторяет.
 * Бросает UnauthorizedError, если восстановить сессию не удалось.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let res = await raw(path, options);

  if (res.status === 401 && options.auth !== false) {
    const ok = await refreshOnce();
    if (ok) {
      res = await raw(path, options);
    }
    if (res.status === 401) {
      tokenStorage.clear();
      throw new UnauthorizedError(401, "auth.session_expired", "Սեսիան լրացել է");
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = data as { code?: string; message?: string } | null;
    throw new ApiError(
      res.status,
      err?.code ?? "error",
      err?.message ?? "Սխալ",
    );
  }
  return data as T;
}
