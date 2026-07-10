import { Noto_Sans_Armenian, Noto_Serif_Armenian } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";

/**
 * Шрифты с поддержкой армянских глифов (Inter/Geist их НЕ содержат — см. дизайн-систему).
 * Noto Sans Armenian — весь UI и текст ответов.
 * Noto Serif Armenian — крупные заголовки экранов (display).
 * JetBrains Mono — числа/ID в аналитике (латиница+цифры).
 */
export const notoSans = Noto_Sans_Armenian({
  subsets: ["armenian", "latin"],
  variable: "--font-noto-sans",
  display: "swap",
});

export const notoSerif = Noto_Serif_Armenian({
  subsets: ["armenian", "latin"],
  weight: ["600", "700"],
  variable: "--font-noto-serif",
  display: "swap",
});

export const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});
