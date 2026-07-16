/**
 * Эмблема продукта Центрального банка Армении: классический банковский портик
 * в круге с золотой каймой. Цвет круга — токен primary (следует теме),
 * золото — фирменный акцент ЦБ (см. docs/03-DESIGN-SYSTEM.md §Ребрендинг).
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Կենտրոնական Բանկ"
    >
      <circle cx="32" cy="32" r="31" fill="var(--primary)" />
      <circle
        cx="32"
        cy="32"
        r="26.5"
        fill="none"
        stroke="#C9A227"
        strokeWidth="2"
      />
      {/* фронтон */}
      <path d="M32 15 L49 25 H15 Z" fill="#FFFFFF" />
      {/* колонны */}
      <rect x="19" y="28" width="5" height="16" rx="1" fill="#FFFFFF" />
      <rect x="29.5" y="28" width="5" height="16" rx="1" fill="#FFFFFF" />
      <rect x="40" y="28" width="5" height="16" rx="1" fill="#FFFFFF" />
      {/* основание */}
      <rect x="16" y="46" width="32" height="3.5" rx="1" fill="#FFFFFF" />
      {/* золотая звезда над фронтоном */}
      <circle cx="32" cy="11" r="2" fill="#C9A227" />
    </svg>
  );
}
