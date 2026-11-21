import { useState, useRef, useEffect, useContext } from 'react';
import './conversationPanel.css';
import { FeedbackContext } from './feedbackContext';
import API_URL from './config';
import { SendContext } from './sendContext';
import { useTaskContext } from './taskContext';
import MarkdownRenderer from "./markdownRenderer";
import { metricsFromApi } from './criteria';
import { STARTER_PROMPTS } from './guides';
import { useLLMs, useDisplayName, initials, readReactions, writeReactions, Reaction } from './user';
import { useSlider, useTypewriter } from './hooks';
import { useToast } from './toast';
import {
    IconArrowUp, IconBot, IconCopy, IconCheck, IconThumbUp, IconThumbDown, IconAlert,
    IconRefresh, IconX, IconClipboard, IconSparkles, IconChart, IconTarget, IconStop,
} from './icons';

/* Renders an answer; a freshly received one is revealed word by word. */
const BotText: React.FC<{ text: string; animate: boolean; onTick: () => void; onDone: () => void }> = ({ text, animate, onTick, onDone }) => {
    const { shown, done } = useTypewriter(text, animate, onTick);
    useEffect(() => {
        if (animate && done) onDone();
    }, [done, animate]);
    return (
        <div className={!done ? 'streaming' : undefined}>
            <MarkdownRenderer text={shown} />
        </div>
    );
};

interface MessageSimplifyed {
    id: number,
    text: string,
}

interface ConversationPanelProps {
    queries: { display_id: number; stored_id: number; text: string; date: Date; isMarked: boolean }[];
    createConversation: () => Promise<void>;
    switchModel?: (llmId: number) => Promise<void>;
    responses: MessageSimplifyed[];
    setResponses: React.Dispatch<React.SetStateAction<MessageSimplifyed[]>>;
    requests: MessageSimplifyed[];
    setRequests: React.Dispatch<React.SetStateAction<MessageSimplifyed[]>>;
    conversation_id: number;
    selectedLLM: number | null;
    setSelectedLLM: (llmId: number | null) => void;
    renameConversation: (conversation_id: number, importText: string) => void;
    isStudyMode?: boolean;
    onSent?: () => void;
    onBrowseTasks?: () => void;
}

const MAX_CHARS = 4000;

/* Plain-language error for the user (technical details go to the console). */
const friendlyError = (raw: string) => {
    console.error('Send failed:', raw);
    if (/failed to fetch|networkerror|load failed/i.test(raw)) {
        return "Couldn't connect. Check your connection and try again.";
    }
    return 'Something went wrong while answering. Please try again.';
};

export const ConversationPanel: React.FC<ConversationPanelProps> = ({
    queries, createConversation, switchModel, responses, setResponses, requests, setRequests, conversation_id,
    selectedLLM, setSelectedLLM, renameConversation, isStudyMode = true, onSent, onBrowseTasks,
}) => {
    const [text, setText] = useState<string>('');
    const { selectedTask, setSelectedTask } = useTaskContext();
    const { setFeedback, setCriteria } = useContext(FeedbackContext);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<{ message: string; prompt: string } | null>(null);
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [reactions, setReactions] = useState<Record<string, Reaction>>(readReactions);
    const [activeFeedbackId, setActiveFeedbackId] = useState<number | null>(null);
    const { setIsSended } = useContext(SendContext);
    const llms = useLLMs();
    const userName = useDisplayName();
    const toast = useToast();
    const [freshId, setFreshId] = useState<number | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const pickerRef = useRef<HTMLDivElement>(null);
    const pill = useSlider(pickerRef, [selectedLLM, llms.length]);

    const stickToBottom = () => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    };

    const conversation = queries.find(q => q.stored_id === conversation_id);
    const modelName = llms.find(l => l.llm_id === selectedLLM)?.name ?? 'Assistant';
    const hasTask = isStudyMode && !!selectedTask && selectedTask.task_id > 0;

    const adjustTextareaHeight = () => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    };

    useEffect(() => {
        adjustTextareaHeight();
    }, [text]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (requests.length === 0 && !loading && !error) el.scrollTop = 0;
        else el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, [requests, responses, loading, error]);

    useEffect(() => {
        abortRef.current?.abort();
        setError(null);
        setActiveFeedbackId(null);
        setFreshId(null);
    }, [conversation_id]);

    const revealing = freshId !== null;
    const busy = loading || revealing;

    /* Stop: cancel the pending request, or finish the reveal instantly if the answer is already here. */
    const stop = () => {
        if (loading) abortRef.current?.abort();
        else if (revealing) setFreshId(null);
    };

    useEffect(() => {
        if (!busy) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') stop();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [busy, loading]);

    /* Picking a model starts a new conversation with it (one model per conversation). */
    const selectModel = (llmId: number) => {
        if (llmId === selectedLLM || loading) return;
        if (switchModel) {
            const name = llms.find(l => l.llm_id === llmId)?.name ?? 'the new model';
            switchModel(llmId)
                .then(() => toast(`New chat with ${name}`, 'info'))
                .catch(() => toast('Could not start a new chat', 'error'));
        } else {
            setSelectedLLM(llmId);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
        }
    };

    const copyResponse = async (id: number, content: string) => {
        try {
            await navigator.clipboard.writeText(content);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = content;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        setCopiedId(id);
        toast('Copied to clipboard');
        window.setTimeout(() => setCopiedId(c => (c === id ? null : c)), 1500);
    };

    const react = (id: number, value: Reaction) => {
        setReactions(prev => {
            const next = { ...prev };
            if (next[id] === value) delete next[id];
            else next[id] = value;
            writeReactions(next);
            return next;
        });
    };

    const handleSend = async (override?: string) => {
        const prompt = (override ?? text).trim();
        if (prompt === "" || loading) return;
        setText('');
        setError(null);

        try {
            if (queries.length === 0) {
                setIsSended(false);
                await createConversation();
            }
        } catch (e) {
            setError({ message: "Couldn't start a conversation. Please try again.", prompt });
            setText(prompt);
            return;
        }

        const isFirstMessage = requests.length === 0;
        setRequests(prev => [...prev, { id: 0, text: prompt }]);
        setLoading(true);
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const response = await fetch(`${API_URL}/conversations/${conversation_id}/messages`, {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query_text: prompt,
                    task_id: hasTask ? selectedTask!.task_id : 0,
                    llm_id: selectedLLM,
                })
            });

            if (!response.ok) {
                let detail = `${response.status} ${response.statusText}`;
                try {
                    const body = await response.json();
                    if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
                } catch { /* not JSON */ }
                throw new Error(detail);
            }

            const data = await response.json();
            setRequests(prev => {
                const updated = [...prev];
                const last = updated.length - 1;
                if (last >= 0) updated[last] = { ...updated[last], id: data.query_id };
                return updated;
            });
            setFreshId(data.response_id);
            setResponses(prev => [...prev, { id: data.response_id, text: data.response_text }]);
            setFeedback(data.comment);
            setCriteria(metricsFromApi(data.metrics));
            setActiveFeedbackId(data.query_id);
            setIsSended(true);
            onSent?.();
        } catch (err) {
            /* Roll back the optimistic message and give the prompt back to the user. */
            setRequests(prev => prev.slice(0, -1));
            setLoading(false);
            if (controller.signal.aborted) {
                setText(prompt);
                toast('Stopped. Your prompt is back in the box', 'info');
                inputRef.current?.focus();
                return;
            }
            setError({
                message: friendlyError(err instanceof Error ? err.message : String(err)),
                prompt,
            });
            setText(prompt);
            setLoading(false);
            return;
        }
        setLoading(false);

        if (isFirstMessage && conversation?.text === "Untitled") {
            try {
                const response = await fetch(`${API_URL}/conversations/${conversation_id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: "nothing", generate: true })
                });
                const data = await response.json();
                if (data.new_title) renameConversation(conversation_id, data.new_title);
            } catch { /* keep "Untitled" */ }
        }
    };

    const showFeedback = async (query_id: number) => {
        if (!query_id) return;
        setActiveFeedbackId(query_id);
        try {
            const response = await fetch(`${API_URL}/feedback/${query_id}`);
            const data = await response.json();
            setFeedback(data.comment);
            setCriteria(metricsFromApi(data.metrics));
            onSent?.();
        } catch (e) {
            console.error('Could not load feedback', e);
        }
    };

    const isEmpty = requests.length === 0 && !loading;
    const latestRequestId = requests.length ? requests[requests.length - 1].id : null;
    const currentFeedbackId = activeFeedbackId ?? latestRequestId;

    return (
        <section className='chat-card card chatbigcontainter' aria-label='Conversation'>
            <div className='chat-toolbar'>
                <div className='chat-title'>
                    <h2>{conversation?.text || 'New conversation'}</h2>
                    <span className='text-muted chat-meta'>
                        {requests.length > 0 ? `${requests.length} prompt${requests.length === 1 ? '' : 's'}` : 'No prompts yet'}
                    </span>
                </div>
                <div className='model-picker optionContainer slider-host' role='radiogroup' aria-label='Model' ref={pickerRef}>
                    <span className='slider-pill' style={pill} />
                    {llms.map(llm => (
                        <button
                            key={llm.llm_id}
                            role='radio'
                            aria-checked={selectedLLM === llm.llm_id}
                            data-active={selectedLLM === llm.llm_id}
                            title='Switching model starts a new chat'
                            className={`option${selectedLLM === llm.llm_id ? ' selected' : ''}`}
                            onClick={() => selectModel(llm.llm_id)}
                        >
                            {llm.name}
                        </button>
                    ))}
                </div>
            </div>

            {hasTask && (
                <div className='task-banner'>
                    <IconTarget size={16} />
                    <span className='task-banner-label'>Task</span>
                    <span className='task-banner-name'>{selectedTask!.task_name}</span>
                    <span className='badge badge-neutral'>{selectedTask!.category}</span>
                    <button className='icon-btn' aria-label='Clear task' data-tip='Clear task' onClick={() => setSelectedTask(null)}>
                        <IconX size={15} />
                    </button>
                </div>
            )}

            <div className='messages Convo' ref={scrollRef}>
                {isEmpty ? (
                    <div className='empty-chat'>
                        <div className='empty-icon'><IconSparkles size={26} /></div>
                        <h3>{hasTask ? `Ready for "${selectedTask!.task_name}"?` : 'What would you like to practise?'}</h3>
                        <p className='text-muted'>
                            Write a prompt for <strong>{modelName}</strong>. Every prompt is graded on focus, clarity, context and
                            output, and you get feedback on how to improve it.
                        </p>
                        {!hasTask && isStudyMode && (
                            <button className='btn btn-secondary browse-btn' onClick={onBrowseTasks}>
                                <IconClipboard size={15} /> Pick a graded task
                            </button>
                        )}
                        {!hasTask && (
                            <div className='starter-grid'>
                                {STARTER_PROMPTS.map((p, i) => (
                                    <button key={p} className='starter' style={{ animationDelay: `${0.05 * i + 0.1}s` }} onClick={() => { setText(p); inputRef.current?.focus(); }}>
                                        <span>{p}</span>
                                        <IconArrowUp size={14} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    requests.map((request, index) => {
                        const response = responses[index];
                        const rid = response?.id;
                        return (
                            <div key={`turn-${index}`} className='turn conversation-item'>
                                <div className={`msg user${currentFeedbackId === request.id && request.id ? ' active' : ''}`}>
                                    <div className='bubble'>
                                        <p>{request.text}</p>
                                    </div>
                                    <span className='msg-avatar user-avatar'>{initials(userName)}</span>
                                    {request.id > 0 && (
                                        <button className='feedback-link' onClick={() => showFeedback(request.id)}>
                                            <IconChart size={13} />
                                            {currentFeedbackId === request.id ? 'Showing feedback' : 'View feedback'}
                                        </button>
                                    )}
                                </div>
                                {response && (
                                    <div className='msg bot'>
                                        <span className='msg-avatar bot-avatar'><IconBot size={16} /></span>
                                        <div className='bot-body'>
                                            <span className='msg-author'>
                                                {modelName}
                                            </span>
                                            <div className='bubble'>
                                                <BotText
                                                    text={response.text}
                                                    animate={rid === freshId}
                                                    onTick={stickToBottom}
                                                    onDone={() => setFreshId(null)}
                                                />
                                            </div>
                                            <div className='msg-actions reactions'>
                                                <button className='icon-btn' aria-label='Copy response' data-tip={copiedId === rid ? 'Copied!' : 'Copy'} onClick={() => copyResponse(rid, response.text)}>
                                                    {copiedId === rid ? <IconCheck size={15} /> : <IconCopy size={15} />}
                                                </button>
                                                <button className={`icon-btn${reactions[rid] === 'up' ? ' active' : ''}`} aria-label='Good response' aria-pressed={reactions[rid] === 'up'} data-tip='Good response' onClick={() => react(rid, 'up')}>
                                                    <IconThumbUp size={15} />
                                                </button>
                                                <button className={`icon-btn${reactions[rid] === 'down' ? ' active down' : ''}`} aria-label='Bad response' aria-pressed={reactions[rid] === 'down'} data-tip='Bad response' onClick={() => react(rid, 'down')}>
                                                    <IconThumbDown size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}

                {loading && (
                    <div className='msg bot loading'>
                        <span className='msg-avatar bot-avatar'><IconBot size={16} /></span>
                        <div className='bot-body'>
                            <span className='msg-author'>{modelName}</span>
                            <div className='bubble typing' aria-label='Generating response'>
                                <span /><span /><span />
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className='send-error' role='alert'>
                        <IconAlert size={18} />
                        <div>
                            <strong>No response from {modelName}</strong>
                            <p>{error.message} Your prompt is back in the box below.</p>
                        </div>
                        <div className='send-error-actions'>
                            <button className='btn btn-secondary' onClick={() => handleSend(error.prompt)}>
                                <IconRefresh size={14} /> Retry
                            </button>
                            <button className='icon-btn' aria-label='Dismiss' onClick={() => setError(null)}>
                                <IconX size={15} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className='composer inputField'>
                <div className='composer-box'>
                    <textarea
                        rows={1}
                        className='chatinput'
                        ref={inputRef}
                        placeholder={hasTask ? `Write your prompt for "${selectedTask!.task_name}"…` : `Message ${modelName}…`}
                        value={text}
                        maxLength={MAX_CHARS}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    {busy ? (
                        <button className='sendBtn stop' aria-label="Stop" title='Stop (Esc)' onClick={stop}>
                            <IconStop size={14} />
                        </button>
                    ) : (
                        <button
                            className='sendBtn'
                            aria-label="Send"
                            onClick={() => handleSend()}
                            disabled={!text.trim()}
                        >
                            <IconArrowUp size={18} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
                <div className='composer-hint'>
                    <span>
                        {busy
                            ? <><kbd>Esc</kbd> to stop</>
                            : <><kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line</>}
                    </span>
                    {text.length > MAX_CHARS * 0.8 && (
                        <span className={text.length > MAX_CHARS * 0.95 ? 'over' : ''}>{text.length} / {MAX_CHARS}</span>
                    )}
                </div>
            </div>
        </section>
    );
};
