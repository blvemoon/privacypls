# Deploying to the DreamHost VPS (Stack 4)

These are copy-paste commands to run over SSH. They assume Ubuntu (DreamHost's VPS images are Ubuntu) and that you log in as a user with `sudo`. Commands that start with `sudo -u privacypls` run as the app's own user, not as root.

Anything in `<angle brackets>` is something you replace.

Budget about 45 to 60 minutes the first time.

---

## 0. Before you start

- [ ] DreamHost VPS bought (Stack 4, Node.js template). Note its **IP address** and your **SSH username**.
- [ ] An Anthropic API key (console.anthropic.com → API keys).
- [ ] A **$20 monthly spend limit set in the Anthropic Console** (Settings → Limits). The app has its own $18 limit, but the Console limit is the backstop the code can't set for you.
- [ ] An SSH key on your own computer. If you don't have one, run this **on your computer**: `ssh-keygen -t ed25519` (press Enter for the defaults).

## 1. Log in and copy your SSH key (from your computer)

```bash
ssh-copy-id <username>@<server-ip>
ssh <username>@<server-ip>
```

If `ssh-copy-id` isn't available (Windows), paste the contents of your `~/.ssh/id_ed25519.pub` into `~/.ssh/authorized_keys` on the server.

## 2. Update the server and turn on automatic security updates

```bash
sudo apt update && sudo apt -y upgrade
sudo apt install -y unattended-upgrades git curl
sudo dpkg-reconfigure -plow unattended-upgrades   # choose "Yes"
```

## 3. Firewall: allow only SSH and web traffic

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

## 4. SSH: keys only, no root login

**Do this only after step 1 works** (you can log in without typing your server password), or you can lock yourself out.

```bash
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n' | sudo tee /etc/ssh/sshd_config.d/99-privacypls.conf
sudo sshd -t && sudo systemctl reload ssh
```

Keep this session open and test a **new** SSH login from your computer before closing it.

## 5. Check Node.js and PM2

```bash
node -v      # needs v22.9 or newer
pm2 -v
```

If Node is older than 22.9, install Node 22 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

If `pm2` is missing: `sudo npm install -g pm2`

## 6. Create the app user and get the code

The app runs as its own regular user, never as root.

```bash
sudo adduser --disabled-password --gecos "" privacypls
sudo -u privacypls git clone https://github.com/blvemoon/privacypls.git /home/privacypls/app
cd /home/privacypls/app
sudo -u privacypls npm ci --omit=dev
sudo -u privacypls npm run check-rules
```

## 7. Settings (.env)

```bash
sudo -u privacypls cp /home/privacypls/app/.env.example /home/privacypls/app/.env
sudo -u privacypls chmod 600 /home/privacypls/app/.env
openssl rand -hex 32          # copy this output for ALTCHA_HMAC_SECRET
sudo -u privacypls nano /home/privacypls/app/.env
```

In the editor, set at least:

- `ANTHROPIC_API_KEY=` your key
- `ALTCHA_HMAC_SECRET=` the random value from `openssl` above
- `ACCESS_PASSWORD=` a password, while the tool is for your own use (leave empty to open it up)

Save with Ctrl+O, Enter, then exit with Ctrl+X. The full list of settings is in the README.

## 8. Start the app with PM2, and make it start after a reboot

```bash
sudo -u privacypls -i bash -c 'cd ~/app && pm2 start deploy/ecosystem.config.cjs && pm2 save'
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u privacypls --hp /home/privacypls
curl -s http://127.0.0.1:3000/health      # should print {"status":"ok"}
```

Log rotation for the app's own logs:

```bash
sudo -u privacypls -i pm2 install pm2-logrotate
sudo -u privacypls -i pm2 set pm2-logrotate:max_size 10M
sudo -u privacypls -i pm2 set pm2-logrotate:retain 14
```

## 9. Nginx

```bash
sudo cp /home/privacypls/app/deploy/nginx-proxy-snippet.conf /etc/nginx/snippets/privacypls-proxy.conf
sudo cp /home/privacypls/app/deploy/nginx-privacypls.conf /etc/nginx/sites-available/privacypls
sudo ln -sf /etc/nginx/sites-available/privacypls /etc/nginx/sites-enabled/privacypls
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

**Keep the privacy promise in the main Nginx log too.** The default `/etc/nginx/nginx.conf` has an `access_log` line that records IP addresses for any other sites. Since this server only runs privacypls, turn it off:

```bash
sudo sed -i 's#^\(\s*\)access_log /var/log/nginx/access.log;#\1access_log off;#' /etc/nginx/nginx.conf
sudo nginx -t && sudo systemctl reload nginx
```

Check that Nginx's log rotation keeps logs for 14 days or less (the privacy page says so):

```bash
grep -E 'rotate|daily|weekly' /etc/logrotate.d/nginx
```

Ubuntu's default is `daily` + `rotate 14`. If it says something longer, change it to `rotate 14`.

## 10. Point the domain at the server (DNS)

In the DreamHost panel (Domains → DNS for privacypls.io), add:

| Type | Name | Value |
| --- | --- | --- |
| A | (blank, the bare domain) | `<server-ip>` |
| A | www | `<server-ip>` |

Then fill in Section 5 of the brief with the final domain and DNS details. DNS can take from a few minutes to a few hours. Check from your computer with `nslookup privacypls.io`.

## 11. HTTPS certificate (Certbot)

Once `http://privacypls.io` loads:

```bash
sudo certbot --nginx -d privacypls.io -d www.privacypls.io --redirect
sudo certbot renew --dry-run                # checks automatic renewal works
systemctl list-timers | grep certbot        # the renewal timer should be listed
```

## 12. Check it

- Open https://privacypls.io. Run one analysis on pasted text and one on a link.
- https://privacypls.io/health shows `{"status":"ok"}`.
- `sudo tail /var/log/nginx/privacypls.access.log` shows no IP addresses.
- `sudo -u privacypls -i bash -c 'cd ~/app && npm run usage'` shows the analyses and their cost.

## 13. Uptime monitor (free)

Create a free HTTP monitor (for example UptimeRobot or Better Stack) for `https://privacypls.io/health`, checking every 5 minutes. It only requests that one page, so it doesn't affect the privacy promise.

---

## Updating to a new version

```bash
sudo -u privacypls -i
cd ~/app && ./deploy/update.sh
exit
```

## Rolling back a bad update

```bash
sudo -u privacypls -i
cd ~/app
git log --oneline -5                   # find the last good version
git checkout <good-version>
npm ci --omit=dev
pm2 reload deploy/ecosystem.config.cjs
curl -s http://127.0.0.1:3000/health
exit
```

To go back to the latest version later: `git checkout main` then `./deploy/update.sh`.

## Backups

Back up two things (both are small):

- `/home/privacypls/app/.env` (settings and keys; store it somewhere private)
- `/home/privacypls/app/data/` (AI spend totals; Milestone 2's cache will live here too)

A simple way, run from **your computer**:

```bash
scp <username>@<server-ip>:/home/privacypls/app/data/usage.json ./privacypls-usage-backup.json
```

(`.env` is readable only by the privacypls user. Copy it with `sudo cat` over SSH if you need it.)

## Rebuilding the server from scratch

Run steps 1 to 13 on the new server, then restore `.env` and `data/` before step 8.
