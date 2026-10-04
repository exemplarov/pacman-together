/** Tiny DOM helpers — avoids innerHTML when interpolating dynamic (user) text. */

/** Escapes a string for safe interpolation into HTML text content. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Creates an element with tag, class and text content in one call. */
export function el(
  tag: string,
  className?: string,
  textContent?: string,
): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}
