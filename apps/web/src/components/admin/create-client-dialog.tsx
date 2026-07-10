"use client";

import { useState, type FormEvent } from "react";
import { Role, createClientSchema } from "@rag/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from "@rag/ui";
import { UserPlus } from "lucide-react";
import { clientsApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { t } from "@/lib/i18n";

export function CreateClientDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setEmail("");
    setPassword("");
    setError(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsed = createClientSchema.safeParse({
      email,
      password,
      role: Role.Client,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("common.error"));
      return;
    }

    setSubmitting(true);
    try {
      await clientsApi.create(parsed.data);
      reset();
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("states.errorHint"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="size-4" />
          {t("clients.create")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("clients.createTitle")}</DialogTitle>
          <DialogDescription>{t("clients.createSubtitle")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="client-email">{t("clients.email")}</Label>
            <Input
              id="client-email"
              type="email"
              dir="ltr"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-password">{t("clients.password")}</Label>
            <Input
              id="client-password"
              type="text"
              dir="ltr"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("common.loading") : t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
