#!/usr/bin/env node
/**
 * Полный функциональный QA против живого стека (docker --profile app или dev).
 *   node scripts/qa-functional.mjs
 * LLM почти не тратится: вопросы чата — кэшируемые; единственный LLM-вызов —
 * mini-rewrite follow-up'а (проверка диалогового контекста, ~200 токенов).
 */
const API = process.env.API_URL ?? "http://localhost:4000";
const INGEST = process.env.INGEST_URL ?? "http://localhost:8000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@company.am";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin12345!";
const CACHED_Q = "Երևանում գիշերավարձի առավելագույն չափը որքա՞ն է";

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) pass++;
  else {
    fail++;
    failures.push(name);
  }
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function req(path, { token, ...opts } = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, headers: res.headers };
}

async function askSse(chatId, token, content) {
  const res = await fetch(`${API}/chat/${chatId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content }),
  });
  if (!res.ok || !res.body) return { httpStatus: res.status };
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
  return { httpStatus: 200, text, sources, done, error };
}

console.log("═══ 1. AUTH ═══");
const login = await req("/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
check("логин админом", !!login.data?.accessToken);
const admin = login.data.accessToken;
const refresh = await req("/auth/refresh", { method: "POST", body: { refreshToken: login.data.refreshToken } });
check("refresh выдаёт новую пару", !!refresh.data?.accessToken && !!refresh.data?.refreshToken);
const me = await req("/auth/me", { token: admin });
check("/auth/me", me.data?.email === EMAIL && me.data?.role === "admin");
check("невалидный email → 400", (await req("/auth/login", { method: "POST", body: { email: "not-email", password: "12345678" } })).status === 400);
check("битый токен → 401", (await req("/auth/me", { token: "garbage.token.here" })).status === 401);

console.log("═══ 2. CLIENTS CRUD + блокировка ═══");
const cEmail = `qa-${Date.now()}@company.am`;
const created = await req("/admin/clients", { method: "POST", token: admin, body: { email: cEmail, password: "QaClient123!", role: "client" } });
check("создание клиента", created.status === 201 && created.data?.email === cEmail);
check("дубль email → 4xx", (await req("/admin/clients", { method: "POST", token: admin, body: { email: cEmail, password: "QaClient123!", role: "client" } })).status >= 400);
check("короткий пароль → 400", (await req("/admin/clients", { method: "POST", token: admin, body: { email: `qa2-${Date.now()}@c.am`, password: "short", role: "client" } })).status === 400);
const clientLogin = await req("/auth/login", { method: "POST", body: { email: cEmail, password: "QaClient123!" } });
const client = clientLogin.data?.accessToken;
check("логин клиентом", !!client);

const blocked = await req(`/admin/clients/${created.data.id}`, { method: "PATCH", token: admin, body: { status: "blocked" } });
check("блокировка клиента", blocked.status === 200 && blocked.data?.status === "blocked");
const blockedLogin = await req("/auth/login", { method: "POST", body: { email: cEmail, password: "QaClient123!" } });
check("логин заблокированного отклоняется", blockedLogin.status === 401 || blockedLogin.status === 403, `got ${blockedLogin.status}`);
await req(`/admin/clients/${created.data.id}`, { method: "PATCH", token: admin, body: { status: "active" } });

console.log("═══ 3. RBAC: клиент на все admin-роуты → 403 ═══");
for (const path of ["/admin/clients", "/admin/documents", "/admin/analytics/dashboard", "/admin/analytics/questions", "/admin/audit?page=1&pageSize=5", "/admin/eval/questions"]) {
  const r = await req(path, { token: client });
  check(`403 ${path}`, r.status === 403, `got ${r.status}`);
}

console.log("═══ 4. CHAT: изоляция, валидация, ответы ═══");
const chat = await req("/chat", { method: "POST", token: admin, body: { title: "qa-func" } });
check("создание чата", !!chat.data?.id);
check("чужой чат клиенту → 404", (await req(`/chat/${chat.data.id}/messages`, { token: client })).status === 404);
check("пустой вопрос → 400", (await req(`/chat/${chat.data.id}/messages`, { method: "POST", token: admin, body: { content: "" } })).status === 400);
check("вопрос 4001+ символов → 400", (await req(`/chat/${chat.data.id}/messages`, { method: "POST", token: admin, body: { content: "ա".repeat(4001) } })).status === 400);

const a1 = await askSse(chat.data.id, admin, CACHED_Q);
check("ответ по документам (кэш)", a1.done?.confidence === "high" && a1.text.includes("25000"), `conf=${a1.done?.confidence}`);
check("источники со snippet", a1.sources?.length > 0 && !!a1.sources[0].snippet);

// follow-up: единственный LLM-вызов (mini-rewrite), ответ — из кэша
const a2 = await askSse(chat.data.id, admin, "Իսկ նվազագույնը՞");
check("follow-up (rewrite) даёт ответ", a2.done?.confidence === "high" && (a2.text.includes("5000") || a2.text.includes("5 000")), a2.text.slice(0, 60));

const history = await req(`/chat/${chat.data.id}/messages`, { token: admin });
check("история: сообщения с источниками", Array.isArray(history.data) && history.data.filter((m) => m.role === "assistant").every((m) => m.sources !== undefined));
const myChats = await req("/chat", { token: admin });
check("список чатов", Array.isArray(myChats.data) && myChats.data.some((c) => c.id === chat.data.id));

console.log("═══ 5. DOCUMENTS: edge-cases ═══");
const badUpload = await fetch(`${API}/admin/documents/upload`, {
  method: "POST",
  headers: { Authorization: `Bearer ${admin}` },
  body: (() => { const fd = new FormData(); fd.append("file", new Blob(["hello"], { type: "text/plain" }), "note.txt"); return fd; })(),
});
check("upload .txt → 400", badUpload.status === 400);
check("несуществующий документ → 404", (await req(`/admin/documents/00000000-0000-4000-8000-000000000000`, { token: admin })).status === 404);
check("register с несуществующим путём → ошибка при индексации (принят и станет failed)", (await req("/admin/documents", { method: "POST", token: admin, body: { title: "qa-missing", type: "pdf", path: "/no/such/file.pdf" } })).status === 201);
await new Promise((r) => setTimeout(r, 3000));
const docsList = await req("/admin/documents", { token: admin });
const missing = docsList.data?.find((d) => d.title === "qa-missing");
check("несуществующий путь → status failed", missing?.status === "failed", missing?.status);
if (missing) {
  const del = await req(`/admin/documents/${missing.id}`, { method: "DELETE", token: admin });
  check("удаление failed-документа", del.status === 200);
}

console.log("═══ 6. INGEST-сервис напрямую ═══");
check("ingest /health", (await fetch(`${INGEST}/health`)).ok);
check("/search без q → 422", (await fetch(`${INGEST}/search`)).status === 422);
const s = await fetch(`${INGEST}/search?q=${encodeURIComponent("գիշերավարձ")}&top=3`).then((r) => r.json());
check("/search выдаёт скоринг", Array.isArray(s) && s.length > 0 && typeof s[0].score === "number");
check("delete несуществующего документа — no-op 200", (await fetch(`${INGEST}/documents/no-such-doc`, { method: "DELETE" })).status === 200);

console.log("═══ 7. EVAL: фильтры/идемпотентность ═══");
const evPending = await req("/admin/eval/questions?status=pending&pageSize=5", { token: admin });
check("фильтр pending", evPending.data?.items?.every((q) => q.status === "pending"));
const reimport = await req("/admin/eval/import", { method: "POST", token: admin, body: { path: "/uploads/eval_dataset.jsonl" } });
check("повторный импорт идемпотентен", reimport.data?.imported === 0 && reimport.data?.skipped === 134, JSON.stringify(reimport.data));

console.log("═══ 8. RATE LIMIT (per-user) ═══");
const burst = await Promise.all(Array.from({ length: 30 }, () => req("/chat", { token: client })));
const got429 = burst.filter((r) => r.status === 429).length;
const got200 = burst.filter((r) => r.status === 200).length;
check("burst 30 → часть 429, часть 200 (лимит 20/мин)", got429 > 0 && got200 > 0 && got200 <= 21, `200:${got200} 429:${got429}`);
const adminOk = await req("/chat", { token: admin });
check("лимит клиента НЕ влияет на другого пользователя", adminOk.status === 200);

console.log("═══ 9. Security headers ═══");
const h = (await req("/health")).headers;
check("helmet: x-frame-options", !!h.get("x-frame-options"));
check("helmet: x-content-type-options", h.get("x-content-type-options") === "nosniff");

console.log(`\n═══ ИТОГ: ${pass} passed, ${fail} failed ═══`);
if (failures.length) console.log("FAILED:", failures.join(" | "));
process.exit(fail === 0 ? 0 : 1);
