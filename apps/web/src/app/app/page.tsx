"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageSource } from "@rag/shared";
import { Button, cn } from "@rag/ui";
import { LogOut, MessageSquarePlus, Plus } from "lucide-react";
import { RequireAuth } from "@/components/auth/require-auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth/context";
import { t } from "@/lib/i18n";
import {
  chatApi,
  streamMessage,
  type Chat,
  type ChatMessage,
  type Confidence,
} from "@/lib/api/chat";
import { MessageBubble } from "@/components/chat/message-bubble";
import { Composer } from "@/components/chat/composer";

const EXAMPLES = ["chat.example1", "chat.example2", "chat.example3"] as const;

function ChatWorkspace() {
  const { user, logout } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamContent, setStreamContent] = useState<string | null>(null);
  const [streamSources, setStreamSources] = useState<MessageSource[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatApi.list().then(setChats).catch(() => undefined);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streamContent]);

  const selectChat = useCallback(async (id: string) => {
    setActiveId(id);
    setStreamContent(null);
    try {
      setMessages(await chatApi.messages(id));
    } catch {
      setMessages([]);
    }
  }, []);

  const newChat = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setStreamContent(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      setBusy(true);
      let chatId = activeId;
      try {
        if (!chatId) {
          const chat = await chatApi.create();
          chatId = chat.id;
          setActiveId(chat.id);
          setChats((prev) => [chat, ...prev]);
        }
      } catch {
        setBusy(false);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", content: text },
      ]);

      let acc = "";
      let srcs: MessageSource[] = [];
      setStreamContent("");
      setStreamSources([]);

      const finalize = (
        id: string,
        confidence: Confidence,
        content: string,
      ) => {
        setMessages((prev) => [
          ...prev,
          { id, role: "assistant", content, confidence, sources: srcs },
        ]);
        setStreamContent(null);
        setStreamSources([]);
        setBusy(false);
      };

      await streamMessage(chatId, text, {
        onToken: (v) => {
          acc += v;
          setStreamContent(acc);
        },
        onSources: (s) => {
          srcs = s;
          setStreamSources(s);
        },
        onDone: (id, confidence) => finalize(id, confidence, acc),
        onError: () =>
          finalize(`e-${Date.now()}`, "refused", t("chat.streamError")),
      });
    },
    [activeId],
  );

  const showEmpty = messages.length === 0 && streamContent === null;

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar: история чатов (на мобиле скрыт — Sheet в след. инкременте) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-foreground">
            {t("chat.historyTitle")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={newChat}
            aria-label={t("chat.newChat")}
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {chats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectChat(c.id)}
              className={cn(
                "block w-full truncate rounded-md px-2 py-1.5 text-start text-[13px]",
                c.id === activeId
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {c.title}
            </button>
          ))}
        </nav>
      </aside>

      {/* Основная область */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={newChat}
              aria-label={t("chat.newChat")}
            >
              <MessageSquarePlus className="size-4" />
            </Button>
            <span className="text-sm font-semibold text-foreground">
              {t("app.name")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span
              className="hidden text-[13px] text-muted-foreground sm:inline"
              dir="ltr"
            >
              {user?.email}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={logout}
            >
              <LogOut className="size-4" />
              {t("auth.logout")}
            </Button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {showEmpty ? (
              <div className="flex flex-col items-center gap-6 py-16 text-center">
                <div>
                  <h1 className="font-display text-[28px] font-bold leading-9 text-foreground">
                    {t("chat.emptyTitle")}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("chat.emptyHint")}
                  </p>
                </div>
                <div className="flex w-full max-w-xl flex-col gap-2">
                  {EXAMPLES.map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={busy}
                      onClick={() => send(t(key))}
                      className="rounded-xl border border-border bg-card px-4 py-3 text-start text-[15px] text-foreground transition-colors hover:border-primary/40 hover:bg-muted disabled:opacity-60"
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
                {streamContent !== null && (
                  <MessageBubble
                    streaming
                    message={{
                      id: "streaming",
                      role: "assistant",
                      content: streamContent || t("chat.thinking"),
                      confidence: "high",
                      sources: streamSources,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <Composer disabled={busy} onSend={send} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppPage() {
  return (
    <RequireAuth>
      <ChatWorkspace />
    </RequireAuth>
  );
}
