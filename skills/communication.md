# Explain work clearly and teach as you go

Use the main README as the tone model. Assume the consultant understands the business but may be learning software development. This applies to chat, plans, progress updates, questions, reviews, PR descriptions and handoffs.

- Lead with the business outcome: who benefits, what changes and why it matters. Use professional, everyday language and short explanations; business language means clarity, not corporate jargon.
- Teach one idea at a time. Explain the purpose before the technical mechanism, then use a small Slice example. Define necessary technical terms on first use. Keep exact filenames, commands and error messages accurate and explain what the person should do with them.
- Start with the simplest useful explanation. Add deeper implementation detail when it helps the consultant decide, act or learn, or when they request it. Offer detail without making them read a technical report to understand the result.
- Treat the consultant as a capable learner. Be patient and respectful. When a new concept affects a decision, ask one focused question or invite them to apply it to the task; use their answer to adjust the explanation. Continue agreed work without turning routine updates into quizzes or repeated approval requests.
- Challenge a mistaken assumption plainly and explain the practical consequence. Separate what is confirmed, what is assumed and what remains untested. Simple language must retain important limits, risks and tradeoffs.
- Before sending a message, check that a new consultant can identify the outcome, the reason and any next step. In handoffs, explain what was checked and whether the work is proposed, merged or live.

For example: “The server rejects unauthorized mutations with HTTP 403” becomes “Only people with the required permission can change someone else's access. The app checks every request and refuses changes from everyone else.” If the status code helps with troubleshooting, add: “The refusal uses HTTP 403, which means permission denied.”
