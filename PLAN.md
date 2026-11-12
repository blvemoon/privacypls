# Plan: Milestone 1 (core app)

This plan was written before the code, as Section 9 of the brief asks. Because the build ran unattended overnight, it was not reviewed before coding started. Anything below can be changed. Mark up what you disagree with and the code will follow.

## Stack

| Part | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js 22.9 or newer (built and tested on Node 22.23; Node 20 reached end of life in April 2026) | The DreamHost Node.js template ships with Node, PM2 and Nginx |
| Web server | Express 5 | Small, very widely used, easy to read |
| AI | Official Anthropic SDK (`@anthropic-ai/sdk`) | Model is one setting: `MODEL=claude-haiku-5-5` |
| Reading web pages | Node's own `http`/`https` with a custom address check, plus `cheerio` to pull text out of HTML | Lets us block private addresses on every hop, including redirects |
| Bot check | ALTCHA (`altcha` widget + `altcha-lib`), self-hosted | Proof-of-work in the visitor's browser; no third-party scripts, cookies, or requests |
| Security headers | `helmet` | Strict content security policy: only this site's own scripts and styles |
| Storage | One small JSON file (`data/usage.json`) holding daily token and cost totals | No database needed yet; no submitted text, URLs, or visitor data is ever stored |

No front-end framework: plain HTML, CSS, and one small JavaScript file. Pages are built on the server so the footer, links, and settings stay consistent.

Seven runtime packages in total (checked on the npm registry on Nov 12, 2026: all maintained, MIT or Apache-2.0, published from their official GitHub repositories, and `npm audit` reports 0 vulnerabilities).

## File structure

```
config/rules.json        Red-flag rules and good signs (edit without touching code)
config/pricing.json      Token prices per model, used for cost tracking and the budget
src/server.js            Starts the app
src/app.js               Routes and request handling
src/config.js            Reads and checks environment variables
src/lib/safeFetch.js     Fetches a URL safely (address checks, timeouts, size cap)
src/lib/extract.js       Turns HTML into readable text
src/lib/chunk.js         Splits long text into pieces under the token limit
src/lib/analyzer.js      Sends text to Claude, validates the JSON, verifies quotes, merges results
src/lib/quotes.js        Checks that each quote really appears in the source text
src/lib/rules.js         Loads and checks the rules file
src/lib/budget.js        Monthly spending limit (reserves an estimate before each call)
src/lib/usageStore.js    Daily and monthly token and cost totals (the "data layer")
src/lib/rateLimit.js     One analysis per visitor per interval, in memory only
src/lib/botCheck.js      ALTCHA challenge and verification
src/views/               Page templates (home, privacy, about, feedback, errors)
public/                  CSS, the browser script, and the theme switcher
samples/                 8 sample texts (concerning, benign, and tricky) with expected results
scripts/usage-report.js  Prints daily and monthly AI spending
scripts/compare-models.js Runs the samples through Haiku and Sonnet and prints flags, quotes, and cost
test/                    Automated tests (no API key needed; Claude is simulated)
deploy/                  Nginx config, PM2 config
docs/DEPLOY.md           Copy-paste server setup and deploy commands
docs/MAINTENANCE.md      Monthly upkeep guide
```

## How the rules config works

`config/rules.json` holds a list of rules. Each has an `id`, a `name`, `lookFor` (the plain-English description from the brief), and a `severity` (High, Medium, or Low). A rule can also allow one escalation, for example tracking goes from Medium to High when no opt-out is offered. A separate `goodSigns` list tells the model what not to flag. The app checks the file when it starts and refuses to start with a clear message if something is malformed. Restart the app after editing (`pm2 restart privacypls`).

## How an analysis works

1. The visitor submits a URL or pasted text. The browser has already solved the ALTCHA puzzle; the hidden honeypot field must be empty; the password must match if the password gate is on.
2. Rate limit: one AI analysis per visitor every 120 seconds (setting). The visitor is identified by a keyed hash of their IP address that lives only in memory and is forgotten after the interval. The hash key itself is replaced every 6 hours.
3. For a URL: fetch the page (http/https only, ports 80/443, every address checked against private and internal ranges, up to 5 redirects each re-checked, 10-second timeout, 2 MB cap), then extract the readable text.
4. Text cap: 150,000 characters (setting). Longer text gets a friendly message.
5. Long text is split into pieces of about 60,000 characters, so every request stays far under the 100,000-token price threshold.
6. Budget check: an estimated cost is reserved against the monthly limit ($18 by default) before calling Claude, so several requests at once cannot overshoot.
7. Claude returns its findings through a forced tool call (structured JSON). The app validates every field, then checks each quote against the source text. Flags whose quote cannot be found are dropped.
8. Results from all pieces are merged and duplicates removed. If there was more than one piece, one short extra call writes the combined summary.
9. The overall risk level is computed by code, not by the model: **High** if any High-severity flag has Medium or High confidence; **Medium** if there is any other High or Medium flag, or three or more Low flags; otherwise **Low**.
10. Token counts and the actual cost are added to the day's totals. The text, the URL, and anything about the visitor are discarded when the response is sent.

## Assumptions (please check these)

1. **Plan review was skipped** because the build ran unattended. You review the plan and code together.
2. **"Add your own" rule rows** were left out (they were empty).
3. **No JavaScript rendering**: plain HTML fetching only, per the brief's italic default. Sites that build their page with JavaScript will show a friendly "couldn't read this page, paste the text instead" message.
4. **Tracking rule severity**: Medium by default; the model may raise it to High only when no opt-out is offered.
5. **Bot check**: ALTCHA, self-hosted.
6. **Password gate** works without cookies: the password is typed on the page and checked with each analysis request. The pages themselves stay viewable; only the analysis (the part that costs money) is locked. This keeps the "no cookies" promise true.
7. **Theme choice** is saved in the browser's own storage (not a cookie, never sent to the server). The privacy page says so.
8. **Budget month** is the calendar month in UTC.
9. **Quotes that cannot be verified are dropped**, not shown with a warning.
10. **"Good signs" are only used to stop over-flagging.** They are not shown in the results, since Section 4 asked for the defaults only.
11. **Analytics (Umami) is not in this milestone.** It is a Milestone 3 item in the roadmap, so the privacy page currently says the site uses no analytics. It must be updated when Umami is added.
12. **Server access logs**: the Nginx config logs time, method, path (without query strings), status, and size, and no IP address. Nginx's own request limiting uses visitor addresses in memory only.
13. **Port 3000 on localhost** for the app, behind Nginx.

## Ready for Milestone 2 (policy cache)

The analysis pipeline is split into separate steps: fetch, extract, fingerprint, analyze. Every result already carries a SHA-256 fingerprint of the analyzed text, which is what the cache needs for its freshness check. The cache can wrap the URL path without changing the analyzer. Storage lives behind small modules in `src/lib/`, so a SQLite cache file can be added next to the usage file without touching visitor-facing code. It must be kept separate from anything that could hold visitor information, as the brief requires.

## Not done in Milestone 1 (and why)

- **Deployment**: the server isn't bought yet. `docs/DEPLOY.md` has every command.
- **Real API calls**: there's no API key yet. All tests simulate Claude. `npm run compare` runs the real Haiku vs Sonnet check once a key exists.
- **Analytics, the pre-launch checklist, and testing on 10 real policies**: these are Milestone 3 items.
