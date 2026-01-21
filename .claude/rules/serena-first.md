# Serena-First Approach

When working with code, prioritize Serena's semantic tools over reading entire files.

## Tool Priority

1. **Understanding code** - Use `get_symbols_overview` first, then `find_symbol` with `include_body=true` only for symbols you need
2. **Finding code** - Use `find_symbol` or `search_for_pattern` instead of Grep/Glob when looking for code constructs
3. **Finding references** - Use `find_referencing_symbols` to understand how code is used
4. **Editing code** - Use `replace_symbol_body`, `insert_after_symbol`, `insert_before_symbol` for precise edits
5. **Renaming** - Use `rename_symbol` for codebase-wide renames

## When to Use Standard Tools

- Non-code files (YAML, JSON, Markdown) - use Read/Edit
- Unknown file structure - use `list_dir` or `find_file` first
- Pattern search in non-code files - use `search_for_pattern` with `restrict_search_to_code_files=false`

## Benefits

- Token efficient: read only what you need
- Precise edits: symbol-level operations reduce errors
- Better context: understand relationships between symbols
