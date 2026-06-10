← [core](_core.md)

# spawn

Das **Ausführungs-Substrat** — die `spawn`-Dep, über die [worker-step](engine/scope/worker-step.md)
AI-Arbeit triggert. Default: headless `claude -p` pro Task-File. Ein Einzel-File.

## Was

- `spawn(worker, input)` → startet eine **frische `claude -p`-Instanz pro
  Task-File**; die Phasen dieser Task laufen *in-process* in dieser Instanz
  (Verschachtelung gedeckelt bei ~2).
- Cross-Task-Kontext (z.B. epic-log-Auszug) wird als Argument übergeben —
  `/a:plan` (task) bleibt epic-blind.
- Injizierte Naht: ein in-process Task-Subagent-Modus (Live-Progress) kann später
  als zweite Implementierung dazukommen, ohne die Runner zu ändern.

## Wie

```mermaid
flowchart LR
    loop["epic.build · loop"] -->|pro Task| s["spawn → claude -p"]
    s --> inst["frische Instanz · Phasen in-process"]
    inst --> r["Ergebnis zurück an den Loop"]
```

## Warum

Headless macht anchored autonom + CI-/cron-fähig (fire-and-forget) und ist
trivial fakebar im Test (Shell-Out). Pro Task statt pro Phase hält die Kosten +
Prozess-Tiefe im Rahmen.
