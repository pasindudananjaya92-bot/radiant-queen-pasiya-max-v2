# Modern Web Guidance + SemVer — Queen OS Agent Prompt Pack

Use this when generating code or ZIPs for Pasiya Max Queen OS.

## SemVer (Microsoft lesson)
- Format ideas as Major.Minor.Patch labels in release notes (e.g. 22A.0).
- Breaking command/route renames → bump major/minor label; never call them "patch".
- `god help` version string must match the ZIP wave (e.g. GOD-MODE Twin · 22A).
- First line of agent reply for a ZIP: `Version: XX — Breaking: Yes/No — What changed: ...`

## Modern Web (Google Modern Web Guidance — principles only)
- Target **Baseline 2024** (widely available) by default.
- Progressive enhancement for newer APIs; feature-detect; always provide fallback.
- Mobile-first; honor `prefers-reduced-motion`.
- Prefer native elements: `<button>`, `<a href>`, `<dialog>` when appropriate.
- Forms: real labels + autocomplete tokens; don't break autofill.
- Performance: avoid long tasks; break up main-thread work; protect INP.
- Accessibility: semantics, focus visible, meaningful alt.
- Do **not** require Chrome-only or origin-trial features.
- Do **not** require laptop `npx` / Playwright for the Founder mobile workflow.

## Queen OS safety
- Twin / invoice / deal = **drafts only** unless Founder explicitly approves later phases.
- GODMODE_AUTO default OFF.
- No silent git push; Founder uploads Grok ZIP via Telegram.
- No live Stripe send; no auto-TG to friends/customers in this wave.
