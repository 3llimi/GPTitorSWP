import './feedbackPanel.css';
import { useContext, useRef, useState } from 'react';
import { useSlider } from './hooks';
import TaskPanel from './taskpanel';
import FeedbackWindow from './feedbackWindow';
import MarkdownRenderer from './markdownRenderer';
import { FeedbackContext } from './feedbackContext';
import { GUIDES } from './guides';
import { averageScore, formatScore } from './criteria';
import { IconClipboard, IconChart, IconBook, IconChevronDown } from './icons';

export type RightTab = 'tasks' | 'feedback' | 'guides';

interface FeedbackPanelProps {
    tab: RightTab;
    setTab: (t: RightTab) => void;
    isStudyMode: boolean;
    setIsStudyMode: (v: boolean) => void;
    onTaskStart?: () => void;
}

const Guides: React.FC = () => {
    const [open, setOpen] = useState<string | null>(GUIDES[0].id);
    return (
        <div className='guides'>
            <p className='text-muted guides-intro'>Short reference material on writing effective prompts.</p>
            {GUIDES.map(g => {
                const isOpen = open === g.id;
                return (
                    <div key={g.id} className={`guide${isOpen ? ' open' : ''}`}>
                        <button className='guide-head' aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.id)}>
                            <div>
                                <span className='guide-title'>{g.title}</span>
                                <span className='guide-summary'>{g.summary}</span>
                            </div>
                            <IconChevronDown size={16} />
                        </button>
                        <div className='collapse'>
                            <div className='collapse-inner'>
                                <div className='guide-body'>
                                    <MarkdownRenderer text={g.body} />
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const FeedbackPanel: React.FC<FeedbackPanelProps> = ({ tab, setTab, isStudyMode, setIsStudyMode, onTaskStart }) => {
    const { criteria, feedback } = useContext(FeedbackContext);
    const hasScore = !!feedback || averageScore(criteria) > 0;
    const tabsRef = useRef<HTMLDivElement>(null);
    const pill = useSlider(tabsRef, [tab, isStudyMode, hasScore]);

    const tabs: { id: RightTab; label: string; icon: JSX.Element; badge?: string }[] = [
        ...(isStudyMode ? [{ id: 'tasks' as RightTab, label: 'Tasks', icon: <IconClipboard size={15} /> }] : []),
        { id: 'feedback', label: 'Feedback', icon: <IconChart size={15} />, badge: hasScore ? formatScore(averageScore(criteria)) : undefined },
        { id: 'guides', label: 'Guides', icon: <IconBook size={15} /> },
    ];

    return (
        <aside className='side-card card feedbackbigcontainter' aria-label='Tasks and feedback'>
            <div className='side-head'>
                <div className='side-tabs slider-host' role='tablist' ref={tabsRef}>
                    <span className='slider-pill soft' style={pill} />
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            role='tab'
                            aria-selected={tab === t.id}
                            data-active={tab === t.id}
                            className={`side-tab ${t.id}-tab${tab === t.id ? ' active' : ''}`}
                            onClick={() => setTab(t.id)}
                        >
                            {t.icon}
                            {t.label}
                            {t.badge && <span className='tab-badge'>{t.badge}</span>}
                        </button>
                    ))}
                </div>
                <label className='mode' data-tip={isStudyMode ? 'Practise against graded tasks' : 'Free practice, no tasks'} data-tip-pos='bottom'>
                    <span>Study</span>
                    <span className='switch'>
                        <input type='checkbox' checked={isStudyMode} onChange={() => setIsStudyMode(!isStudyMode)} aria-label='Study mode' />
                        <span className='slider' />
                    </span>
                </label>
            </div>

            <div className='side-body' key={tab}>
                {tab === 'tasks' && isStudyMode && <TaskPanel onStart={() => { setTab('feedback'); onTaskStart?.(); }} />}
                {tab === 'feedback' && <FeedbackWindow />}
                {tab === 'guides' && <Guides />}
            </div>
        </aside>
    );
};

export default FeedbackPanel;
