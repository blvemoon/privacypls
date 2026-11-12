# Monthly maintenance (about 15 to 30 minutes)

Most upkeep is automatic:

| What | Handled by |
| --- | --- |
| Security updates for the operating system | `unattended-upgrades` (daily) |
| App restarts after a crash or reboot | PM2 (`pm2 startup` + `pm2 save`) |
| HTTPS certificate renewal | Certbot's timer (twice a day) |
| Log cleanup | `pm2-logrotate` (app logs) and logrotate (Nginx logs, 14 days) |
| Overspending | The app's $18 monthly limit, plus the $20 Anthropic Console limit |

Once a month, log in (`ssh <username>@<server-ip>`) and work through this list.

## 1. Is everything running? (2 minutes)

```bash
sudo -u privacypls -i pm2 status          # privacypls should be "online"
curl -s http://127.0.0.1:3000/health      # {"status":"ok"}
uptime                                     # "load average" under 2 is fine on 2 vCPUs
```

## 2. Spending (3 minutes)

```bash
sudo -u privacypls -i bash -c 'cd ~/app && npm run usage'
```

- Compare with the Anthropic Console (Usage page). They should be close. The app's numbers are estimates from token counts.
- If spend reached about **$16** (80% of the budget), look for abuse: a sudden jump in analyses on one day usually means bots. Consider turning on `ACCESS_PASSWORD` or raising `RATE_LIMIT_SECONDS`.
- Log the month's actual amounts in the Budget doc's monthly tracker.

## 3. Disk and memory (2 minutes)

```bash
df -h /            # "Use%" should be well under 80%
free -h            # "available" memory should be well above 500M
du -sh /var/log /home/privacypls/.pm2/logs
```

## 4. System updates that need a reboot (5 minutes)

```bash
sudo apt update && sudo apt list --upgradable
sudo apt -y upgrade
[ -f /var/run/reboot-required ] && echo "Reboot needed"
```

If a reboot is needed: `sudo reboot`, wait a minute, then repeat step 1.

## 5. Certificate (1 minute)

```bash
sudo certbot certificates          # "VALID: xx days" should be more than 30
```

## 6. App updates and dependencies (5 to 10 minutes)

To pull new code from GitHub:

```bash
sudo -u privacypls -i
cd ~/app && ./deploy/update.sh
exit
```

To check the app's packages for security problems:

```bash
sudo -u privacypls -i bash -c 'cd ~/app && npm audit --omit=dev'
```

If it reports problems, fix them on your own computer or with Claude Code (`npm audit fix`, run the tests, commit, push), then run `update.sh` on the server. Avoid running `npm audit fix --force` directly on the server.

### Updating Node.js (a few times a year)

```bash
node -v
sudo apt update && sudo apt install -y nodejs     # updates within the installed major version (e.g. 22.x)
sudo -u privacypls -i pm2 reload privacypls
```

Moving to a new major version (for example Node 24) is a bigger change. Test it locally first, then update the NodeSource setup line in DEPLOY.md step 5.

## 7. Prices (1 minute, or when Anthropic announces changes)

Check https://platform.claude.com/docs/en/about-claude/pricing. If Haiku or Sonnet prices changed, update `config/pricing.json` (in Git, then deploy), so the monthly limit stays accurate.

---

## Common fixes

**The site is down.**

```bash
sudo -u privacypls -i pm2 logs privacypls --lines 50
sudo systemctl status nginx
```

If the app crashed because of a settings mistake, the log names the setting. Fix `.env`, then run `sudo -u privacypls -i pm2 restart privacypls`.

**"The analysis service is temporarily unavailable" on every request.** Check the API key in `.env` and the Anthropic Console (billing, spend limit, key not revoked). The app log shows `ai_auth_problem` when the key is rejected.

**"This month's analysis limit has been reached."** That's the $18 limit working. It resets on the 1st (UTC). To raise it, change `MONTHLY_BUDGET_USD` in `.env` and restart. Stay at or under the Console limit.

**Editing the red-flag rules.** Edit `config/rules.json` (in Git, then deploy). `npm run check-rules` checks it first. `update.sh` runs that check automatically.

**Removing everything the app stores.** The app stores only `data/usage.json` (spend totals). Deleting it resets the month's spend count to $0, which also resets the budget limit, so don't do this casually.
