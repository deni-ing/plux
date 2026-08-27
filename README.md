# Plux

**A Hebrew-first personal finance app with an AI assistant that actually understands your money.**

[**Live demo**](https://plux-theta.vercel.app) — click **"היכנס כדמו"** ("Enter as demo") on the home screen. No sign-up, no email, no password: one click drops you into a real account seeded with four months of realistic synthetic data.

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-336791)](https://supabase.com/)
[![Clerk](https://img.shields.io/badge/Auth-Clerk-6C47FF)](https://clerk.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

*(עברית: [README.he.md](./README.he.md))*

---

## What it is

Plux is a personal finance tracker built end-to-end as a portfolio project — not a clone, and not a commercial product. The starting question was simple: Israeli banks and card companies show you *what happened*; nothing mainstream lets you *ask* about it in plain language and get a real answer computed from your own data. Plux does.

It's fully in Hebrew, right-to-left, and designed around how Israeli banking actually works (credit-card billing cycles that don't line up with the calendar month, "הוראת קבע" standing orders, multi-account households).

## Try it without an account

Signing up just to poke around a finance app is a real barrier, so Plux has a dedicated demo path: a real [Clerk](https://clerk.com/) user, seeded with four months of realistic (fully synthetic — no real financial data) transactions across groceries, rent, subscriptions, transfers and more. One click on the home page, backed by Clerk's sign-in-token flow, and you're looking at a populated dashboard.

## Features

- **Dashboard** — this month's net, income and expense at a glance, current account balance, and an end-of-month forecast (floor / expected / ceiling) with a confidence indicator, plus a live market ticker.
- **Pluxer** — an AI chat assistant (Claude) that answers questions like *"כמה נשאר לי החודש?"* by actually querying your transactions, budgets and categories through tool-calling, not by guessing from a prompt. It also writes a short natural-language summary of each month automatically.
- **Transactions** — searchable, filterable transaction history with category assignment and unclassified-item detection.
- **Recurring & subscriptions** — distinguishes charges you've explicitly declared as standing orders from ones the system detects algorithmically (with a confidence score), and forecasts what's still coming before the month closes.
- **Budgets & savings goals** — set spending targets per category and track progress toward savings goals.
- **Import** — bring in bank/card statements.
- **A real "financial month"** — periods run on a configurable billing-cycle day, not the 1st of the calendar month, matching how Israeli credit cards actually bill.

## Under the hood

A few decisions worth mentioning to anyone reading the code:

- **Next.js 16 (App Router) + TypeScript**, server components and route handlers, deployed on Vercel.
- **Prisma 7 over PostgreSQL (Supabase)**, normally through the connection pooler, with a documented direct-connection escape hatch (`PLUX_DIRECT_DB`) for scripts that need a single long-lived transaction (e.g. the demo seed script).
- **Per-request tenant isolation without Postgres RLS policies**: every query runs inside a Prisma transaction that first sets a session-scoped `app.current_user_id` via `set_config(..., true)` — scoped to the transaction, not the connection, which matters behind a pooler where connections are shared across requests.
- **No `middleware.ts`** — every route checks its own auth via Clerk explicitly, which keeps auth logic visible at the point of use rather than centralized and implicit.
- **The AI assistant is tool-calling, not RAG-over-a-blob** — Claude gets a small set of typed tools (`getMonthlyReport`, `findTransactions`, `listAvailableMonths`) and decides which to call; answers are grounded in real query results, and monthly summaries are cached so they're generated once per period, not on every page load.
- **Demo access via Clerk sign-in tokens**, not a shared demo password — a real, first-class Clerk session, generated server-side per visit.
- **Uploaded bank/card statements are purged after 30 days** by a scheduled job — the parsed transactions stay, but the raw source file (which can contain a full ID number or account number) doesn't get kept indefinitely just in case a parser bug needs re-running against it later.

The full endpoint reference — request/response types read directly from the route handlers, not a separate schema that can drift — lives in [`docs/API.md`](./docs/API.md).

## Getting started

```bash
git clone https://github.com/deni-ing/plux.git
cd plux
npm install
cp .env.template .env  # fill in the values below
npx prisma migrate dev
npm run dev
```

You'll need:

| Variable | What it's for |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | A PostgreSQL database (developed against [Supabase](https://supabase.com/)) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Auth ([Clerk](https://clerk.com/)) |
| `ANTHROPIC_API_KEY` | Powers Pluxer and the monthly AI summaries |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Only needed for a couple of Supabase-specific admin operations |
| `TWELVE_DATA_API_KEY` | Optional — the market ticker on the dashboard |

See `.env.template` for the complete list, including optional overrides.

```bash
npm run test    # unit tests
npm run lint    # ESLint
npm run build   # production build + type-check
```

## Prior art

There's no shortage of ways Israelis already track spending, and it's worth being specific about how Plux relates to them rather than hand-waving.

**[MAX](https://www.max.co.il/cards/max-app)** (formerly Leumi Card) ships a companion app for its own credit cards: a categorized view of your charges, some spend summaries, benefits and rewards. It's genuinely useful, but it's scoped to MAX-issued cards — it isn't built to aggregate a bank account and cards from other issuers into one picture, and it has no forecasting, subscription detection, or way to ask it a question.

**[Riseup](https://www.riseup.co.il/)** is the closest thing Israel has to a dedicated budgeting product: it connects to your bank accounts and cards, gives you a weekly spend target, predicts your cash-flow for the rest of the month, and backs it with a support team and community. It's a solid, well-regarded product — and also a closed-source, ₪55/month subscription (after a free trial), which puts it out of reach as something to learn from or extend.

Plux isn't trying to replace either of those for real, everyday use — it's a from-scratch exploration of the same problem space: an accurate model of how Israeli billing cycles actually work, a chat interface that can genuinely answer questions about your data instead of just charting it, and something anyone can open and click through in ten seconds without creating an account. It's free, MIT-licensed, and the entire codebase is here to read.

## Author

**Daniel Ingerman**
[LinkedIn](https://www.linkedin.com/in/deni-ing-66b1651b5/) · [GitHub](https://github.com/deni-ing) · [danielingerman1928@gmail.com](mailto:danielingerman1928@gmail.com)

## License

MIT — see [LICENSE](./LICENSE).
