"use client";

import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MessageSource } from "@rag/shared";
import { renderWithCitations } from "./citation";

/**
 * Ответ AI приходит в markdown (LLM размечает списки/жирный) с цитатами ⟨n⟩.
 * Рендерим markdown и внутри текстовых узлов заменяем ⟨n⟩ на цитатные чипы.
 * Замена идемпотентна: обработанные строки маркеров больше не содержат.
 */
function withCitations(
  children: ReactNode,
  sources: MessageSource[],
  messageId: string,
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      return renderWithCitations(child, sources, messageId);
    }
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children) {
      return cloneElement(
        child,
        {},
        withCitations(child.props.children, sources, messageId),
      );
    }
    return child;
  });
}

export function MarkdownAnswer({
  text,
  sources,
  messageId,
}: {
  text: string;
  sources: MessageSource[];
  messageId: string;
}) {
  const cite = (children: ReactNode) =>
    withCitations(children, sources, messageId);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{cite(children)}</p>
        ),
        ul: ({ children }) => (
          <ul className="my-2 list-disc space-y-1.5 ps-5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-2 list-decimal space-y-1.5 ps-5">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{cite(children)}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        h1: ({ children }) => (
          <p className="mb-1.5 mt-3 font-semibold first:mt-0">{cite(children)}</p>
        ),
        h2: ({ children }) => (
          <p className="mb-1.5 mt-3 font-semibold first:mt-0">{cite(children)}</p>
        ),
        h3: ({ children }) => (
          <p className="mb-1.5 mt-3 font-semibold first:mt-0">{cite(children)}</p>
        ),
        a: ({ children }) => <span>{children}</span>, // внешних ссылок в ответах нет
        code: ({ children }) => (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">
            {children}
          </code>
        ),
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border bg-muted px-2 py-1 text-start font-medium">
            {cite(children)}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border px-2 py-1">{cite(children)}</td>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
