# Notes — Requirements

> Spec-driven requirements for a local-first task app, written in the current
> convention: each requirement is a **user story** plus **acceptance criteria in
> EARS** (Easy Approach to Requirements Syntax — “WHEN … THE SYSTEM SHALL …”).
> Functional requirements state **what** and **why**; the concrete design,
> data model, and technical frame live in the appendices.

## Introduction

**Notes** is a single-page, offline task app. A sidebar holds identity, status
filters, and the theme switch; the main area shows a horizontally centered list
of tasks. Selecting a task opens its **Markdown note** as a calm reading view.
Everything persists locally in the browser — no account, no network.

The product bar is as much about feel as function: it must look top-class and
quiet (Material 3, borderless, pastel, generous whitespace) and switch flawlessly
between light and dark. Visual specifics are in **Appendix A**, the supported
Markdown subset in **Appendix B**, and the data model in **Appendix C**. Technical
constraints are captured as non-functional requirements (§NFR).

## Requirements

### R1 — Add a task

**User story:** As a user, I want to add a task by typing a title, so that I can
capture work quickly.

1. WHEN the user submits a non-empty title, THE SYSTEM SHALL create a task with a
   unique id, status `todo`, an empty note, and creation/update timestamps, and
   persist it.
2. IF the submitted title is empty or whitespace only, THEN THE SYSTEM SHALL NOT
   create a task.
3. WHEN a task is created, THE SYSTEM SHALL place it at the top of the list, clear
   the input, and keep input focus.

### R2 — Select a task’s status

**User story:** As a user, I want to set a task’s status, so that I can track its
progress at a glance.

1. THE SYSTEM SHALL represent each task’s status as exactly one of `todo`,
   `doing`, `done`.
2. WHEN the user activates a task’s status selector and chooses a status, THE
   SYSTEM SHALL update the task’s status, persist it, and bump its update
   timestamp.
3. WHILE a task’s status is `done`, THE SYSTEM SHALL render the task with the
   muted, strikethrough treatment.
4. WHEN the user activates the status selector, THE SYSTEM SHALL NOT open the
   task’s note.

### R3 — Read a task’s note

**User story:** As a user, I want to open a task and read its note as formatted
text, so that I can see its details in a focused view.

1. WHEN the user selects a task anywhere other than its status selector, THE
   SYSTEM SHALL open a reading view showing the task title and its note rendered
   from Markdown.
2. THE SYSTEM SHALL render the note using the supported Markdown subset
   (Appendix B).
3. WHEN the user activates the back affordance, THE SYSTEM SHALL return to the
   task list.

### R4 — Edit a task

**User story:** As a user, I want to edit a task’s note and title, so that I can
keep it current.

1. WHEN the user enters edit mode, THE SYSTEM SHALL present the note’s raw
   Markdown source in an editable field.
2. WHEN the user saves the edit or leaves the field, THE SYSTEM SHALL persist the
   note, bump the update timestamp, and re-render the reading view.
3. WHEN the user edits a task’s title, THE SYSTEM SHALL persist the new title.

### R5 — Delete a task

**User story:** As a user, I want to delete a task, so that I can remove what no
longer matters.

1. WHEN the user confirms deletion of a task, THE SYSTEM SHALL remove the task and
   its note from storage and from the list.

### R6 — Filter tasks by status

**User story:** As a user, I want to filter tasks by status, so that I can focus
on what is relevant.

1. THE SYSTEM SHALL provide the filters: All, To do, Doing, Done.
2. WHEN the user selects a filter, THE SYSTEM SHALL show only tasks whose status
   matches it (All shows every task) and visibly mark the active filter.
3. IF no task matches the active filter, THEN THE SYSTEM SHALL display a calm
   empty-state message rather than an error.

### R7 — Light and dark theme

**User story:** As a user, I want a light and dark theme that remembers my choice,
so that the app suits my environment.

1. WHEN the user toggles the theme, THE SYSTEM SHALL switch between light and dark
   and persist the chosen theme.
2. WHEN the app starts, THE SYSTEM SHALL restore the persisted theme.
3. WHILE a theme is active, THE SYSTEM SHALL apply that theme’s Material 3 surface
   palette to every visible surface.

### R8 — Local persistence and resilience

**User story:** As a user, I want my tasks and preferences to survive a reload, so
that I never lose my work.

1. THE SYSTEM SHALL persist all tasks and the theme preference to the browser’s
   `localStorage`.
2. IF stored data is missing or corrupt, THEN THE SYSTEM SHALL fall back to an
   empty task list and the default theme without throwing.
3. WHEN a task operation changes state, THE SYSTEM SHALL write the change
   atomically (no partially written store).

### R9 — Safe Markdown rendering

**User story:** As a user, I want my note formatting to render correctly and
safely, so that the app is both readable and secure.

1. THE SYSTEM SHALL render each construct of the supported Markdown subset
   (Appendix B) to its correct HTML.
2. THE SYSTEM SHALL escape all user input so that any embedded HTML or script is
   inert text (no injection).
3. WHERE note content uses syntax outside the supported subset, THE SYSTEM SHALL
   render it as plain text.

## Non-functional requirements (NFR)

### NFR-1 — Visual design (Material 3)

1. THE SYSTEM SHALL style every surface using the Material 3 design tokens in
   Appendix A, referencing no raw color outside the token definitions.
2. THE SYSTEM SHALL convey separation through tonal surface levels and whitespace,
   not borders or heavy shadows; resting elements SHALL be borderless and
   shadowless.
3. THE SYSTEM SHALL use only the pastel container accents — no saturated or loud
   fills anywhere.
4. THE SYSTEM SHALL apply the typography roles of Appendix A: Inter for UI,
   Fraunces for display and titles, Newsreader for the reading body.

### NFR-2 — Layout

1. THE SYSTEM SHALL present a full-viewport layout: a left sidebar (identity,
   status filters, theme) and a main area whose task column is horizontally
   centered at `max-width: 720px` with generous side margins.
2. WHILE the viewport is narrower than 720px, THE SYSTEM SHALL collapse the
   sidebar into a slide-over opened by a menu control.

### NFR-3 — Accessibility and motion

1. WHILE the user prefers reduced motion, THE SYSTEM SHALL minimize or remove
   transitions.
2. THE SYSTEM SHALL maintain legible text contrast in both themes.

### NFR-4 — Technical constraints (the fixed frame)

1. THE SYSTEM SHALL be built on Bun + TypeScript with a framework-free DOM (no UI
   framework) — see `.claude/rules/`.
2. THE SYSTEM SHALL style via CSS custom properties (design tokens) with no CSS
   framework.
3. THE SYSTEM SHALL persist solely through the browser `localStorage` API (no
   backend, no network).
4. THE SYSTEM SHALL render Markdown with a small hand-rolled parser, not a
   third-party Markdown library.

## Out of scope

Backend or sync, accounts, multi-device, tags or multiple lists, drag-to-reorder,
attachments, due-date reminders, and full CommonMark. The surface stays small and
the craft stays high.

## Success criteria

Every functional and non-functional requirement is satisfied with concrete
evidence (real `bun test` output for logic; browser-observed result for DOM and
visual criteria), in **both** light and dark themes, with no console errors, and
the app makes a calm, high-end impression on first open.

---

## Appendix A — Design reference

> The concrete realization of NFR-1/2. Define the colors as CSS custom properties
> on `:root` (light) and override on `[data-theme="dark"]`.

### Color — light (`:root`)

| Token | Value | Use |
| --- | --- | --- |
| `--md-sys-color-surface` | `#FCFBFE` | main background |
| `--md-sys-color-surface-container-low` | `#F7F4FC` | sidebar |
| `--md-sys-color-surface-container` | `#F2EEF8` | resting task row |
| `--md-sys-color-surface-container-high` | `#ECE8F4` | hover / composer |
| `--md-sys-color-surface-container-highest` | `#E6E2EF` | pressed / `done` chip |
| `--md-sys-color-on-surface` | `#1B1B21` | primary text |
| `--md-sys-color-on-surface-variant` | `#49464F` | meta / muted text |
| `--md-sys-color-primary` | `#6750A4` | accent (sparingly) |
| `--md-sys-color-on-primary` | `#FFFFFF` | text on accent |
| `--md-sys-color-primary-container` | `#E9DDFF` | active filter, `doing` status |
| `--md-sys-color-on-primary-container` | `#21005D` | text on container |
| `--md-sys-color-secondary-container` | `#E8DEF8` | `todo` status, subtle chips |
| `--md-sys-color-tertiary-container` | `#FFD8E4` | optional soft accent |
| `--md-sys-color-outline-variant` | `#CBC4CF` | rare hairline only |
| `--md-sys-shadow` | `rgba(28,27,33,.08)` | soft hover shadow |

### Color — dark (`[data-theme="dark"]`)

| Token | Value |
| --- | --- |
| `--md-sys-color-surface` | `#131218` |
| `--md-sys-color-surface-container-low` | `#1B1A21` |
| `--md-sys-color-surface-container` | `#1F1E25` |
| `--md-sys-color-surface-container-high` | `#2A2830` |
| `--md-sys-color-surface-container-highest` | `#35323B` |
| `--md-sys-color-on-surface` | `#E6E1E9` |
| `--md-sys-color-on-surface-variant` | `#CAC4CF` |
| `--md-sys-color-primary` | `#CFBDFE` |
| `--md-sys-color-on-primary` | `#381E72` |
| `--md-sys-color-primary-container` | `#4F378A` |
| `--md-sys-color-on-primary-container` | `#E9DDFF` |
| `--md-sys-color-secondary-container` | `#332D41` |
| `--md-sys-color-tertiary-container` | `#633B48` |
| `--md-sys-color-outline-variant` | `#49454E` |
| `--md-sys-shadow` | `rgba(0,0,0,.40)` |

**Status treatments:** `todo` → `secondary-container` (neutral) · `doing` →
`primary-container` (soft violet) · `done` → `surface-container-highest` + a check,
plus the strikethrough/muted row treatment (R2.3).

### Typography

Three families from Google Fonts, each with a job: **Inter** (variable) for all UI
and short text; **Fraunces** (optical) for the wordmark, display, and note titles;
**Newsreader** for the Markdown reading body.

| Token | Family | Size/Line | Weight | Use |
| --- | --- | --- | --- | --- |
| `--type-display` | Fraunces | 40 / 48 | 420 | empty state, big title |
| `--type-wordmark` | Fraunces | 24 / 30 | 500 | sidebar “Notes” |
| `--type-headline` | Fraunces | 28 / 36 | 460 | note title (reading view) |
| `--type-title` | Inter | 16 / 24 | 600 | section labels |
| `--type-body` | Inter | 16 / 24 | 450 | task titles, UI |
| `--type-meta` | Inter | 13 / 18 | 450 | dates, counts (muted) |
| `--type-label` | Inter | 14 / 20 | 550 | buttons, filter pills |
| `--type-reading` | Newsreader | 18 / 30 | 400 | rendered Markdown body |

### Shape, spacing, motion

- **Shape:** `--radius-sm 8px`, `--radius-md 12px`, `--radius-lg 20px`,
  `--radius-xl 28px`, `--radius-full 999px`. Rows/cards use `--radius-lg`; the
  composer and pills use `--radius-full` or `--radius-md`.
- **Spacing scale:** `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. The centered column
  breathes — never cramped.
- **Motion:** easing `cubic-bezier(0.2,0,0,1)`; durations 150ms (state), 250ms
  (enter), 350ms (view transition); honored against `prefers-reduced-motion`.

### Layout sketch

```
┌───────────────┬───────────────────────────────────────────────┐
│  SIDEBAR 280  │  MAIN  (surface)                               │
│  surface-     │                                               │
│  container-low│        ┌───────────── 720px ─────────────┐    │
│               │        │  ⌁ New task… (composer field)    │    │
│  ✶ Notes      │        ├──────────────────────────────────┤    │
│  (wordmark,   │        │  ○ To do  Draft the launch post  │    │
│   Fraunces)   │        │  ◐ Doing  Call the printer       │    │
│               │        │  ✓ Done   Buy stamps             │    │
│  All          │        │  …                               │    │
│  To do        │        └──────────────────────────────────┘    │
│  Doing        │        (centered, lots of side whitespace)     │
│  Done         │                                               │
│  ──────────   │                                               │
│  ☀ / ☾ theme  │                                               │
└───────────────┴───────────────────────────────────────────────┘
```

Reading view: selecting a task replaces the list with a centered `max-width:
680px` column — a back affordance top-left, the note title as a Fraunces headline,
a meta line, then the rendered Markdown in the reading serif. An edit toggle swaps
the rendered note for a `<textarea>`.

## Appendix B — Supported Markdown subset

Render to **safe** HTML (escape all input; never inject raw HTML):

- Headings `#`, `##`, `###`
- **Bold** `**…**`, *italic* `*…*`, `inline code`
- Fenced code blocks ```` ``` ````
- Unordered (`- `) and ordered (`1. `) lists
- Links `[text](url)` (http/https only; `rel="noopener"`)
- Blockquote `> `
- Horizontal rule `---`
- Paragraphs / line breaks

Anything outside this subset degrades to plain text (R9.3).

## Appendix C — Data model (`localStorage`)

```ts
// key: "notes.tasks.v1"
type Store = { tasks: Task[] }
type TaskStatus = "todo" | "doing" | "done"   // new tasks → "todo"
type Task = {
  id: string          // crypto.randomUUID()
  title: string
  status: TaskStatus
  note: string        // Markdown source ("" until first edit)
  createdAt: number   // Date.now()
  updatedAt: number
}

// key: "notes.theme.v1"  ->  "light" | "dark" | "system"
```

Reads tolerate missing/corrupt data (R8.2); writes replace the whole `Store`
atomically (R8.3).
