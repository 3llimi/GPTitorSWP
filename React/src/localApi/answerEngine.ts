/*
 * Built-in answer engine: writes the answers and grades the prompts.
 *
 * A TypeScript port of API/Utilities/answer_engine.py, so the app can run as a
 * static site with no backend. Keep the two in sync when changing either one.
 *
 * Answers follow what the prompt asks for (a story, an email, a table, bullet
 * points, a plan, a comparison, code...). The grader is rule based: it reads the
 * prompt (role, context, audience, output format, constraints, vagueness, length,
 * overlap with the task), so better prompts get better scores.
 */

export type CriterionKey = 'criterion_1' | 'criterion_2' | 'criterion_3' | 'criterion_4';
export type EngineMetrics = Record<CriterionKey, { score: number; comment: string }>;

// --------------------------------------------------------------------------
// Prompt analysis
// --------------------------------------------------------------------------

const STOP = new Set(`a an the and or but if then than that this these those to of in on for with
about from by as at be is are was were it its into your you me my we our they them
their what which who how when where why can could would should will just please some
any more most very also do does did have has had not no`.split(/\s+/));

const RE = {
    role: /\b(you are|act as|pretend (to be|you are)|imagine you are|as an? (expert|teacher|tutor|historian|developer|engineer|interviewer|coach|editor|assistant))\b/i,
    audience: /\b(beginners?|first[- ]year|students?|children|kids|teen(ager)?s|adults|parents|employees|customers|developers|audience|readers?|non[- ]technical|experts?|my (team|manager|class|boss|friend|partner)|for (a|an) \w+)\b/i,
    context: /\b(i am|i'm|i have|my|we are|because|context|background|given that|currently|so that|in order to)\b/i,
    format: /\b(list|bullets?|bullet points|table|steps?|step[- ]by[- ]step|paragraphs?|sentences?|outline|json|markdown|code|example|examples|summary|summari[sz]e|headings?|one at a time)\b/i,
    constraint: /\b(\d+|one|two|three|four|five|six|seven|ten|no more than|at most|at least|under|fewer than|less than|short|brief|concise|max(imum)?|only)\b/i,
    imperative: /^\s*(please\s+)?(explain|describe|summari[sz]e|write|list|compare|calculate|give|create|rewrite|translate|act|suggest|help|plan|draft|generate|analy[sz]e|outline|tell|show|find|design|recommend|teach|ask|evaluate|imagine|you are|how|what|why|when|which|who|where|can you|could you)\b/im,
    vague: /\b(something|stuff|things|anything|etc|whatever|kind of|sort of|somehow|some info)\b/i,
};

type FeatureKey = keyof typeof RE;

export interface Features extends Record<FeatureKey, boolean> {
    words: number;
    questions: number;
    overlap: number;
}

/** Python's str.split() word count: whitespace runs, ignoring leading/trailing space. */
const wordCount = (s: string): number => {
    const t = s.trim();
    return t ? t.split(/\s+/).length : 0;
};

const keywords = (text: string): Set<string> =>
    new Set((text.toLowerCase().match(/[a-zA-Z]{5,}/g) ?? []).filter(w => !STOP.has(w)));

/** Python's round(): halves go to the nearest even number. */
const pyRound = (v: number): number => {
    const r = Math.round(v);
    return Math.abs(v % 1) === 0.5 ? 2 * Math.round(v / 2) : r;
};

const clamp = (x: number): number => Math.max(0.5, Math.min(5.0, pyRound(x * 2) / 2));

export const analyse = (query: string, task = ''): Features => {
    const f = {} as Features;
    (Object.keys(RE) as FeatureKey[]).forEach(k => { f[k] = RE[k].test(query); });
    f.words = wordCount(query);
    f.questions = query.split('?').length - 1;
    let overlap = 0;
    if (task) {
        const tk = keywords(task);
        const qk = keywords(query);
        let common = 0;
        tk.forEach(w => { if (qk.has(w)) common++; });
        overlap = common / Math.max(1, Math.min(tk.size, 12));
    }
    f.overlap = Math.min(1.0, overlap);
    return f;
};

const n = (b: boolean): number => (b ? 1 : 0);

export const grade = (query: string, task = ''): { scores: number[]; features: Features } => {
    const f = analyse(query, task);
    const w = f.words;

    let c1 = 3.0;
    if (w < 5) c1 = 1.5;
    else if (w <= 60) c1 += 1.5;
    else if (w <= 120) c1 += 0.5;
    else c1 -= 1.0;
    if (f.questions > 2) c1 -= 1.0;
    if (f.vague) c1 -= 0.5;

    const c2 = 1.5 + 0.8 * n(f.imperative) + 0.7 * n(f.format) + 0.7 * n(f.constraint)
        + 0.5 * n(w >= 10) - 1.0 * n(f.vague) + 0.3 * n(f.role);

    let c3 = 1.0 + 1.0 * n(f.context) + 1.0 * n(f.audience) + 0.8 * n(f.role) + 0.4 * n(w >= 15);
    if (task) c3 += 1.6 * f.overlap;
    else c3 += 0.4;

    const c4 = 1.2 + 1.3 * n(f.format) + 1.0 * n(f.constraint) + 0.7 * n(f.imperative) + 0.3 * n(f.audience);

    return { scores: [c1, c2, c3, c4].map(clamp), features: f };
};

// --------------------------------------------------------------------------
// Feedback text
// --------------------------------------------------------------------------

const criterionComments = (f: Features, scores: number[], task: string): string[] => {
    const w = f.words;
    const c1 = scores[0] >= 4
        ? 'Well focused: one clear request at a sensible length.'
        : w < 5
            ? 'Too short to be focused — say exactly what you want in one clear sentence.'
            : w > 60 || f.questions > 2
                ? 'Trim the prompt to the essentials and ask one thing at a time.'
                : 'Remove vague words and keep the prompt on a single goal.';
    const c2 = scores[1] >= 4
        ? 'Clear and specific — the model knows exactly what to produce.'
        : f.vague
            ? 'Replace vague words like "something" or "stuff" with concrete terms.'
            : 'Start with a clear action verb (explain, list, compare…) and name the exact topic.';
    let c3: string;
    if (task) {
        c3 = f.overlap >= 0.5 && scores[2] >= 4
            ? 'You carry the important details of the task into your prompt.'
            : f.overlap >= 0.5
                ? 'Good use of the task details — also say who the answer is for and why you need it.'
                : "Include the key facts from the task (numbers, names, constraints) — the model can't see the task text.";
    } else {
        c3 = scores[2] >= 4
            ? "Good context: the model knows who it's for and why."
            : 'Add background: who the answer is for, and why you need it.';
    }
    const c4 = scores[3] >= 4
        ? 'The expected output is clearly defined.'
        : 'Say what the answer should look like — a list, a table, a number of paragraphs, or a word limit.';
    return [c1, c2, c3, c4];
};

/** Python's s[:limit].rsplit(" ", 1)[0] */
const cutAtSpace = (s: string, limit: number): string => {
    const head = s.slice(0, limit);
    const i = head.lastIndexOf(' ');
    return i >= 0 ? head.slice(0, i) : head;
};

const suggestedPrompt = (query: string, f: Features, taskName: string): string => {
    let base = query.trim().replace(/[.?!]+$/, '');
    if (base.length > 220) base = cutAtSpace(base, 217) + '…';
    const parts: string[] = [];
    if (!f.role) parts.push('You are an expert tutor.');
    if (base) parts.push(base[0].toUpperCase() + base.slice(1) + (!base.endsWith('…') ? '.' : ''));
    if (taskName && f.overlap < 0.5) parts.push(`Use all the facts given in the "${taskName}" task.`);
    if (!f.audience) parts.push('Explain it for a first-year student.');
    if (!f.format) parts.push('Answer in 3–5 bullet points.');
    else if (!f.constraint) parts.push('Keep it under 150 words.');
    return parts.join(' ');
};

/** Returns [comment_markdown, metrics] in the same shape as the real grader. */
export const feedback = (query: string, task = '', taskName = ''): [string, EngineMetrics] => {
    const { scores, features: f } = grade(query, task);
    const comments = criterionComments(f, scores, task);
    const avg = scores.reduce((a, b) => a + b, 0) / 4;

    const strengths: string[] = [];
    if (f.role) strengths.push('you give the model a **role**');
    if (f.format) strengths.push('you ask for a clear **output format**');
    if (f.constraint) strengths.push('you set a **constraint**');
    if (f.context || f.audience) strengths.push('you provide **context**');

    const opener = avg >= 4.25 ? 'Excellent prompt!'
        : avg >= 3 ? 'Good prompt.'
            : avg >= 2 ? 'A reasonable start.'
                : 'This prompt needs more detail.';

    const joined = strengths.join(', ');
    const capitalized = joined.charAt(0).toUpperCase() + joined.slice(1).toLowerCase();
    const lines = [opener + (strengths.length ? ' ' + capitalized + '.' : '')];

    const improvements = comments
        .map((c, i) => ({ c, s: scores[i] }))
        .sort((a, b) => a.s - b.s)
        .filter(x => x.s < 4)
        .slice(0, 3)
        .map(x => x.c);
    if (improvements.length) {
        lines.push('\n**To improve:**\n');
        improvements.forEach(c => lines.push(`- ${c}`));
        lines.push('\n**Try something like:**\n');
        lines.push('> ' + suggestedPrompt(query, f, taskName));
    } else {
        lines.push('\nNothing major to fix. Try the same prompt with another model and compare the answers.');
    }

    const metrics = {} as EngineMetrics;
    scores.forEach((score, i) => {
        metrics[`criterion_${i + 1}` as CriterionKey] = { score, comment: comments[i] };
    });
    return [lines.join('\n'), metrics];
};

// --------------------------------------------------------------------------
// Answers
// --------------------------------------------------------------------------

const CANNED: [RegExp, string][] = [
    [/^\s*(who are you|what are you|what can you do|what is gptitor|introduce yourself|(what|which) (model|ai|llm)( are you| is this)?|are you (an? )?(ai|bot|chatgpt|gpt|human))\b/, `I'm the assistant inside **GPTitor**, a sandbox for practising prompt writing.

Here's how it works:

1. **You write a prompt** — freely, or for one of the graded tasks.
2. **I answer it**, just like a regular chatbot.
3. **Your prompt gets graded** on focus, clarity, context and output format, with tips to improve it.

Try asking me something specific, with an audience and a format — e.g. *"Explain black holes to a 12-year-old in 3 bullet points."*`],
    [/recursion/, `**Recursion** is when a function solves a problem by calling itself on a smaller version of the same problem.

Every recursive function needs two parts:

1. **A base case** — the smallest input, answered directly.
2. **A recursive case** — break the problem down and call the function again.

\`\`\`python
def factorial(n):
    if n <= 1:          # base case
        return 1
    return n * factorial(n - 1)   # recursive case

print(factorial(5))  # 120
\`\`\`

\`factorial(5)\` becomes \`5 * factorial(4)\`, then \`5 * 4 * factorial(3)\` … until it reaches the base case and the results multiply back up.`],
    [/french revolution/, `- **Financial crisis:** France was nearly bankrupt after costly wars, including support for the American Revolution.
- **Unfair taxes:** The Third Estate carried the tax burden while clergy and nobles were largely exempt.
- **Food shortages:** Poor harvests in 1788 doubled bread prices and caused widespread hunger.
- **Enlightenment ideas:** Thinkers like Rousseau and Voltaire challenged absolute monarchy and privilege.
- **Weak leadership:** Louis XVI failed to push through reform, and the Estates-General of 1789 turned into a revolt.`],
    [/sql join|interviewer/, `Great, let's begin. I'll ask one question at a time.

**Question 1:** What is the difference between an \`INNER JOIN\` and a \`LEFT JOIN\`? Give an example of when you would use each.

Take your time — answer in your own words and I'll follow up.`],
    [/formal|rewrite/, `Here is a more formal version:

> "We need to complete and release this by Friday."

A slightly more polished alternative for an email:

> "Please note that this must be finalised and delivered by Friday." `],
];

const TOPIC_PREFIXES: RegExp[] = [
    /^(?:me|us)\s+/i,
    /^(?:a few|some|\d+|two|three|four|five|six|seven|ten)\s+(?:\w+\s+)?(?:tips|ways|ideas|steps|reasons|examples|facts|questions)\s+(?:for|on|to|about|of)\s+/i,
    /^(?:an?\s+)?(?:short\s+|formal\s+|polite\s+|professional\s+)?(?:email|letter|message)(?:\s+to\s+(?:my\s+|the\s+|a\s+|an\s+)?[\w-]+)?(?:\s+(?:asking|requesting|about|regarding|for|explaining))?(?:\s+(?:for|about))?\s+/i,
    /^(?:an?\s+)?(?:short\s+)?(?:story|poem|essay|introduction|speech)\s+(?:about|on|for)\s+/i,
    /^(?:is|are|was|were|does|do|about|on|regarding)\s+/i,
    /^(?:the|a|an)\s+(?=\w)/i,
];

/** Python's s.strip(" ,:;") */
const stripChars = (s: string): string => s.replace(/^[ ,:;]+|[ ,:;]+$/g, '');

const firstSentence = (s: string): string => s.split(/[.?!\n]/)[0];

const topicOf = (query: string): string => {
    let t = query.trim();
    // Drop a leading role sentence ("You are a historian.") — the subject comes after it.
    t = t.replace(/^\s*(?:you are|act as|imagine you are|pretend (?:to be|you are))[^.!?\n]*[.!?\n]\s*/i, '') || t;
    t = t.replace(/^\s*(?:please\s+)?(?:can|could|would) you\s+/i, '');
    const first = firstSentence(t);
    const about = /\babout\s+(.+)/i.exec(first);
    if (about && /\b(story|poem|essay|tale|speech|email|letter|message|tell me)\b/i.test(first)) {
        t = about[1];
    }
    t = t.replace(/^\s*(?:please\s+)?(?:explain|describe|summari[sz]e|write|list|compare|give|create|draft|generate|outline|tell|show|make|build|prepare|suggest|recommend|teach|what(?:'s| is| are)?|why|define)\b\s*/i, '');
    t = firstSentence(t);
    for (let i = 0; i < 3; i++) {
        for (const pat of TOPIC_PREFIXES) t = t.replace(pat, '');
    }
    t = t.split(/,| in (?:\d+|one|two|three|four|five|a|an|simple|plain)\b| as (?:a|an)\b| using\b| for (?:a|an|first|beginners|students|children|kids)\b| to (?:a|an) /i)[0];
    t = stripChars(t);
    if (t.length > 45) {
        // Cut long subjects at a natural joint ("… who visits a village and describes …" → first clause)
        const m = /\s(?:and|that|which|while|but|so)\s/.exec(t.slice(25));
        if (m) t = t.slice(0, 25 + m.index);
    }
    return (t.length > 70 ? cutAtSpace(t, 70) : t) || 'your question';
};

const WORD_NUMBERS: Record<string, number> = { three: 3, four: 4, five: 5, six: 6 };

const countIn = (q: string, def: number): number => {
    const m = /\b(\d+|three|four|five|six)[\s-]+(?:\w+\s+)?(?:day\b|bullet|points|steps|paragraphs|sentences|ideas|tips|examples|ways|reasons|days)/.exec(q);
    if (!m) return def;
    const g = m[1];
    const v = WORD_NUMBERS[g] ?? (/^\d+$/.test(g) ? parseInt(g, 10) : def);
    return Math.min(Math.max(v, 2), 7);
};

const cap = (s: string): string => s.slice(0, 1).toUpperCase() + s.slice(1);

type Point = [string, string];

// Short ready-made explanations for frequently asked topics.
const KNOWLEDGE: [RegExp, string, Point[]][] = [
    [/photosynth/, 'Photosynthesis', [
        ['What it is', 'the process plants use to turn sunlight, water and carbon dioxide into sugar (food) and oxygen.'],
        ['Where it happens', 'in the leaves, inside tiny green parts called chloroplasts that contain chlorophyll.'],
        ['Why it matters', 'it feeds almost every living thing and produces the oxygen we breathe.'],
        ['The recipe', '6 CO₂ + 6 H₂O + light → C₆H₁₂O₆ + 6 O₂.'],
    ]],
    [/machine learning|\bml\b/, 'Machine learning', [
        ['What it is', 'teaching computers to find patterns in data instead of following hand-written rules.'],
        ['How it works', 'a model makes predictions, measures its error, and adjusts itself to do better next time.'],
        ['Main types', 'supervised (labelled examples), unsupervised (find structure) and reinforcement (learn by reward).'],
        ['Example', 'spam filters learn which emails are spam from thousands of labelled messages.'],
    ]],
    [/neural network|deep learning/, 'Neural networks', [
        ['What they are', 'layers of simple connected units that together can learn very complex patterns.'],
        ['How they learn', 'by adjusting the strength of their connections to reduce prediction error (backpropagation).'],
        ['Where they shine', 'images, speech, translation and other data with rich structure.'],
        ['Trade-off', 'they need lots of data and compute, and can be hard to interpret.'],
    ]],
    [/black hole/, 'Black holes', [
        ['What they are', 'regions where gravity is so strong that nothing, not even light, can escape.'],
        ['How they form', 'when a very massive star collapses at the end of its life.'],
        ['Event horizon', 'the boundary beyond which escape is impossible.'],
        ['How we see them', 'by their effect on nearby matter, and in 2019 the first image of one was captured.'],
    ]],
    [/climate change|global warming/, 'Climate change', [
        ['What it is', "the long-term rise in Earth's average temperature and the changes it causes."],
        ['Main cause', 'greenhouse gases from burning fossil fuels trap extra heat in the atmosphere.'],
        ['Effects', 'more heatwaves, rising sea levels, melting ice and shifting weather patterns.'],
        ['Solutions', 'clean energy, efficiency, protecting forests and adapting infrastructure.'],
    ]],
    [/blockchain/, 'Blockchain', [
        ['What it is', 'a shared, append-only record of transactions kept by many computers at once.'],
        ["Why it's trusted", 'each block is linked to the previous one with cryptography, so changing history is detectable.'],
        ['Uses', 'cryptocurrencies, supply-chain tracking and digital ownership records.'],
        ['Limitation', 'it is slower and more energy-hungry than a normal database.'],
    ]],
    [/\bgravity\b/, 'Gravity', [
        ['What it is', 'the force that pulls objects with mass towards each other.'],
        ['On Earth', 'it gives everything weight and makes objects fall at 9.8 m/s².'],
        ['In space', 'it keeps the Moon orbiting Earth and Earth orbiting the Sun.'],
        ["Einstein's view", 'mass bends space-time, and objects follow that curvature.'],
    ]],
    [/\bdns\b|how (?:does )?the internet work/, 'How the internet works', [
        ['Addresses', 'every device has an IP address; DNS turns names like example.com into those addresses.'],
        ['Packets', 'data is split into small packets that travel independently across networks.'],
        ['Protocols', 'TCP/IP makes sure packets arrive and are reassembled in the right order.'],
        ['The web', 'your browser uses HTTP to request pages from servers and display them.'],
    ]],
];

const TIPS: Point[] = [
    ['Set one clear goal', 'decide exactly what "done" looks like before you start.'],
    ['Remove distractions', 'silence notifications and keep only what you need in front of you.'],
    ['Work in short blocks', '25–45 focused minutes followed by a 5-minute break keeps energy high.'],
    ['Start with the hardest part', 'tackle it while your attention is fresh.'],
    ['Track your progress', 'a short checklist makes progress visible and motivating.'],
    ['Review and adjust', 'at the end, note what worked and change one thing next time.'],
    ['Ask for help early', 'a quick question can save an hour of being stuck.'],
];

const STEPS: Point[] = [
    ['List what you know', 'write down every number, unit and condition given.'],
    ['Identify the unknown', 'state exactly what needs to be found.'],
    ['Choose a method', 'pick the formula or reasoning that links the knowns to the unknown.'],
    ['Calculate step by step', 'solve one part at a time and keep track of units.'],
    ['Check the result', 'make sure the answer is realistic and satisfies every condition.'],
    ['State the answer', 'give the final result clearly, then a one-line justification.'],
    ['Note assumptions', 'say what you assumed so it can be challenged or refined.'],
];

const PLAN = ['Get an overview and gather materials', 'Focus on the core concepts', 'Practise with exercises',
    'Review weak spots', 'Do a full practice run', 'Rest and light revision', 'Final review'];

const render = (points: Point[], q: string): string => {
    if (/\btable\b/.test(q)) {
        return '| Point | Detail |\n|---|---|\n' + points.map(([a, b]) => `| ${a} | ${cap(b)} |`).join('\n');
    }
    if (/\bbullet/.test(q)) return points.map(([a, b]) => `- **${a}** — ${b}`).join('\n');
    if (/paragraph/.test(q)) return points.map(([a, b]) => `**${a}.** ${cap(b)}`).join('\n\n');
    return points.map(([a, b], i) => `${i + 1}. **${a}** — ${b}`).join('\n');
};

/** Python's str.format with named fields. */
const fill = (template: string, values: Record<string, string>): string =>
    template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));

const EMAIL = `**Subject:** Request regarding {topic}

Dear Professor,

I hope you are well. I am writing to ask about {topic}. Due to circumstances outside my control, I would appreciate your understanding and, if possible, a short adjustment.

I am happy to provide any further details and to discuss this at a time that suits you.

Kind regards,
[Your name]`;

const STORY_PARAS = [
    'This is the story of {topic}. It began on a bright, warm morning. The sun was high, the sky was clear, '
    + 'and the air smelled of fresh bread and woodsmoke.',
    'At first, people only watched from their doorways. Then one child asked a question, and another smiled. '
    + 'Soon a small crowd had gathered, listening closely to every word.',
    'By evening, the stranger was no longer a stranger. Stories were shared around the fire, '
    + 'and everyone agreed it had been a day worth remembering.',
    'Years later, people still told the tale — always starting the same way: "It was a sunny day, just like this one…"',
];

const story = (topic: string, q: string): string => {
    const count = countIn(q, 2);
    const title = cap(topic.replace(/^(an?|the)\s+/i, ''));
    const subject = /^([A-Z]|an?\s|the\s)/.test(topic) ? topic : `a ${topic}`;
    const paras = STORY_PARAS.slice(0, Math.min(count, STORY_PARAS.length)).map(p => fill(p, { topic: subject }));
    return `*${title}*\n\n` + paras.join('\n\n');
};

const CODE = `Here's a minimal example:

\`\`\`python
def solve(items):
    """Return the cleaned-up items."""
    if not items:
        return []
    return [item.strip() for item in items if item]


print(solve([" a ", "", "b "]))  # ['a', 'b']
\`\`\`

Replace the processing line with the logic your problem needs.`;

const COMPARE = `| Aspect | {a} | {b} |
|---|---|---|
| Main strength | Simple and quick to start with | More structure and control |
| Main weakness | Less suited to very large projects | More to learn up front |
| Best for | Fast results and learning | Long-term, larger work |

**In short:** pick {a} when getting started quickly matters most, and {b} when you need structure at scale.`;

const GREETING = `Hi! I'm ready to help.

To get a useful answer (and a better score), tell me:

- **what** you want — explain, list, compare, write…
- **who** it's for — e.g. a beginner, your manager
- **how** to answer — e.g. 3 bullet points, under 100 words`;

export const answer = (query: string, taskName = ''): string => {
    const q = query.toLowerCase().trim();
    for (const [pattern, text] of CANNED) {
        if (pattern.test(q)) return text;
    }

    if (wordCount(q) <= 3 && /^(hi|hello|hey|yo|good (morning|afternoon|evening)|test)\b/.test(q)) {
        return GREETING;
    }

    for (const [pattern, name, pts] of KNOWLEDGE) {
        if (pattern.test(q)) return `**${name}** in a nutshell:\n\n` + render(pts.slice(0, countIn(q, 4)), q);
    }

    const topic = topicOf(query);

    // What kind of text was asked for wins over the task fallback below.
    const kind = /\b(email|letter|message|story|poem|essay|speech|tale)\b/.exec(q);
    if (kind) {
        if (['email', 'letter', 'message'].includes(kind[1])) return fill(EMAIL, { topic });
        return story(topic, q);
    }

    if (/\b(compare|comparison|difference|versus|vs\.?)\b/.test(q)) {
        const sep = /\s+(?:and|vs\.?|versus|or)\s+/.exec(topic);
        const [a, b] = sep
            ? [topic.slice(0, sep.index), topic.slice(sep.index + sep[0].length)]
            : [topic, 'the alternative'];
        return fill(COMPARE, { a: cap(a.trim()), b: cap(b.trim()) });
    }

    if (/\b(plan|schedule|itinerary|routine|timetable)\b/.test(q)) {
        const days = countIn(q, 3);
        const rows = PLAN.slice(0, days).map((p, i) => `- **Day ${i + 1}:** ${p}`).join('\n');
        return `Here's your ${days}-day plan:\n\n${rows}\n\nAdjust the pace if a day takes longer than expected.`;
    }

    if (taskName || /^\s*how (far|many|much|long|fast)\b/.test(q) || (/\d/.test(q) && q.includes('?'))) {
        const intro = taskName ? `Let's work through **${taskName}** step by step.` : "Let's work this out step by step.";
        return `${intro}\n\n${render(STEPS.slice(0, countIn(q, 5)), q)}\n\n`
            + 'Follow these steps with the given numbers and you can verify the result against every condition.';
    }

    if (/\b(tips?|advice|ways? to|how (?:can|do|should) i|how to|improve|better at|reasons)\b/.test(q)) {
        return `Here are practical ways to approach **${topic}**:\n\n` + render(TIPS.slice(0, countIn(q, 5)), q);
    }

    if (/\b(code|python|javascript|function|script|program)\b/.test(q)) return CODE;

    const points: Point[] = ([
        ['The core idea', `start with a one-sentence definition of ${topic}, then add detail.`],
        ['Why it matters', "understand the problem it solves — that's what makes it memorable."],
        ['How it works', 'break it into its main parts and see how each one contributes.'],
        ['An example', 'a concrete case makes the idea easy to remember and apply.'],
        ['Common mistakes', 'watch out for over-generalising or skipping the basics.'],
    ] as Point[]).slice(0, countIn(q, 4));
    return `Here's a structured overview of **${topic}**:\n\n` + render(points, q);
};

const TITLE_STOP = new Set([...STOP, 'who', 'that', 'which', 'while', 'will', 'did']);

export const title = (query: string): string => {
    const q = query.trim();
    let words: string[];
    if (/^(how|why|when|where|which|who)\b/i.test(q)) {
        words = (q.match(/[A-Za-z0-9']+/g) ?? []).slice(0, 7);
    } else {
        words = (topicOf(q).match(/[A-Za-z0-9']+/g) ?? []).slice(0, 6);
        // Cut before a relative clause: "Traveler named Hongo who visits…" → "Traveler named Hongo"
        const k = words.findIndex((w, i) => i >= 2 && ['who', 'that', 'which', 'where'].includes(w.toLowerCase()));
        if (k >= 0) words = words.slice(0, k);
    }
    // Don't end a title on a dangling word ("… who visits an")
    while (words.length > 2 && TITLE_STOP.has(words[words.length - 1].toLowerCase())) words.pop();
    return words.length ? cap(words.join(' ')) : 'New conversation';
};
