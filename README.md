# privacypls.io

A small web app that reads a privacy policy or terms of service (from a link or pasted text) and flags potentially concerning language. Every flag comes with the exact quote it's based on, a plain-language explanation, a severity, and a confidence level. Results are AI-generated potential flags, not legal advice.

- **Plan and design decisions:** [PLAN.md](PLAN.md)
- **Deploying to the DreamHost VPS:** [docs/DEPLOY.md](docs/DEPLOY.md)
- **Monthly upkeep:** [docs/MAINTENANCE.md](docs/MAINTENANCE.md)

## Reminders (things code can't do for you)

1. **Create the Anthropic API account and key**, add billing, and **set a $20 monthly spend limit in the Anthropic Console.** The app stops itself at $18, and the Console limit is the backstop.
2. **Fill in the domain and DNS details in Section 5 of the brief** once the server is set up (DEPLOY.md step 10).
3. Keep `ACCESS_PASSWORD` set while the tool is for personal use.

## Run it on your computer

You need Node.js 22.9 or newer (`node -v`).

```bash
git clone https://github.com/blvemoon/privacypls.git
cd privacypls
npm install
cp .env.example .env
```

In `.env`, set `NODE_ENV=development` and `ANTHROPIC_API_KEY=...`. In development the bot check uses a built-in test secret, so `ALTCHA_HMAC_SECRET` can stay empty.

```bash
npm start            # http://127.0.0.1:3000
npm test             # automated tests (no API key needed; Claude is simulated)
```

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Starts the app (reads `.env`) |
| `npm run dev` | Starts the app and restarts it when code changes |
| `npm test` | Runs the automated tests. No API key needed, no cost |
| `npm run usage` | Shows AI usage and estimated cost per day this month, and per month |
| `npm run compare` | Runs the 8 sample texts through **Haiku and Sonnet** with the real API, and prints flags, quotes, misses, over-flags and cost. Costs roughly $0.40. Options: `-- --haiku`, `-- --only 06` |
| `npm run check-rules` | Checks `config/rules.json` for mistakes |

## Settings (environment variables)

All settings live in `.env` (copy `.env.example`). Never commit `.env`. Restart the app after changing it (`pm2 restart privacypls` on the server).

| Setting | Default | What it does |
| --- | --- | --- |
| `NODE_ENV` | `development` | Use `production` on the server. Production refuses to start without the API key and bot-check secret |
| `ANTHROPIC_API_KEY` | (none) | Your Anthropic API key. **Secret** |
| `ALTCHA_HMAC_SECRET` | (none) | Random value for signing bot-check puzzles (`openssl rand -hex 32`). **Secret** |
| `MODEL` | `claude-haiku-5-5` | The model for all analyses. Change to `claude-sonnet-5-5` to switch |
| `ALLOWED_MODELS` | `claude-haiku-5-5,claude-sonnet-5-5` | Models the server may use per request (for the future paid "deeper analysis") |
| `MONTHLY_BUDGET_USD` | `18` | The app stops running analyses when this month's (UTC) estimated AI spend reaches this |
| `RATE_LIMIT_SECONDS` | `120` | One analysis per visitor every this many seconds |
| `MAX_CONCURRENT_ANALYSES` | `3` | More than this at once gets "We're busy, please try again shortly" |
| `ACCESS_PASSWORD` | (empty) | If set, every analysis needs this password. Empty opens the tool to everyone |
| `BOT_CHECK_ENABLED` | `true` | ALTCHA proof-of-work check. Keep on in production |
| `ALTCHA_COST` | `2000` | Puzzle difficulty |
| `MAX_TEXT_CHARS` | `150000` | Longest text accepted |
| `MIN_TEXT_CHARS` | `200` | Shortest text accepted |
| `CHUNK_CHARS` | `60000` | Long text is split into pieces this size, keeping each request far under Haiku's 100,000-token price step |
| `MAX_OUTPUT_TOKENS` | `4000` | Most the model may write per piece |
| `AI_TIMEOUT_SECONDS` | `90` | How long to wait for the AI per request |
| `DONATION_URL` | (empty) | Your Ko-fi link. Empty hides every "Support this project" link |
| `FEEDBACK_CONTACT` | (empty) | An email address or https form link. Empty hides the Feedback link and page |
| `FETCH_TIMEOUT_SECONDS` | `10` | Time limit for fetching a page |
| `FETCH_MAX_BYTES` | `2097152` | Largest page fetched (2 MB) |
| `FETCH_MAX_REDIRECTS` | `5` | Redirects followed |
| `SITE_NAME` / `SITE_URL` | `privacypls.io` | Shown on the pages |
| `HOST` / `PORT` | `127.0.0.1` / `3000` | Where the app listens (Nginx forwards to it) |
| `DATA_DIR` | `data` | Where usage totals are stored |
| `RULES_FILE` / `PRICING_FILE` | `config/...` | Rules and price files |
| `PRIVACY_LAST_UPDATED` | `November 12, 2026` | Date shown on the privacy page. Change it whenever that page changes |

## Editing the red-flag rules

Rules live in [`config/rules.json`](config/rules.json). Each rule has:

```json
{
  "id": "data-sold-shared",            // lowercase letters, numbers, dashes; must be unique
  "name": "Data sold or shared",       // shown to visitors
  "lookFor": "Language saying ...",    // what the AI looks for, in plain English
  "severity": "High",                  // High, Medium, or Low
  "escalation": { "to": "High", "when": "no opt-out is offered" }   // optional
}
```

`goodSigns` lists language the AI should treat as reassuring, so it doesn't over-flag. (JSON doesn't allow comments; the `//` notes above are only for this README.)

After editing, run `npm run check-rules`, then restart the app.

**How the overall risk level is set** (by code, not by the AI): **High** if any High-severity flag has Medium or High confidence. **Medium** if there is any other High or Medium flag, or three or more Low flags. **Low** otherwise.

## Costs

- Every analysis records its token counts and estimated cost in `data/usage.json`, as daily totals with no text, links, or visitor information. See them with `npm run usage`.
- Prices are in `config/pricing.json` (checked November 12, 2026: Haiku 5.5 is $0.10 / $0.50 per million tokens up to 100k-token prompts, Sonnet 5.5 is $2 / $10). Update it if Anthropic changes prices.
- Before each AI call, the app reserves a deliberately high cost estimate against the monthly limit, so simultaneous requests can't overshoot it.

## Privacy: what the app does and doesn't keep

- Submitted text, fetched pages, and links are held in memory only while the analysis runs, then discarded. They are never logged.
- Rate limiting uses a keyed hash of the visitor's IP. It's kept in memory only, forgotten after the interval, and the key changes every 6 hours.
- No cookies. Theme choice is stored in the visitor's own browser.
- Nginx access logs (see `deploy/nginx-privacypls.conf`) record no IP addresses or query strings.
- No analytics yet. When analytics is added (Milestone 3), update the privacy page first.

If you change what the app does, update `src/views/pages.js` (the privacy page) and `PRIVACY_LAST_UPDATED` to match.

## Project layout

```
config/       Rules and prices (edit without touching code)
src/          Server code (app.js has the routes; lib/ has the parts; views/ has the pages)
public/       CSS and browser JavaScript
samples/      8 sample policies and their expected results
scripts/      usage report, model comparison, rules check
test/         Automated tests
deploy/       Nginx, PM2, and update script
docs/         Deployment and maintenance guides
```

## Pre-launch checklist (before sharing the site publicly)

- [ ] $20 spend limit set in the Anthropic Console
- [ ] `npm run compare` run, and Haiku judged good enough (or `MODEL` switched to Sonnet)
- [ ] Rate limiting tested on the live site (a second analysis within 2 minutes is refused)
- [ ] Monthly limit tested (temporarily set `MONTHLY_BUDGET_USD=0`, check the message, set it back)
- [ ] Bot check on (`BOT_CHECK_ENABLED=true`) and the password gate off (`ACCESS_PASSWORD` empty) when going public
- [ ] Health check monitored by an uptime service
- [ ] Analytics working (Milestone 3), and the privacy page updated to mention it
- [ ] Donation link set (or intentionally empty)
- [ ] Privacy policy page live, linked from the footer and near the input box, and reviewed
- [ ] The site's own privacy policy run through the tool, with no High-severity flags
- [ ] Tested on at least 10 real policies
