// Updating panels in place: while time runs their figures change every tick,
// and rebuilding their HTML would swallow clicks on their buttons.

/**
 * Brings `target`'s children in line with `source`'s if both have the same
 * shape (same elements in the same places), changing only text and attributes.
 * Returns false, changing nothing, if the shapes differ.
 */
export function patch(target: Node, source: Node): boolean {
  if (!sameShape(target, source)) return false;
  sync(target, source);
  return true;
}

function sameShape(a: Node, b: Node): boolean {
  if (a.childNodes.length !== b.childNodes.length) return false;
  for (let i = 0; i < a.childNodes.length; i++) {
    const x = a.childNodes[i] as Node;
    const y = b.childNodes[i] as Node;
    if (x.nodeName !== y.nodeName || !sameShape(x, y)) return false;
  }
  return true;
}

function sync(target: Node, source: Node): void {
  target.childNodes.forEach((child, i) => {
    const from = source.childNodes[i] as Node;
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent !== from.textContent) child.textContent = from.textContent;
    } else if (child instanceof Element && from instanceof Element) {
      for (const attr of Array.from(child.attributes)) if (!from.hasAttribute(attr.name)) child.removeAttribute(attr.name);
      for (const attr of Array.from(from.attributes)) {
        if (child.getAttribute(attr.name) !== attr.value) child.setAttribute(attr.name, attr.value);
      }
      sync(child, from);
    }
  });
}
