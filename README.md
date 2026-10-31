# Radiant Queen · PasiyaOS (Pasiya Max)

**Status: PRODUCTION STABLE · Seal Freeze (Agent-16)**

Telegram-first OS: bot + Hull A/B workers + Mini Apps (Desktop / Phone / Builder / Hub).

## Stack (100% free-tier oriented)

- **Bot / Hull A:** Vercel serverless (`api/telegram.js`, `api/cron.js`, … ≤12 functions)
- **Hull B:** separate Vercel project (`hull-b/`) for heavy jobs
- **Data:** Supabase (Postgres, optional pgvector)
- **AI:** Groq → Gemini → OpenRouter cascade
- **Search:** Tavily + Jina fallback
- **Social Path-A:** Telegram channel queue + Make webhook + optional Facebook Page token

## Quick commands

| Area | Commands |
|------|----------|
| Health | `/ping` · `/debug doctor` · `seal` · `prod status` · `cron health` |
| Hull | `hull status` · `/hulljobs` · `swarm schedules` |
| Repo | `repos` · `repo write path \| content` · `confirm repo write` |
| Skills | `skill hash …` · `skill httpget https://…` |
| Social | `social post …` · `social fbcheck` · `social digest` |
| Agent | `macro seal-check` · `resume help` |

## Mini App

| URL path | Purpose |
|----------|---------|
| `/bot/hub.html` | Stable hub + deep links (**start here**) |
| `/bot/desktop.html` | PasiyaOS desktop |
| `/bot/phone.html` | PasiyaPhone |
| `/bot/build.html` | Builder Robot |

Telegram: open Mini App → Hub, or set menu button to hub URL.

## Seal Freeze

After Agent-15/16 full checkup (100% pass):

- Prefer **use-only** for 24–48h before new mega features
- Batch uploads; one Redeploy when possible (Hobby deploy/day limit)
- Prometheus auto-fix stays **OFF** (safe)
- `/debug` routes are AI-blocked (inline gate)

## Architecture notes

- **No** new serverless files without checking the 12-function Hobby limit
- Heavy work → Hull B queue (`HULL_MODE=queue`)
- Founder-only for destructive / deploy / repo write confirms

## License / ownership

Private founder project · single-user operation · not a public multi-tenant SaaS.
