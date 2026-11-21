import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Chart } from 'chart.js/auto';
import './profile.css';
import API_URL from './config';
import { CRITERIA, formatScore, scoreLevel, levelLabel, levelBadge, averageScore } from './criteria';
import { ScoreRing } from './feedbackWindow';
import { useDisplayName, setDisplayName, initials } from './user';
import { useCountUp, useSlider } from './hooks';
import { useToast } from './toast';
import { useTheme } from './theme';
import {
    IconPencil, IconCheck, IconX, IconZap, IconMessages, IconTrophy, IconChart, IconAlert,
    IconRefresh, IconArrowRight, IconInfo, IconTarget, IconEye, IconLayers, IconFlag,
} from './icons';

interface Stats {
    daily_activity: { date: string; number_of_queries: number }[];
    metrics: { criterion_1: number; criterion_2: number; criterion_3: number; criterion_4: number };
    total_activity: { total_queries: number; total_conversations: number; tasks_solved: number };
}

const EMPTY: Stats = {
    daily_activity: [],
    metrics: { criterion_1: 0, criterion_2: 0, criterion_3: 0, criterion_4: 0 },
    total_activity: { total_queries: 0, total_conversations: 0, tasks_solved: 0 },
};

const CRIT_ICONS = [IconTarget, IconEye, IconLayers, IconFlag];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const StatTile: React.FC<{ icon: JSX.Element; label: string; value: number; decimals?: number; suffix?: string; sub?: string; delay?: number }> = ({ icon, label, value, decimals = 0, suffix, sub, delay = 0 }) => {
    const n = useCountUp(value);
    return (
        <div className='stat-tile card' style={{ animationDelay: `${delay}s` }}>
            <span className='stat-icon'>{icon}</span>
            <div>
                <div className='stat-value'>
                    {n.toFixed(decimals)}
                    {suffix && <small>{suffix}</small>}
                </div>
                <div className='stat-label'>{label}</div>
                {sub && <div className='stat-sub'>{sub}</div>}
            </div>
        </div>
    );
};

type Range = 7 | 30 | 0;

const ActivityChart: React.FC<{ data: Stats['daily_activity'] }> = ({ data }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [range, setRange] = useState<Range>(7);
    const segRef = useRef<HTMLDivElement>(null);
    const pill = useSlider(segRef, [range]);
    const { theme } = useTheme();

    const series = useMemo(() => {
        const byDate = new Map(data.map(d => [String(d.date).slice(0, 10), d.number_of_queries]));
        if (range === 0) {
            return data.map(d => ({ label: String(d.date).slice(5, 10), value: d.number_of_queries }));
        }
        const out: { label: string; value: number }[] = [];
        const today = new Date();
        for (let i = range - 1; i >= 0; i--) {
            const day = new Date(today);
            day.setDate(today.getDate() - i);
            const key = ymd(day);
            out.push({
                label: range === 7 ? day.toLocaleDateString(undefined, { weekday: 'short' }) : key.slice(5),
                value: byDate.get(key) ?? 0,
            });
        }
        return out;
    }, [data, range]);

    useEffect(() => {
        if (!canvasRef.current) return;
        const css = getComputedStyle(document.documentElement);
        const v = (name: string) => css.getPropertyValue(name).trim();
        const chart = new Chart(canvasRef.current, {
            type: 'bar',
            data: {
                labels: series.map(s => s.label),
                datasets: [{
                    label: 'Prompts',
                    data: series.map(s => s.value),
                    backgroundColor: v('--primary'),
                    hoverBackgroundColor: v('--primary-hover'),
                    borderRadius: 6,
                    maxBarThickness: 28,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: v('--ink'),
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: { label: ctx => `${ctx.parsed.y} prompt${ctx.parsed.y === 1 ? '' : 's'}` },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: { color: v('--muted'), font: { family: 'IBM Plex Sans', size: 11 }, maxRotation: 0, autoSkipPadding: 12 },
                    },
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        grid: { color: v('--border') },
                        ticks: { color: v('--muted'), font: { family: 'IBM Plex Sans', size: 11 }, precision: 0 },
                    },
                },
            },
        });
        return () => chart.destroy();
    }, [series, theme]);

    const total = series.reduce((a, s) => a + s.value, 0);

    return (
        <div className='card chart-card'>
            <div className='card-head'>
                <div>
                    <h3>Activity</h3>
                    <p className='text-muted'>{total} prompt{total === 1 ? '' : 's'} {range ? `in the last ${range} days` : 'in total'}</p>
                </div>
                <div className='segmented slider-host' role='radiogroup' aria-label='Range' ref={segRef}>
                    <span className='slider-pill' style={pill} />
                    {([7, 30, 0] as Range[]).map(r => (
                        <button key={r} role='radio' aria-checked={range === r} data-active={range === r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>
                            {r ? `${r}d` : 'All'}
                        </button>
                    ))}
                </div>
            </div>
            <div className='chart-box'>
                <canvas ref={canvasRef} aria-label='Prompts per day' role='img' />
            </div>
        </div>
    );
};

const Profile: React.FC = () => {
    const [stats, setStats] = useState<Stats>(EMPTY);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const name = useDisplayName();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const toast = useToast();

    const load = async () => {
        setStatus('loading');
        try {
            const response = await fetch(`${API_URL}/profile/statistics`);
            if (response.status === 404) {
                /* The API answers 404 when there is no activity yet — that's an empty profile, not an error. */
                setStats(EMPTY);
            } else if (!response.ok) {
                throw new Error(await response.text());
            } else {
                const data = await response.json();
                const ta = data.total_activity || {};
                setStats({
                    daily_activity: data.daily_activity || [],
                    metrics: { ...EMPTY.metrics, ...data.metrics },
                    total_activity: {
                        total_queries: ta.total_queries || 0,
                        total_conversations: ta.total_conversations || 0,
                        tasks_solved: Array.isArray(ta.tasks_solved) ? ta.tasks_solved.length : ta.tasks_solved || 0,
                    },
                });
            }
            setStatus('ready');
        } catch {
            setStatus('error');
        }
    };

    useEffect(() => { load(); }, []);

    const avg = averageScore(stats.metrics);
    const hasActivity = stats.total_activity.total_queries > 0;
    const todayKey = ymd(new Date());
    const today = stats.daily_activity.find(d => String(d.date).slice(0, 10) === todayKey)?.number_of_queries ?? 0;
    const activeDays = stats.daily_activity.length;
    const lastActive = stats.daily_activity.length ? String(stats.daily_activity[stats.daily_activity.length - 1].date).slice(0, 10) : null;

    const sortedCriteria = CRITERIA.map((c, i) => ({ ...c, score: stats.metrics[c.key], Icon: CRIT_ICONS[i] }));
    const weakest = hasActivity ? [...sortedCriteria].sort((a, b) => a.score - b.score)[0] : null;

    const startEdit = () => { setDraft(name); setEditing(true); };
    const saveName = () => {
        setDisplayName(draft);
        setEditing(false);
        if (draft.trim() && draft.trim() !== name) toast('Name saved');
    };

    return (
        <div className='profile-page'>
            <section className='card profile-hero'>
                <div className='hero-avatar'>{initials(name)}</div>
                <div className='hero-main'>
                    {editing ? (
                        <form className='name-form' onSubmit={e => { e.preventDefault(); saveName(); }}>
                            <input
                                autoFocus
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => e.key === 'Escape' && setEditing(false)}
                                placeholder='Your name'
                                maxLength={60}
                                aria-label='Your name'
                            />
                            <button type='submit' className='icon-btn active' aria-label='Save name'><IconCheck size={16} /></button>
                            <button type='button' className='icon-btn' aria-label='Cancel' onClick={() => setEditing(false)}><IconX size={16} /></button>
                        </form>
                    ) : (
                        <div className='hero-name-row'>
                            <h1 className='hero-name'>{name || 'Welcome!'}</h1>
                            <button className='icon-btn' aria-label='Edit name' data-tip='Edit name' onClick={startEdit}><IconPencil size={15} /></button>
                        </div>
                    )}
                    <p className='text-muted'>
                        {name ? 'Prompt engineering student' : 'Add your name so your profile feels like yours.'}
                        {lastActive && <> · Last practised {new Date(lastActive).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</>}
                        {activeDays > 0 && <> · Active on {activeDays} day{activeDays === 1 ? '' : 's'}</>}
                    </p>
                </div>
                <Link to='/chatpage' className='btn btn-primary'>
                    Practise now <IconArrowRight size={16} />
                </Link>
            </section>

            {status === 'error' && (
                <div className='card profile-error' role='alert'>
                    <IconAlert size={18} />
                    <span>Couldn't load your statistics. Please try again.</span>
                    <button className='btn btn-secondary' onClick={load}><IconRefresh size={14} /> Retry</button>
                </div>
            )}

            <section className='stats-grid'>
                <StatTile icon={<IconZap size={18} />} label='Prompts sent' delay={0} value={stats.total_activity.total_queries} sub={today ? `+${today} today` : 'None today yet'} />
                <StatTile icon={<IconMessages size={18} />} label='Conversations' delay={0.05} value={stats.total_activity.total_conversations} />
                <StatTile icon={<IconTrophy size={18} />} label='Tasks attempted' delay={0.1} value={stats.total_activity.tasks_solved} />
                <StatTile icon={<IconChart size={18} />} label='Average score' delay={0.15} value={avg} decimals={1} suffix='/5' sub={hasActivity ? levelLabel[scoreLevel(avg)] : 'No grades yet'} />
            </section>

            <section className='profile-grid'>
                {status === 'loading' ? (
                    <div className='card chart-card skeleton-card' />
                ) : hasActivity ? (
                    <ActivityChart data={stats.daily_activity} />
                ) : (
                    <div className='card chart-card empty-activity'>
                        <IconChart size={28} />
                        <h3>No activity yet</h3>
                        <p className='text-muted'>Send your first prompt and your daily activity will show up here.</p>
                        <Link to='/chatpage' className='btn btn-secondary'>Start practising</Link>
                    </div>
                )}

                <div className='card skills-card'>
                    <div className='card-head'>
                        <div>
                            <h3>Skills</h3>
                            <p className='text-muted'>Average score per criterion</p>
                        </div>
                    </div>
                    <div className='skills-top'>
                        <ScoreRing score={avg} size={96} stroke={9} label='average' />
                        <div className='skills-top-text'>
                            <span className={`badge ${levelBadge[scoreLevel(avg, hasActivity)]}`}>{levelLabel[scoreLevel(avg, hasActivity)]}</span>
                            <p className='text-muted'>
                                {weakest
                                    ? <>Focus next on <strong>{weakest.title}</strong>.</>
                                    : 'Your skill breakdown appears after your first graded prompt.'}
                            </p>
                        </div>
                    </div>
                    <ul className='skill-list'>
                        {sortedCriteria.map((c, i) => (
                            <li style={{ animationDelay: `${0.2 + i * 0.05}s` }} key={c.key} className={`skill lvl-${scoreLevel(c.score, hasActivity)}`}>
                                <span className='skill-icon'><c.Icon size={15} /></span>
                                <div className='skill-main'>
                                    <div className='skill-row'>
                                        <span className='skill-title'>
                                            {c.title}
                                            <span className='skill-info' data-tip={c.short + ': see Guides for tips'}><IconInfo size={13} /></span>
                                        </span>
                                        <span className='skill-score'>{hasActivity ? formatScore(c.score) : '–'}<small>/5</small></span>
                                    </div>
                                    <span className='meter'><span className='meter-fill' style={{ width: `${(c.score / 5) * 100}%` }} /></span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>
        </div>
    );
};

export default Profile;
