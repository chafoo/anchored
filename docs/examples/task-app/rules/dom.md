# DOM construction: createElement, never innerHTML

Always build DOM nodes with `document.createElement` + `append`/`appendChild`
and set text via `.textContent`. **Never** use `innerHTML` to inject
user-provided content — it is an XSS hole.

Acceptable:
```ts
const li = document.createElement("li");
li.textContent = task.title; // safe — escapes automatically
container.append(li);
```

Not acceptable:
```ts
container.innerHTML = `<li>${task.title}</li>`; // XSS hole
```

To clear a container, use `replaceChildren()` (or loop with `removeChild`),
not `innerHTML = ""`.

This matters most in the **Markdown renderer**: the parser must emit
`createElement` nodes for every token and assemble a `DocumentFragment` — it may
**never** assign `innerHTML` anywhere in its call path.

**Why:** task titles, Markdown bodies, and other user-entered content are untrusted
input. Modeling secure DOM construction as the default prevents injection bugs
from appearing in the first place.

**Applies to:** any `.ts` file that creates DOM elements.
