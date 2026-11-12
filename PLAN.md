# Plan: Milestone 1 on Vercel

**Status: approved Nov 12, 2026, with your change to the retry rules. Built on the `milestone-1-vercel` branch.**

This replaces the earlier server-based plan. Most of the earlier code carries over; what changes is where things are stored and how the site is hosted. Mark up anything you disagree with.

## Stack

| Part | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router), written in plain JavaScript | Vercel's native setup, as the brief asks. JavaScript rather than TypeScript keeps the code closer to the earlier version and easier to read |
| Hosting | Vercel Hobby (free) | Your choice. HTTPS, scaling and restarts are handled by Vercel |
| Shared storage | Upstash Redis, free plan, added through the Vercel Marketplace (`@upstash/redis`) | Your choice. Holds the rate limiter, the spending counter, the daily usage totals, and used bot-check answers |
| AI | Anthropic SDK, Claude Haiku 5.5 by default | Model is one setting (`MODEL`) |
| Reading web pages | Same safe fetcher as before (Node's own `http`/`https` with address checks) plus `cheerio` | Already built and tested; works in Vercel's Node.js functions |
| Bot check | ALTCHA, self-hosted (same as before) | No third-party scripts or cookies. Used answers are now remembered in Redis |
| Postgres (policy cache) | Not in Milestone 1 | Decided at Milestone 2, as you asked |
| Analytics | Not in Milestone 1 | Vercel Web Analytics is a Milestone 3 item |

## What carries over from the server version, and what changes

**Carries over almost unchanged:** the red-flag rules file, safe URL fetching, text extraction, splitting long text, quote checking, the analysis prompt and JSON validation, the overall-risk rule, the page wording, the dark/light theme, the 8 sample policies, and the Haiku-vs-Sonnet comparison script.

**Changes:**

| Earlier (server) | Now (Vercel) | Why |
| --- | --- | --- |
| Express routes | Next.js pages and API routes | Vercel's native setup |
| Rate limiter in memory | Redis, one key per visitor that expires on its own | Vercel runs many short-lived copies of the app that don't share memory |
| Spending total in a file | Redis | Files don't persist on Vercel |
| Daily usage totals in a file | Redis | Same |
| Bot-check replay protection in memory | Redis | Same |
| "Too many at once" counter in memory | Redis | Same |
| Spending estimate: characters ÷ 3 | Exact token count from Anthropic's free counting endpoint, plus a safety margin | Tighter and more reliable (see "The monthly limit" below) |
| Nginx, PM2, Certbot, firewall commands | Gone. One Vercel Firewall rate-limit rule, set in the dashboard | Vercel provides these |
| Monthly limit defaulted to a dollar amount | **Required setting, no built-in amount** | Keeps your budget out of the public repo |
| Copy-paste SSH deploy guide | Plain-English Vercel guide: connect GitHub, set variables, add Redis, add domain | Merging on GitHub deploys automatically |

## The monthly limit (no way around it for visitors)

You asked that visitors have no way to bypass the limit. Here is how the app enforces it:

1. **No limit set means no analyses.** If `MONTHLY_BUDGET_USD` is missing, zero, or not a number, the app refuses every analysis and shows the "limit reached" message. It never falls back to "unlimited."
2. **No Redis means no analyses.** If Redis is unreachable or out of its free quota, the app refuses analyses instead of skipping the check.
3. **The worst case is reserved before every AI call.** Before calling Claude, the app counts the exact input tokens (Anthropic's counting endpoint is free), adds a 10% safety margin, and adds the maximum the model is allowed to write in reply. That worst-case cost is reserved in Redis in a single, indivisible step: "add this, but only if the total stays under the limit." Visitors running analyses at the same moment, on different copies of the app, can't both slip under the line.
4. **The reservation is swapped for the real cost afterwards.** If the app crashes in between, the reservation stays counted, so errors can only over-count, never under-count.
5. **Visitors can't choose anything that affects cost.** The model, the reply length, and the text limit are server settings. Long text is split into pieces, and each piece reserves its own cost before it runs.
6. **Everything that spends goes through the same check,** including the Haiku-vs-Sonnet comparison script.

**What the app limit can't cover**, so the Anthropic Console limit stays essential:
- Spending from your API key used outside this app.
- Prices in `config/pricing.json` being wrong or out of date. The app's cost math depends on them.
- Small differences between Anthropic's billed amounts and the app's estimate. The safety margin covers this, and the Console limit is the final backstop.

## Other protections (same as before, now Vercel-ready)

- **Rate limit:** one analysis per visitor per interval (setting, default 120 seconds). The visitor is identified by a keyed hash of their IP address, stored in Redis with an automatic expiry. The hash key is a secret setting, changed automatically every 6 hours by mixing in the time, so old hashes can't be linked to an IP.
- **Too many at once:** a Redis counter. Over the limit gets "We're busy, please try again shortly."
- **Bot check:** ALTCHA proof-of-work in the visitor's browser. Each answer works once (remembered in Redis until it would expire anyway).
- **Honeypot field, password gate (`ACCESS_PASSWORD`), text-length cap:** unchanged.
- **Vercel Firewall:** one rate-limit rule on `/api/analyze` (Hobby allows one), set up in the dashboard. The deploy guide gives the exact steps.
- **Security headers:** strict content security policy. Next.js needs a per-request "nonce" for its own scripts, so pages are generated per request. This is fine at this scale.

## When an analysis fails

Every failure opens a **dialog box** (an accessible pop-up window). It shows what happened, what the visitor can do, and whether they can try again now. If they have to wait, it shows a live countdown and the Analyze button stays disabled until the wait is over. Whether they can retry depends on the reason:

| What went wrong | Can they retry right away? | What the dialog says (short version) |
| --- | --- | --- |
| Link isn't valid, or points somewhere private | Yes | "That isn't a public web address. Check the link." |
| Page not found, site blocks automated reading, not a web page (e.g. PDF), page has no readable text, page too large | Yes, with a different link or by pasting the text | Names the specific problem and suggests pasting the text instead |
| Pasted text too short or too long | Yes, after changing the text | States the limit and the current length |
| Bot check missing or failed | Yes | "Please complete the 'I'm not a robot' check." |
| Wrong access password | Yes | "That password isn't right." |
| Visitor already ran an analysis recently | **No: wait** | "You can run one analysis every 2 minutes," with a countdown |
| Too many people at once | **No: short wait (30 seconds)** | "We're busy, please try again shortly," with a countdown |
| The AI service is down or refused the request, **before anything was spent** | Yes | "The analysis service had a problem and nothing was charged. You can try again now." |
| Something failed **after money was already spent** (an unusable AI answer, or one part of a long document failing) | **No: normal wait** | "Something went wrong after part of the analysis had already been paid for," with a countdown. This stops one document from being re-run repeatedly at your expense |
| Monthly limit reached | **No: until next month** | "This month's analysis limit has been reached. Please try again next month." No countdown |
| Anything unexpected | Yes | "Something went wrong. Please try again." |

Rule of thumb: the visitor waits only when an analysis actually spent money, or when the site as a whole is protecting itself (busy, or monthly limit). Mistakes in what they entered never cost them a wait, because those are caught before anything is spent.

## Privacy on Vercel

- The app still never stores or logs submitted text, URLs, or IP addresses. Redis holds only expiring hashed IDs, counters, and totals.
- **Change for the privacy page:** Vercel records request details, including visitors' IP addresses, as part of running the site, under its own privacy policy. The page will say so plainly and link to Vercel's and Upstash's privacy policies. The earlier promise "server logs contain no IP addresses" goes away, since we no longer control those logs.

## File structure

```
app/                     Pages and API routes
  page.js                The analyzer page
  privacy/ about/ feedback/
  api/analyze/route.js   Runs an analysis
  api/challenge/route.js Bot-check puzzle
  health/route.js        For an uptime monitor
  components/            The form and results (browser side)
lib/                     The parts (mostly carried over)
  store.js               Redis connection (new)
  budget.js rateLimit.js usage.js botCheck.js   Now Redis-based
  safeFetch.js extract.js chunk.js quotes.js rules.js pricing.js analyzer.js
config/rules.json  config/pricing.json
samples/                 8 sample policies with expected results
scripts/                 usage report, model comparison, rules check
test/                    Automated tests (simulated Claude, in-memory Redis stand-in)
docs/DEPLOY.md  docs/MAINTENANCE.md
```

## Settings

Set in Vercel (Project → Settings → Environment Variables). Required:

- `ANTHROPIC_API_KEY`
- `MONTHLY_BUDGET_USD`, in dollars. **Required, with no default.**
- `HASH_SECRET`, a random value for visitor hashes and bot-check signing
- The Redis variables, added automatically when you connect Upstash in the Marketplace

Optional, same as before: `MODEL`, `RATE_LIMIT_SECONDS`, `ACCESS_PASSWORD`, `DONATION_URL`, `FEEDBACK_CONTACT`, `MAX_TEXT_CHARS`, and others. The README will list them all.

## Assumptions (please check)

1. **Plain JavaScript, not TypeScript.**
2. **One Redis database for everything, and one shared spending total.** Your live site, Vercel's preview deployments, local test runs, and the comparison script all count against the same monthly limit, so nothing can spend outside it. (Changed while building: separate totals per deployment would have let previews spend a second full budget.) Rate limits are kept separate per deployment. Vercel protects preview links with a login by default, so the public can't reach them.
3. **Budget month is the calendar month in UTC.**
4. **Retry rules follow "When an analysis fails" above**, changed at your request: whether the visitor can retry depends on why it failed, and a dialog explains it.
5. **Daily usage totals are kept in Redis for 400 days.** `npm run usage` reads them from your computer, after `vercel env pull` downloads the connection settings.
6. **The firewall rule is set by hand** in the Vercel dashboard (guide included), since I can't log in to your account.
7. The decisions you made on the earlier plan carry over: verified quotes only, "good signs" used only to avoid over-flagging, the overall risk computed by code, the password checked per analysis with no cookies, and the theme saved in the browser.

## Not in Milestone 1

- Deployment itself (you'll connect GitHub to Vercel; the guide walks through it)
- Real AI calls (no API key yet; tests simulate Claude)
- Postgres, the policy cache (Milestone 2), and analytics (Milestone 3)

## After you approve

I build on a new branch, `milestone-1-vercel`, run the tests and a browser check, push it, and open a pull request for your review. Nothing reaches `main` until you merge.
