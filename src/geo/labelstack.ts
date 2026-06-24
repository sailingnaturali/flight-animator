export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Greedy top-down de-collision: returns a vertical offset (>= 0) for each rect, in input order,
// such that rects sharing a column no longer overlap. Higher rects anchor in place; lower ones are
// pushed down past whatever sits above them. Used to spread clustered map labels apart.
export function stackVertically(rects: Rect[], gap = 4): number[] {
  const order = rects.map((rect, i) => ({ rect, i })).sort((a, b) => a.rect.top - b.rect.top);
  const dy = new Array<number>(rects.length).fill(0);
  const placed: Rect[] = [];

  for (const { rect, i } of order) {
    let shift = 0;
    let changed = true;
    while (changed) {
      changed = false;
      const top = rect.top + shift;
      const bottom = rect.bottom + shift;
      for (const p of placed) {
        const overlapsColumn = rect.left < p.right && p.left < rect.right;
        const overlapsRow = top < p.bottom && p.top < bottom;
        if (overlapsColumn && overlapsRow) {
          const need = p.bottom + gap - rect.top;
          if (need > shift) {
            shift = need;
            changed = true;
          }
        }
      }
    }
    dy[i] = shift;
    placed.push({ left: rect.left, right: rect.right, top: rect.top + shift, bottom: rect.bottom + shift });
  }

  return dy;
}
