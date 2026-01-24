# Session Continuity Rule

## When Context Limit Approaches (~92%)

When you notice the conversation is getting long or hitting context limits:

### Step 1: Save Work State to Memory

Use `mcp__serena__write_memory` with name `unfinished-work`:

```
Memory: unfinished-work
Content:
- Current task description
- Files being modified
- Progress made (what's done, what's pending)
- Key decisions made
- Next steps to complete
- Any blockers or open questions
```

### Step 2: Notify User

Tell the user:
> "I'm approaching context limits. I've saved the current work state to memory `unfinished-work`.
> In the next session, I'll remind you to continue this work."

---

## At Session Start

### Step 1: Check for Unfinished Work

Always check if `unfinished-work` memory exists:

```
mcp__serena__list_memories → check for "unfinished-work"
```

### Step 2: If Found, Remind User

Read and summarize the unfinished work:

> "I found unfinished work from a previous session:
> - Task: [description]
> - Progress: [what was done]
> - Next steps: [what remains]
>
> Would you like to continue this work?"

### Step 3: After Completing the Work

Delete the memory to free space:

```
mcp__serena__delete_memory("unfinished-work")
```

---

## Memory Format Template

```markdown
# Unfinished Work

## Task
[Clear description of what was being worked on]

## Progress
- [x] Completed step 1
- [x] Completed step 2
- [ ] Pending step 3
- [ ] Pending step 4

## Files Modified
- `path/to/file1.ts` - [what was changed]
- `path/to/file2.ts` - [what was changed]

## Key Decisions
- Decision 1: [rationale]
- Decision 2: [rationale]

## Next Steps
1. [Immediate next action]
2. [Following action]
3. [Final action]

## Open Questions
- [Any unresolved questions for user]

## Context
[Any other important context needed to resume]
```

---

## Why This Works

1. **Serena memories persist** across sessions
2. **Single memory** (`unfinished-work`) is easy to check
3. **Cleanup after completion** keeps memory organized
4. **Structured format** ensures nothing is lost
