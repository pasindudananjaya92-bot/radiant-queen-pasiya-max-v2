# RADIANT QUEEN · PASIYA MAX — STABLE v4.0

**Brand locked.** Do not rename to RedQueen or any other brand.

| | |
|--|--|
| **Telegram bot** | [@PasiyaMaxQueen_bot](https://t.me/PasiyaMaxQueen_bot) |
| **Web OS (main site)** | https://radiant-queen-pasiya-max-v2.vercel.app |
| **Bot hub (official pages)** | https://radiant-queen-pasiya-max-v2.vercel.app/bot/ |
| **Factory studio** | https://radiant-queen-pasiya-max-v2.vercel.app/bot/studio.html |
| **StrideClub** | https://strideclub-platform-6b71a.containers.snapdeploy.app |
| **Version** | `v4.0-stable` |

Gemini-powered Telegram super-bot + web OS + Bot Factory (tenant packs) + StrideClub bridge.  
Hosted on **Vercel** (webhook + static hub). Free-tier oriented.

---

## What is live (STABLE freeze)

### Telegram (`api/telegram.js`)
- Dual menu: type **1–10** + touch buttons
- Phone / Clean / Normal UI modes
- Radiant Gold: `/balance` `/daily` `/prices`
- Free tools when AI quota rests: `/tools` weather currency calc todos habits…
- Group admin pack: welcome, anti-link, warn/mute, tagall, slow, notes, reports…
- Bot Factory: `/market` `/factoryapply` `/factorywelcome` `/factorylist`
- Public share: `/invitepack` `/invitemarket` `/sharelinks` + deep links `?start=pack_club`
- Tenant bots via `/setbot` + `api/tenant-webhook.js`
- Founder GitHub tools (private): upload/list/log

### Web hub (`public/bot/`)
- Landing, create, settings, studio
- **Sign in with Google** (Firebase `strideclub-auth-platform`)
- Authorized domain: `radiant-queen-pasiya-max-v2.vercel.app`

### Main site (`src/` React OS)
- Luxury dashboard UI (Neural / Analytics / Tools modals)
- Links to Telegram bot, Bot Hub, StrideClub

---

## Stack

| Layer | Tech |
|-------|------|
| Bot webhook | Telegraf · `api/telegram.js` |
| Tenant webhook | `api/tenant-webhook.js` |
| Database | Supabase Postgres |
| AI | Google Gemini (free tier limits) |
| Weather | Open-Meteo (no key) |
| FX | open.er-api.com |
| Auth (web) | Firebase Google Sign-In |
| Host | Vercel |

---

## Environment (Vercel)

| Variable | Required | Notes |
|----------|----------|--------|
| `BOT_TOKEN` | yes | BotFather |
| `GEMINI_API_KEY` | yes | AI features |
| `ADMIN_ID` | yes | Founder Telegram numeric id |
| `SUPABASE_URL` | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | |
| `GITHUB_TOKEN` | founder tools | Contents read+write |
| `GITHUB_REPO` | optional | `pasindudananjaya92-bot/radiant-queen-pasiya-max-v2` |
| `STRIDE_API_BASE` | optional | StrideClub base URL |
| `BOT_USERNAME` | optional | default `PasiyaMaxQueen_bot` |
| `APP_URL` | optional | `https://radiant-queen-pasiya-max-v2.vercel.app` |

---

## Quick start (users)

1. Open [@PasiyaMaxQueen_bot](https://t.me/PasiyaMaxQueen_bot) → `/start`
2. `/balance` → 400 Radiant Gold · `/daily` +50
3. `/market` → pick pack · or share `/invitepack club`
4. Web: [/bot/](https://radiant-queen-pasiya-max-v2.vercel.app/bot/) → Sign in with Google
5. Full OS UI: [main site](https://radiant-queen-pasiya-max-v2.vercel.app/)

### Deep links
```
https://t.me/PasiyaMaxQueen_bot?start=market
https://t.me/PasiyaMaxQueen_bot?start=pack_club
https://t.me/PasiyaMaxQueen_bot?start=pack_shop
https://t.me/PasiyaMaxQueen_bot?start=pack_school
https://t.me/PasiyaMaxQueen_bot?start=pack_gold
```

---

## Quota-safe note

When Gemini free tier is exhausted, AI pauses. **Non-AI still works:**  
`/ping` `/version` `/tools` `/weather` `/currency` `/calc` `/market` `/sharelinks` group admin commands.

---

## Repo map

```
api/telegram.js          Main bot (STABLE)
api/tenant-webhook.js    Tenant mini-bots
public/bot/              Official hub + Google auth
src/                     Main web OS (React)
STABLE_v4.md             Freeze notes
```

---

## Brand

**Radiant Queen · Pasiya Max** only.  
Bot username: `@PasiyaMaxQueen_bot`

© Pasiya Max · STABLE v4.0
