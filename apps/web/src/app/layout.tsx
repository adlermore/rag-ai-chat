import type { Metadata } from "next";
import { notoSans, notoSerif, jetBrainsMono } from "@/lib/fonts";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth/context";
import { dictionary } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: dictionary.app.name,
  description: dictionary.app.tagline,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="hy"
      suppressHydrationWarning
      className={`${notoSans.variable} ${notoSerif.variable} ${jetBrainsMono.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
