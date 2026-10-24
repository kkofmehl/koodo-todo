# Koodo Todo

A private, PIN-gated todo app built for phone use. Multiple lists with colors, optional due dates, daily repeating checklists, one level of sub-items, email reminders over Gmail SMTP, and a recycle bin.

## Features

- PIN unlock once per device (HttpOnly cookie, 1 year)
- Any number of named, colored lists
- Drag lists on the home screen to change their order
- Optional due date per list
- Daily lists that keep items and clear checks each America/Chicago day
- Items with one level of sub-items
- Soft-delete with recycle bin restore / permanent delete
- Per-list daily and due-date email reminders to one app-wide address
- Installable PWA (manifest + service worker) for home-screen use on phones

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) and enter PIN `0611` (override with `PIN` in `.env`).

Data is stored in `./data/` (gitignored).

### Install as a PWA

On a phone (or desktop Chrome), open the deployed HTTPS URL, unlock with your PIN, then use the browser’s **Add to Home Screen** / **Install app** action. The app opens in standalone mode.

Localhost also works for install testing in Chrome. Regenerate icons after design changes with:

```bash
npm run icons
```

## Run tests

```bash
npm test
```

## Deploy to Fly.io

### Prerequisites

- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) installed and authenticated. On this machine, use `flyctl`; `fly` points to Concourse's CLI.
- A Fly.io account

### First-time setup

The Fly app `koodo-todo` and volume `koodo_data` (1 GB, `ord`) already exist. Set secrets and deploy:

```bash
flyctl secrets set \
  PIN=your-pin \
  APP_URL=https://koodo-todo.fly.dev \
  EMAIL_FROM="Koodo Todo <you@gmail.com>" \
  SMTP_USER=you@gmail.com \
  SMTP_PASS=lihu ctlu txyi aspr
flyctl deploy
flyctl scale count 1
```

`PIN` is required for the process to boot on Fly. SMTP secrets are optional for boot; reminders stay quiet until they are set.

The volume mounts at `/data` and stores `todos.json`.

### Subsequent deploys

```bash
flyctl deploy
```

### Useful commands

```bash
flyctl logs
flyctl ssh console
flyctl status
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `DATA_DIR` | `./data` | Directory for `todos.json` |
| `PIN` | `0611` locally | Access PIN (required on Fly) |
| `APP_URL` | `http://localhost:8080` | Public URL used in reminder emails |
| `EMAIL_FROM` | — | Sender address |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP host |
| `SMTP_PORT` | `465` | SMTP port |
| `SMTP_SECURE` | `true` | Use TLS |
| `SMTP_USER` | — | Gmail address |
| `SMTP_PASS` | — | Google App Password |
| `COOKIE_SECURE` | derived from `APP_URL` | Set `Secure` on device cookie |

### Google SMTP setup

1. Enable 2FA on the Google account.
2. Create an [App Password](https://myaccount.google.com/apppasswords).
3. Set `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` as secrets.

Reminders run in-process every ~30 seconds on the always-on machine. Daily list reminders use each list’s configured Chicago time. Due-date reminders send at 8:00 AM Chicago on the list’s due date.
