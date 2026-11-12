# privacypls.io

A small web app that reads a privacy policy or terms of service (from a link or pasted text) and flags potentially concerning language. Every flag comes with the exact quote it's based on, a plain-language explanation, a severity, and a confidence level. Results are AI-generated potential flags, not legal advice.

Built with Next.js on Vercel, Claude (Anthropic) for analysis, Upstash Redis for the spending limit and rate limiting, and Vercel Web Analytics for cookie-free visit counts.

- **Plan and design decisions:** [PLAN.md](PLAN.md)
- **Deploying to Vercel:** [docs/DEPLOY.md](docs/DEPLOY.md)
- **Monthly upkeep:** [docs/MAINTENANCE.md](docs/MAINTENANCE.md)

## Reminders (things code can't do for you)

1. **Set a monthly spend limit in the Anthropic Console.** The app enforces its own limit (`MONTHLY_BUDGET_USD`), but only the Console can stop spending from your API key used elsewhere, or from out-of-date prices in `config/pricing.json`.
2. **Fill in the domain and DNS details in Section 5 of the brief** once the domain points at Vercel (DEPLOY.md step 7).
3. Keep `ACCESS_PASSWORD` set while the tool is for personal use.

## Run it on your computer

You need Node.js 22.9 or newer (`node -v`).

```bash
git clone https://github.com/blvemoon/privacypls.git
cd privacypls
npm install
cp .env.example .env.local
```

In `.env.local`, set `ANTHROPIC_API_KEY`, set `MONTHLY_BUDGET_USD` to a small test amount, and add `USE_MEMORY_STORE=true` so you don't need Redis locally.

```bash
npm run dev          # http://localhost:3000
npm test             # automated tests (no API key needed; Claude is simulated)
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the site locally with live reloading |
| `npm run build` / `npm start` | Production build, and running it locally |
| `npm test` | Runs the automated tests. No API key, no cost |
| `npm run usage` | AI usage and cost per day this month, and spending against your limit (reads the live database; setup in DEPLOY.md) |
| `npm run compare` | Runs the 8 sample texts through **Haiku and Sonnet** with the real API, and prints flags, quotes, misses, over-flags, and cost. Spends real money, counted against the same monthly limit. Options: `-- --haiku`, `-- --only 06` |
| `npm run check-rules` | Checks `config/rules.json` for mistakes |

## Settings (environment variables)

Set them in Vercel (Project → Settings → Environment Variables), then redeploy. See [.env.example](.env.example).

| Setting | Default | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (none) | Your Anthropic API key. **Secret** |
| `MONTHLY_BUDGET_USD` | **(none, required)** | Monthly AI spending limit in dollars. Missing or invalid means every analysis is refused |
| `HASH_SECRET` | (none, required on Vercel) | Random value of at least 32 characters, for visitor hashes and bot-check signing. **Secret** |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | (added by Vercel) | Redis connection. `UPSTASH_REDIS_REST_URL`/`_TOKEN` also work |
| `ACCESS_PASSWORD` | (empty) | If set, every analysis needs this password |
| `MODEL` | `claude-haiku-5-5` | The model for all analyses. `claude-sonnet-5-5` to switch |
| `ALLOWED_MODELS` | `claude-haiku-5-5,claude-sonnet-5-5` | Models the server may use (for the future paid "deeper analysis") |
| `RATE_LIMIT_SECONDS` | `120` | One analysis per visitor every this many seconds |
| `MAX_CONCURRENT_ANALYSES` | `3` | More than this at once gets "We're busy, please try again shortly" |
| `MAX_TEXT_CHARS` / `MIN_TEXT_CHARS` | `150000` / `200` | Longest and shortest text accepted |
| `CHUNK_CHARS` | `60000` | Long text is split into pieces this size, so each request stays far under Haiku's 100,000-token price step |
| `MAX_OUTPUT_TOKENS` | `4000` | Most the model may write per piece (also used in the worst-case cost reservation) |
| `AI_TIMEOUT_SECONDS` | `90` | How long to wait for the AI per request |
| `BOT_CHECK_ENABLED` | `true` | ALTCHA proof-of-work check. Keep it on |
| `ALTCHA_COST` | `2000` | Puzzle difficulty |
| `DONATION_URL` | (empty) | Ko-fi link. Empty hides every "Support this project" link |
| `FEEDBACK_CONTACT` | (empty) | Email address or https form link. Empty hides the Feedback link and page |
| `FETCH_TIMEOUT_SECONDS`, `FETCH_MAX_BYTES`, `FETCH_MAX_REDIRECTS` | `10`, `2097152`, `5` | Limits for fetching a page |
| `PRIVACY_LAST_UPDATED` | `November 12, 2026` | Date shown on the privacy page. Change it whenever that page changes |
| `USE_MEMORY_STORE` | `false` | Local development only; ignored on Vercel |

## How the spending limit works

See "The monthly limit" in [PLAN.md](PLAN.md). In short:
- Before each AI call, the app counts the exact input tokens (Anthropic's counting endpoint is free) and reserves the worst-case cost in Redis, in one indivisible step that only succeeds if the total stays under the limit.
- Afterwards it swaps in the real cost.
- Missing settings, a missing limit, or a Redis outage all mean "refuse," never "unlimited."
- The total is shared by the live site, previews, and the scripts.

## When an analysis fails

Failures appear in a dialog that says what happened and whether the visitor can retry now. Mistakes in what they entered never cost a wait. They wait only when money was spent, when the site is busy, or when the monthly limit is reached. The full table is in [PLAN.md](PLAN.md).

## Editing the red-flag rules

Rules live in [`config/rules.json`](config/rules.json). Each rule has:

- `id`: lowercase letters, numbers and dashes; must be unique
- `name`: shown to visitors
- `lookFor`: what the AI looks for, in plain English
- `severity`: High, Medium, or Low
- `escalation` (optional), for example `{ "to": "High", "when": "no opt-out is offered" }`

`goodSigns` lists reassuring language, so the AI doesn't over-flag. Run `npm run check-rules` after editing. The tests and the build also check the file.

**Overall risk level** (set by code, not the AI): **High** if any High-severity flag has Medium or High confidence. **Medium** if there's any other High or Medium flag, or three or more Low flags. **Low** otherwise.

## Privacy: what the app keeps

- Submitted text, fetched pages, and links are held in memory only while the analysis runs, and are never logged.
- Redis holds only: hashed visitor IDs (expire after the waiting period), used bot-check answers (about 10 minutes), counters, and daily totals of analyses, tokens, and cost.
- No cookies. The theme choice is stored in the visitor's own browser.
- Vercel and Upstash keep their own standard infrastructure records; the privacy page says so and links to their policies.
- Vercel Web Analytics counts page views without cookies. Page addresses are sent without anything after `?` or `#`, and submitted text and links are never part of a page view. Turn it on in Vercel → Analytics (DEPLOY.md step 4b).

If you change what the app does, update `app/privacy/page.js` and `PRIVACY_LAST_UPDATED` to match.

## Project layout

```
app/          Pages (analyzer, privacy, about, feedback) and API routes
lib/          The parts: safe fetching, analysis, spending limit, rate limit, bot check, storage
config/       Rules and prices (edit without touching code)
samples/      8 sample policies and their expected results
scripts/      Usage report, model comparison, rules check
test/         Automated tests
docs/         Deployment and maintenance guides
proxy.js      Security policy for every page (Next.js 16 name for "middleware")
```

## Pre-launch checklist (before sharing the site publicly)

- [ ] Spend limit set in the Anthropic Console, and `MONTHLY_BUDGET_USD` set below it
- [ ] Vercel Firewall rule on (DEPLOY.md step 5), and preview deployments protected (step 6)
- [ ] Redis connected; Upstash and Vercel usage well within the free limits
- [ ] `npm run compare` run, and Haiku judged good enough (or `MODEL` switched to Sonnet)
- [ ] Rate limiting tested on the live site (a second analysis within the interval shows the wait dialog)
- [ ] Monthly limit tested on a preview (set `MONTHLY_BUDGET_USD` very low, check the message, set it back)
- [ ] Bot check on, and `ACCESS_PASSWORD` removed when going public
- [ ] Health check monitored by an uptime service
- [ ] Vercel Web Analytics enabled and showing visits (the privacy page already names it)
- [ ] Donation link set (or intentionally empty)
- [ ] Privacy policy page live, linked from the footer and near the input box, and reviewed
- [ ] The site's own privacy policy run through the tool, with no High-severity flags
- [ ] Tested on at least 10 real policies
