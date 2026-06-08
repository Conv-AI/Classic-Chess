import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right' | 'auto';

type Props = {
  text: string;
  children: ReactNode;
  placement?: TooltipPlacement;
  wide?: boolean;
  className?: string;
};

function computePosition(
  trigger: DOMRect,
  tip: DOMRect,
  placement: TooltipPlacement,
): { top: number; left: number } {
  const margin = 10;
  const gap = 8;
  const order: TooltipPlacement[] = placement === 'auto'
    ? ['bottom', 'top', 'left', 'right']
    : [placement, 'bottom', 'top', 'left', 'right'];

  for (const side of order) {
    let top = 0;
    let left = 0;
    if (side === 'bottom') {
      top = trigger.bottom + gap;
      left = trigger.left + trigger.width / 2 - tip.width / 2;
    } else if (side === 'top') {
      top = trigger.top - tip.height - gap;
      left = trigger.left + trigger.width / 2 - tip.width / 2;
    } else if (side === 'left') {
      top = trigger.top + trigger.height / 2 - tip.height / 2;
      left = trigger.left - tip.width - gap;
    } else {
      top = trigger.top + trigger.height / 2 - tip.height / 2;
      left = trigger.right + gap;
    }

    const clampedLeft = Math.max(margin, Math.min(left, window.innerWidth - tip.width - margin));
    const clampedTop = Math.max(margin, Math.min(top, window.innerHeight - tip.height - margin));
    const fitsHorizontally = clampedLeft === left || tip.width <= window.innerWidth - margin * 2;
    const fitsVertically = clampedTop === top || tip.height <= window.innerHeight - margin * 2;
    if (fitsHorizontally && fitsVertically) {
      return { top: clampedTop, left: clampedLeft };
    }
  }

  return {
    top: Math.max(margin, trigger.bottom + gap),
    left: Math.max(margin, Math.min(trigger.left, window.innerWidth - tip.width - margin)),
  };
}

export default function Tooltip({
  text,
  children,
  placement = 'auto',
  wide = false,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tipRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tipRect = tipRef.current.getBoundingClientRect();
    const pos = computePosition(triggerRect, tipRect, placement);
    setStyle({ top: pos.top, left: pos.left, position: 'fixed', visibility: 'visible' });
  }, [open, text, placement, wide]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (!triggerRef.current || !tipRef.current) return;
      const pos = computePosition(
        triggerRef.current.getBoundingClientRect(),
        tipRef.current.getBoundingClientRect(),
        placement,
      );
      setStyle({ top: pos.top, left: pos.left, position: 'fixed', visibility: 'visible' });
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, placement]);

  if (!text) return <>{children}</>;

  return (
    <>
      <span
        ref={triggerRef}
        className={`tooltip-trigger ${className}`.trim()}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-describedby={open ? id : undefined}
      >
        {children}
      </span>
      {open && createPortal(
        <div
          ref={tipRef}
          id={id}
          className={`app-tooltip${wide ? ' is-wide' : ''}`}
          style={style}
          role="tooltip"
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}
