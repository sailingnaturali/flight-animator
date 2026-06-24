import { describe, it, expect } from 'vitest';
import { stackVertically, type Rect } from './labelstack';

const r = (left: number, top: number, w: number, h: number): Rect => ({
  left, top, right: left + w, bottom: top + h,
});

describe('stackVertically', () => {
  it('leaves non-overlapping labels untouched', () => {
    const rects = [r(0, 0, 50, 16), r(0, 100, 50, 16)];
    expect(stackVertically(rects, 4)).toEqual([0, 0]);
  });

  it('does not nudge labels that only share a row but not a column', () => {
    const rects = [r(0, 0, 50, 16), r(200, 5, 50, 16)];
    expect(stackVertically(rects, 4)).toEqual([0, 0]);
  });

  it('pushes a colliding label below the one above it', () => {
    // both in the same column; second overlaps the first vertically
    const rects = [r(0, 0, 50, 16), r(0, 5, 50, 16)];
    const dy = stackVertically(rects, 4);
    // first (higher) stays; second shifts to clear: prevBottom(16)+gap(4) - top(5) = 15
    expect(dy[0]).toBe(0);
    expect(dy[1]).toBe(15);
  });

  it('stacks a three-label cluster so none overlap', () => {
    const rects = [r(0, 0, 50, 16), r(0, 4, 50, 16), r(0, 8, 50, 16)];
    const dy = stackVertically(rects, 4);
    // apply the offsets and assert no remaining vertical overlap in the same column
    const placed = rects.map((rect, i) => ({ ...rect, top: rect.top + dy[i], bottom: rect.bottom + dy[i] }));
    placed.sort((a, b) => a.top - b.top);
    for (let i = 1; i < placed.length; i++) {
      expect(placed[i].top).toBeGreaterThanOrEqual(placed[i - 1].bottom);
    }
  });

  it('returns offsets in the original input order', () => {
    // the lower label is given first; its offset must stay 0, the higher one is the anchor
    const rects = [r(0, 5, 50, 16), r(0, 0, 50, 16)];
    const dy = stackVertically(rects, 4);
    expect(dy).toHaveLength(2);
    // the topmost (second item, top=0) anchors at 0; the first item (top=5) gets pushed down
    expect(dy[1]).toBe(0);
    expect(dy[0]).toBe(15);
  });
});
