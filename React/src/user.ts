import { useEffect, useState } from 'react';
import API_URL from './config';

/* ---------- Display name (no auth backend yet, so it lives in the browser) ---------- */

const NAME_KEY = 'gptitor.displayName';
const NAME_EVENT = 'gptitor:name';

const readName = () => {
    try {
        return localStorage.getItem(NAME_KEY) || '';
    } catch {
        return '';
    }
};

export const setDisplayName = (name: string) => {
    try {
        localStorage.setItem(NAME_KEY, name.trim());
    } catch {
        /* storage unavailable — keep in memory only */
    }
    window.dispatchEvent(new Event(NAME_EVENT));
};

export const useDisplayName = () => {
    const [name, setName] = useState(readName);
    useEffect(() => {
        const sync = () => setName(readName());
        window.addEventListener(NAME_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(NAME_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);
    return name;
};

export const initials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'You';
    return parts.slice(0, 2).map(p => p[0]!.toUpperCase()).join('');
};

/* ---------- LLM list (fetched from the API, with a fallback) ---------- */

export interface LLMInfo {
    llm_id: number;
    name: string;
}

const FALLBACK_LLMS: LLMInfo[] = [
    { llm_id: 1, name: 'Qwen2-mini' },
    { llm_id: 2, name: 'Llama3-mini' },
    { llm_id: 3, name: 'Qwen2-large' },
    { llm_id: 4, name: 'Llama3-large' },
];

let llmCache: LLMInfo[] | null = null;

export const useLLMs = () => {
    const [llms, setLlms] = useState<LLMInfo[]>(llmCache ?? FALLBACK_LLMS);
    useEffect(() => {
        if (llmCache) return;
        fetch(`${API_URL}/llms`)
            .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((data: LLMInfo[]) => {
                if (Array.isArray(data) && data.length) {
                    llmCache = data;
                    setLlms(data);
                }
            })
            .catch(() => { /* keep fallback list */ });
    }, []);
    return llms;
};

/* ---------- Per-message reactions (like / dislike) ---------- */

const REACT_KEY = 'gptitor.reactions';

export type Reaction = 'up' | 'down';

export const readReactions = (): Record<string, Reaction> => {
    try {
        return JSON.parse(localStorage.getItem(REACT_KEY) || '{}');
    } catch {
        return {};
    }
};

export const writeReactions = (r: Record<string, Reaction>) => {
    try {
        localStorage.setItem(REACT_KEY, JSON.stringify(r));
    } catch {
        /* ignore */
    }
};
