import { handleLocalRequest } from './server';

const call = async (method: string, path: string, body?: unknown, signal?: AbortSignal) => {
  const res = await handleLocalRequest(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  return { status: res.status, data: await res.json() };
};

/* Sending a prompt waits 0.9–1.8 s like the real API; fast-forward through it. */
const send = async (conversationId: number, body: unknown, signal?: AbortSignal) => {
  const pending = call('POST', `/conversations/${conversationId}/messages`, body, signal);
  await jest.advanceTimersByTimeAsync(2000);
  return pending;
};

beforeEach(() => {
  localStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => jest.useRealTimers());

test('serves tasks, categories and models', async () => {
  const tasks = await call('GET', '/tasks');
  const categories = await call('GET', '/categories');
  const llms = await call('GET', '/llms');
  expect(tasks.data).toHaveLength(40);
  expect(categories.data.length).toBeGreaterThan(0);
  expect(llms.data[0]).toEqual({ llm_id: 1, name: 'Qwen2-mini' });
  expect((await call('GET', '/tasks/1')).data.task_name).toBe('Car travel');
  expect((await call('GET', '/tasks/999')).status).toBe(404);
});

test('a conversation round trip: send, feedback, title, stats, delete', async () => {
  const created = await call('POST', '/conversations', { llm_id: 2 });
  expect(created.status).toBe(201);
  const id = created.data.conversation_id;
  expect(created.data).toMatchObject({ title: 'Untitled', llm_id: 2 });

  expect((await call('GET', '/profile/statistics')).status).toBe(404);

  const sent = await send(id, { query_text: 'Explain black holes to a 12-year-old in 3 bullet points', task_id: 1 });
  expect(sent.status).toBe(201);
  expect(sent.data.response_text).toContain('Black holes');
  expect(sent.data.metrics.criterion_1.score).toBeGreaterThan(0);

  const messages = await call('GET', `/conversations/${id}/messages`);
  expect(messages.data.map((m: { message_class: string }) => m.message_class)).toEqual(['Request', 'Response']);

  const fb = await call('GET', `/feedback/${sent.data.query_id}`);
  expect(fb.data.comment).toBe(sent.data.comment);

  const renamed = await call('PUT', `/conversations/${id}`, { content: 'nothing', generate: true });
  expect(renamed.data.new_title).toBe('Black holes');

  const stats = await call('GET', '/profile/statistics');
  expect(stats.data.total_activity).toEqual({ total_queries: 1, total_conversations: 1, tasks_solved: 1 });
  expect(stats.data.daily_activity).toHaveLength(1);

  expect((await call('DELETE', `/conversations/${id}`)).status).toBe(200);
  expect((await call('GET', '/conversations')).data).toEqual([]);
  expect((await call('GET', `/feedback/${sent.data.query_id}`)).status).toBe(404);
});

test('rejects empty prompts and unknown conversations', async () => {
  const { data } = await call('POST', '/conversations', { llm_id: 1 });
  expect((await call('POST', `/conversations/${data.conversation_id}/messages`, { query_text: '   ' })).status).toBe(400);
  expect((await send(999, { query_text: 'hello' })).status).toBe(404);
  expect((await call('PUT', `/conversations/${data.conversation_id}`, { content: ' ', generate: false })).status).toBe(400);
});

test('a stopped prompt is not saved', async () => {
  const { data } = await call('POST', '/conversations', { llm_id: 1 });
  const controller = new AbortController();
  const pending = call('POST', `/conversations/${data.conversation_id}/messages`, { query_text: 'hello' }, controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect((await call('GET', `/conversations/${data.conversation_id}/messages`)).data).toEqual([]);
});
