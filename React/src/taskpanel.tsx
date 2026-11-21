import React, { useState, useEffect, useContext, useMemo } from 'react';
import { FeedbackContext } from './feedbackContext';
import './taskpanel.css';
import { Task } from './models/task';
import API_URL from './config';
import { useTaskContext } from './taskContext';
import MarkdownRenderer from './markdownRenderer';
import { emptyMetrics } from './criteria';
import { useToast } from './toast';
import { IconSearch, IconX, IconChevronLeft, IconChevronRight, IconTarget, IconAlert, IconRefresh, IconCheck } from './icons';

interface Category {
    category_id: number;
    category_name: string;
    category_description: string;
}

interface ApiTask {
    task_id: number;
    task_name: string;
    task_category: string;
    task_description: string;
}

interface TaskPanelProps {
    onStart?: () => void;
}

const shortCategory = (name: string) => name.split(' and ')[0];

const TaskPanel: React.FC<TaskPanelProps> = ({ onStart }) => {
    const { selectedCategory, setSelectedCategory, selectedTask, setSelectedTask } = useTaskContext();
    const { setCriteria, setFeedback } = useContext(FeedbackContext);
    const [categories, setCategories] = useState<Category[]>([]);
    const [tasks, setTasks] = useState<ApiTask[]>([]);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [search, setSearch] = useState('');
    const [previewId, setPreviewId] = useState<number | null>(null);
    const toast = useToast();

    const load = () => {
        setStatus('loading');
        Promise.all([
            fetch(`${API_URL}/categories`).then(r => (r.ok ? r.json() : Promise.reject(r.status))),
            fetch(`${API_URL}/tasks`).then(r => (r.ok ? r.json() : Promise.reject(r.status))),
        ])
            .then(([cats, ts]) => {
                setCategories(cats);
                setTasks(ts);
                setStatus('ready');
            })
            .catch(() => setStatus('error'));
    };

    useEffect(load, []);

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        tasks.forEach(t => { c[t.task_category] = (c[t.task_category] || 0) + 1; });
        return c;
    }, [tasks]);

    const term = search.trim().toLowerCase();
    const filtered = tasks.filter(t =>
        (selectedCategory === 'All' || t.task_category === selectedCategory) &&
        (!term || t.task_name.toLowerCase().includes(term) || t.task_description.toLowerCase().includes(term))
    );

    const preview = tasks.find(t => t.task_id === previewId);
    const activeId = selectedTask?.task_id ?? 0;

    const startTask = (t: ApiTask) => {
        setSelectedTask(new Task(t.task_id, t.task_name, t.task_category, t.task_description));
        setCriteria(emptyMetrics());
        setFeedback('');
        setPreviewId(null);
        toast(`Task started: ${t.task_name}`);
        onStart?.();
    };

    if (status === 'loading') {
        return (
            <div className='task-skeletons'>
                {[0, 1, 2, 3, 4].map(i => <div key={i} className='task-skeleton' />)}
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className='panel-state'>
                <IconAlert size={22} />
                <p>Tasks couldn't be loaded. Please try again.</p>
                <button className='btn btn-secondary' onClick={load}><IconRefresh size={14} /> Try again</button>
            </div>
        );
    }

    if (preview) {
        const isActive = preview.task_id === activeId;
        return (
            <div className='task-detail'>
                <button className='back-btn' onClick={() => setPreviewId(null)}>
                    <IconChevronLeft size={16} /> All tasks
                </button>
                <span className='badge badge-neutral'>{preview.task_category}</span>
                <h3 className='task-detail-title'>{preview.task_name}</h3>
                <div className='task-detail-desc'>
                    <MarkdownRenderer text={preview.task_description} />
                </div>
                <div className='task-detail-hint'>
                    <IconTarget size={16} />
                    <p>Write a prompt that gets the model to solve this task. Your prompt (not the answer) is what gets graded.</p>
                </div>
                <button className='btn btn-primary task-start' onClick={() => startTask(preview)} disabled={isActive}>
                    {isActive ? <><IconCheck size={16} /> Current task</> : 'Start this task'}
                </button>
            </div>
        );
    }

    return (
        <div className='task-browser taskcontainer'>
            <div className='task-filters'>
                <div className='field-search'>
                    <IconSearch size={15} />
                    <input
                        type='text'
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={`Search ${tasks.length} tasks`}
                        aria-label='Search tasks'
                    />
                    {search && (
                        <button className='clear-search' onClick={() => setSearch('')} aria-label='Clear search'>
                            <IconX size={12} />
                        </button>
                    )}
                </div>
                <div className='select-wrap'>
                    <select
                        id='category-selector'
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        aria-label='Category'
                    >
                        <option value='All'>All categories ({tasks.length})</option>
                        {categories.map(c => (
                            <option key={c.category_id} value={c.category_name}>
                                {c.category_name} ({counts[c.category_name] || 0})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className='task-count'>
                {filtered.length} task{filtered.length === 1 ? '' : 's'}
                {selectedCategory !== 'All' && (
                    <button className='link-btn' onClick={() => setSelectedCategory('All')}>Clear filter</button>
                )}
            </div>

            {filtered.length === 0 ? (
                <div className='panel-state'>
                    <IconSearch size={22} />
                    <p>No tasks match your search.</p>
                </div>
            ) : (
                <ul className='task-list'>
                    {filtered.map((t, i) => (
                        <li key={t.task_id} style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
                            <button className={`task-item${t.task_id === activeId ? ' active' : ''}`} onClick={() => setPreviewId(t.task_id)}>
                                <span className='task-num'>{t.task_id}</span>
                                <span className='task-text'>
                                    <span className='task-name'>{t.task_name}</span>
                                    <span className='task-snippet'>{t.task_description}</span>
                                </span>
                                <span className='task-side'>
                                    {t.task_id === activeId
                                        ? <span className='badge'>Active</span>
                                        : <span className='task-cat'>{shortCategory(t.task_category)}</span>}
                                    <IconChevronRight size={15} />
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default TaskPanel;
