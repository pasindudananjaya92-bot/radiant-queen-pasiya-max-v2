# RADIANT QUEEN · PASIYA MAX (Telegram Bot)

**Bot:** [@PasiyaMaxQueen_bot](https://t.me/PasiyaMaxQueen_bot)  
**Web:** https://radiant-queen-pasiya-max-v2.vercel.app  
**StrideClub:** https://strideclub-platform-6b71a.containers.snapdeploy.app  

Gemini-powered Telegram bot + Supabase persistence + StrideClub bridge.  
Hosted on **Vercel** (webhook). Free-tier oriented.

## Stack

- `api/telegram.js` — Telegraf webhook handler
- Supabase (Postgres) — group settings, XP, warns, notes, FAQ, todos, habits, saves
- Google Gemini — chat, vision, tools
- GitHub API — founder can upload files from private Telegram chat

## Environment (Vercel)

| Variable | Required | Notes |
|----------|----------|--------|
| `BOT_TOKEN` | yes | BotFather token |
| `GEMINI_API_KEY` | yes | Google AI |
| `ADMIN_ID` | yes | Your Telegram numeric id |
| `ADMIN_EMAIL` | optional | e.g. pasindudananjaya92@gmail.com (meta only) |
| `SUPABASE_URL` | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | |
| `GITHUB_TOKEN` | for upload | Classic/fine-grained with **Contents: Read and write** |
| `GITHUB_REPO` | optional | default `pasindudananjaya92-bot/radiant-queen-pasiya-max-v2` |
| `STRIDE_API_BASE` | optional | StrideClub base URL |

## Founder: upload file to GitHub from Telegram

1. Open **private chat** with the bot (not a group).
2. `/ghpath api/telegram.js`
3. Send the file as a **Document** (paperclip → File).
4. Or send document with caption: `gh api/telegram.js`

Only `ADMIN_ID` can do this. Token needs **Contents: Read and write**.

## Quick commands

- `/menu` `/commands` `/about` `/version`
- Runner: `/logrun` `/me` `/pace` `/habit`
- Knowledge: `/wiki` `/web` `/code`
- Group: `/setwelcome` `/antilink` `/warn` `/slow`
- Founder: `/ghpath` `/ghstatus` `/broadcast` `/admin`

## License

Private / educational project for Pasiya Max · StrideClub.
