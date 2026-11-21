/*
 * In-browser stand-in for the FastAPI backend (API/), so GPTitor can be hosted
 * as a static site (e.g. GitHub Pages).
 *
 * installLocalApi() wraps window.fetch: requests to API_URL are answered here,
 * with the same routes, JSON shapes and status codes as the Python API, and
 * everything else goes to the network as usual. Data is kept in localStorage,
 * so each visitor's history stays in their own browser.
 */
import * as engine from './answerEngine';
import categoriesData from './data/categories.json';
import tasksData from './data/tasksEng.json';

const DB_KEY = 'gptitor.localdb';
const USER_ID = 1; // the API has no real auth either: every request is user 1

/* Same models as API/Data/llms.json. The built-in engine answers for all of them. */
const LLMS = [
    { llm_id: 1, name: 'Qwen2-mini' },
    { llm_id: 2, name: 'Llama3-mini' },
    { llm_id: 3, name: 'Qwen2-large' },
    { llm_id: 4, name: 'Llama3-large' },
];

const CATEGORIES = categoriesData.map((c, i) => ({
    category_id: i + 1,
    category_name: c.category_name,
    category_description: c.category_description,
}));

/* Like API/Utilities/init_db.py: tasks whose category doesn't exist are skipped. */
const TASKS = tasksData
    .filter(t => CATEGORIES.some(c => c.category_name === t.task_category))
    .map((t, i) => ({
        task_id: i + 1,
        task_name: t.task_name,
        task_category: t.task_category,
        task_description: t.task_description,
    }));

interface Conversation { conversation_id: number; title: string; user_id: number; llm_id: number; created_at: string }
interface Message {
    message_id: number; conversation_id: number; message_class: 'Request' | 'Response';
    content: string; task_id: number; feedback_id: number; created_at: string;
}
interface Feedback { feedback_id: number; comment: string; metrics: engine.EngineMetrics }
interface Db {
    next: { conversation: number; message: number; feedback: number };
    conversations: Conversation[];
    messages: Message[];
    feedback: Feedback[];
}

const emptyDb = (): Db => ({
    next: { conversation: 1, message: 1, feedback: 1 },
    conversations: [],
    messages: [],
    feedback: [],
});

let memoryDb: Db | null = null; // used when localStorage is unavailable (private mode, blocked storage)

const load = (): Db => {
    try {
        const raw = localStorage.getItem(DB_KEY);
        if (raw) return JSON.parse(raw) as Db;
    } catch { /* fall back to memory */ }
    return memoryDb ?? (memoryDb = emptyDb());
};

const save = (db: Db) => {
    memoryDb = db;
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch { /* keep the in-memory copy */ }
};

const pad = (x: number) => String(x).padStart(2, '0');
/* "YYYY-MM-DD HH:MM:SS" in local time, the format the API returns. */
const timestamp = (d = new Date()) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

class HttpError extends Error {
    constructor(public status: number, public detail: string) { super(detail); }
}

const notFound = (detail: string) => new HttpError(404, detail);

const getConversation = (db: Db, id: number) => {
    const c = db.conversations.find(x => x.conversation_id === id);
    if (!c) throw notFound(`Conversation with ID ${id} not found.`);
    return c;
};

const publicConversation = (c: Conversation) => ({
    conversation_id: c.conversation_id,
    user_id: c.user_id,
    title: c.title,
    llm_id: c.llm_id,
    created_at: c.created_at,
});

const abortError = () => new DOMException('The user aborted a request.', 'AbortError');

/* Like answer_engine.simulate_latency(), but stops early when the request is aborted. */
const simulateLatency = (signal?: AbortSignal | null) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
    }, 900 + Math.random() * 900);
    const onAbort = () => { clearTimeout(timer); reject(abortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
});

const round1 = (x: number) => Math.round(x * 10) / 10;

const statistics = (db: Db) => {
    const mine = new Set(db.conversations.filter(c => c.user_id === USER_ID).map(c => c.conversation_id));
    const requests = db.messages.filter(m => m.message_class === 'Request' && mine.has(m.conversation_id));
    if (requests.length === 0) {
        // The API answers 404 when there's no activity yet; the profile page treats that as empty.
        throw notFound(`Daily activity not found for user ID ${USER_ID}.`);
    }

    const metrics: Record<string, number> = {};
    for (const key of ['criterion_1', 'criterion_2', 'criterion_3', 'criterion_4'] as engine.CriterionKey[]) {
        const scores = requests
            .map(m => db.feedback.find(f => f.feedback_id === m.feedback_id)?.metrics?.[key]?.score)
            .filter((s): s is number => typeof s === 'number');
        metrics[key] = scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    }

    const perDay = new Map<string, number>();
    requests.forEach(m => {
        const day = m.created_at.slice(0, 10);
        perDay.set(day, (perDay.get(day) ?? 0) + 1);
    });

    return {
        metrics,
        total_activity: {
            total_queries: requests.length,
            total_conversations: new Set(requests.map(m => m.conversation_id)).size,
            tasks_solved: new Set(requests.filter(m => m.task_id > 0).map(m => m.task_id)).size,
        },
        daily_activity: [...perDay.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, number_of_queries]) => ({ date, number_of_queries })),
    };
};

type Body = Record<string, unknown>;

const sendQuery = async (conversationId: number, body: Body, signal?: AbortSignal | null) => {
    const queryText = String(body.query_text ?? '');
    const taskId = Number(body.task_id ?? 0);
    if (queryText.length > 2048) throw new HttpError(422, 'query_text should have at most 2048 characters');
    if (!queryText.trim()) throw new HttpError(400, 'Question cannot be empty');

    getConversation(load(), conversationId);
    const task = taskId ? TASKS.find(t => t.task_id === taskId) : undefined;
    if (taskId && !task) throw notFound(`Task with ID ${taskId} not found.`);

    const requestCreatedAt = timestamp();
    await simulateLatency(signal);
    const [comment, metrics] = engine.feedback(queryText, task?.task_description ?? '', task?.task_name ?? '');
    const responseText = engine.answer(queryText, task?.task_name ?? '');

    // Re-read: the conversation may have been deleted, or another tab may have written, while we waited.
    const db = load();
    getConversation(db, conversationId);
    const feedbackId = db.next.feedback++;
    db.feedback.push({ feedback_id: feedbackId, comment, metrics });
    const queryId = db.next.message++;
    db.messages.push({
        message_id: queryId, conversation_id: conversationId, message_class: 'Request',
        content: queryText, task_id: taskId, feedback_id: feedbackId, created_at: requestCreatedAt,
    });
    const responseId = db.next.message++;
    db.messages.push({
        message_id: responseId, conversation_id: conversationId, message_class: 'Response',
        content: responseText, task_id: taskId, feedback_id: feedbackId, created_at: timestamp(),
    });
    save(db);

    return {
        conversation_id: conversationId,
        query_id: queryId,
        response_id: responseId,
        response_text: responseText,
        comment,
        metrics,
    };
};

const route = async (method: string, path: string, body: Body, signal?: AbortSignal | null): Promise<[number, unknown]> => {
    const seg = path.split('/').filter(Boolean);
    if (seg[0] === 'profile' && seg[1] === 'statistics' && seg.length === 2 && method === 'GET') {
        return [200, statistics(load())];
    }

    // Every other route's second segment is a numeric ID, as in the FastAPI routers.
    const id = seg[1] !== undefined ? Number(seg[1]) : NaN;
    if (seg[1] !== undefined && !Number.isInteger(id)) throw new HttpError(422, 'Input should be a valid integer');

    if (seg[0] === 'llms' && seg.length === 1 && method === 'GET') return [200, LLMS];

    if (seg[0] === 'categories' && method === 'GET') {
        if (seg.length === 1) return [200, CATEGORIES];
        const category = CATEGORIES.find(c => c.category_id === id);
        if (!category) throw notFound(`Category with ID '${id}' not found.`);
        return [200, TASKS.filter(t => t.task_category === category.category_name)];
    }

    if (seg[0] === 'tasks' && method === 'GET') {
        if (seg.length === 1) return [200, TASKS];
        const task = TASKS.find(t => t.task_id === id);
        if (!task) throw notFound(`Task with ID ${id} not found.`);
        return [200, task];
    }

    if (seg[0] === 'feedback' && seg.length === 2 && method === 'GET') {
        const db = load();
        const message = db.messages.find(m => m.message_id === id);
        if (!message) throw notFound(`Request with ID ${id} not found.`);
        const fb = db.feedback.find(f => f.feedback_id === message.feedback_id);
        if (!fb) throw notFound(`Feedback for request with ID ${id} not found.`);
        return [200, fb];
    }

    if (seg[0] === 'conversations') {
        if (seg.length === 1 && method === 'GET') {
            return [200, load().conversations.filter(c => c.user_id === USER_ID).map(publicConversation)];
        }
        if (seg.length === 1 && method === 'POST') {
            const db = load();
            const conversation: Conversation = {
                conversation_id: db.next.conversation++,
                title: 'Untitled',
                user_id: USER_ID,
                llm_id: Number(body.llm_id ?? 1),
                created_at: timestamp(),
            };
            db.conversations.push(conversation);
            save(db);
            return [201, publicConversation(conversation)];
        }
        if (seg.length === 2 && method === 'GET') return [200, publicConversation(getConversation(load(), id))];
        if (seg.length === 2 && method === 'DELETE') {
            const db = load();
            getConversation(db, id);
            const feedbackIds = new Set(db.messages.filter(m => m.conversation_id === id).map(m => m.feedback_id));
            db.feedback = db.feedback.filter(f => !feedbackIds.has(f.feedback_id));
            db.messages = db.messages.filter(m => m.conversation_id !== id);
            db.conversations = db.conversations.filter(c => c.conversation_id !== id);
            save(db);
            return [200, `Conversation with ID ${id} deleted successfully.`];
        }
        if (seg.length === 2 && method === 'PUT') {
            const db = load();
            const conversation = getConversation(db, id);
            if (body.generate) {
                const first = db.messages.find(m => m.conversation_id === id);
                if (!first) throw notFound(`Messages in conversation with ID ${id} not found.`);
                conversation.title = engine.title(first.content);
            } else {
                const newTitle = String(body.content ?? 'Untitled');
                if (!newTitle.trim()) throw new HttpError(400, 'Title cannot be empty.');
                conversation.title = newTitle;
            }
            save(db);
            return [200, {
                detail: `Conversation with ID ${id} updated successfully.`,
                new_title: conversation.title,
            }];
        }
        if (seg.length === 3 && seg[2] === 'messages' && method === 'GET') {
            const db = load();
            getConversation(db, id);
            return [200, db.messages
                .filter(m => m.conversation_id === id)
                .map(({ message_id, message_class, content, feedback_id }) => ({ message_id, message_class, content, feedback_id }))];
        }
        if (seg.length === 3 && seg[2] === 'messages' && method === 'POST') {
            return [201, await sendQuery(id, body, signal)];
        }
    }

    throw notFound('Not Found');
};

const json = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/** Answers a request the way the FastAPI backend would. */
export const handleLocalRequest = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? 'GET').toUpperCase();
    let body: Body = {};
    if (typeof init.body === 'string' && init.body) {
        try {
            body = JSON.parse(init.body);
        } catch {
            return json(422, { detail: 'JSON decode error' });
        }
    }
    const path = new URL(url, 'http://local').pathname;
    try {
        const [status, data] = await route(method, path, body, init.signal);
        return json(status, data);
    } catch (e) {
        if (e instanceof HttpError) return json(e.status, { detail: e.detail });
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        return json(500, { detail: `Internal server error: ${e instanceof Error ? e.message : String(e)}` });
    }
};

/** Routes every fetch to `apiUrl` to the in-browser backend. */
export const installLocalApi = (apiUrl: string) => {
    const base = apiUrl.replace(/\/+$/, '');
    const networkFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url === base || url.startsWith(base + '/')) {
            const request = input instanceof Request ? input : null;
            return handleLocalRequest(url.slice(base.length) || '/', {
                method: init?.method ?? request?.method,
                body: init?.body,
                signal: init?.signal ?? request?.signal,
            });
        }
        return networkFetch(input, init);
    };
};
