import hy from "./hy.json";

/**
 * i18n: армянский (hy) — единственная локаль v1. Ключи английские.
 * Хардкод армянского текста в JSX запрещён (CLAUDE.md §3) — всё через t().
 */
export const dictionary = hy;
export type Dictionary = typeof hy;

/** Пути вида "auth.loginTitle" — все возможные ключи словаря. */
type DotPaths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? DotPaths<T[K], `${Prefix}${K}.`>
    : `${Prefix}${K}`;
}[keyof T & string];

export type TranslationKey = DotPaths<Dictionary>;

/** Перевод по ключу-пути. Возвращает сам ключ, если перевод не найден (видно в UI). */
export function t(key: TranslationKey): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[part]
          : undefined,
      dictionary,
    );
  return typeof value === "string" ? value : key;
}
