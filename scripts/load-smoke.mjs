#!/usr/bin/env node
/**
 * Нагрузочный smoke (Фаза 5): 50 параллельных вопросов.
 * 10 клиентов × 5 вопросов — в пределах rate-limit (20/мин на пользователя).
 * Вопрос кэшируемый: после первого ответа остальные — кэш-хиты (LLM не тратится),
 * нагрузка ложится на api/Postgres/Redis — то, что и проверяем.
 *   node scripts/load-smoke.mjs
 */
const API = process.env.API_URL ?? "http://localhost:4000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@company.am";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin12345!";
const USERS = 10;
const PER_USER = 5;
const QUESTION = "Երևանում գիշերավարձի առավելագույն չափը որքա՞ն է";

async function json(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function ask(chatId, token) {
  const t0 = performance.now();
  const res = await fetch(`${API}/chat/${chatId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: QUESTION }),
  });
  if (!res.ok || !res.body) return { ok: false, status: res.status, ms: performance.now() - t0 };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", done = null;
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    for (const p of buf.split("\n\n")) {
      const line = p.trim();
      if (line.startsWith("data:")) {
        try {
          const e = JSON.parse(line.slice(5));
          if (e.type === "done") done = e;
        } catch {}
      }
    }
  }
  return { ok: done?.confidence === "high", ms: performance.now() - t0 };
}

// подготовка: админ + 10 клиентов с чатами
const admin = await json("/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
const adminAuth = { Authorization: `Bearer ${admin.data.accessToken}` };

// прогрев кэша одним вопросом (если инвалидирован — единственный LLM-вызов)
{
  const chat = await json("/chat", { method: "POST", headers: adminAuth, body: {} });
  const warm = await ask(chat.data.id, admin.data.accessToken);
  console.log(`прогрев кэша: ${warm.ok ? "ok" : "fail"} за ${(warm.ms / 1000).toFixed(1)}s`);
}

const sessions = [];
for (let i = 0; i < USERS; i++) {
  const email = `load-${Date.now()}-${i}@company.am`;
  await json("/admin/clients", {
    method: "POST", headers: adminAuth,
    body: { email, password: "LoadTest123!", role: "client" },
  });
  const login = await json("/auth/login", { method: "POST", body: { email, password: "LoadTest123!" } });
  const token = login.data.accessToken;
  const chats = [];
  for (let c = 0; c < PER_USER; c++) {
    const chat = await json("/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: { title: `load-${i}-${c}` },
    });
    chats.push(chat.data.id);
  }
  sessions.push({ token, chats });
}
console.log(`подготовлено: ${USERS} клиентов × ${PER_USER} чатов`);

// залп: 50 параллельных вопросов
const t0 = performance.now();
const results = await Promise.all(
  sessions.flatMap((s) => s.chats.map((chatId) => ask(chatId, s.token))),
);
const wall = (performance.now() - t0) / 1000;

const ok = results.filter((r) => r.ok).length;
const lat = results.map((r) => r.ms).sort((a, b) => a - b);
const q = (p) => (lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] / 1000).toFixed(2);
console.log(`\nитого: ${ok}/${results.length} успешных за ${wall.toFixed(1)}s (wall)`);
console.log(`latency: p50=${q(0.5)}s  p95=${q(0.95)}s  max=${q(1)}s`);
const errs = results.filter((r) => !r.ok);
if (errs.length) console.log("ошибки/не-high:", errs.map((e) => e.status ?? "sse").join(","));
process.exit(ok === results.length ? 0 : 1);
