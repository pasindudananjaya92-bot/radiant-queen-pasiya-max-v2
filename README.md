# RADIANT QUEEN • PASIYA MAX v2.3

Gemini-powered Telegram bot + web chat on **Vercel**, with **Supabase** group tools, Runner XP, and a live **StrideClub** bridge (Agent 6).

## Live links
- **Bot:** https://t.me/PasiyaMaxQueen_bot
- **Web:** https://radiant-queen-pasiya-max-v2.vercel.app
- **StrideClub:** https://strideclub-platform-6b71a.containers.snapdeploy.app
- **Repo:** https://github.com/pasindudananjaya92-bot/radiant-queen-pasiya-max-v2

## Stack
| Layer | Tech |
|--------|------|
| Webhook | Vercel serverless (`api/telegram.js`, `api/chat.js`) |
| Bot framework | Telegraf |
| AI | Google Gemini (`@google/genai`) |
| Database | Supabase Postgres |
| Club hub | StrideClub on SnapDeploy |

## Agent story (6)
**Web (StrideClub):**
1. Pasiya AI Coach  
2. Community Moderator  
3. Events & Reminders  
4. Data Sync  
5. Social Poster  

**Telegram (this bot) = Agent 6** — moderation, XP, tips, and bridge status via `/stride`.

## Commands

### Everyone
| Command | Description |
|---------|-------------|
| `/start` `/menu` `/help` | Menu & help |
| `/ask` | Ask Gemini AI |
| `/social` | Official links |
| `/status` `/id` | Status / your Telegram ID |
| `/runxp` | Your runner XP & level |
| `/xptop` | XP top 10 |
| `/logrun [note]` | Honor log (+3 XP) |
| `/stride` | StrideClub health + leaderboard |
| `/stride agents` | List all 6 agents |
| `/dailytip` | AI running tip |
| `/rules` | Group rules |

### Group admins
| Command | Description |
|---------|-------------|
| `/setwelcome <text>` | Welcome message → Supabase |
| `/setrules <text>` | Group rules → Supabase |
| `/groupinfo` | Group + settings snapshot |
| `/antilink on\|off` | Block links for non-admins |
| `/warn` (reply) | Warn user; auto-mute at 3 |
| `/unwarn` (reply) | Remove one warn + unmute |
| `/modcheck` | Permission / health check |
| `/runxp 5` (reply) | Award XP to a member |

### Founder only
| Command | Description |
|---------|-------------|
| `/usage` | Groups + rate-limit snapshot |
| `/broadcast <text>` | Message all configured groups |
| `/admin` | Founder panel |

## Supabase tables (main)
- `group_settings` — welcome, rules, anti-link flags  
- `rq_warns` — warn counts  
- `rq_pending_joins` — join captcha  
- `rq_rate_limits` — AI rate limits  
- `rq_run_xp` / `rq_run_xp_log` — runner XP  

## Environment variables (Vercel)
```text
BOT_TOKEN=
GEMINI_API_KEY=
ADMIN_ID=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GITHUB_TOKEN=          # optional
GITHUB_REPO=           # optional
STRIDE_API_BASE=https://strideclub-platform-6b71a.containers.snapdeploy.app
```

## Notes
- Vercel is **serverless** — prefer one-shot commands (`/setwelcome`, `/antilink`, `/logrun`) over multi-step memory alone.
- Official **Telegram Bot API** only (no deleted-message recovery / view-once capture).
- StrideClub may **sleep** on free hosting; open the site to wake, then `/stride`.
- Phase A: Runner XP + Stride bridge + daily tip.  
- Phase B: `/stride agents`, `/logrun`, `/broadcast`.

## License
Private project — Pasiya Max / RADIANT QUEEN.
