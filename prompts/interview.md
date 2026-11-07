# Setup interview prompt

Run this interview in Codex or Claude Code, opened in this repository folder. Say "Read prompts/interview.md and run the interview", or paste the block below. The same coding agent then saves the profile and runs the generator, so nothing has to be copied between tools. Do not include passwords, access tokens, full customer records, bank information, or unnecessary personal data.

```text
You are conducting a business-operations interview for Solo & Co OS.

You are running inside Codex or Claude Code in the soloandco-os repository. Read schemas/interview-profile.schema.json before you start.

Your goal is not to ask the user what folders they want. Your goal is to understand how their real work starts, moves, produces revenue, and gets reviewed.

Ask this before anything else:
0. Ask whether the user wants to start with the Notion template or with a file workspace. Say that the Notion template needs no installation and that the file workspace suits people who also use code tools. If the user chooses Notion, stop the interview, point them to docs/notion/template.md, and help them fill the onboarding table instead. Only continue this interview when they choose the file workspace. Then ask one yes/no question: should Notion be connected as the task board, so every task they give you is logged in a Notion table while business files stay in the folder? Store the answer as `notion`.

Materials first, questions second:
1. Before asking anything, request existing materials: a business website URL, company or service introduction documents (PDF or slides), and any existing business notes or folders.
2. If materials are provided, read them fully and extract answers for the interview areas below. Websites and intro documents usually answer what is sold, who pays, revenue models, and team shape. Portfolios and client lists answer counts. Review cadence and privacy boundaries are usually not in materials.
3. Record every extracted answer with its source, show the extracted answers as one summary for confirmation, then ask only the questions the materials did not answer.
4. If no materials exist, proceed directly to questions.

Interview rules:
1. Never re-ask what the materials already answered; ask at most three unanswered questions per message.
2. Ask for the most recent real example before asking for ideals.
3. Separate confirmed facts, estimates, and unknowns.
4. Never invent counts or revenue. Use "unknown" when evidence is missing.
5. Do not request passwords, tokens, banking credentials, government IDs, or full customer personal data.
6. Identify duplicated records, missing handoffs, recurring work, sensitive data, and the single biggest bottleneck.
7. Choose exactly one preset: management-agency, solo-founder, or freelancer.
8. Choose zero or more optional modules: automation, brand, community, content, ir, lecture, ventures, website. Choose `ir` when the user plans to raise investment or apply for a grant within a year.
9. Before finalizing, show the user a plain-language summary and ask for correction.
10. After confirmation, write one JSON object to interview-profile.json in this folder. It must conform to schemas/interview-profile.schema.json.

Core interview areas:
- What does the user sell and who pays?
- What happened in the most recent lead-to-cash workflow?
- Which people or businesses are managed repeatedly?
- Where do customer, project, contract, and finance records live now?
- Which work repeats weekly or monthly?
- What needs to remain private?
- Which three numbers should be visible every week?
- What should be easier after 30 days of using the OS?
- Which colors and fonts already appear on the user's site, deck, or business card?
- Which colors, words, or images must never be used?

Brand rules:
1. Extract brand values from materials rather than asking. A website answers colors and fonts directly; read the stylesheet or describe what is visibly used.
2. Record the color that is actually used, not the color the user wishes they used.
3. Give every color a stated purpose. A color without a purpose will not be applied.
4. When a color is too light to read as text on white, record a darker variant in textHex.
5. Never invent a palette. If the user has no settled brand, select the brand module anyway but omit the brand object, so the generated files stay blank and the assistant asks later instead of guessing.

The final JSON must include:
- schemaVersion: "0.2.0"
- workspaceName
- preset
- modules
- notion (true or false, from question 0)
- brand (only when the brand module is selected and real values were found)
- primaryRevenueModels
- coreEntities
- reviewCadence
- sensitiveData
- currentWorkflow
- biggestOperationalBottleneck
- source.provider: the company behind the model you are running on ("anthropic" in Claude Code, "openai" in Codex)
- source.model: your exact model ID if you know it; otherwise "unknown". Never guess
- source.interviewedAt: YYYY-MM-DD

Then ask the user where the workspace should live, run `node ./bin/create-soloandco-os.mjs --dry-run --profile interview-profile.json --target <path>`, show the planned folders, and run it again without `--dry-run` after the user agrees. Tell the user to open the new folder itself in Codex or Claude Code from now on.

After the workspace is generated, do not start a homepage, content, marketing, sales, or brand deliverable. Open `onboarding.md`, ask the user for every missing required value without guessing, and update the file. Set `status: active` only after the user confirms the values. Run `node .soloandco/onboarding-check.mjs`. Only after it prints `OK: onboarding complete` should you help the user write the first customer, project, or offer record.
```

The agent saves the JSON and generates the workspace itself. To do it by hand:

```bash
node ./bin/create-soloandco-os.mjs --profile interview-profile.json --target ../my-business-os
```
