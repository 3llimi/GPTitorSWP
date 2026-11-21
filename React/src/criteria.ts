import { Metrics } from './models/metrics';

export type CriterionKey = 'criterion_1' | 'criterion_2' | 'criterion_3' | 'criterion_4';

export interface CriterionDef {
    key: CriterionKey;
    commentKey: keyof Metrics;
    title: string;
    short: string;
    description: string;
}

/* Single source of truth for the four grading criteria
   (previously copy-pasted in four components). */
export const CRITERIA: CriterionDef[] = [
    {
        key: 'criterion_1',
        commentKey: 'comment_criterion_1',
        title: 'Conciseness & Focus',
        short: 'Focus',
        description: 'The prompt should be concise and focused on a specific topic or question. Long, convoluted prompts can confuse the LLM and result in less coherent answers.',
    },
    {
        key: 'criterion_2',
        commentKey: 'comment_criterion_2',
        title: 'Clarity & Specificity',
        short: 'Clarity',
        description: 'The prompt should be clear and specific, leaving little room for ambiguity. Vague or broad prompts can lead to off-target or generalized responses.',
    },
    {
        key: 'criterion_3',
        commentKey: 'comment_criterion_3',
        title: 'Relevance & Context',
        short: 'Context',
        description: 'The prompt should include relevant context to guide the LLM. Providing necessary background information helps the model generate a more accurate and pertinent response.',
    },
    {
        key: 'criterion_4',
        commentKey: 'comment_criterion_4',
        title: 'Purpose & Output',
        short: 'Output',
        description: 'The prompt should clearly state the desired output or purpose of the response. This helps the LLM understand the expected format and level of detail.',
    },
];

export const formatScore = (n: number) => (n % 1 === 0 ? n.toFixed(0) : n.toFixed(1));

export const averageScore = (m: Pick<Metrics, CriterionKey>) =>
    (m.criterion_1 + m.criterion_2 + m.criterion_3 + m.criterion_4) / 4;

export type ScoreLevel = 'none' | 'low' | 'mid' | 'high';

export const scoreLevel = (score: number, hasData = true): ScoreLevel => {
    if (!hasData) return 'none';
    if (score >= 4) return 'high';
    if (score >= 2.5) return 'mid';
    return 'low';
};

export const levelLabel: Record<ScoreLevel, string> = {
    none: 'Not graded',
    low: 'Needs work',
    mid: 'Getting there',
    high: 'Strong',
};

export const levelBadge: Record<ScoreLevel, string> = {
    none: 'badge-neutral',
    low: 'badge-danger',
    mid: 'badge-warning',
    high: 'badge-success',
};

export const emptyMetrics = () => new Metrics(0, '', 0, '', 0, '', 0, '');

export const metricsFromApi = (m: any) =>
    new Metrics(
        m.criterion_1.score, m.criterion_1.comment,
        m.criterion_2.score, m.criterion_2.comment,
        m.criterion_3.score, m.criterion_3.comment,
        m.criterion_4.score, m.criterion_4.comment,
    );
