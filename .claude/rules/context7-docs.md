# Context7-First for Documentation

When researching libraries, frameworks, or needing up-to-date documentation, always use Context7 MCP tools first.

## When to Use Context7

1. **Researching a library/framework** - Before implementing features using external packages
2. **Checking API usage** - When unsure about function signatures, parameters, or return types
3. **Finding code examples** - When you need working examples for a specific use case
4. **Verifying current best practices** - Documentation changes; Context7 has the latest
5. **Troubleshooting** - When debugging issues that might be related to API changes

## Tool Usage

### Step 1: Resolve Library ID
Always call `mcp__context7__resolve-library-id` first to get the correct library ID:
```
libraryName: "pulumi"
query: "How to create an Azure resource group"
```

### Step 2: Query Documentation
Then use `mcp__context7__query-docs` with the resolved library ID:
```
libraryId: "/pulumi/pulumi"
query: "How to create an Azure resource group with tags"
```

## Common Libraries in This Project

| Library | Typical Query Topics |
|---------|---------------------|
| `pulumi` | Core Pulumi concepts, ComponentResource, Output handling |
| `@pulumi/azure-native` | Azure resource creation, properties, configurations |
| `@pulumi/kubernetes` | Kubernetes resource deployment via Pulumi |
| `typescript` | Language features, type definitions |

## Best Practices

- **Be specific in queries** - "How to set up AKS with managed identity" vs "AKS setup"
- **Include context** - Mention the specific use case or problem you're solving
- **Limit calls** - Maximum 3 calls per question; use best available result after that
- **Cache mentally** - Don't re-query the same topic within a conversation

## When NOT to Use Context7

- Internal project code questions - use Serena tools instead
- Non-library questions (Azure portal, general concepts)
- Information already available in project documentation (`docs/`)

## Benefits

- **Current information** - Gets latest documentation, not training data cutoff
- **Accurate examples** - Working code snippets from official sources
- **API accuracy** - Correct function signatures and parameters
