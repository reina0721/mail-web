'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type PresencePhase = 'enter' | 'stable' | 'exit';

export type FeedbackPresenceProps = Readonly<{
  visible: boolean;
  children: ReactNode;
}>;

/** FeedbackPresence 保留退出层直到动画结束，并在退出时立即关闭交互与辅助技术暴露。 */
export function FeedbackPresence({ visible, children }: FeedbackPresenceProps) {
  const [rendered, setRendered] = useState(visible);
  const [phase, setPhase] = useState<PresencePhase>(visible ? 'stable' : 'exit');
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (visible) {
        setRendered(true);
        setPhase('enter');
        return;
      }
      if (rendered) setPhase('exit');
    });
    return () => cancelAnimationFrame(frame);
  }, [rendered, visible]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const finishPresence = () => {
      if (phase === 'exit' && !visible) {
        setRendered(false);
        return;
      }
      if (phase === 'enter' && visible) setPhase('stable');
    };
    element.addEventListener('animationend', finishPresence);
    return () => element.removeEventListener('animationend', finishPresence);
  }, [phase, visible]);

  if (!rendered) return null;

  return (
    <div
      aria-hidden={visible ? undefined : true}
      className="ui-feedback-presence"
      data-motion-recipe="feedback"
      data-presence={phase}
      inert={visible ? undefined : true}
      ref={elementRef}
    >
      {children}
    </div>
  );
}
