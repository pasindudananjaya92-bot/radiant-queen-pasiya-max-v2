# RADIANT QUEEN • PASIYA MAX v2.2

Gemini-powered Telegram bot + web chat on Vercel, with Supabase group settings.

## Links
- Bot: https://t.me/PasiyaMaxQueen_bot
- Web: https://radiant-queen-pasiya-max-v2.vercel.app
- StrideClub: https://strideclub-platform-6b71a.containers.snapdeploy.app
- Repo: https://github.com/pasindudananjaya92-bot/radiant-queen-pasiya-max-v2

## Stack
- Vercel serverless webhook (`api/telegram.js`, `api/chat.js`)
- Telegraf + Google Gemini (`@google/genai`)
- Supabase Postgres (welcome, anti-link, rate limits, warns)

## Group admin commands
| Command | Description |
|---------|-------------|
| `/setwelcome <text>` | Save welcome to Supabase |
| `/groupinfo` | Group + settings snapshot |
| `/antilink on\|off` | Link filter for non-admins |
| `/warn` (reply) | Warn user + count |
| `/usage` | Founder-only metrics |

## Private commands
`/start` `/menu` `/help` `/ask` `/social` `/status` `/id` `/admin`

## Env (Vercel)
- `BOT_TOKEN`, `GEMINI_API_KEY`, `ADMIN_ID`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `GITHUB_TOKEN`, `GITHUB_REPO`

## Notes
- Welcome / anti-link persist in Supabase (`group_settings`).
- Vercel is serverless: use one-shot commands (`/setwelcome`, `/antilink`) instead of multi-step memory alone.
- Official Telegram Bot API only (no deleted-message recovery / view-once capture).
 
