# Seal Freeze Board (Agent-16)

## Checklist (Full Checkup — PASSED)

- [x] Core: ping, debug doctor, seal, prod status, cron health
- [x] Hull: status, macros (seal-check)
- [x] Repo / skills: repos, skill hash
- [x] Social: help, post to channel + Make (FB optional)
- [x] Memory / askweb
- [x] Cron health JSON (no HTML leak)

## Freeze rules

1. No mega feature packs for 24–48h unless critical bug
2. One Redeploy per batch of file uploads
3. Keep Prometheus OFF
4. FB_PAGE_* optional until Page token is ready

## Mini App polish

- Entry: `/bot/hub.html`
- Deep links: `hub.html?go=desktop|phone|build`
- Desktop/Phone existing apps remain; hub is the stable launcher

## Bot status board

Chat: `seal` → permanent checklist through Agent-16 + freeze note
