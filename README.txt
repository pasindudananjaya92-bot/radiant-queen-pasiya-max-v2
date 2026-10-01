v4.0-p1d-hotfix
Fix: broken multi-line single-quoted strings in /imagine and /notify
caused SyntaxError → whole webhook dead (buttons spin then die).

Upload: api/telegram.js replace
Caption: gh api/telegram.js
Test: /version → v4.0-p1d-hotfix then /menu /ask hi /imagine cat
