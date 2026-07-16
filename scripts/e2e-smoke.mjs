#!/usr/bin/env node
/**
 * E2E happy-path smoke (Фаза 5, docs/04-ROADMAP.md).
 * Гоняется против ЖИВОГО стека (dev или docker --profile app):
 *   node scripts/e2e-smoke.mjs
 * env: API_URL, WEB_URL, INGEST_URL, ADMIN_EMAIL, ADMIN_PASSWORD.
 *
 * Вопрос чата берётся «кэшируемый» — при повторных прогонах ответ приходит из
 * Redis-кэша и НЕ тратит LLM-токены (первый прогон после инвалидации — тратит).
 */
const API = process.env.API_URL ?? "http://localhost:4000";
const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const INGEST = process.env.INGEST_URL ?? "http://localhost:8000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@company.am";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin12345!";

const QUESTION = "Երևանում գիշերավարձի առավելագույն չափը որքա՞ն է";
const OFFTOPIC = "Ինչպե՞ս պատրաստել իտալական սուրճ տանը";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function json(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

/** Читает SSE-стрим ответа чата до события done/error. */
async function askSse(chatId, token, content) {
  const res = await fetch(`${API}/chat/${chatId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok || !res.body) return { error: `http_${res.status}` };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", sources = [], done = null, error = null;
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const line = p.trim();
      if (!line.startsWith("data:")) continue;
      const e = JSON.parse(line.slice(5));
      if (e.type === "token") text += e.value;
      else if (e.type === "sources") sources = e.sources;
      else if (e.type === "done") done = e;
      else if (e.type === "error") error = e.message;
    }
  }
  return { text, sources, done, error };
}

// ── 1. Health всех сервисов ──
for (const [name, url] of [
  ["api /health", `${API}/health`],
  ["web /login", `${WEB}/login`],
  ["ingest /health", `${INGEST}/health`],
]) {
  const ok = await fetch(url).then((r) => r.ok).catch(() => false);
  check(name, ok);
}

// ── 2. Auth и RBAC ──
const noToken = await json("/admin/clients");
check("админ-роут без токена → 401", noToken.status === 401);

const badLogin = await json("/auth/login", {
  method: "POST",
  body: { email: EMAIL, password: "wrong-password-123" },
});
check("неверный пароль → 401", badLogin.status === 401);

const login = await json("/auth/login", {
  method: "POST",
  body: { email: EMAIL, password: PASSWORD },
});
check("логин админом", login.status === 201 || login.status === 200);
const token = login.data?.accessToken;
const auth = { Authorization: `Bearer ${token}` };

// клиентская роль не имеет доступа к админ-роутам
const clientEmail = `e2e-${Date.now()}@company.am`;
await json("/admin/clients", {
  method: "POST",
  headers: auth,
  body: { email: clientEmail, password: "E2eClient123!", role: "client" },
});
const clientLogin = await json("/auth/login", {
  method: "POST",
  body: { email: clientEmail, password: "E2eClient123!" },
});
const clientToken = clientLogin.data?.accessToken;
const rbac = await json("/admin/clients", {
  headers: { Authorization: `Bearer ${clientToken}` },
});
check("клиент на админ-роут → 403", rbac.status === 403);

// ── 3. Документы ──
const docs = await json("/admin/documents", { headers: auth });
const readyDocs = (docs.data ?? []).filter((d) => d.status === "ready").length;
check("есть проиндексированные документы", readyDocs > 0, `ready=${readyDocs}`);

// ── 4. Чат: ответ с источниками ──
const chat = await json("/chat", {
  method: "POST",
  headers: auth,
  body: { title: "e2e-smoke" },
});
check("создание чата", Boolean(chat.data?.id));

const t0 = Date.now();
const ans = await askSse(chat.data.id, token, QUESTION);
const dt = ((Date.now() - t0) / 1000).toFixed(1);
check(
  "ответ на вопрос по документам",
  !ans.error && ans.done?.confidence !== "refused" && ans.text.length > 20,
  `conf=${ans.done?.confidence} за ${dt}s`,
);
check("источники приложены", (ans.sources?.length ?? 0) > 0, `sources=${ans.sources?.length}`);
check(
  "источник содержит документ и фрагмент",
  Boolean(ans.sources?.[0]?.documentTitle && ans.sources?.[0]?.snippet),
);

// ── 5. Отказ на вопрос вне базы ──
const ref = await askSse(chat.data.id, token, OFFTOPIC);
check("off-topic → refused", ref.done?.confidence === "refused");

// ── 6. Аналитика ──
const dash = await json("/admin/analytics/dashboard", { headers: auth });
check("dashboard отвечает", dash.status === 200 && typeof dash.data?.totalQuestions === "number");

console.log(failures === 0 ? "\n🎉 E2E SMOKE: PASS" : `\n💥 E2E SMOKE: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
