'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Longest we wait for a closing dialog to leave the page before giving up on the focus. */
const GIVE_UP_MS = 1500;
/** After the dialog is gone, how long we still check whether focus fell to the page. */
const SETTLE_MS = 300;

const nothingFocused = () => !document.activeElement || document.activeElement === document.body || document.activeElement === document.documentElement;

/**
 * Puts keyboard focus back where it was when a dialog that is driven by state closes.
 *
 * Radix hands focus back to its own `DialogTrigger`; a dialog opened from a button's click handler has none,
 * so focus fell to the page and a keyboard user lost their place. This remembers the element that had focus
 * when `open` turned true (or `opener`, for a dialog started from a menu whose item disappears) and focuses it
 * again once the dialog is gone, without stealing focus the user already moved elsewhere.
 */
export function useReturnFocus(open: boolean, opener?: RefObject<HTMLElement | null>): void {
  const saved = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const timer = useRef<number | null>(null);

  // runs before the dialog mounts (Radix mounts its content one render later), so focus is still on the opener
  useLayoutEffect(() => {
    if (open && !wasOpen.current) {
      const from = opener?.current ?? document.activeElement;
      saved.current = from instanceof HTMLElement && from !== document.body ? from : null;
    }
    if (!open && wasOpen.current && saved.current) {
      const target = saved.current;
      saved.current = null;
      const started = Date.now();
      // the dialog fades out before it unmounts: wait until it is really gone, then look at where focus is
      const attempt = () => {
        timer.current = null;
        if (!target.isConnected) return;
        const gone = !document.querySelector('[role="dialog"], [role="alertdialog"]');
        if (gone && nothingFocused()) {
          target.focus({ preventScroll: true });
          return;
        }
        // focus already went somewhere on purpose: stop soon; a dialog still fading out: keep waiting
        if (Date.now() - started < (gone ? SETTLE_MS : GIVE_UP_MS)) timer.current = window.setTimeout(attempt, 60);
      };
      timer.current = window.setTimeout(attempt, 60);
    }
    wasOpen.current = open;
  }, [open, opener]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
}
