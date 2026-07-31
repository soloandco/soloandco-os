# Interview design

## Goal

The interview reconstructs how work actually moves from opportunity to delivered value and collected revenue. It does not ask users to design an information architecture.

## Evidence order

1. The most recent real example
2. Existing files, tools, and handoffs
3. Repeated breakdowns and duplicated records
4. Sensitive-data boundaries
5. Desired future state

## Required output

The confirmed interview summary must conform to [`interview-profile.schema.json`](../schemas/interview-profile.schema.json). A model may recommend a preset, but the user confirms it before generation.

## Provider neutrality

Claude Fable 5 is the first documented workflow because long-form interviewing is a natural fit. The JSON contract also supports OpenAI, local models, a web form, or manual authoring.

## Evaluation

Compare interview approaches using:

- incorrect factual assumptions
- missing workflow entities
- user correction count
- time to confirmed profile
- generated folders deleted after two weeks
- first real record completed within ten minutes

