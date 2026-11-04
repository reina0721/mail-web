'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useMotionPolicy } from './motion-policy-context';

type RevealCallback = (animate: boolean, order?: number, batchSize?: number) => void;
type RevealRegistrar = (
  element: HTMLElement,
  reveal: RevealCallback,
  initial?: boolean,
) => () => void;

type RevealRegistration = { reveal: RevealCallback; seenOutside: boolean; initial: boolean };
const ViewportRevealContext = createContext<RevealRegistrar | null>(null);
const readDefaultViewport = () => ({ fast: false, restored: false });

export function ViewportRevealProvider({
  children,
  readViewport = readDefaultViewport,
}: Readonly<{
  children: ReactNode;
  /** Host owns scrolling and restoration; the recipe consumes only these decisions. */
  readViewport?: () => Readonly<{ fast: boolean; restored: boolean }>;
}>) {
  const { resolvedMode, categories } = useMotionPolicy();
  const callbacksRef = useRef(new Map<Element, RevealRegistration>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observerUnavailableRef = useRef(false);
  const revealImmediately = resolvedMode !== 'full' || !categories.reveal;

  useEffect(() => {
    const showAll = () => {
      for (const { reveal } of callbacksRef.current.values()) reveal(false);
      callbacksRef.current.clear();
    };
    if (revealImmediately || typeof IntersectionObserver === 'undefined') {
      showAll();
      return;
    }

    let observer: IntersectionObserver;
    try {
      observer = new IntersectionObserver(
        (entries) => {
          let order = 0;
          const viewport = readViewport();
          // IO snapshots already contain geometry: top-to-bottom, then inline reading order.
          const latest = new Map<Element, IntersectionObserverEntry>();
          for (const entry of entries) {
            const previous = latest.get(entry.target);
            if (!previous || entry.time >= previous.time) latest.set(entry.target, entry);
          }
          const sorted = [...latest.values()].sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top ||
              a.boundingClientRect.left - b.boundingClientRect.left,
          );
          const shouldAnimate = (
            entry: IntersectionObserverEntry,
            registration: RevealRegistration,
          ) =>
            entry.isIntersecting &&
            !(viewport.restored && !registration.seenOutside) &&
            (registration.seenOutside ? !viewport.fast : registration.initial);
          const batchSize = sorted.filter((entry) => {
            const registration = callbacksRef.current.get(entry.target);
            return registration && shouldAnimate(entry, registration);
          }).length;
          for (const entry of sorted) {
            const registration = callbacksRef.current.get(entry.target);
            if (!registration) continue;
            // 初次已可见（首屏、锚点、恢复位置）不重播。快速越过的区域直接完成。
            if (!entry.isIntersecting && entry.boundingClientRect.bottom > 0) {
              registration.seenOutside = true;
              continue;
            }
            const animate = shouldAnimate(entry, registration);
            registration.reveal(animate, animate ? order++ : 0, batchSize);
            callbacksRef.current.delete(entry.target);
            observer.unobserve(entry.target);
          }
        },
        { rootMargin: '0px', threshold: 0 },
      );
    } catch {
      observerUnavailableRef.current = true;
      showAll();
      return;
    }
    observerUnavailableRef.current = false;
    observerRef.current = observer;
    for (const [element, registration] of callbacksRef.current) {
      try {
        observer.observe(element);
      } catch {
        registration.reveal(false);
        callbacksRef.current.delete(element);
      }
    }
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [revealImmediately, readViewport]);

  const register = useCallback<RevealRegistrar>(
    (element, reveal, initial = false) => {
      if (
        revealImmediately ||
        observerUnavailableRef.current ||
        typeof IntersectionObserver === 'undefined'
      ) {
        reveal(false);
        return () => undefined;
      }
      callbacksRef.current.set(element, { reveal, seenOutside: false, initial });
      try {
        observerRef.current?.observe(element);
      } catch {
        callbacksRef.current.delete(element);
        reveal(false);
      }
      return () => {
        if (callbacksRef.current.delete(element)) observerRef.current?.unobserve(element);
      };
    },
    [revealImmediately],
  );

  return <ViewportRevealContext value={register}>{children}</ViewportRevealContext>;
}

/** 显式 below-fold Region 的可选增强；内容默认可见，不由 Observer 决定可用性。 */
export function ViewportReveal({
  children,
  items = false,
  className,
}: Readonly<{
  children: ReactNode;
  /** Observe semantic items in an existing layout, without animating its container. */
  items?: boolean;
  className?: string;
}>) {
  return items ? (
    <RevealItems {...(className ? { className } : {})}>{children}</RevealItems>
  ) : (
    <RevealRegion>{children}</RevealRegion>
  );
}

function RevealItems({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  const register = useContext(ViewportRevealContext);
  const scopeRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(new WeakSet<HTMLElement>());
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope || !register) return;
    const active = new Map<HTMLElement, () => void>();
    const completed = completedRef.current;
    const finish = (element: HTMLElement, animate: boolean, order = 0, batchSize = 1) => {
      element.dataset.reveal = 'revealed';
      element.dataset.revealEntry = String(animate);
      element.dataset.revealOrder = String(order);
      element.style.setProperty('--surface-reveal-rank', String(order));
      element.style.setProperty(
        '--surface-reveal-fraction',
        String(order / Math.max(1, batchSize - 1)),
      );
      completed.add(element);
    };
    const collect = () => {
      // Only owned semantic markup. Never inspect vendor anatomy or individual icons/labels.
      const candidates = new Set<HTMLElement>(scope.querySelectorAll('[data-reveal-item]'));
      for (const group of scope.querySelectorAll('[data-reveal-items]')) {
        for (const child of group.children) if (child instanceof HTMLElement) candidates.add(child);
      }
      for (const child of scope.children) if (child instanceof HTMLElement) candidates.add(child);
      const owned = [...candidates].filter(
        (element) =>
          element.closest('[data-reveal-scope]') === scope &&
          !element.closest('[data-reveal-skip]') &&
          !element.matches('.surface-viewport-reveal') &&
          !element.querySelector('[data-reveal-scope], .surface-viewport-reveal') &&
          ![...candidates].some((other) => other !== element && element.contains(other)),
      );
      for (const [element, cleanup] of active) {
        if (!owned.includes(element)) {
          cleanup();
          finish(element, false);
          active.delete(element);
        }
      }
      for (const element of owned) {
        if (active.has(element) || completed.has(element)) continue;
        element.dataset.reveal = 'pending';
        element.dataset.revealEntry = 'false';
        active.set(
          element,
          register(
            element,
            (animate, order, batchSize) => finish(element, animate, order, batchSize),
            true,
          ),
        );
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      for (const [element, cleanup] of active) {
        if (element.contains(event.target)) {
          cleanup();
          finish(element, false);
        }
      }
    };
    collect();
    const mutations = new MutationObserver(collect);
    mutations.observe(scope, { childList: true, subtree: true });
    scope.addEventListener('focusin', onFocus);
    return () => {
      mutations.disconnect();
      scope.removeEventListener('focusin', onFocus);
      for (const [element, cleanup] of active) {
        cleanup();
        element.dataset.revealEntry = 'false';
      }
    };
  }, [register]);
  return (
    <div className={className} data-reveal-scope="items" ref={scopeRef}>
      {children}
    </div>
  );
}

function RevealRegion({ children }: Readonly<{ children: ReactNode }>) {
  const register = useContext(ViewportRevealContext);
  const { resolvedMode, categories } = useMotionPolicy();
  const [entry, setEntry] = useState<'pending' | 'visible' | 'revealed'>(
    resolvedMode !== 'full' || !categories.reveal ? 'visible' : 'pending',
  );
  const revealed = entry !== 'pending';
  const cleanupRef = useRef<(() => void) | null>(null);

  const setElement = useCallback(
    (element: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (!element || revealed) return;
      if (!register) {
        setEntry('visible');
        return;
      }
      cleanupRef.current = register(element, (animate) =>
        setEntry(animate ? 'revealed' : 'visible'),
      );
    },
    [register, revealed],
  );

  useEffect(() => () => cleanupRef.current?.(), []);

  return (
    <div
      className="surface-viewport-reveal"
      data-motion-recipe="reveal"
      data-reveal={revealed ? 'revealed' : 'pending'}
      data-reveal-entry={entry === 'revealed' ? 'true' : 'false'}
      onFocusCapture={() => setEntry('visible')}
      ref={setElement}
    >
      {children}
    </div>
  );
}
