# Recommended models and reasoning settings

Slice recommends **Claude Opus 5.5** or **GPT-6 Astra** for agents planning or changing this repository. Reasoning effort is the setting that controls how much thought a model gives a task; it does not change which model is selected.

| Work                                                                           | Recommended setting for either model              |
| ------------------------------------------------------------------------------ | ------------------------------------------------- |
| Planning: understanding the goal, choosing an approach and assessing risks     | **High**                                          |
| Implementation: writing code and carrying out the agreed plan                  | **Medium**                                        |
| Difficult debugging or changes to login, permissions, private data or releases | **High** when the work needs deeper investigation |

Prefer these models over weaker, lightweight or speed-focused alternatives for code changes, including work delegated to another agent. The aim is to reduce the risk of a regression: a change that breaks something that previously worked. This is the maintainer's quality recommendation, not a claim that a model guarantees correct code or that smaller models always fail.

Check the selected model and effort when your tool exposes them. If the recommended option is unavailable, or you cannot verify the setting, tell the contributor plainly; do not silently substitute a weaker model or claim to have switched it. Let them choose the appropriate available option. Documentation here does not automatically change anyone's model settings. Follow the tool's limits on model selection and delegation.

Tests, review, privacy rules and release checks still apply regardless of model. This recommendation governs contributor agents; it does not change the separately configured advisory reviewer or its approval limits. Maintainers should review future model substitutions deliberately.

Names checked October 15, 2026 against [Anthropic's Opus overview](https://www.anthropic.com/claude/opus) and [OpenAI's GPT-6 Astra documentation](https://developers.openai.com/api/docs/models/gpt-6-astra). The effort choices above are Slice's working preference, not a vendor requirement.
