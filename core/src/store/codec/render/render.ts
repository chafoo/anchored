// parser/render.ts — createRenderer(deps): node → YAML string. Auto-injects the
// schema directive on line 1 (comments don't round-trip through the parser, so the
// renderer is the single canonical injection point). Prose → block-scalar (|).
// Pure — no FS write (that is io.ts), just the string.

export interface RendererYaml {
  stringify(value: unknown, opts?: { lineWidth?: number }): string
}
export interface RendererDeps {
  yaml: RendererYaml
  schemaUrl: (tier: string) => string
}

export interface RenderOpts {
  tier: string
}

export const defaultSchemaUrl = (tier: string): string =>
  `https://raw.githubusercontent.com/chafoo/anchored/main/plugin/references/schema/${tier}.schema.json`

export function createRenderer(deps: RendererDeps) {
  const { yaml, schemaUrl } = deps
  return {
    renderNodeYAML(node: unknown, opts: RenderOpts): string {
      const directive = `# yaml-language-server: $schema=${schemaUrl(opts.tier)}`
      // lineWidth: 0 disables wrapping (keeps long scalars intact); multiline
      // strings emit as literal block-scalars by default, key order is preserved,
      // output ends with a single newline.
      const body = yaml.stringify(node, { lineWidth: 0 })
      return `${directive}\n${body}`
    },
  }
}
