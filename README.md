# RADIANT QUEEN · PASIYA MAX v2.9

**Bot:** [@PasiyaMaxQueen_bot](https://t.me/PasiyaMaxQueen_bot)  
**Web:** https://radiant-queen-pasiya-max-v2.vercel.app  
**StrideClub:** https://strideclub-platform-6b71a.containers.snapdeploy.app  
**Version:** v2.9-quota-safe  

Gemini-powered Telegram bot + Supabase + StrideClub bridge + GitHub founder tools.  
Hosted on **Vercel** (webhook). Free-tier oriented.

## Stack

- `api/telegram.js` — Telegraf webhook
- Supabase (Postgres) — groups, XP, warns, notes, FAQ, todos, habits, saves
- Google Gemini — chat, vision, voice, tools (**free-tier limits apply**)
- Open-Meteo — weather / forecast / sun / AQI (no key)
- open.er-api.com — currency rates (includes LKR)
- GitHub API — founder upload/list/get/log from private chat

## Environment (Vercel)

| Variable | Required | Notes |
|----------|----------|--------|
| `BOT_TOKEN` | yes | BotFather |
| `GEMINI_API_KEY` | yes | AI features |
| `ADMIN_ID` | yes | Founder Telegram numeric id |
| `ADMIN_EMAIL` | optional | meta only |
| `SUPABASE_URL` | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | |
| `GITHUB_TOKEN` | founder tools | Contents Read **and** Write |
| `GITHUB_REPO` | optional | `pasindudananjaya92-bot/radiant-queen-pasiya-max-v2` |
| `STRIDE_API_BASE` | optional | StrideClub base URL |

## Quota-safe usage

When Gemini free tier is exhausted, AI commands pause. **Non-AI still works:**

```
/ping /version /about /commands
/currency USD LKR /moon /calc 10*5
/weather Colombo /forecast Colombo /sun Colombo /aqi Colombo
/todos /habits /saves /export
/ghstatus /ghlist /sysbackup   (founder, private)
```

AI (needs quota): `/ask`, Tools panel, `/wiki` `/web` `/code` `/define` `/tr`, voice, photo/video OCR, `/quote` `/dailytip`.

## Command map

### AI & chat
`/menu` `/ask` `/quote` `/dailytip` `/help` `/status` `/id` `/today`

### Knowledge (AI)
`/wiki` `/web` `/code` `/define` `/tr` `/ocr`

### Runner
`/runxp` `/xptop` `/logrun` `/streak` `/weekly` `/badges` `/linkstride`  
`/pace` `/split` `/convert` `/challenge` `/me` `/habit` `/habits`

### Weather & time (no Gemini)
`/weather` `/forecast` `/sun` `/aqi` `/time` `/moon`

### Money & utils (no Gemini)
`/currency` `/calc` `/uuid` `/pw` `/b64` `/hash` `/roll` `/pick`

### Personal DB
`/save` `/saves` `/unsave` `/todo` `/todos` `/done` `/export`

### Group moderation
`/setwelcome` `/setrules` `/rules` `/groupinfo` `/antilink`  
`/warn` `/unwarn` `/warns` `/mute` `/unmute` `/slow` `/title` `/modcheck`  
`/note` `/notes` `/clearnote` `/stats` `/report` `/shutup` `/speak`  
`/faqset` `/faq` `/faqs`

### Founder / GitHub (private chat)
`/ghpath` `/ghstatus` `/ghlist` `/ghget` `/ghlog` `/sysbackup`  
`/admin` `/usage` `/broadcast` `/agentpulse`

### System
`/ping` `/version` `/commands` `/about` `/links`

## Founder: upload file to GitHub

1. Private chat with bot  
2. `/ghpath api/telegram.js`  
3. Send file as **Document**  
4. Or caption: `gh api/telegram.js`

## Supabase tables (summary)

`group_settings`, `rq_run_xp`, `rq_run_xp_log`, `rq_warns`, `rq_pending_joins`,  
`rq_group_notes`, `rq_group_reports`, `rq_faq`, `rq_feedback`, `rq_club_meta`,  
`rq_saves`, `rq_todos`, `rq_habits`, `rq_rate_limits`

See project chat / SQL dumps for full `CREATE TABLE` definitions.  
`chat_id` and `user_id` are **bigint** (Telegram ids).

## License

Private / educational — Pasiya Max · StrideClub.
