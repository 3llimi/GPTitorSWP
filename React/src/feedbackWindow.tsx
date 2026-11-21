import { useState, useContext } from 'react';
import { FeedbackContext } from './feedbackContext';
import './feedbackWindow.css';
import MarkdownRenderer from './markdownRenderer';
import { useCountUp } from './hooks';
import { CRITERIA, averageScore, formatScore, scoreLevel, levelLabel, levelBadge, CriterionKey } from './criteria';
import { IconTarget, IconEye, IconLayers, IconFlag, IconInfo, IconChevronDown, IconSparkles } from './icons';

const CRITERION_ICONS: Record<CriterionKey, JSX.Element> = {
    criterion_1: <IconTarget size={16} />,
    criterion_2: <IconEye size={16} />,
    criterion_3: <IconLayers size={16} />,
    criterion_4: <IconFlag size={16} />,
};

export const ScoreRing: React.FC<{ score: number; size?: number; stroke?: number; label?: string }> = ({ score, size = 112, stroke = 10, label = 'out of 5' }) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const animated = useCountUp(score, 1000);
    const pct = Math.max(0, Math.min(1, animated / 5));
    return (
        <div className='score-ring' style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden='true'>
                <circle cx={size / 2} cy={size / 2} r={r} fill='none' stroke='var(--primary-soft)' strokeWidth={stroke} />
                <circle
                    className='score-ring-value'
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill='none'
                    stroke='var(--primary)'
                    strokeWidth={stroke}
                    strokeLinecap='round'
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - pct)}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </svg>
            <div className='score-ring-text'>
                <span className='score-ring-num'>{formatScore(Math.round(animated * 10) / 10)}</span>
                <span className='score-ring-label'>{label}</span>
            </div>
        </div>
    );
};

const FeedbackWindow: React.FC = () => {
    const { feedback, criteria } = useContext(FeedbackContext);
    const [expanded, setExpanded] = useState<CriterionKey | null>(null);

    const overall = averageScore(criteria);
    const hasData = !!feedback || overall > 0;
    const level = scoreLevel(overall, hasData);

    const weakest = hasData
        ? CRITERIA.reduce((min, c) => (criteria[c.key] < criteria[min.key] ? c : min), CRITERIA[0])
        : null;

    return (
        <div className='feedback-view lowpart'>
            <div className='score-summary'>
                <ScoreRing score={overall} />
                <div className='score-summary-text'>
                    <span className='eyebrow'>Prompt score</span>
                    <span className={`badge ${levelBadge[level]}`}>{levelLabel[level]}</span>
                    <p className='text-muted'>
                        {hasData
                            ? weakest && criteria[weakest.key] < 5
                                ? <>Biggest opportunity: <strong>{weakest.title}</strong>.</>
                                : 'Excellent — full marks across the board.'
                            : 'Send a prompt to see how it scores on each criterion.'}
                    </p>
                </div>
            </div>

            <div className='criteria-list'>
                {CRITERIA.map((c, i) => {
                    const score = criteria[c.key];
                    const comment = criteria[c.commentKey] as string;
                    const isOpen = expanded === c.key;
                    const lvl = scoreLevel(score, hasData);
                    return (
                        <div key={c.key} className={`criterion lvl-${lvl}${isOpen ? ' open' : ''}`} style={{ animationDelay: `${i * 0.05}s` }}>
                            <button
                                className='criterion-head more-details-btn'
                                onClick={() => setExpanded(isOpen ? null : c.key)}
                                aria-expanded={isOpen}
                                disabled={!hasData}
                            >
                                <span className='criterion-icon'>{CRITERION_ICONS[c.key]}</span>
                                <span className='criterion-main'>
                                    <span className='criterion-row'>
                                        <span className='criterion-title'>{c.title}</span>
                                        <span className='criterion-score'>{hasData ? formatScore(score) : '–'}<small>/5</small></span>
                                    </span>
                                    <span className='meter'>
                                        <span className='meter-fill' style={{ width: `${(score / 5) * 100}%` }} />
                                    </span>
                                </span>
                                {hasData && <IconChevronDown size={16} className='criterion-chevron' />}
                            </button>
                            <div className='collapse'>
                                <div className='collapse-inner'>
                                    <div className='criterion-body'>
                                        <p>{comment || 'No specific comment for this criterion.'}</p>
                                        <p className='criterion-what'><IconInfo size={13} /> {c.description}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className='feedback-notes'>
                <h4><IconSparkles size={15} /> Feedback</h4>
                {feedback ? (
                    <div className='feedback-text'>
                        <MarkdownRenderer text={feedback} />
                    </div>
                ) : (
                    <p className='text-muted'>Written feedback on your latest prompt will appear here.</p>
                )}
            </div>
        </div>
    );
};

export default FeedbackWindow;
