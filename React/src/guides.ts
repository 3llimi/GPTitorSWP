export interface Guide {
    id: string;
    title: string;
    summary: string;
    body: string;
}

export const GUIDES: Guide[] = [
    {
        id: 'basics',
        title: 'Basic Principles',
        summary: 'Clarity, context and simple language.',
        body: `##### Be clear and specific
Specificity helps the AI understand exactly what you're asking for.

- Less effective: "Tell me about Python."
- More effective: "Explain the basics of Python programming, including variables, data types, and loops."

##### Define the context
Providing context ensures the AI knows the background of your query.

- Less effective: "What is a loop?"
- More effective: "In the context of programming, what is a loop and how is it used in Python?"

##### Use simple and direct language
Avoid complex wording or ambiguous terminology.

- Less effective: "Can you expound on the nuances of algorithmic structures?"
- More effective: "Can you explain what algorithms are and how they work?"

##### Ask open-ended questions when needed
For more detailed responses, opt for open-ended questions.

- Less effective: "Is Python a good programming language?"
- More effective: "Why is Python considered a good programming language for beginners and experts alike?"

##### Break down complex queries
If the topic is complex, break it into smaller, manageable parts.

- Less effective: "Explain machine learning."
- More effective: "Can you explain the basic concepts of machine learning? Start with what it is, how it works, and give an example."`,
    },
    {
        id: 'advanced',
        title: 'Advanced Techniques',
        summary: 'Examples, formats, iteration and constraints.',
        body: `##### Provide examples
Examples help the AI understand the format and type of response you expect.

- Less effective: "How do I write a good prompt?"
- More effective: "Can you give me an example of a well-crafted prompt for writing an essay introduction?"

##### Specify the desired output format
Say whether you need a list, bullet points, a table or paragraphs.

- Less effective: "Tell me about agile methodologies."
- More effective: "Can you explain agile methodologies in bullet points?"

##### Iterate and refine the prompt
Start with a basic prompt and refine it based on the responses you get.

- Initial prompt: "Tell me about the solar system."
- Refined prompt: "Describe the solar system, listing each planet and their unique characteristics."

##### Use constraints when needed
Constraining the response keeps the answer concise and focused.

- Less effective: "Tell me about renewable energy."
- More effective: "Describe three key advantages of renewable energy in no more than two sentences each."`,
    },
    {
        id: 'examples',
        title: 'Example Prompts',
        summary: 'Well-formed prompts you can adapt.',
        body: `##### Writing an essay introduction
"I am writing an essay on the importance of cybersecurity. Can you provide an engaging and informative introduction paragraph?"

##### Coding explanation
"I am learning Python and I am confused about list comprehensions. Can you explain what they are and provide a simple example?"

##### Historical event summary
"Summarize the causes and consequences of the French Revolution in a short paragraph."`,
    },
];

/* Starter prompts shown in an empty conversation. */
export const STARTER_PROMPTS = [
    'Explain recursion to a first-year student using one short code example in Python.',
    'Summarize the causes of the French Revolution in five bullet points.',
    'Act as an interviewer and ask me three questions about SQL joins, one at a time.',
    'Rewrite this sentence to be more formal: "we gotta ship this by friday".',
];
