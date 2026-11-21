import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import FeedbackContextProvider from './feedbackContextProvider';
import { TaskProvider } from './taskContext';
import { ToastProvider } from './toast';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TaskProvider>
      <FeedbackContextProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </FeedbackContextProvider>
    </TaskProvider>
  </React.StrictMode>,
)
