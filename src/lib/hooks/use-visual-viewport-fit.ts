'use client';

import { useEffect } from 'react';

/**
 * On a phone the on-screen keyboard covers the bottom of the page without resizing it, so a sheet's
 * save button (or the end of a list) ends up under the keys. This keeps a sheet inside the part of the
 * screen that is visible. Below 640px only: wider screens keep their own layout.
 *  - 'fill': a full-screen sheet is made exactly as tall as the visible area;
 *  - 'bottom': a sheet anchored to the bottom edge is lifted above the keyboard and limited to what is left.
 */
export function useVisualViewportFit(el: HTMLElement | null, mode: 'fill' | 'bottom') {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!el || !viewport) return;
    const phone = window.matchMedia('(max-width: 639px)');

    const set = (name: string, value: string) => el.style.setProperty(name, value);
    const clear = () => ['top', 'height', 'bottom', 'max-height'].forEach((name) => el.style.removeProperty(name));
    const apply = () => {
      if (!phone.matches) {
        clear();
        return;
      }
      if (mode === 'fill') {
        set('top', `${viewport.offsetTop}px`);
        set('height', `${viewport.height}px`);
      } else {
        set('bottom', `${Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height)}px`);
        set('max-height', `${Math.round(viewport.height * 0.92)}px`);
      }
    };

    apply();
    viewport.addEventListener('resize', apply);
    viewport.addEventListener('scroll', apply);
    phone.addEventListener('change', apply);
    return () => {
      viewport.removeEventListener('resize', apply);
      viewport.removeEventListener('scroll', apply);
      phone.removeEventListener('change', apply);
      clear();
    };
  }, [el, mode]);
}
