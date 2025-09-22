# COMA Development Todo List

**NOTE: Before tackling any items below, these must be prioritized first based on project goals and requirements.**

## Priority 1 - Critical (Must Fix Now)
- [x] **Test end-to-end functionality with real repository** (✅ Integrated test suite with `claude-coma test`)
- [x] **Verify hooks trigger correctly in Claude Code** (✅ Integration test validates hook triggering)
- [x] **Add installation and setup instructions to README** (✅ Updated with test commands)

## Priority 2 - Essential (Before Release)
- [ ] Add configuration options for timeouts and prompts
- [x] **Implement verbose/debug mode** (✅ Added --debug flag with atomic logging)
- [ ] Add real usage examples to documentation
- [ ] Create troubleshooting guide

## Priority 3 - Important (Quality of Life)
- [x] **Add performance metrics and logging** (✅ Debug logging system implemented)
- [ ] Context capture hook testing with real Claude Code sessions

## Architecture & Design Improvements (Future)
- [x] **File Reading for Acolytes**: Enable acolytes to read actual file contents for informed decisions (✅ Already implemented via --allowed-tools)
- [x] **Change Context Awareness**: Provide acolytes with user intent and commit message context (✅ Implemented via context capture system)
- [ ] **Dual Mode Architecture**: Design clear separation between "Simple Protective Wrapper" and "Development Assistant" modes
- [ ] **Acolyte Specialization**: Create file-type specific acolytes (JS, Python, Config, etc.)
- [ ] **Role-based Acolytes**: Implement specialized roles (security, performance, style, documentation)
- [ ] **Cross-file Analysis**: Enable acolytes to understand relationships between modified files
- [ ] **Enhanced Context Capture**: Capture more than 5 recent messages, include user prompts

## Security & Safety Improvements (Future)
- [x] **Acolyte Sandboxing**: Restrict acolyte tools to read-only operations (✅ Implemented via --allowed-tools)
- [ ] **API Key Security**: Implement secure credential management and sandboxing
- [ ] **Rate Limiting**: Add OpenAI API rate limiting and cost controls
- [ ] **Prompt Injection Protection**: Secure acolyte prompts against malicious input
- [ ] **Audit Trail**: Log all acolyte decisions and reasoning for review
- [ ] **Decision History**: Track acolyte performance and false positive/negative rates

## User Experience Enhancements (Needs Prioritization)
- [ ] **Interactive Mode**: Allow follow-up questions and context provision to acolytes
- [ ] **Override Mechanism**: Provide way to bypass acolyte rejections with justification
- [ ] **Real-time Feedback**: Show acolyte analysis as user types/edits
- [ ] **Conflict Resolution**: Help resolve disagreements between acolytes
- [ ] **Learning Mode**: Allow acolytes to learn from user corrections

## Configuration Management (Needs Prioritization)
- [ ] **Project Profiles**: Create repository-specific acolyte configurations
- [ ] **Team Settings**: Shared acolyte behavior across team members
- [ ] **Custom Prompts**: Allow customization of acolyte system prompts per project
- [ ] **Ruleset Management**: Define and share coding standards as acolyte rules
- [ ] **Training Data**: Feed project-specific examples to acolytes

## Integration Features (Needs Prioritization)
- [ ] **Git Integration**: Understand git history, branches, and conflict detection
- [ ] **Pull Request Workflow**: Integrate with GitHub/GitLab PR processes
- [ ] **IDE Extensions**: VS Code, JetBrains, and other editor integrations
- [ ] **CI/CD Integration**: GitHub Actions, pre-commit hooks, automated testing
- [ ] **Multi-developer Coordination**: Handle concurrent changes from team members

## Recent Major Improvements (January 2025)
- [x] **Permanent Hook Installation**: Simplified to install-once model, no temporary backup/restore
- [x] **Transparent Operation**: Hooks installed permanently but only active when CLAUDE_COMA=1 set
- [x] **Unified Entry Point**: All hooks now route through 'claude-coma hook <type>' for consistency
- [x] **Environment-Based Activation**: Perfect integration with other Claude Code tools
- [x] **Debug Logging System**: Comprehensive atomic logging with --debug flag support
- [x] **Updated Test Suite**: All tests updated for new permanent hook architecture
- [x] **Architecture Documentation**: ARCHITECTURE.md updated to reflect new design
- [x] **Cleanup Instructions**: Changed from automatic cleanup to user-friendly instructions
- [x] **Integrated Test Runner**: Self-contained test suite via `claude-coma test` command
- [x] **No Executable Scripts**: Converted all tests to importable modules for security
- [x] **Comprehensive Testing**: Unit tests + integration test with environment validation
- [x] **ASCII-Only Output**: Clean, professional test results following design principles

## Completed Items
- [x] Create standard npm directory structure
- [x] Implement dual provider system (Claude Code + OpenAI)
- [x] Remove redundant MCP server implementation
- [x] Fix provider interface consistency
- [x] Clean up file references and imports
- [x] Update documentation for new architecture
- [x] Add license file to repository
- [x] Install and verify OpenAI dependency
- [x] Add OpenAI API key validation
- [x] Create comprehensive test suite for both providers (6 test files)
- [x] Add graceful error handling for network failures
- [x] Implement timeout handling for Claude Code sessions
- [x] Test cleanup process works properly
- [x] Extract hardcoded prompts to customizable base.md template
- [x] Implement context capture system via hooks
- [x] Add read-only tool restrictions for acolyte security
- [x] Create ARCHITECTURE.md with detailed technical documentation
- [x] Add .gitignore with appropriate patterns

## Notes
- Keep this list updated as we discover new requirements
- Mark items as completed when finished
- Add priority labels for new items
- Include brief descriptions for complex tasks