/**
 * Bootstrap der Base-Dependency `config`.
 * Lädt + merged anchored.default.yml (Framework-Basis) mit <project>/anchored.yml
 * (User-Deltas) → effectiveConfig. Einmal beim Start; als deps.config injiziert.
 * in: projectRoot · out: deps { config, ops, spawn, ... }
 * TODO(pure-engine).
 */
export {}
