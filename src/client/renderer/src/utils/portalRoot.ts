/**
 * Returns a dedicated DOM container for React portals.
 * Using a single container per role (instead of document.body directly) prevents
 * React's reconciler from throwing 'removeChild' errors when multiple portals
 * share document.body as their container in the same commit batch.
 */
export function getPortalContainer(id: string): HTMLElement {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    // Ensure the container is visually inert until a portal renders into it.
    el.style.position = 'fixed';
    el.style.zIndex = '9000';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '0';
    el.style.height = '0';
    // No pointer-events override — let children control their own pointer events
    document.body.appendChild(el);
  }
  return el;
}
