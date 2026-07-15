"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Role, loginRequestSchema } from "@rag/shared";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@rag/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth/context";
import { ApiError } from "@/lib/api/client";
import { t } from "@/lib/i18n";
import { BrandMark } from "@/components/brand";
import { DemoBadge } from "@/components/demo-badge";
import { PoweredBySteply } from "@/components/powered-by-steply";

function destinationFor(role: string): string {
  return role === Role.Admin ? "/admin" : "/app";
}

function messageForCode(code: string | undefined): string {
  switch (code) {
    case "auth.blocked":
      return t("auth.blocked");
    case "auth.invalid_credentials":
    default:
      return t("auth.invalidCredentials");
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { status, user, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Уже вошедших уводим из формы логина.
  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(destinationFor(user.role));
    }
  }, [status, user, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(t("auth.invalidCredentials"));
      return;
    }

    setSubmitting(true);
    try {
      const loggedIn = await login(parsed.data.email, parsed.data.password);
      router.replace(destinationFor(loggedIn.role));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(messageForCode(err.code));
      } else {
        setError(t("states.errorHint"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="flex w-full max-w-md flex-col items-center">
      <Card className="w-full">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center pb-1">
            <BrandMark size={56} />
          </div>
          <p className="font-display text-2xl font-bold text-foreground">
            {t("app.name")}
          </p>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("app.bankFull")}
          </p>
          <div className="flex justify-center">
            <DemoBadge full />
          </div>
          <CardTitle className="text-lg font-semibold">
            {t("auth.loginTitle")}
          </CardTitle>
          <CardDescription>{t("auth.loginSubtitle")}</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder={t("auth.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive" aria-live="polite">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? t("auth.submitting") : t("auth.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <PoweredBySteply className="mt-5" />
      </div>
    </main>
  );
}
