import { useState, useEffect, useContext, MutableRefObject, useMemo, useRef } from 'react';
import { useSlider } from './hooks';
import { useNavigate } from 'react-router-dom';
import './sidebar.css';
import QueryComponent from './queryComponent';
import { SendContext } from './sendContext';
import type { Query } from './App';
import { IconPanelLeft, IconPlus, IconSearch, IconStar, IconX, IconMessage, IconAlert, IconRefresh } from './icons';

interface SidebarProps {
    CreateConversation: () => Promise<void>;
    openConversation: (stored_id: number) => void;
    deleteConversation: (display_id: number, stored_id: number) => void;
    queries: Query[];
    toMark: (stored_id: number) => void;
    isLiked: MutableRefObject<boolean>;
    likedQueries: Query[];
    renameConversation: (conversation_id: number, importText: string) => void;
    isRenamed: MutableRefObject<boolean>;
    moveForbidden: MutableRefObject<boolean>;
    activeConversationId: number;
    historyLoaded: boolean;
    historyError: boolean;
    retryHistory: () => void;
    forceExpanded: boolean;
    mobileOpen: boolean;
    onMobileClose: () => void;
}

const COLLAPSE_KEY = 'gptitor.sidebarCollapsed';

const startOfDay = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c.getTime();
};

const groupByDate = (items: Query[]) => {
    const today = startOfDay(new Date());
    const day = 24 * 60 * 60 * 1000;
    const groups: { label: string; items: Query[] }[] = [
        { label: 'Today', items: [] },
        { label: 'Yesterday', items: [] },
        { label: 'Previous 7 days', items: [] },
        { label: 'Older', items: [] },
    ];
    items.forEach(q => {
        const t = startOfDay(q.date);
        if (t >= today) groups[0].items.push(q);
        else if (t >= today - day) groups[1].items.push(q);
        else if (t >= today - 7 * day) groups[2].items.push(q);
        else groups[3].items.push(q);
    });
    return groups.filter(g => g.items.length > 0);
};

const Sidebar: React.FC<SidebarProps> = ({
    CreateConversation,
    openConversation,
    deleteConversation,
    queries,
    toMark,
    isLiked,
    likedQueries,
    renameConversation,
    isRenamed,
    moveForbidden,
    activeConversationId,
    historyLoaded,
    historyError,
    retryHistory,
    forceExpanded,
    mobileOpen,
    onMobileClose,
}) => {
    const navigate = useNavigate();
    const [selectedQueryId, setSelectedQueryId] = useState<number | null>(null);
    const { isSended } = useContext(SendContext);
    const [showStarred, setShowStarred] = useState(false);
    const [findValue, setFindValue] = useState('');
    const [creating, setCreating] = useState(false);
    const [collapsed, setCollapsed] = useState(() => {
        /* Remember the user's choice; otherwise start collapsed on smaller laptop screens. */
        try {
            const saved = localStorage.getItem(COLLAPSE_KEY);
            if (saved !== null) return saved === '1';
        } catch { /* ignore */ }
        return window.innerWidth < 1200;
    });

    const isCollapsed = collapsed && !forceExpanded;
    const tabsRef = useRef<HTMLDivElement>(null);
    const pill = useSlider(tabsRef, [showStarred, isCollapsed, queries.length, likedQueries.length]);

    useEffect(() => {
        try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
    }, [collapsed]);

    useEffect(() => {
        setSelectedQueryId(activeConversationId);
    }, [activeConversationId]);

    /* Open the right conversation when the list changes (first load → last opened, new chat → newest). */
    useEffect(() => {
        if (queries.length > 0 && isSended && !isLiked.current && !isRenamed.current) {
            if (moveForbidden.current) {
                const savedId = localStorage.getItem('lastOpenedDialogId');
                const id = savedId !== null ? parseInt(savedId, 10) : NaN;
                const target = queries.some(q => q.stored_id === id) ? id : queries[queries.length - 1].stored_id;
                setSelectedQueryId(target);
                openConversation(target);
            } else {
                const last = queries[queries.length - 1].stored_id;
                setSelectedQueryId(last);
                openConversation(last);
            }
        }
        moveForbidden.current = false;
    }, [queries]);

    const handleCreateConversation = async () => {
        setCreating(true);
        try {
            await CreateConversation();
            navigate('/chatpage');
            onMobileClose();
        } catch (e) {
            console.error(e);
        } finally {
            setCreating(false);
        }
    };

    const handleOpen = (stored_id: number) => {
        setSelectedQueryId(stored_id);
        openConversation(stored_id);
        navigate('/chatpage');
        onMobileClose();
    };

    const sorted = useMemo(
        () => [...queries].sort((a, b) => b.date.getTime() - a.date.getTime()),
        [queries]
    );

    const term = findValue.trim().toLowerCase();
    const source = showStarred ? sorted.filter(q => q.isMarked) : sorted;
    const visible = term ? source.filter(q => q.text.toLowerCase().includes(term)) : source;
    const groups = term || showStarred ? [{ label: term ? `${visible.length} result${visible.length === 1 ? '' : 's'}` : 'Starred', items: visible }] : groupByDate(visible);

    const renderItem = (query: Query) => (
        <QueryComponent
            key={query.stored_id}
            display_id={query.display_id}
            stored_id={query.stored_id}
            queryText={query.text}
            onDelete={deleteConversation}
            onOpen={handleOpen}
            isSelected={selectedQueryId === query.stored_id}
            toMark={toMark}
            isMarked={query.isMarked}
            onEdit={renameConversation}
            highlight={term}
        />
    );

    return (
        <>
        <div className={`sidebar-backdrop${mobileOpen ? ' show' : ''}`} onClick={onMobileClose} aria-hidden='true' />
        <aside className={`sidebar${isCollapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`} aria-label='Conversations'>
            <div className='sidebar-rail' aria-hidden={!isCollapsed}>
                <button className='icon-btn' data-tip='Expand sidebar' data-tip-pos='right' onClick={() => setCollapsed(false)} tabIndex={isCollapsed ? 0 : -1}>
                    <IconPanelLeft />
                </button>
                <button className='icon-btn new-chat-mini' data-tip='New chat' data-tip-pos='right' onClick={handleCreateConversation} disabled={creating} tabIndex={isCollapsed ? 0 : -1}>
                    <IconPlus />
                </button>
                <button
                    className='icon-btn'
                    data-tip={`Starred (${likedQueries.length})`}
                    data-tip-pos='right'
                    onClick={() => { setCollapsed(false); setShowStarred(true); }}
                    tabIndex={isCollapsed ? 0 : -1}
                >
                    <IconStar />
                </button>
            </div>

            <div className='sidebar-panel' aria-hidden={isCollapsed}>
                <div className='sidebar-head'>
                    <span className='sidebar-title'>Conversations</span>
                    <button className='icon-btn collapse-btn' data-tip='Collapse' data-tip-pos='bottom' onClick={() => setCollapsed(true)}>
                        <IconPanelLeft />
                    </button>
                    <button className='icon-btn close-drawer-btn' aria-label='Close' onClick={onMobileClose}>
                        <IconX />
                    </button>
                </div>

                <button className='btn btn-primary new-chat-btn' onClick={handleCreateConversation} disabled={creating}>
                    <IconPlus size={16} />
                    {creating ? 'Creating…' : 'New chat'}
                </button>

                <div className='history-search'>
                    <IconSearch size={16} />
                    <input
                        type='text'
                        placeholder='Search conversations'
                        value={findValue}
                        onChange={e => setFindValue(e.target.value)}
                        aria-label='Search conversations'
                    />
                    {findValue && (
                        <button className='clear-search' onClick={() => setFindValue('')} aria-label='Clear search'>
                            <IconX size={14} />
                        </button>
                    )}
                </div>

                <div className='filter-tabs star-filter slider-host' role='tablist' ref={tabsRef}>
                    <span className='slider-pill' style={pill} />
                    <button role='tab' aria-selected={!showStarred} data-active={!showStarred} className={!showStarred ? 'active' : ''} onClick={() => setShowStarred(false)}>
                        All <span className='count'>{queries.length}</span>
                    </button>
                    <button role='tab' aria-selected={showStarred} data-active={showStarred} className={showStarred ? 'active' : ''} onClick={() => setShowStarred(true)}>
                        <IconStar size={13} /> Starred <span className='count'>{likedQueries.length}</span>
                    </button>
                </div>

                <div className='conv-list'>
                    {!historyLoaded && (
                        <div className='skeletons' aria-label='Loading conversations'>
                            {[0, 1, 2, 3].map(i => <div key={i} className='skeleton' style={{ width: `${85 - i * 12}%` }} />)}
                        </div>
                    )}

                    {historyLoaded && historyError && (
                        <div className='list-state error'>
                            <IconAlert size={20} />
                            <p>Couldn't load your history.</p>
                            <button className='btn btn-secondary' onClick={retryHistory}><IconRefresh size={14} /> Retry</button>
                        </div>
                    )}

                    {historyLoaded && !historyError && visible.length === 0 && (
                        <div className='list-state'>
                            {showStarred ? <IconStar size={20} /> : <IconMessage size={20} />}
                            <p>
                                {term
                                    ? `No conversations match "${findValue.trim()}".`
                                    : showStarred
                                        ? 'Star a conversation to keep it here.'
                                        : 'No conversations yet.'}
                            </p>
                        </div>
                    )}

                    {visible.length > 0 && groups.map(g => (
                        <section key={g.label} className='conv-group'>
                            <h3 className='group-label'>{g.label}</h3>
                            <div className='queries'>{g.items.map(renderItem)}</div>
                        </section>
                    ))}
                </div>
            </div>
        </aside>
        </>
    );
};

export default Sidebar;
