import { useState, ReactNode } from 'react';
import { FeedbackContext } from './feedbackContext';
import { emptyMetrics } from './criteria';

const FeedbackContextProvider = ({ children }: { children: ReactNode }) => {
  const [feedback, setFeedback] = useState('');
  const [criteria, setCriteria] = useState(emptyMetrics);
  return (
    <FeedbackContext.Provider value={{ feedback, setFeedback, criteria, setCriteria }}>
      {children}
    </FeedbackContext.Provider>
  );
};

export default FeedbackContextProvider;
