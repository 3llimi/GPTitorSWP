import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import './toast.css';
import { IconCheck, IconAlert, IconInfo } from './icons';

type Kind = 'success' | 'error' | 'info';

interface Toast {
    id: number;
    text: string;
    kind: Kind;
    leaving: boolean;
}

const ToastContext = createContext<(text: string, kind?: Kind) => void>(() => { });

export const useToast = () => useContext(ToastContext);

const ICONS: Record<Kind, JSX.Element> = {
    success: <IconCheck size={15} />,
    error: <IconAlert size={15} />,
    info: <IconInfo size={15} />,
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const next = useRef(1);

    const show = useCallback((text: string, kind: Kind = 'success') => {
        const id = next.current++;
        setToasts(t => [...t.slice(-2), { id, text, kind, leaving: false }]);
        window.setTimeout(() => setToasts(t => t.map(x => (x.id === id ? { ...x, leaving: true } : x))), 2400);
        window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2700);
    }, []);

    return (
        <ToastContext.Provider value={show}>
            {children}
            <div className='toasts' role='status' aria-live='polite'>
                {toasts.map(t => (
                    <div key={t.id} className={`toast ${t.kind}${t.leaving ? ' leaving' : ''}`}>
                        <span className='toast-icon'>{ICONS[t.kind]}</span>
                        {t.text}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
