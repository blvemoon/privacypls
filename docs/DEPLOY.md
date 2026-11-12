# Deploying to Vercel (Hobby plan)

Everything here is done in web dashboards, except two optional commands at the end. Budget about 30 to 45 minutes the first time. Once it's set up, **merging a pull request on GitHub deploys the site automatically.**

---

## 0. Before you start

- [ ] An Anthropic API key (console.anthropic.com → API keys).
- [ ] **A monthly spend limit set in the Anthropic Console** (Settings → Limits). The app has its own limit, but the Console limit is the backstop that code can't set for you.
- [ ] Decide your app limit (`MONTHLY_BUDGET_USD`). Set it a little below the Console limit, to leave room for estimate differences.

## 1. Create the Vercel project

1. Go to vercel.com and sign up with **Continue with GitHub**. Choose the **Hobby** plan.
2. **Add New… → Project**, find `blvemoon/privacypls`, and click **Import**. If it isn't listed, click "Adjust GitHub App Permissions" and give Vercel access to the repo.
3. Vercel detects Next.js automatically. Leave the build settings as they are and click **Deploy**.

The first deploy works, but the site **refuses analyses** until steps 2 and 3 are done. That's intentional: it never runs without its protections.

## 2. Add the Redis database (Upstash, free)

1. In the project, open **Storage** → **Create Database** (or **Browse Marketplace**) → **Upstash** → **Redis**.
2. Choose the **Free** plan and a region close to you (US East is fine), and name it `privacypls`.
3. When asked which environments to connect, keep **Production, Preview, and Development** all checked.

Vercel adds the connection settings (`KV_REST_API_URL` and `KV_REST_API_TOKEN`, or the `UPSTASH_…` versions) to the project automatically.

## 3. Add the settings

**Settings → Environment Variables.** Add each one below. For every variable, keep **Production** and **Preview** checked, and turn on **Sensitive** for the secrets.

| Name | Value | Sensitive? |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Your Anthropic API key | Yes |
| `MONTHLY_BUDGET_USD` | Your monthly AI limit in dollars, number only (for example `12.50`) | No |
| `HASH_SECRET` | A long random value (see below) | Yes |
| `ACCESS_PASSWORD` | A password, while the site is for personal use. Leave it out to open the tool to everyone | Yes |
| `DONATION_URL` | Your Ko-fi link (optional) | No |

To make a random `HASH_SECRET`, run `openssl rand -hex 32` in a terminal (Mac/Linux), or use a password manager to generate a 64-character random password.

The full list of optional settings is in the README.

**Then redeploy:** settings only take effect on a new deploy. Go to **Deployments**, open the latest one, click **⋯ → Redeploy**.

## 4. Check it works

- Open your project's `.vercel.app` address. Visit `/health`; it should show `{"status":"ok"}`.
- Run one analysis on pasted text, and one on a link.
- Run a second analysis straight away. You should see the "Please wait a moment" dialog with a countdown.

## 5. Firewall rule (limits raw request floods)

Hobby allows one rate-limit rule. The app does the fine-grained limiting; this rule stops floods before they reach it.

1. Project → **Firewall** → **Configure** (or **Rules**) → **New Rule**.
2. Name it `Limit analyze`.
3. **If** Request Path **equals** `/api/analyze`.
4. **Then** **Rate Limit**: fixed window of **60 seconds**, **10 requests**, keyed by **IP address**, with the action **Deny**. (Choosing "Too Many Requests (429)" may show a Pro upgrade prompt on Hobby; Deny works on every plan.)
5. **Save**, then **Review Changes → Publish**.

## 6. Make previews private

Vercel creates a preview site for every pull request. Previews share the same monthly spending total as the live site, so only you should be able to open them.

**Settings → Deployment Protection → Vercel Authentication**: make sure it's **on** for preview deployments (Standard Protection). Then only people logged into your Vercel account can open preview links.

## 7. Your domain (privacypls.io)

1. **Settings → Domains → Add**: enter `privacypls.io`. Add `www.privacypls.io` too, and choose to redirect it to `privacypls.io`.
2. Vercel shows the DNS records to create, usually an **A** record for `privacypls.io` and a **CNAME** for `www`.
3. Create those records wherever you bought the domain (your registrar's DNS settings), and remove any old A records for the bare domain.
4. Wait for Vercel to show **Valid Configuration**. That can take from minutes to a few hours. HTTPS is set up automatically.

Then fill in the domain and DNS details in Section 5 of the brief.

## 8. Uptime monitor (free)

Create a free HTTP monitor (for example UptimeRobot or Better Stack) for `https://privacypls.io/health`, checking every 5 minutes.

---

## Updating the site

1. I push changes to a branch and open a pull request.
2. Vercel builds a **preview** for that pull request (see the link in the pull request). Try it there.
3. **Merge** the pull request on GitHub. Vercel deploys to the live site automatically within a minute or two.

## Rolling back a bad deploy

Project → **Deployments** → find the last good **Production** deployment → **⋯ → Instant Rollback** (or **Promote to Production**). The live site switches back right away. Then fix the problem in a new pull request.

## Optional: running the scripts on your computer

`npm run usage` (spending report) and `npm run compare` (Haiku vs Sonnet quality check) need your project's settings on your computer. You need Node.js 22.9 or newer.

```bash
git clone https://github.com/blvemoon/privacypls.git
cd privacypls
npm install
npm install -g vercel
vercel login
vercel link                      # choose the privacypls project
vercel env pull .env.local       # downloads the settings (secrets included; never share this file)
npm run usage
npm run compare -- --haiku       # spends a few cents; counts toward the monthly limit
```

Sensitive variables can't be downloaded. If `npm run compare` says the API key is missing, add `ANTHROPIC_API_KEY=...` to `.env.local` yourself.
