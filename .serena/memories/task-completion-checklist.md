# Task Completion Checklist

When completing a task, ensure:

## Code Quality
- [ ] TypeScript compiles without errors (`pnpm -r build`)
- [ ] Follows existing patterns in codebase
- [ ] Uses path aliases correctly (@enterprise/core)
- [ ] Proper error handling with custom error classes

## Documentation
- [ ] Update relevant docs if behavior changes
- [ ] Link new docs from index files
- [ ] Use lowercase-hyphen naming for files

## Testing
- [ ] Run `pnpm -r test` if tests exist
- [ ] Verify Pulumi preview works for stack changes

## Configuration
- [ ] Validate against schema if config changes
- [ ] Update example configs if schema changes
