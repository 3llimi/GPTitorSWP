import { createContext } from 'react';
import { Metrics } from './models/metrics';

export const FeedbackContext = createContext<{
    feedback: string;
    setFeedback: React.Dispatch<React.SetStateAction<string>>;
    criteria: Metrics;
    setCriteria: React.Dispatch<React.SetStateAction<Metrics>>;
}>({
    feedback: "",
    setFeedback: () => {},
    criteria: new Metrics(0, "", 0, "", 0, "", 0, ""),
    setCriteria: () => {}
});
