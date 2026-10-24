# PasiyaOS / Radiant Queen — Status Update (v3000 Phase B)

## Sealed foundations
- **v2000:** Powerhouse, Echo X (ironclad), Omniscient Architect, Chronos-V, ghHeal, early `/ping`
- **v3000-A:** `/expect` live contracts on Supabase `rq_expect_rules` (persistent)

## Phase B
- Architect `/retest` merges DB expect rules automatically
- `/debug file lib/x.js :: problem` — fetch from GitHub + optional `apply` push

## Key commands
| Command | Purpose |
|---------|---------|
| `/expect /echo :: must include twin` | Add contract |
| `/expect list` / `/expect doctor` | Inspect persistence |
| `/architect retest /echo` | Contract + DB rules |
| `/debug file lib/foo.js :: …` | Diagnose file |
| `/debug file lib/foo.js :: apply :: …` | Surgical push |
| `/architect unlock /cmd` | Clear lockdown |

## Stack
Telegram + Vercel (≤12 functions) + Supabase + GitHub API · Founder-only heavy ops

## Safety
- Balance gate before auto-push
- No long Vercel waits inside serverless (push + return)
- Lockdown after repeated failed god-loops
