import { useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

const KEY = 'gptitor.theme';
const EVENT = 'gptitor:theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export const readPref = (): ThemePref => {
    try {
        const v = localStorage.getItem(KEY);
        return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
        return 'system';
    }
};

export const resolve = (pref: ThemePref): Theme =>
    pref === 'system' ? (media().matches ? 'dark' : 'light') : pref;

const apply = (theme: Theme, animate: boolean) => {
    const root = document.documentElement;
    if (animate) {
        root.classList.add('theme-switching');
        window.setTimeout(() => root.classList.remove('theme-switching'), 350);
    }
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111827' : '#FFFFFF');
};

export const setThemePref = (pref: ThemePref) => {
    try {
        if (pref === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, pref);
    } catch { /* ignore */ }
    apply(resolve(pref), true);
    window.dispatchEvent(new Event(EVENT));
};

/* Keeps <html data-theme> in sync with the preference and the OS setting. */
export const useTheme = () => {
    const [pref, setPref] = useState<ThemePref>(readPref);
    const [theme, setTheme] = useState<Theme>(() => resolve(readPref()));

    useEffect(() => {
        const sync = (animate: boolean) => {
            const p = readPref();
            const t = resolve(p);
            setPref(p);
            setTheme(t);
            if (document.documentElement.dataset.theme !== t) apply(t, animate);
        };
        sync(false);
        const onPref = () => sync(true);
        const mq = media();
        mq.addEventListener('change', onPref);
        window.addEventListener(EVENT, onPref);
        window.addEventListener('storage', onPref);
        return () => {
            mq.removeEventListener('change', onPref);
            window.removeEventListener(EVENT, onPref);
            window.removeEventListener('storage', onPref);
        };
    }, []);

    return { pref, theme };
};
