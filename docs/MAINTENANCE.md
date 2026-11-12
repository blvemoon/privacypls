# Monthly maintenance (under 15 minutes)

Vercel handles servers, security patches, HTTPS certificates, restarts, scaling, and DDoS protection. What's left is checking usage and keeping the app's packages current.

## 1. Spending (3 minutes)

- **Anthropic Console → Usage:** this month's real cost. It should be close to the app's own count (`npm run usage`, see DEPLOY.md). Log it in the Budget doc's monthly tracker.
- If you've used **80% or more** of `MONTHLY_BUDGET_USD`, look for abuse: a sudden jump in analyses on one day usually means bots. Options: turn on `ACCESS_PASSWORD`, raise `RATE_LIMIT_SECONDS`, or tighten the Vercel Firewall rule.

## 2. Vercel usage against the Hobby limits (2 minutes)

Vercel dashboard → **Usage**. Hobby has hard limits, and going over one pauses that feature for up to 30 days. The ones that matter here are **Function Invocations** (1,000,000 a month), **Active CPU**, and **Fast Data Transfer**. If anything passes about 70%, check whether traffic is real.

## 2b. Visitors (1 minute)

Vercel dashboard → **Analytics**: page views, top pages, referrers, and countries. Hobby keeps one month of data and includes 50,000 events a month. If you're near that, collection pauses until next month (the site keeps working).

## 3. Redis usage (1 minute)

Upstash console (or Vercel → Storage → your database) → **Usage**. The free plan includes 500,000 commands and 256 MB a month. An analysis uses about 10 to 15 commands; page views use none. **If Redis runs out, the site refuses analyses** (that's the safe direction), so check this before a public launch.

## 4. Packages and Node.js (5 minutes, or when GitHub alerts you)

Turn on **Dependabot alerts** once: GitHub repo → Settings → Code security → Dependabot alerts. GitHub then emails you when a package needs a security update. When that happens, ask me (or Claude Code) to update it. You'll get a pull request: check its Vercel preview, then merge.

**Node.js:** Vercel → Settings → General → **Node.js Version**. Keep it on a supported LTS version (22.x or newer). When Vercel announces a deprecation, switch to the newer LTS and redeploy.

## 5. Prices (only when Anthropic changes them)

If Haiku or Sonnet prices change, update `config/pricing.json` in a pull request. The app's cost math, and so the monthly limit, depends on it.

---

## Common fixes

**Every analysis says "The service is temporarily unavailable."** Usually a settings problem:
- `HASH_SECRET` missing or shorter than 32 characters
- Redis not connected, or out of its free quota
Check Vercel → Logs for `setup_problem` or `storage_failed`. Fix the setting, then redeploy.

**Every analysis says "This month's analysis limit has been reached," at the start of the month.** `MONTHLY_BUDGET_USD` is missing or not a plain number. Set it (for example `12.50`, with no dollar sign), then redeploy.

**"The analysis service had a problem" on every request.** Check the API key and billing in the Anthropic Console. Vercel's logs show `ai_auth_problem` when the key is rejected.

**A deploy broke the site.** See "Rolling back a bad deploy" in DEPLOY.md.

**Editing the red-flag rules.** Edit `config/rules.json` in a pull request. The automated tests (and the build) fail if the file has a mistake, so a typo can't reach the live site.

**Resetting the month's spending count.** Don't, unless you're sure: it's what enforces the limit. If you really need to (for example, after testing), delete the key `pp:spend:YYYY-MM` in the Upstash console's Data Browser.
