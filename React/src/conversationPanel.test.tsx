import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fetchMock from 'jest-fetch-mock';
import { ConversationPanel } from './conversationPanel';
import { FeedbackContext } from './feedbackContext';
import { TaskProvider } from './taskContext';
import { ToastProvider } from './toast';
import { Metrics } from './models/metrics';

const metrics = {
  criterion_1: { score: 4, comment: 'Focused.' },
  criterion_2: { score: 3, comment: 'Be more specific.' },
  criterion_3: { score: 2, comment: 'Add context.' },
  criterion_4: { score: 4, comment: 'Clear output.' },
};

/* Route fetch calls by URL so background requests (model list, status) don't interfere. */
const mockApi = (send: () => Promise<string> | string, status = 200) => {
  fetchMock.mockResponse(async req => {
    if (req.url.endsWith('/llms')) return JSON.stringify([{ llm_id: 1, name: 'Qwen2-mini' }]);
    if (req.url.endsWith('/llms/status')) return JSON.stringify({ mode: 'live' });
    if (req.url.includes('/messages') && req.method === 'POST') return { status, body: await send() };
    return JSON.stringify({});
  });
};

const setup = (overrides: Partial<React.ComponentProps<typeof ConversationPanel>> = {}) => {
  const setFeedback = jest.fn();
  const setCriteria = jest.fn();
  const props: React.ComponentProps<typeof ConversationPanel> = {
    queries: [{ display_id: 1, stored_id: 1, text: 'My chat', date: new Date(), isMarked: false }],
    createConversation: jest.fn().mockResolvedValue(undefined),
    responses: [],
    setResponses: jest.fn(),
    requests: [],
    setRequests: jest.fn(),
    conversation_id: 1,
    selectedLLM: 1,
    setSelectedLLM: jest.fn(),
    renameConversation: jest.fn(),
    ...overrides,
  };
  render(
    <ToastProvider>
      <TaskProvider>
        <FeedbackContext.Provider value={{ feedback: '', setFeedback, criteria: new Metrics(0, '', 0, '', 0, '', 0, ''), setCriteria }}>
          <ConversationPanel {...props} />
        </FeedbackContext.Provider>
      </TaskProvider>
    </ToastProvider>
  );
  return { props, setFeedback, setCriteria };
};

const postCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

beforeEach(() => {
  fetchMock.resetMocks();
});

it('does not send an empty prompt', () => {
  mockApi(() => '{}');
  const { props } = setup();
  const send = screen.getByRole('button', { name: /send/i });
  expect(send).toBeDisabled();
  fireEvent.click(send);
  expect(props.setRequests).not.toHaveBeenCalled();
  expect(postCalls()).toHaveLength(0);
});

it('sends the prompt and passes the answer and grades on', async () => {
  mockApi(() => JSON.stringify({
    query_id: 10, response_id: 11, response_text: 'An answer', comment: 'Nice prompt', metrics,
  }));
  const { props, setFeedback, setCriteria } = setup();

  fireEvent.change(screen.getByPlaceholderText(/message/i), { target: { value: 'Explain recursion' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => expect(setFeedback).toHaveBeenCalledWith('Nice prompt'));
  const [url, init] = postCalls()[0];
  expect(String(url)).toMatch(/\/conversations\/1\/messages$/);
  expect(JSON.parse(String(init!.body))).toEqual({ query_text: 'Explain recursion', task_id: 0, llm_id: 1 });
  expect(props.setResponses).toHaveBeenCalled();
  expect(setCriteria.mock.calls[0][0].criterion_3).toBe(2);
});

it('shows an error with retry and gives the prompt back when sending fails', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockApi(() => JSON.stringify({ detail: 'Internal error' }), 500);
  setup();

  const box = screen.getByPlaceholderText(/message/i) as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: 'Hello there' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  expect(box.value).toBe('Hello there');
});

it('stops a pending prompt and gives it back for editing', async () => {
  // jest-fetch-mock only honours an abort once the mocked response settles
  mockApi(() => new Promise<string>(res => setTimeout(() => res('{}'), 300)));
  const { props, setFeedback } = setup();

  const box = screen.getByPlaceholderText(/message/i) as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: 'A long question' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));

  const stop = await screen.findByRole('button', { name: /stop/i });
  fireEvent.click(stop);

  await waitFor(() => expect(box.value).toBe('A long question'));
  expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  expect(setFeedback).not.toHaveBeenCalled();
  expect(props.setRequests).toHaveBeenCalledTimes(2); // optimistic add, then rollback
});

it('stops with the Escape key', async () => {
  // jest-fetch-mock only honours an abort once the mocked response settles
  mockApi(() => new Promise<string>(res => setTimeout(() => res('{}'), 300)));
  setup();

  const box = screen.getByPlaceholderText(/message/i) as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: 'Another question' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  await screen.findByRole('button', { name: /stop/i });

  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(box.value).toBe('Another question'));
});
