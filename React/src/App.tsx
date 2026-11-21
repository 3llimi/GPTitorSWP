import './App.css';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useState, useContext, useEffect, useRef } from 'react';
import { FeedbackContext } from './feedbackContext';
import Sidebar from './sidebar';
import NavBar from './header';
import StudyMode from './studymode';
import Profile from './profile';
import Tutorial from './Tutorial';
import API_URL from './config';
import SendContextProvider from './sendContextProvider';
import { emptyMetrics, metricsFromApi } from './criteria';

interface Message {
  id: number;
  message_class: string;
  text: string;
  feedback_id: number;
}

interface MessageSimplifyed {
  id: number,
  text: string,
}

export interface Query {
  display_id: number;
  stored_id: number;
  text: string;
  date: Date;
  isMarked: boolean;
  llm_id?: number | null;
}

const addHoursToDate = (date: Date, hours: number): Date => {
  const newDate = new Date(date.getTime());
  newDate.setHours(newDate.getHours() + hours);
  return newDate;
};

/* Re-mounts the page on navigation so it fades in. */
const Page: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  return <div key={pathname} className='page'>{children}</div>;
};

const App: React.FC = () => {

  const { setFeedback, setCriteria } = useContext(FeedbackContext);
  const [convId, setConvId] = useState(1);
  const [queries, setQueries] = useState<Query[]>([]);
  const [nextId, setNextId] = useState(1);
  const [responses, setResponses] = useState<MessageSimplifyed[]>([]);
  const [requests, setRequests] = useState<MessageSimplifyed[]>([]);
  const hasMounted = useRef(false);
  const [selectedLLM, setSelectedLLM] = useState<number | null>(null);
  const isLiked = useRef(false);
  const isRenamed = useRef(false);
  const moveForbidden = useRef(false);
  const needInAddToFavList = useRef(false);
  const [likedQueries, setLikedQueries] = useState<Query[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [runTutorial, setRunTutorial] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (queries.length === 0) {
      setRequests([]);
      setResponses([]);
    }
  }, [queries]);

  const toMark = (stored_id: number) => {
    const updatedQueries = queries.map(item =>
      item.stored_id === stored_id ? { ...item, isMarked: !item.isMarked } : item
    );
    needInAddToFavList.current = true;
    setQueries(updatedQueries);
    isLiked.current = true;
  };

  useEffect(() => {
    if (isLiked.current) {
      const savedMarks = queries.reduce<Record<number, boolean>>((acc, item) => {
        acc[item.stored_id] = item.isMarked || false;
        return acc;
      }, {});
      localStorage.setItem('isMarked', JSON.stringify(savedMarks));
      isLiked.current = false;
    }
  }, [queries]);

  const addQueries = (data: any[]) => {
    const savedMarksJson = localStorage.getItem('isMarked');
    const savedMarks = savedMarksJson ? JSON.parse(savedMarksJson) : {};
    needInAddToFavList.current = true;
    setQueries(
      data.map(item => ({
        display_id: item.conversation_id,
        stored_id: item.conversation_id,
        text: item.title,
        date: addHoursToDate(new Date(item.created_at.replace(" ", "T")), 3),
        llm_id: item.llm_id,
        isMarked: !!savedMarks[item.conversation_id],
      })));
    const highestId = Math.max(...data.map(item => item.conversation_id));
    setNextId(highestId + 1);
  };

  useEffect(() => {
    if (needInAddToFavList.current) {
      setLikedQueries(queries.filter(query => query.isMarked));
      needInAddToFavList.current = false;
    }
  }, [queries]);

  const fetchDialogs = async () => {
    setHistoryError(false);
    try {
      const response = await fetch(`${API_URL}/conversations`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      if (data.length === 0) {
        await CreateConversation();
      } else {
        moveForbidden.current = true;
        addQueries(data);
      }
    } catch (error) {
      console.error('Could not load conversations: ', error);
      setHistoryError(true);
    } finally {
      setHistoryLoaded(true);
    }
  };

  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;
    setQueries([]);
    setNextId(1);
    fetchDialogs();
  }, []);

  const renameConversation = (conversationId: number, importText: string) => {
    setQueries(prev => prev.map(item =>
      item.stored_id === conversationId ? { ...item, text: importText } : item
    ));
    isRenamed.current = true;
    setTimeout(() => {
      isRenamed.current = false;
    }, 1000);
  };

  const CreateConversation = async (llmOverride?: number, replaceStoredId?: number) => {
    const llmId = llmOverride ?? selectedLLM ?? 1;
    if (selectedLLM !== llmId) {
      setSelectedLLM(llmId);
    }
    const response = await fetch(`${API_URL}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ llm_id: llmId }),
    });
    if (!response.ok) throw new Error(`Could not create conversation (${response.status})`);

    const data = await response.json();

    const newQuery: Query = {
      display_id: nextId,
      stored_id: data.conversation_id,
      text: `Untitled`,
      date: addHoursToDate(new Date(data.created_at.replace(' ', 'T')), 3),
      llm_id: llmId,
      isMarked: false,
    };

    /* Single update so the sidebar never sees an intermediate list (which would open the wrong chat). */
    setQueries(prevQueries => [...prevQueries.filter(q => q.stored_id !== replaceStoredId), newQuery]);
    setNextId(n => n + 1);
  };

  const isCurrentEmpty = () => {
    const current = queries.find(q => q.stored_id === convId);
    return current && current.text === 'Untitled' && requests.length === 0 ? current : null;
  };

  /* "New chat" reuses the current conversation if nothing has been sent in it yet,
     so the history doesn't fill up with empty "Untitled" entries. */
  const newChat = async () => {
    if (isCurrentEmpty()) {
      (document.querySelector('.chatinput') as HTMLTextAreaElement | null)?.focus();
      return;
    }
    await CreateConversation();
  };

  /* Picking a model starts a new conversation with it (one model per conversation).
     An empty current conversation is replaced rather than left behind. */
  const switchModel = async (llmId: number) => {
    if (llmId === selectedLLM) return;
    setSelectedLLM(llmId);
    const empty = isCurrentEmpty();
    await CreateConversation(llmId, empty?.stored_id);
    if (empty) {
      fetch(`${API_URL}/conversations/${empty.stored_id}`, { method: 'DELETE' })
        .catch(error => console.error('Could not delete conversation:', error));
    }
  };

  const openToken = useRef(0);

  const openConversation = async (stored_id: number) => {
    localStorage.setItem('lastOpenedDialogId', stored_id.toString());
    /* Ignore responses from an older open request if the user has since opened another chat. */
    const token = ++openToken.current;
    const stale = () => token !== openToken.current;

    try {
      const llm_response = await fetch(`${API_URL}/conversations/${stored_id}`);
      const llm_data = await llm_response.json();
      const response = await fetch(`${API_URL}/conversations/${stored_id}/messages`);
      const data = await response.json();
      if (stale()) return;

      setSelectedLLM(llm_data.llm_id);
      setConvId(stored_id);

      const parsedMessages: Message[] = data.map((item: any) => ({
        id: item.message_id,
        message_class: item.message_class,
        text: item.content,
        feedback_id: item.feedback_id,
      }));

      const pick = (cls: string) => parsedMessages
        .filter(message => message.message_class === cls)
        .map(({ id, text }) => ({ id, text }));

      const extractedRequests = pick('Request');
      const extractedResponses = pick('Response');

      setResponses(extractedResponses);
      setRequests(extractedRequests);

      if (extractedResponses.length > 0) {
        const lastRequest = extractedRequests[extractedRequests.length - 1].id;
        const response_2 = await fetch(`${API_URL}/feedback/${lastRequest}`);
        const data_2 = await response_2.json();
        if (stale()) return;
        setFeedback(data_2.comment);
        setCriteria(metricsFromApi(data_2.metrics));
      } else {
        setFeedback('');
        setCriteria(emptyMetrics());
      }
    } catch (error) {
      console.error('Could not open conversation:', error);
    }
  };

  const deleteConversation = async (display_id: number, stored_id: number) => {
    setQueries(prev => prev.filter(query => query.display_id !== display_id));
    if (stored_id === convId) {
      setRequests([]);
      setResponses([]);
      setFeedback('');
      setCriteria(emptyMetrics());
    }
    try {
      await fetch(`${API_URL}/conversations/${stored_id}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Could not delete conversation:', error);
    }
  };

  return (
    <SendContextProvider>
      <Router basename='/gptitor'>
        <div className='app-shell'>
          <NavBar onStartTour={() => { setMenuOpen(false); setRunTutorial(true); }} onToggleMenu={() => setMenuOpen(o => !o)} />
          <div className='app-body'>
            <Sidebar
              renameConversation={renameConversation}
              CreateConversation={newChat}
              openConversation={openConversation}
              deleteConversation={deleteConversation}
              queries={queries}
              toMark={toMark}
              isLiked={isLiked}
              likedQueries={likedQueries}
              isRenamed={isRenamed}
              moveForbidden={moveForbidden}
              activeConversationId={convId}
              historyLoaded={historyLoaded}
              historyError={historyError}
              retryHistory={fetchDialogs}
              forceExpanded={runTutorial}
              mobileOpen={menuOpen}
              onMobileClose={() => setMenuOpen(false)}
            />
            <main className='app-main'>
              <Page>
              <Routes>
                <Route path="/" element={<Navigate to="/chatpage" />} />
                <Route path='/chatpage' element={<StudyMode
                  queries={queries}
                  createConversation={CreateConversation}
                  switchModel={switchModel}
                  requests={requests}
                  setRequests={setRequests}
                  responses={responses}
                  setResponses={setResponses}
                  conversation_id={convId}
                  selectedLLM={selectedLLM}
                  setSelectedLLM={setSelectedLLM}
                  renameConversation={renameConversation}
                />} />
                <Route path='/profile' element={<Profile />} />
                <Route path="*" element={<Navigate to="/chatpage" />} />
              </Routes>
              </Page>
            </main>
          </div>
          {runTutorial && <Tutorial runTutorial={runTutorial} onClose={() => setRunTutorial(false)} />}
        </div>
      </Router>
    </SendContextProvider>
  );
}

export default App;
