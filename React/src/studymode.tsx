import './studymode.css';
import { useContext, useEffect, useRef, useState } from 'react';
import { FeedbackContext } from './feedbackContext';
import { averageScore, formatScore } from './criteria';
import { useIsMobile, useSlider, COMPACT_QUERY } from './hooks';
import { IconMessages, IconChart } from './icons';
import { ConversationPanel } from './conversationPanel';
import FeedbackPanel, { RightTab } from './feedbackPanel';
import { useTaskContext } from './taskContext';
import type { Query } from './App';

interface MessageSimplifyed {
    id: number,
    text: string,
}

interface StudyModeProps {
    queries: Query[];
    createConversation: () => Promise<void>;
    switchModel: (llmId: number) => Promise<void>;
    requests: MessageSimplifyed[];
    setRequests: React.Dispatch<React.SetStateAction<MessageSimplifyed[]>>;
    responses: MessageSimplifyed[];
    setResponses: React.Dispatch<React.SetStateAction<MessageSimplifyed[]>>;
    conversation_id: number;
    selectedLLM: number | null;
    setSelectedLLM: (llmId: number | null) => void;
    renameConversation: (conversation_id: number, importText: string) => void;
}

const MODE_KEY = 'gptitor.studyMode';

const StudyMode: React.FC<StudyModeProps> = (props) => {
    const { setSelectedTask } = useTaskContext();
    const [isStudyMode, setIsStudyMode] = useState(() => {
        try { return localStorage.getItem(MODE_KEY) !== '0'; } catch { return true; }
    });
    const [tab, setTab] = useState<RightTab>(isStudyMode ? 'tasks' : 'feedback');

    useEffect(() => {
        try { localStorage.setItem(MODE_KEY, isStudyMode ? '1' : '0'); } catch { /* ignore */ }
        if (!isStudyMode) {
            setSelectedTask(null);
            if (tab === 'tasks') setTab('feedback');
        }
    }, [isStudyMode]);

    /* Compact screens: show the chat or the side panel, with a switcher on top */
    const compact = useIsMobile(COMPACT_QUERY);
    const [view, setView] = useState<'chat' | 'panel'>('chat');
    const [unseen, setUnseen] = useState(false);
    const switchRef = useRef<HTMLDivElement>(null);
    const pill = useSlider(switchRef, [view, compact, unseen]);
    const { criteria, feedback } = useContext(FeedbackContext);
    const score = averageScore(criteria);

    const showView = (v: 'chat' | 'panel') => {
        setView(v);
        if (v === 'panel') setUnseen(false);
    };

    const focusComposer = () =>
        window.setTimeout(() => (document.querySelector('.chatinput') as HTMLTextAreaElement | null)?.focus(), 50);

    return (
        <div className='chat-page' data-view={view}>
            {compact && (
                <div className='view-switch slider-host' role='tablist' aria-label='View' ref={switchRef}>
                    <span className='slider-pill' style={pill} />
                    <button role='tab' aria-selected={view === 'chat'} data-active={view === 'chat'} onClick={() => showView('chat')}>
                        <IconMessages size={15} /> Chat
                    </button>
                    <button role='tab' aria-selected={view === 'panel'} data-active={view === 'panel'} onClick={() => showView('panel')}>
                        <IconChart size={15} /> {isStudyMode ? 'Tasks & feedback' : 'Feedback'}
                        {(feedback || score > 0) && <span className={`view-badge${unseen ? ' pulse' : ''}`}>{formatScore(score)}</span>}
                    </button>
                </div>
            )}
            <ConversationPanel
                {...props}
                isStudyMode={isStudyMode}
                onSent={() => {
                    setTab('feedback');
                    if (compact) setUnseen(true);
                }}
                onBrowseTasks={() => {
                    setTab('tasks');
                    showView('panel');
                }}
            />
            <FeedbackPanel
                tab={tab}
                setTab={setTab}
                isStudyMode={isStudyMode}
                setIsStudyMode={setIsStudyMode}
                onTaskStart={() => {
                    showView('chat');
                    focusComposer();
                }}
            />
        </div>
    );
};

export default StudyMode;
