# Tool Priority Order (MANDATORY)

This rule defines the priority order for tool usage. Follow this order for efficiency and accuracy.

## Session Start Checklist

1. **Check for unfinished work**: `mcp__serena__list_memories` → look for `unfinished-work`
2. **Read project memories**: `project-overview`, `environment-system` (if relevant)
3. **Follow tool priority below**

## Priority 1: MCP Servers (Always First)

### Context7 - External Documentation
Use **FIRST** when working with external libraries or APIs:
- Pulumi SDK, Azure Native provider, Kubernetes provider
- Any npm package documentation
- Current best practices for frameworks

```
Step 1: mcp__context7__resolve-library-id → get library ID
Step 2: mcp__context7__query-docs → get current documentation
```

**Common Library IDs for This Project:**
| Library | ID | Use For |
|---------|-----|---------|
| Pulumi Core | `/pulumi/pulumi` | ComponentResource, Outputs, StackReference |
| Azure Native | `/pulumi/azure-native` | Azure resource properties, ARM mappings |
| Kubernetes | `/pulumi/kubernetes` | K8s resource deployment |

### Serena - Internal Code (Semantic Operations)
Use **FIRST** when working with project code:

| Task | Serena Tool | NOT This |
|------|-------------|----------|
| Understand a file | `get_symbols_overview` | Read entire file |
| Find a symbol | `find_symbol` | Grep/Glob |
| Read symbol code | `find_symbol` with `include_body=true` | Read file |
| Find usages | `find_referencing_symbols` | Grep |
| Edit code | `replace_symbol_body` | Edit tool |
| Add code | `insert_after_symbol` / `insert_before_symbol` | Write tool |
| Rename | `rename_symbol` | Find and replace |

## Priority 2: Specialized Agents

Use agents for complex, multi-step tasks:

| Scenario | Agent | When |
|----------|-------|------|
| New feature | `planner` | Before starting implementation |
| Code written | `code-reviewer` | Immediately after writing |
| Bug fix | `tdd-guide` | Write test first |
| Architecture | `architect` | Design decisions |
| Security-sensitive | `security-reviewer` | Auth, user input, APIs |
| Build fails | `build-error-resolver` | Fix compilation errors |

## Priority 3: Standard Tools (Fallback)

Use standard tools when MCP servers are not applicable:

| File Type | Tool |
|-----------|------|
| YAML, JSON, Markdown | Read/Edit/Write |
| Binary files | Read |
| Directory structure | Bash `ls` or `list_dir` |
| Git operations | Bash |

## Decision Flow

```
Is it about an external library/API?
  YES → Use Context7 first
  NO  ↓

Is it about project code?
  YES → Use Serena first
  NO  ↓

Is it a complex multi-step task?
  YES → Use appropriate Agent
  NO  ↓

Use standard Read/Edit/Bash tools
```

## Key Project Files (Quick Reference)

| Purpose | File | Use Serena? |
|---------|------|-------------|
| Environment types | `packages/core/lib/interfaces.ts` | Yes |
| Naming utilities | `packages/core/lib/naming.ts` | Yes |
| Tagging utilities | `packages/core/lib/tagging.ts` | Yes |
| Config schema | `packages/core/lib/config/schema.ts` | Yes |
| Platform stack | `stacks/02-platform-services/index.ts` | Yes |
| App stack | `stacks/04-application-services/index.ts` | Yes |
| Config examples | `config/examples/*.yaml` | No (YAML) |
| User guide | `docs/user-guide.md` | No (Markdown) |

## Anti-Patterns

**DON'T:**
- Read entire TypeScript files when you only need one function
- Use Grep to find code symbols (use `find_symbol`)
- Ask about Pulumi API without checking Context7 first
- Skip code review after making changes

**DO:**
- Use `get_symbols_overview` first to understand a file
- Use `find_symbol` with specific name paths
- Query Context7 for current API documentation
- Run `code-reviewer` agent after writing code
