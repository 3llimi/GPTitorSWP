import { useEffect, useLayoutEffect, useRef, useState, RefObject } from 'react';

/* ---------- Animated number ---------- */

export const useCountUp = (value: number, duration = 900) => {
    const [n, setN] = useState(0);
    const from = useRef(0);
    useEffect(() => {
        let raf = 0;
        const start = performance.now();
        const begin = from.current;
        const tick = (t: number) => {
            const p = Math.min(1, (t - start) / duration);
            const v = begin + (value - begin) * (1 - Math.pow(1 - p, 3));
            setN(v);
            from.current = v;
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [value, duration]);
    return n;
};

/* ---------- Sliding indicator for segmented controls / tabs ----------
   Measures the active child (marked with data-active="true") and returns a style
   for an absolutely positioned pill that glides between options. */

export const useSlider = (ref: RefObject<HTMLElement>, deps: unknown[]) => {
    const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });
    const first = useRef(true);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => {
            const active = el.querySelector<HTMLElement>('[data-active="true"]');
            if (!active) {
                setStyle({ opacity: 0 });
                return;
            }
            setStyle({
                opacity: 1,
                width: active.offsetWidth,
                height: active.offsetHeight,
                transform: `translate(${active.offsetLeft}px, ${active.offsetTop}px)`,
                transition: first.current ? 'none' : undefined,
            });
            first.current = false;
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, deps);
    return style;
};

/* ---------- Typewriter reveal for freshly received answers ---------- */

export const useTypewriter = (text: string, enabled: boolean, onTick?: () => void) => {
    const [shown, setShown] = useState(enabled ? '' : text);
    useEffect(() => {
        if (!enabled) {
            setShown(text);
            return;
        }
        const tokens = text.match(/\S+\s*|\s+/g) ?? [text];
        const step = Math.max(1, Math.ceil(tokens.length / 90)); // ~1.5s total regardless of length
        let i = 0;
        const id = window.setInterval(() => {
            i = Math.min(tokens.length, i + step);
            setShown(tokens.slice(0, i).join(''));
            onTick?.();
            if (i >= tokens.length) window.clearInterval(id);
        }, 16);
        return () => window.clearInterval(id);
    }, [text, enabled]);
    return { shown, done: shown.length >= text.length };
};

/* ---------- Breakpoint ---------- */

export const MOBILE_QUERY = '(max-width: 720px)';
/* Below this width the chat and the side panel are shown one at a time */
export const COMPACT_QUERY = '(max-width: 900px)';

export const useIsMobile = (query: string = MOBILE_QUERY) => {
    const [mobile, setMobile] = useState(() => window.matchMedia(query).matches);
    useEffect(() => {
        const mq = window.matchMedia(query);
        const on = () => setMobile(mq.matches);
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, [query]);
    return mobile;
};
