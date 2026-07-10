import type { AuthTokens } from "@rag/shared";

/**
 * Хранение JWT в localStorage. Для внутреннего инструмента v1 это приемлемо;
 * при ужесточении безопасности (Фаза 3+) можно перейти на httpOnly-cookie.
 */
const ACCESS_KEY = "rag.accessToken";
const REFRESH_KEY = "rag.refreshToken";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export const tokenStorage = {
  get access(): string | null {
    return isBrowser() ? window.localStorage.getItem(ACCESS_KEY) : null;
  },
  get refresh(): string | null {
    return isBrowser() ? window.localStorage.getItem(REFRESH_KEY) : null;
  },
  set(tokens: AuthTokens): void {
    if (!isBrowser()) return;
    window.localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  },
  clear(): void {
    if (!isBrowser()) return;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  },
};
