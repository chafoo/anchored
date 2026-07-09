// lib/contracts/config.ts — the config capability (run module ↔ anchored.yml). Serves the
// project's verification know-how: top-level custom `fields` and the named setups
// (validator/before/after instruction blocks). A missing anchored.yml means the built-in
// defaults ARE the behavior. Interface-only.

/** Top-level custom criterion fields, record form `name: type`. */
export type FieldsConfig = Record<string, 'string' | 'number' | 'boolean'>

/** An instruction block the AGENT executes (never a harness-run command). */
export interface Instructions {
  instructions: string
}

/** The validator slot: instructions + the one opt-in hardening knob. */
export interface ValidatorInstructions extends Instructions {
  /** `grounded`: this setup refuses a prose verdict — proof must be executed output.
   *  Opt-in policy; `judgment: true` criteria stay exempt. */
  require?: 'grounded'
}

/** One setup (or the defaults), flat — exactly these three slots, nothing else. */
export interface SetupConfig {
  validator?: ValidatorInstructions
  before?: Instructions
  after?: Instructions
}

export interface ConfigPort {
  /** The declared custom fields (empty record when none). */
  fields(): FieldsConfig
  /** defaults + setups[name], flat merge; no name → defaults; unknown name → throws. */
  resolve(setup?: string): SetupConfig
  /** The declared setup names (for routing + error suggestions). */
  names(): string[]
}
