"""Built-in answer engine: writes the answers and grades the prompts.

Answers follow what the prompt asks for (a story, an email, a table, bullet
points, a plan, a comparison, code...). The grader is rule based: it reads the
prompt (role, context, audience, output format, constraints, vagueness, length,
overlap with the task), so better prompts get better scores.

Set GPTITOR_REMOTE_LLM=1 to use the remote LLM integration in Utilities/llm.py
instead (the backend tests do this, because they mock those calls).
"""
import asyncio
import os
import random
import re


def enabled() -> bool:
    """True unless the remote LLM integration was explicitly switched on."""
    return os.getenv("GPTITOR_REMOTE_LLM", "").strip().lower() not in ("1", "true", "yes", "on")


async def simulate_latency():
    await asyncio.sleep(random.uniform(0.9, 1.8))


# --------------------------------------------------------------------------
# Prompt analysis
# --------------------------------------------------------------------------

_STOP = set("""a an the and or but if then than that this these those to of in on for with
about from by as at be is are was were it its into your you me my we our they them
their what which who how when where why can could would should will just please some
any more most very also do does did have has had not no""".split())

_RE = {
    "role": r"\b(you are|act as|pretend (to be|you are)|imagine you are|as an? (expert|teacher|tutor|historian|developer|engineer|interviewer|coach|editor|assistant))\b",
    "audience": r"\b(beginners?|first[- ]year|students?|children|kids|teen(ager)?s|adults|parents|employees|customers|developers|audience|readers?|non[- ]technical|experts?|my (team|manager|class|boss|friend|partner)|for (a|an) \w+)\b",
    "context": r"\b(i am|i'm|i have|my|we are|because|context|background|given that|currently|so that|in order to)\b",
    "format": r"\b(list|bullets?|bullet points|table|steps?|step[- ]by[- ]step|paragraphs?|sentences?|outline|json|markdown|code|example|examples|summary|summari[sz]e|headings?|one at a time)\b",
    "constraint": r"\b(\d+|one|two|three|four|five|six|seven|ten|no more than|at most|at least|under|fewer than|less than|short|brief|concise|max(imum)?|only)\b",
    "imperative": r"^\s*(please\s+)?(explain|describe|summari[sz]e|write|list|compare|calculate|give|create|rewrite|translate|act|suggest|help|plan|draft|generate|analy[sz]e|outline|tell|show|find|design|recommend|teach|ask|evaluate|imagine|you are|how|what|why|when|which|who|where|can you|could you)\b",
    "vague": r"\b(something|stuff|things|anything|etc|whatever|kind of|sort of|somehow|some info)\b",
}


def _has(key: str, text: str) -> bool:
    flags = re.IGNORECASE | (re.MULTILINE if key == "imperative" else 0)
    return re.search(_RE[key], text, flags) is not None


def _keywords(text: str) -> set:
    return {w for w in re.findall(r"[a-zA-Z]{5,}", text.lower()) if w not in _STOP}


def _clamp(x: float) -> float:
    return max(0.5, min(5.0, round(x * 2) / 2))


def analyse(query: str, task: str = "") -> dict:
    words = len(query.split())
    f = {k: _has(k, query) for k in _RE}
    f["words"] = words
    f["questions"] = query.count("?")
    overlap = 0.0
    if task:
        tk = _keywords(task)
        overlap = len(tk & _keywords(query)) / max(1, min(len(tk), 12))
    f["overlap"] = min(1.0, overlap)
    return f


def grade(query: str, task: str = "") -> dict:
    f = analyse(query, task)
    w = f["words"]

    c1 = 3.0
    if w < 5:
        c1 = 1.5
    elif w <= 60:
        c1 += 1.5
    elif w <= 120:
        c1 += 0.5
    else:
        c1 -= 1.0
    if f["questions"] > 2:
        c1 -= 1.0
    if f["vague"]:
        c1 -= 0.5

    c2 = 1.5 + 0.8 * f["imperative"] + 0.7 * f["format"] + 0.7 * f["constraint"] \
        + 0.5 * (w >= 10) - 1.0 * f["vague"] + 0.3 * f["role"]

    c3 = 1.0 + 1.0 * f["context"] + 1.0 * f["audience"] + 0.8 * f["role"] + 0.4 * (w >= 15)
    if task:
        c3 += 1.6 * f["overlap"]
    else:
        c3 += 0.4

    c4 = 1.2 + 1.3 * f["format"] + 1.0 * f["constraint"] + 0.7 * f["imperative"] + 0.3 * f["audience"]

    scores = [_clamp(c) for c in (c1, c2, c3, c4)]
    return {"scores": scores, "features": f}


# --------------------------------------------------------------------------
# Feedback text
# --------------------------------------------------------------------------

def _criterion_comments(f: dict, scores: list, task: str) -> list:
    w = f["words"]
    c1 = ("Well focused: one clear request at a sensible length."
          if scores[0] >= 4 else
          "Too short to be focused — say exactly what you want in one clear sentence."
          if w < 5 else
          "Trim the prompt to the essentials and ask one thing at a time."
          if w > 60 or f["questions"] > 2 else
          "Remove vague words and keep the prompt on a single goal.")
    c2 = ("Clear and specific — the model knows exactly what to produce."
          if scores[1] >= 4 else
          "Replace vague words like \"something\" or \"stuff\" with concrete terms."
          if f["vague"] else
          "Start with a clear action verb (explain, list, compare…) and name the exact topic.")
    if task:
        c3 = ("You carry the important details of the task into your prompt."
              if f["overlap"] >= 0.5 and scores[2] >= 4 else
              "Good use of the task details — also say who the answer is for and why you need it."
              if f["overlap"] >= 0.5 else
              "Include the key facts from the task (numbers, names, constraints) — the model can't see the task text.")
    else:
        c3 = ("Good context: the model knows who it's for and why."
              if scores[2] >= 4 else
              "Add background: who the answer is for, and why you need it.")
    c4 = ("The expected output is clearly defined."
          if scores[3] >= 4 else
          "Say what the answer should look like — a list, a table, a number of paragraphs, or a word limit.")
    return [c1, c2, c3, c4]


def _suggested_prompt(query: str, f: dict, task_name: str) -> str:
    base = query.strip().rstrip(".?!")
    if len(base) > 220:
        base = base[:217].rsplit(" ", 1)[0] + "…"
    parts = []
    if not f["role"]:
        parts.append("You are an expert tutor.")
    parts.append(base[0].upper() + base[1:] + ("." if not base.endswith("…") else ""))
    if task_name and f["overlap"] < 0.5:
        parts.append(f"Use all the facts given in the \"{task_name}\" task.")
    if not f["audience"]:
        parts.append("Explain it for a first-year student.")
    if not f["format"]:
        parts.append("Answer in 3–5 bullet points.")
    elif not f["constraint"]:
        parts.append("Keep it under 150 words.")
    return " ".join(parts)


def feedback(query: str, task: str = "", task_name: str = "") -> tuple:
    """Returns (comment_markdown, metrics_dict) in the same shape as the real grader."""
    g = grade(query, task)
    scores, f = g["scores"], g["features"]
    comments = _criterion_comments(f, scores, task)
    avg = sum(scores) / 4

    strengths = []
    if f["role"]:
        strengths.append("you give the model a **role**")
    if f["format"]:
        strengths.append("you ask for a clear **output format**")
    if f["constraint"]:
        strengths.append("you set a **constraint**")
    if f["context"] or f["audience"]:
        strengths.append("you provide **context**")

    if avg >= 4.25:
        opener = "Excellent prompt!"
    elif avg >= 3:
        opener = "Good prompt."
    elif avg >= 2:
        opener = "A reasonable start."
    else:
        opener = "This prompt needs more detail."

    lines = [opener + (" " + ", ".join(strengths).capitalize() + "." if strengths else "")]

    improvements = [c for c, s in sorted(zip(comments, scores), key=lambda x: x[1]) if s < 4][:3]
    if improvements:
        lines.append("\n**To improve:**\n")
        lines.extend(f"- {c}" for c in improvements)
        lines.append("\n**Try something like:**\n")
        lines.append("> " + _suggested_prompt(query, f, task_name))
    else:
        lines.append("\nNothing major to fix. Try the same prompt with another model and compare the answers.")

    metrics = {
        f"criterion_{i + 1}": {"score": scores[i], "comment": comments[i]}
        for i in range(4)
    }
    return "\n".join(lines), metrics


# --------------------------------------------------------------------------
# Answers
# --------------------------------------------------------------------------

_CANNED = [
    (r"^\s*(who are you|what are you|what can you do|what is gptitor|introduce yourself"
     r"|(what|which) (model|ai|llm)( are you| is this)?|are you (an? )?(ai|bot|chatgpt|gpt|human))\b","""I'm the assistant inside **GPTitor**, a sandbox for practising prompt writing.

Here's how it works:

1. **You write a prompt** — freely, or for one of the graded tasks.
2. **I answer it**, just like a regular chatbot.
3. **Your prompt gets graded** on focus, clarity, context and output format, with tips to improve it.

Try asking me something specific, with an audience and a format — e.g. *"Explain black holes to a 12-year-old in 3 bullet points."*"""),
    (r"recursion", """**Recursion** is when a function solves a problem by calling itself on a smaller version of the same problem.

Every recursive function needs two parts:

1. **A base case** — the smallest input, answered directly.
2. **A recursive case** — break the problem down and call the function again.

```python
def factorial(n):
    if n <= 1:          # base case
        return 1
    return n * factorial(n - 1)   # recursive case

print(factorial(5))  # 120
```

`factorial(5)` becomes `5 * factorial(4)`, then `5 * 4 * factorial(3)` … until it reaches the base case and the results multiply back up."""),
    (r"french revolution", """- **Financial crisis:** France was nearly bankrupt after costly wars, including support for the American Revolution.
- **Unfair taxes:** The Third Estate carried the tax burden while clergy and nobles were largely exempt.
- **Food shortages:** Poor harvests in 1788 doubled bread prices and caused widespread hunger.
- **Enlightenment ideas:** Thinkers like Rousseau and Voltaire challenged absolute monarchy and privilege.
- **Weak leadership:** Louis XVI failed to push through reform, and the Estates-General of 1789 turned into a revolt."""),
    (r"sql join|interviewer", """Great, let's begin. I'll ask one question at a time.

**Question 1:** What is the difference between an `INNER JOIN` and a `LEFT JOIN`? Give an example of when you would use each.

Take your time — answer in your own words and I'll follow up."""),
    (r"formal|rewrite", """Here is a more formal version:

> "We need to complete and release this by Friday."

A slightly more polished alternative for an email:

> "Please note that this must be finalised and delivered by Friday." """),
]


_TOPIC_PREFIXES = [
    r"^(?:me|us)\s+",
    r"^(?:a few|some|\d+|two|three|four|five|six|seven|ten)\s+(?:\w+\s+)?(?:tips|ways|ideas|steps|reasons|examples|facts|questions)\s+(?:for|on|to|about|of)\s+",
    r"^(?:an?\s+)?(?:short\s+|formal\s+|polite\s+|professional\s+)?(?:email|letter|message)(?:\s+to\s+(?:my\s+|the\s+|a\s+|an\s+)?[\w-]+)?(?:\s+(?:asking|requesting|about|regarding|for|explaining))?(?:\s+(?:for|about))?\s+",
    r"^(?:an?\s+)?(?:short\s+)?(?:story|poem|essay|introduction|speech)\s+(?:about|on|for)\s+",
    r"^(?:is|are|was|were|does|do|about|on|regarding)\s+",
    r"^(?:the|a|an)\s+(?=\w)",
]


def _topic(query: str) -> str:
    t = query.strip()
    # Drop a leading role sentence ("You are a historian.") — the subject comes after it.
    t = re.sub(r"^\s*(?:you are|act as|imagine you are|pretend (?:to be|you are))[^.!?\n]*[.!?\n]\s*", "", t,
               flags=re.IGNORECASE) or t
    t = re.sub(r"^\s*(?:please\s+)?(?:can|could|would) you\s+", "", t, flags=re.IGNORECASE)
    first = re.split(r"[.?!\n]", t)[0]
    about = re.search(r"\babout\s+(.+)", first, flags=re.IGNORECASE)
    if about and re.search(r"\b(story|poem|essay|tale|speech|email|letter|message|tell me)\b", first, flags=re.IGNORECASE):
        t = about.group(1)
    t = re.sub(r"^\s*(?:please\s+)?(?:explain|describe|summari[sz]e|write|list|compare|give|create|draft|generate"
               r"|outline|tell|show|make|build|prepare|suggest|recommend|teach|what(?:'s| is| are)?|why|define)\b\s*",
               "", t, flags=re.IGNORECASE)
    t = re.split(r"[.?!\n]", t)[0]
    for _ in range(3):
        for pat in _TOPIC_PREFIXES:
            t = re.sub(pat, "", t, flags=re.IGNORECASE)
    t = re.split(r",| in (?:\d+|one|two|three|four|five|a|an|simple|plain)\b| as (?:a|an)\b| using\b"
                 r"| for (?:a|an|first|beginners|students|children|kids)\b| to (?:a|an) ",
                 t, flags=re.IGNORECASE)[0]
    t = t.strip(" ,:;")
    if len(t) > 45:
        # Cut long subjects at a natural joint ("… who visits a village and describes …" → first clause)
        m = re.search(r"\s(?:and|that|which|while|but|so)\s", t[25:])
        if m:
            t = t[:25 + m.start()]
    return (t[:70].rsplit(" ", 1)[0] if len(t) > 70 else t) or "your question"


def _count(q: str, default: int) -> int:
    m = re.search(r"\b(\d+|three|four|five|six)[\s-]+(?:\w+\s+)?(?:day\b|bullet|points|steps|paragraphs|sentences"
                  r"|ideas|tips|examples|ways|reasons|days)", q)
    if not m:
        return default
    g = m.group(1)
    n = {"three": 3, "four": 4, "five": 5, "six": 6}.get(g) or (int(g) if g.isdigit() else default)
    return min(max(n, 2), 7)


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:]


# Short ready-made explanations for frequently asked topics.
_KNOWLEDGE = [
    (r"photosynth", "Photosynthesis", [
        ("What it is", "the process plants use to turn sunlight, water and carbon dioxide into sugar (food) and oxygen."),
        ("Where it happens", "in the leaves, inside tiny green parts called chloroplasts that contain chlorophyll."),
        ("Why it matters", "it feeds almost every living thing and produces the oxygen we breathe."),
        ("The recipe", "6 CO₂ + 6 H₂O + light → C₆H₁₂O₆ + 6 O₂."),
    ]),
    (r"machine learning|\bml\b", "Machine learning", [
        ("What it is", "teaching computers to find patterns in data instead of following hand-written rules."),
        ("How it works", "a model makes predictions, measures its error, and adjusts itself to do better next time."),
        ("Main types", "supervised (labelled examples), unsupervised (find structure) and reinforcement (learn by reward)."),
        ("Example", "spam filters learn which emails are spam from thousands of labelled messages."),
    ]),
    (r"neural network|deep learning", "Neural networks", [
        ("What they are", "layers of simple connected units that together can learn very complex patterns."),
        ("How they learn", "by adjusting the strength of their connections to reduce prediction error (backpropagation)."),
        ("Where they shine", "images, speech, translation and other data with rich structure."),
        ("Trade-off", "they need lots of data and compute, and can be hard to interpret."),
    ]),
    (r"black hole", "Black holes", [
        ("What they are", "regions where gravity is so strong that nothing, not even light, can escape."),
        ("How they form", "when a very massive star collapses at the end of its life."),
        ("Event horizon", "the boundary beyond which escape is impossible."),
        ("How we see them", "by their effect on nearby matter, and in 2019 the first image of one was captured."),
    ]),
    (r"climate change|global warming", "Climate change", [
        ("What it is", "the long-term rise in Earth's average temperature and the changes it causes."),
        ("Main cause", "greenhouse gases from burning fossil fuels trap extra heat in the atmosphere."),
        ("Effects", "more heatwaves, rising sea levels, melting ice and shifting weather patterns."),
        ("Solutions", "clean energy, efficiency, protecting forests and adapting infrastructure."),
    ]),
    (r"blockchain", "Blockchain", [
        ("What it is", "a shared, append-only record of transactions kept by many computers at once."),
        ("Why it's trusted", "each block is linked to the previous one with cryptography, so changing history is detectable."),
        ("Uses", "cryptocurrencies, supply-chain tracking and digital ownership records."),
        ("Limitation", "it is slower and more energy-hungry than a normal database."),
    ]),
    (r"\bgravity\b", "Gravity", [
        ("What it is", "the force that pulls objects with mass towards each other."),
        ("On Earth", "it gives everything weight and makes objects fall at 9.8 m/s²."),
        ("In space", "it keeps the Moon orbiting Earth and Earth orbiting the Sun."),
        ("Einstein's view", "mass bends space-time, and objects follow that curvature."),
    ]),
    (r"\bdns\b|how (?:does )?the internet work", "How the internet works", [
        ("Addresses", "every device has an IP address; DNS turns names like example.com into those addresses."),
        ("Packets", "data is split into small packets that travel independently across networks."),
        ("Protocols", "TCP/IP makes sure packets arrive and are reassembled in the right order."),
        ("The web", "your browser uses HTTP to request pages from servers and display them."),
    ]),
]

_TIPS = [
    ("Set one clear goal", "decide exactly what \"done\" looks like before you start."),
    ("Remove distractions", "silence notifications and keep only what you need in front of you."),
    ("Work in short blocks", "25–45 focused minutes followed by a 5-minute break keeps energy high."),
    ("Start with the hardest part", "tackle it while your attention is fresh."),
    ("Track your progress", "a short checklist makes progress visible and motivating."),
    ("Review and adjust", "at the end, note what worked and change one thing next time."),
    ("Ask for help early", "a quick question can save an hour of being stuck."),
]

_STEPS = [
    ("List what you know", "write down every number, unit and condition given."),
    ("Identify the unknown", "state exactly what needs to be found."),
    ("Choose a method", "pick the formula or reasoning that links the knowns to the unknown."),
    ("Calculate step by step", "solve one part at a time and keep track of units."),
    ("Check the result", "make sure the answer is realistic and satisfies every condition."),
    ("State the answer", "give the final result clearly, then a one-line justification."),
    ("Note assumptions", "say what you assumed so it can be challenged or refined."),
]

_PLAN = ["Get an overview and gather materials", "Focus on the core concepts", "Practise with exercises",
         "Review weak spots", "Do a full practice run", "Rest and light revision", "Final review"]


def _render(points, q: str) -> str:
    if re.search(r"\btable\b", q):
        rows = "\n".join(f"| {a} | {_cap(b)} |" for a, b in points)
        return "| Point | Detail |\n|---|---|\n" + rows
    if re.search(r"\bbullet", q):
        return "\n".join(f"- **{a}** — {b}" for a, b in points)
    if re.search(r"paragraph", q):
        return "\n\n".join(f"**{a}.** {_cap(b)}" for a, b in points)
    return "\n".join(f"{i + 1}. **{a}** — {b}" for i, (a, b) in enumerate(points))


_EMAIL = """**Subject:** Request regarding {topic}

Dear Professor,

I hope you are well. I am writing to ask about {topic}. Due to circumstances outside my control, I would appreciate your understanding and, if possible, a short adjustment.

I am happy to provide any further details and to discuss this at a time that suits you.

Kind regards,
[Your name]"""

_STORY_PARAS = [
    "This is the story of {topic}. It began on a bright, warm morning. The sun was high, the sky was clear, "
    "and the air smelled of fresh bread and woodsmoke.",
    "At first, people only watched from their doorways. Then one child asked a question, and another smiled. "
    "Soon a small crowd had gathered, listening closely to every word.",
    "By evening, the stranger was no longer a stranger. Stories were shared around the fire, "
    "and everyone agreed it had been a day worth remembering.",
    "Years later, people still told the tale — always starting the same way: \"It was a sunny day, just like this one…\"",
]


def _story(topic: str, q: str) -> str:
    n = _count(q, 2)
    title = _cap(re.sub(r"^(an?|the)\s+", "", topic, flags=re.IGNORECASE))
    subject = topic if re.match(r"^([A-Z]|an?\s|the\s)", topic) else f"a {topic}"
    paras = [p.format(topic=subject) for p in _STORY_PARAS[:min(n, len(_STORY_PARAS))]]
    return f"*{title}*\n\n" + "\n\n".join(paras)

_CODE = '''Here's a minimal example:

```python
def solve(items):
    """Return the cleaned-up items."""
    if not items:
        return []
    return [item.strip() for item in items if item]


print(solve([" a ", "", "b "]))  # ['a', 'b']
```

Replace the processing line with the logic your problem needs.'''

_COMPARE = """| Aspect | {a} | {b} |
|---|---|---|
| Main strength | Simple and quick to start with | More structure and control |
| Main weakness | Less suited to very large projects | More to learn up front |
| Best for | Fast results and learning | Long-term, larger work |

**In short:** pick {a} when getting started quickly matters most, and {b} when you need structure at scale."""

_GREETING = """Hi! I'm ready to help.

To get a useful answer (and a better score), tell me:

- **what** you want — explain, list, compare, write…
- **who** it's for — e.g. a beginner, your manager
- **how** to answer — e.g. 3 bullet points, under 100 words"""


def answer(query: str, task_name: str = "", task_desc: str = "") -> str:
    q = query.lower().strip()
    for pattern, text in _CANNED:
        if re.search(pattern, q):
            return text

    if len(q.split()) <= 3 and re.match(r"^(hi|hello|hey|yo|good (morning|afternoon|evening)|test)\b", q):
        return _GREETING

    for pattern, name, pts in _KNOWLEDGE:
        if re.search(pattern, q):
            return f"**{name}** in a nutshell:\n\n" + _render(pts[:_count(q, 4)], q)

    topic = _topic(query)

    # What kind of text was asked for wins over the task fallback below.
    kind = re.search(r"\b(email|letter|message|story|poem|essay|speech|tale)\b", q)
    if kind:
        if kind.group(1) in ("email", "letter", "message"):
            return _EMAIL.format(topic=topic)
        return _story(topic, q)

    if re.search(r"\b(compare|comparison|difference|versus|vs\.?)\b", q):
        parts = re.split(r"\s+(?:and|vs\.?|versus|or)\s+", topic, maxsplit=1)
        a, b = (parts[0], parts[1]) if len(parts) > 1 else (topic, "the alternative")
        return _COMPARE.format(a=_cap(a.strip()), b=_cap(b.strip()))

    if re.search(r"\b(plan|schedule|itinerary|routine|timetable)\b", q):
        days = _count(q, 3)
        rows = "\n".join(f"- **Day {i + 1}:** {_PLAN[i]}" for i in range(days))
        return f"Here's your {days}-day plan:\n\n{rows}\n\nAdjust the pace if a day takes longer than expected."

    if task_name or re.match(r"^\s*how (far|many|much|long|fast)\b", q) or (re.search(r"\d", q) and "?" in q):
        intro = f"Let's work through **{task_name}** step by step." if task_name else "Let's work this out step by step."
        return (f"{intro}\n\n{_render(_STEPS[:_count(q, 5)], q)}\n\n"
                "Follow these steps with the given numbers and you can verify the result against every condition.")

    if re.search(r"\b(tips?|advice|ways? to|how (?:can|do|should) i|how to|improve|better at|reasons)\b", q):
        return f"Here are practical ways to approach **{topic}**:\n\n" + _render(_TIPS[:_count(q, 5)], q)

    if re.search(r"\b(code|python|javascript|function|script|program)\b", q):
        return _CODE

    points = [
        ("The core idea", f"start with a one-sentence definition of {topic}, then add detail."),
        ("Why it matters", "understand the problem it solves — that's what makes it memorable."),
        ("How it works", "break it into its main parts and see how each one contributes."),
        ("An example", "a concrete case makes the idea easy to remember and apply."),
        ("Common mistakes", "watch out for over-generalising or skipping the basics."),
    ][:_count(q, 4)]
    return f"Here's a structured overview of **{topic}**:\n\n" + _render(points, q)


def title(query: str) -> str:
    q = query.strip()
    if re.match(r"^(how|why|when|where|which|who)\b", q, flags=re.IGNORECASE):
        words = re.findall(r"[A-Za-z0-9']+", q)[:6]
    else:
        words = re.findall(r"[A-Za-z0-9']+", _topic(q))[:6]
    return _cap(" ".join(words)) if words else "New conversation"
