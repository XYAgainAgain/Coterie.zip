import type { Item } from './types';

export const CONTAINER_TAG = 'Container';

/* Container-ness reads the Container tag OR the legacy flag; the two are kept in sync. */
export function isContainerItem(it: Item): boolean {
  return it.isContainer || it.tags.some(t => t.base === CONTAINER_TAG);
}

/* Root plus every item nested beneath it, walked breadth-first within one store. The
   visited set keeps a malformed containerId cycle from hanging the walk. */
export function collectSubtree(items: Item[], rootId: string): Item[] {
  const root = items.find(i => i.id === rootId);
  if (!root) return [];
  const out: Item[] = [root];
  const seen = new Set<string>([rootId]);
  for (let i = 0; i < out.length; i++) {
    for (const child of items) {
      if (child.containerId === out[i].id && !seen.has(child.id)) {
        seen.add(child.id);
        out.push(child);
      }
    }
  }
  return out;
}

/* True if candidateId sits anywhere inside ancestorId's subtree. Walks up from the
   candidate, so it's the nest cycle guard: you can't drop a container into its own contents. */
export function isDescendant(items: Item[], ancestorId: string, candidateId: string): boolean {
  let cid: string | null = candidateId;
  const seen = new Set<string>();
  while (cid && !seen.has(cid)) {
    seen.add(cid);
    const node = items.find(i => i.id === cid);
    if (!node || node.containerId === null) return false;
    if (node.containerId === ancestorId) return true;
    cid = node.containerId;
  }
  return false;
}
