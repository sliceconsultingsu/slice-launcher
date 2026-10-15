# Superpowers for Slice

[Superpowers](https://github.com/obra/superpowers), created by Jesse Vincent and contributors, is a collection of guides for coding agents. It helps turn an idea into small steps, investigate problems and check that work is complete. It is our first listed agent skills collection.

## Choose the guide for the job

Ask your agent to read the linked instructions before using them. The links below point to a fixed upstream revision so everyone starts from the same reference.

| Your situation              | Instructions for the agent                                                                                                                                         | What you should get                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Starting with Superpowers   | [Using Superpowers](https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills/using-superpowers/SKILL.md)                           | A relevant routine selected for the task                              |
| Shaping a new feature       | [Brainstorming](https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills/brainstorming/SKILL.md)                                   | A clear problem, intended users and agreed outcome                    |
| Breaking work into steps    | [Writing plans](https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills/writing-plans/SKILL.md)                                   | A manageable plan with a way to check each result                     |
| Something is broken         | [Systematic debugging](https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills/systematic-debugging/SKILL.md)                     | Evidence of the cause before a proposed fix                           |
| Adding or changing behavior | [Test-driven development](https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills/test-driven-development/SKILL.md)               | A check that demonstrates the missing behavior, then confirms the fix |
| Responding to review        | [Receiving code review](https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills/receiving-code-review/SKILL.md)                   | Feedback checked against the actual work                              |
| Preparing a handoff         | [Verification before completion](https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills/verification-before-completion/SKILL.md) | Clear evidence of what works and what remains unverified              |

## Give your agent access

The guides can be read directly from the links above. In a tool that can fetch linked files, ask the agent to load the starting guide and then the relevant task guide, including any references they require. This is explicit use of the instructions; it does not install a plugin or automatically activate every skill.

For automatic skill discovery, use the [upstream installation guide](https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/README.md#installation) for your coding tool. Installation is separate for each person's tool. Follow that tool's setup and session-reload instructions; keep personal installation files outside this repository. The plugin's installed version may differ from the fixed reference here: record which version you used when it affects the work, and propose changes to the shared reference through a PR.

To check setup, ask:

> Which Superpowers skill will you use for this task? Open its instructions and tell me where you loaded them from. Explain what it will help us achieve in one plain-language sentence.

An agent should identify the actual file or fetched source it read. If it cannot access the instructions, it must say so and continue under AGENTS.md where possible. It must not claim that Superpowers is installed or in use just because this page exists. Reading the guides and installing a plugin have not been verified in every contributor's tool.

## Apply Slice's working rules

- Explain the business outcome first and teach unfamiliar ideas simply, as required by [AGENTS.md](../../AGENTS.md). The names of these routines should not become jargon in progress updates.
- Use the consultant's stated goals and existing decisions. Clarify material gaps; keep routine, already agreed work moving.
- Keep Slice's shared login, permission checks, app structure and release process. A generic example in a skill is not a reason to replace them.
- Follow the current tool's limits on extra agents, network access and approvals. A workflow suggesting extra agents does not override those limits.
- Verify results using Slice's checks. Use the repository's review and merge rules when a skill discusses finishing a branch. Never bypass a failed check or treat a skill as permission to publish.
- Use synthetic examples. Before using any external tool or provider, follow [data boundaries](../../docs/data-boundary.md); a skill does not authorize sharing private business data.

## Source and maintenance

Reference added October 15, 2026: [`obra/superpowers` at `bb92a77`](https://github.com/obra/superpowers/tree/bb92a77741419a4ab5f06e711a283343f1ada0c3). Upstream is [MIT licensed](https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/LICENSE). This folder contains Slice's integration guide, not a copied distribution or an installed plugin. No application dependency or production setting is added.

When updating the reference, check the changed instructions, installation guidance and compatibility with AGENTS.md. Update these links together in a reviewed PR. Older plans under `docs/superpowers/` are historical project records, not installed skills or current setup instructions.
