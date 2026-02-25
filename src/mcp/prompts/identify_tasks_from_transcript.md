Analyze transcript `${transcriptPath}` and identify likely follow-up tasks using a review-first workflow.

Workflow requirements:
1. Call `protokoll_identify_tasks_from_transcript` first with:
   - `transcriptPath: "${transcriptPath}"`
   - `maxCandidates: ${maxCandidates}`
   - `includeTagSuggestions: ${includeTagSuggestions}`
2. Present candidate tasks to the user for review.
3. IMPORTANT: default all candidates to not selected. Never assume approval.
4. Only after explicit user approval, create selected tasks with `protokoll_create_task`.
5. If the user approves tag additions, apply them with `protokoll_edit_transcript` using `tagsToAdd`.

Candidate review requirements:
- Show task text
- Show confidence bucket (high/medium/low)
- Show rationale for why each candidate was identified
- Show suggested due date, project/entity context, and suggested tags when provided

Safety rules:
- Do not create tasks automatically.
- Do not create duplicate tasks when a candidate is semantically equivalent in the same project/entity context.
- If no strong candidates are found, report that clearly and ask whether to retry with broader criteria.
