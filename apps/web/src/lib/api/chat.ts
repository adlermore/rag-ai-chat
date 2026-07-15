import type { ChatStreamEvent, MessageSource } from "@rag/shared";
import { apiFetch } from "./client";
import { tokenStorage } from "@/lib/auth/storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
}

export type Confidence = "high" | "low" | "refused";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: Confidence | null;
  sources?: MessageSource[];
}

export const chatApi = {
  list(): Promise<Chat[]> {
    return apiFetch<Chat[]>("/chat");
  },
  create(title?: string): Promise<Chat> {
    return apiFetch<Chat>("/chat", { method: "POST", body: { title } });
  },
  messages(chatId: string): Promise<ChatMessage[]> {
    return apiFetch<ChatMessage[]>(`/chat/${chatId}/messages`);
  },
};

export type PendingPhase = "search" | "chat";

export interface StreamHandlers {
  onToken: (value: string) => void;
  onSources: (sources: MessageSource[]) => void;
  onDone: (messageId: string, confidence: Confidence) => void;
  onError: (message: string) => void;
  onPhase?: (phase: PendingPhase) => void;
}

/**
 * Отправляет вопрос и читает SSE-поток ответа (token/sources/done/error).
 * Стрим через fetch + ReadableStream (apiFetch не годится для SSE).
 */
export async function streamMessage(
  chatId: string,
  content: string,
  h: StreamHandlers,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/chat/${chatId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStorage.access ?? ""}`,
      },
      body: JSON.stringify({ content }),
    });
  } catch {
    h.onError("network");
    return;
  }

  if (!res.ok || !res.body) {
    h.onError(`http_${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (evt: ChatStreamEvent) => {
    switch (evt.type) {
      case "phase":
        h.onPhase?.(evt.value);
        break;
      case "token":
        h.onToken(evt.value);
        break;
      case "sources":
        h.onSources(evt.sources);
        break;
      case "done":
        h.onDone(evt.messageId, evt.confidence as Confidence);
        break;
      case "error":
        h.onError(evt.message);
        break;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        dispatch(JSON.parse(line.slice(5).trim()) as ChatStreamEvent);
      } catch {
        /* игнорируем некорректный фрагмент */
      }
    }
  }
}
