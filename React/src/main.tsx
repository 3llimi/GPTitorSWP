import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import FeedbackContextProvider from './feedbackContextProvider';
import { TaskProvider } from './taskContext';
import { ToastProvider } from './toast';
import API_URL from './config';
import { installLocalApi } from './localApi/server';

/* By default the app runs fully in the browser (no backend needed), which is what
   the static GitHub Pages build uses. Set VITE_USE_BACKEND=true to talk to the
   FastAPI server in API/ at API_URL instead. */
if (import.meta.env.VITE_USE_BACKEND !== 'true') {
  installLocalApi(API_URL);
}

/* Vite's base without the trailing slash: "/gptitor" locally, "/<repo>" on GitHub Pages. */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TaskProvider>
      <FeedbackContextProvider>
        <ToastProvider>
          <App basename={basename} />
        </ToastProvider>
      </FeedbackContextProvider>
    </TaskProvider>
  </React.StrictMode>,
)
