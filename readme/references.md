# Research References

These sources influenced the framework. Agents should use current primary sources when facts may have changed.

## Agentic Workflows And Instructions

- Anthropic, "Building Effective AI Agents": simple workflow patterns, parallelization, orchestrator-workers, and evaluator-optimizer loops. https://www.anthropic.com/engineering/building-effective-agents
- Anthropic, "Effective context engineering for AI agents": compaction and structured note-taking as persistent memory patterns. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- OpenAI, "A practical guide to building agents": start with strong foundations, clear tools/instructions, incremental orchestration, guardrails, and evals. https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
- OpenAI Agents SDK, "Human-in-the-loop": approval interruptions pause runs and serialized run state allows later resume from the original root run. https://openai.github.io/openai-agents-python/human_in_the_loop/
- LangGraph docs, "Persistence": checkpointers and stores preserve state so agents can resume after interruption, failure, or across interactions. https://docs.langchain.com/oss/python/langgraph/persistence
- LangGraph docs, "Interrupts": interrupts save graph state, wait for external input, and resume with a command against the same thread. https://docs.langchain.com/oss/python/langgraph/interrupts
- OpenAI Codex docs, "Custom instructions with AGENTS.md": use layered, concise repository guidance. https://developers.openai.com/codex/guides/agents-md
- OpenAI Codex docs, "Best practices": frame prompts with goal, context, constraints, and done criteria; use reusable guidance and verification loops. https://developers.openai.com/codex/learn/best-practices
- AGENTS.md open format: project instructions as a README for agents. https://agents.md/

## Product And Requirements

- Agile Alliance, "User Stories": user stories as functional increments developed with the product owner and expected to contribute product value. https://agilealliance.org/glossary/user-stories/
- Scrum Guide, "Definition of Done": shared quality measures for a releasable increment. https://scrumguides.org/scrum-guide.html
- Product Talk, "Opportunity Solution Trees": connecting desired outcomes, opportunities, solutions, and assumption tests. https://www.producttalk.org/opportunity-solution-trees/
- Atlassian, "Acceptance Criteria": predefined conditions for acceptance and a practical definition of done for a task. https://www.atlassian.com/work-management/project-management/acceptance-criteria

## Knowledge And Documentation

- Microsoft Learn, "Maintain an architecture decision record": decision records as append-only logs with context, options, outcomes, confidence, and status. https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record
- ADR GitHub organization, "Architecture decision record": ADRs capture important decisions with context and consequences. https://github.com/architecture-decision-record/architecture-decision-record
- Write the Docs, "Docs as Code": documentation managed with issue trackers, version control, plain text markup, code review, and automated tests. https://www.writethedocs.org/guide/docs-as-code/

## Engineering Quality

- Google Engineering Practices, "The Standard of Code Review": code review should improve code health while allowing progress. https://google.github.io/eng-practices/review/reviewer/standard.html
- Google Engineering Practices, "What to look for in a code review": design, functionality, complexity, tests, naming, comments, style, consistency, docs, and context. https://google.github.io/eng-practices/review/reviewer/looking-for.html
- Martin Fowler, "The Practical Test Pyramid": use different test granularities with many fast focused tests and fewer high-level tests. https://martinfowler.com/articles/practical-test-pyramid.html
- Martin Fowler, "Continuous Integration": frequent integration verified by automated builds and tests. https://martinfowler.com/articles/continuousIntegration.html
- OWASP Secure Coding Practices Checklist: validation, encoding, authentication, access control, cryptography, logging, data protection, and configuration guidance. https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/stable-en/02-checklist/05-checklist
- OWASP AI Agent Security Cheat Sheet: agent identity, tool permissions, prompt injection, memory poisoning, and human approval for high-impact actions. https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html
- OWASP Threat Modeling Cheat Sheet: lightweight structure for identifying what is being built, what can go wrong, mitigations, and adequacy checks. https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html
- Google SRE, "Postmortem Culture": blameless incident learning and follow-up action discipline. https://sre.google/sre-book/postmortem-culture/
- Google SRE Workbook, "Postmortem Culture": practical postmortem structure and learning practices. https://sre.google/workbook/postmortem-culture/
- Conventional Commits: lightweight structured commit messages that support automation. https://www.conventionalcommits.org/en/v1.0.0/
