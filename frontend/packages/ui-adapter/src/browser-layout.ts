/** Browser layout adapter: selection visibility and responsive orientation only. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const subscribeNarrow = (notify: () => void) => {
  globalThis.addEventListener('resize', notify);
  return () => globalThis.removeEventListener('resize', notify);
};
const narrowSnapshot = () => globalThis.innerWidth < 768;

export function useNarrowLayout(): boolean {
  return useSyncExternalStore(subscribeNarrow, narrowSnapshot, () => false);
}

/** Only move the collection viewport. Never scroll a page or steal keyboard focus. */
export function useCollectionViewport(
  selection: string,
  content: unknown,
  selectedSelector = '[aria-selected="true"]',
) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ before: false, after: false });
  useEffect(() => {
    const viewport = ref.current;
    if (!viewport) return;
    const measure = () => {
      const before = viewport.scrollLeft > 1;
      const after = viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft > 1;
      setOverflow((prior) =>
        prior.before === before && prior.after === after ? prior : { before, after },
      );
    };
    const reveal = () => {
      const selected = viewport.querySelector<HTMLElement>(selectedSelector);
      if (!selected) {
        measure();
        return;
      }
      const box = viewport.getBoundingClientRect();
      const item = selected.getBoundingClientRect();
      if (item.left < box.left) viewport.scrollLeft += item.left - box.left;
      else if (item.right > box.right) viewport.scrollLeft += item.right - box.right;
      measure();
    };
    const frame = requestAnimationFrame(reveal);
    const observer = new ResizeObserver(reveal);
    observer.observe(viewport);
    viewport.addEventListener('scroll', measure, { passive: true });
    for (const item of viewport.children) observer.observe(item);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport.removeEventListener('scroll', measure);
    };
  }, [selection, content, selectedSelector]);
  return { ref, overflow };
}
