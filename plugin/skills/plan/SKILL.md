---
name: plan
description: Plant/strukturiert eine Arbeitseinheit. /a:plan <epic|task|phase>? <prosa|path>. Ohne Tier -> discover + classify (Empfehlung epic|task), User bestaetigt. Ruft die anchored-CLI via Bash.
---

# /a:plan

TODO. Entry-Skill fuer die plan-Stage (tier-uebergreifend).

- `<tier?>` optional; fehlt er -> `discover` sondieren, dann `classify`
  (Schwellen: <5 Phasen task / 5-9 Unabhaengigkeits-Test / >=10 epic), User bestaetigt.
- `<prosa|path>` = Ziel als Text oder Pfad.
- Mutationen ausschliesslich ueber `anchored …` (Bash) — kein direktes Edit am Node-File.

Siehe `docs/design/` im core-Repo.
