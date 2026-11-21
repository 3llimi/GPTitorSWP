import React from 'react';
import Joyride, { Step, CallBackProps, STATUS } from 'react-joyride';

const steps: Step[] = [
    {
        target: '.chat-card',
        title: 'Your practice space',
        content: 'Write prompts here. Each prompt you send is answered by the selected model and graded on four prompt-writing criteria.',
        disableBeacon: true,
        placement: 'right',
    },
    {
        target: '.model-picker',
        title: 'Pick a model',
        content: 'Each conversation uses one model. Choosing a different model starts a new conversation with it, so you can compare how models react to the same prompt.',
        disableBeacon: true,
    },
    {
        target: '.side-tabs',
        title: 'Tasks, feedback and guides',
        content: 'Browse graded tasks, see the score and feedback for your latest prompt, or read short guides on prompting techniques.',
        disableBeacon: true,
    },
    {
        target: '.mode',
        title: 'Study mode',
        content: 'With study mode on you practise against tasks. Turn it off to chat freely and still get feedback on every prompt.',
        disableBeacon: true,
    },
    {
        target: '.new-chat-btn',
        title: 'New conversation',
        content: 'Start a fresh conversation at any time.',
        disableBeacon: true,
        placement: 'right',
    },
    {
        target: '.conv-list',
        title: 'Your history',
        content: 'Conversations are grouped by date. Hover one to star, rename or delete it, and use the search box to find old prompts.',
        disableBeacon: true,
        placement: 'right',
    },
    {
        target: '.main-nav',
        title: 'Track your progress',
        content: 'Open Progress to see your activity over time and how your average score develops on each criterion.',
        disableBeacon: true,
    },
    {
        target: '.composer',
        title: "You're ready",
        content: "That's it. Write your first prompt and let's get better at prompting!",
        disableBeacon: true,
        placement: 'top',
    },
];

interface TutorialProps {
    runTutorial: boolean;
    onClose: () => void;
}

/* Only keep steps whose target is visible at the current screen size (e.g. phones hide the sidebar). */
const visibleSteps = () =>
    steps.filter(s => {
        const el = typeof s.target === 'string' ? document.querySelector<HTMLElement>(s.target) : null;
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
    });

const Tutorial: React.FC<TutorialProps> = ({ runTutorial, onClose }) => {
    const [active] = React.useState(visibleSteps);
    const handleJoyrideCallback = (data: CallBackProps) => {
        const { status } = data;
        if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
            localStorage.setItem('tutorialCompleted', 'true');
            onClose();
        }
    };

    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();

    return (
        <Joyride
            steps={active}
            run={runTutorial}
            continuous
            showSkipButton
            showProgress
            scrollToFirstStep
            callback={handleJoyrideCallback}
            disableOverlayClose
            locale={{ last: 'Finish', skip: 'Skip tour' }}
            styles={{
                options: {
                    primaryColor: v('--primary'),
                    textColor: v('--ink-2'),
                    arrowColor: v('--surface'),
                    backgroundColor: v('--surface'),
                    overlayColor: v('--overlay'),
                    zIndex: 1000,
                },
                tooltip: { borderRadius: 12, padding: 18, fontFamily: v('--font-body') },
                tooltipTitle: { fontSize: 16, fontWeight: 700, textAlign: 'left', color: v('--ink') },
                tooltipContent: { fontSize: 14, textAlign: 'left', padding: '8px 0 0' },
                buttonNext: { borderRadius: 8, fontWeight: 600, fontSize: 14, padding: '9px 14px' },
                buttonBack: { color: v('--muted'), fontSize: 14 },
                buttonSkip: { color: v('--muted'), fontSize: 13 },
                spotlight: { borderRadius: 12 },
            }}
        />
    );
};

export default Tutorial;
