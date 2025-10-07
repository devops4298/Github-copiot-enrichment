# Intelligent Prompt Enrichment & Agent Integration

A powerful VS Code extension that enhances GitHub Copilot with intelligent prompt enrichment, repository indexing, and advanced agent capabilities.

## Features

### 🎯 Intelligent Prompt Enrichment
- Automatically enriches user prompts with relevant code context from your repository
- Uses 20 research-based prompt engineering templates
- Smart template selection based on your prompt intent

### 📚 Repository Indexing
- Indexes your codebase using embeddings for semantic search
- Automatically updates index when files change
- Fast retrieval of relevant code snippets

### 🤖 Agent/Chat Mode Switching
- **Chat Mode**: Traditional conversational AI interaction
- **Agent Mode**: Advanced autonomous task execution
- Easy switching via status bar or commands

### 🎨 Modern UI
- Beautiful chat interface with message history
- Interactive sidebar with status monitoring
- Real-time indexing progress
- Template preview and selection

### 🔧 20 Prompt Engineering Templates

Based on research papers and best practices:

1. **Persona Pattern** - Role-based prompting
2. **Chain of Thought** - Step-by-step reasoning
3. **Few-Shot Examples** - Example-based learning
4. **Recipe Pattern** - Sequential instructions
5. **Template Pattern** - Structured output format
6. **Alternative Approaches** - Multiple solution exploration
7. **Context Manager** - Context-aware prompting
8. **Output Automator** - Format specification
9. **Question Refinement** - Clarification-based
10. **Cognitive Verifier** - Solution verification
11. **Meta Language Creation** - Domain-specific notation
12. **Semantic Filter** - Focus control
13. **Fact Check List** - Claim verification
14. **Reflection Pattern** - Self-improvement
15. **Audience Pattern** - Audience-aware responses
16. **Flipped Interaction** - AI-led questioning
17. **Game Play Pattern** - Interactive scenarios
18. **Infinite Generation** - Variation generation
19. **Visualization Generator** - Visual representations
20. **Comparative Analysis** - Multi-option comparison

## Installation

1. Clone this repository
2. Run `npm install` in the extension directory
3. Open in VS Code and press F5 to run in development mode

## Quick Start

1. **Index Your Repository**
   - Click the database icon in the status bar
   - Or use Command Palette: `Prompt Enrichment: Reindex Repository`

2. **Open Chat**
   - Click the Prompt Enrichment icon in the sidebar
   - Or use Command Palette: `Open Prompt Enrichment Chat`

3. **Start Chatting**
   - Type your prompt in the chat input
   - Click "Enrich" to preview enrichment or "Send" to send directly
   - The extension will automatically add repository context and apply templates

4. **Switch Modes**
   - Click the mode indicator in the status bar
   - Toggle between Chat and Agent modes

5. **Change Models**
   - Click the model name in the status bar
   - Select from available models

## Commands

- `Prompt Enrichment: Reindex Repository` - Index or reindex your codebase
- `Prompt Enrichment: Show Templates` - Browse available prompt templates
- `Copilot: Switch to Chat Mode` - Switch to chat mode
- `Copilot: Switch to Agent Mode` - Switch to agent mode
- `Copilot: Change Model` - Select a different AI model
- `Open Prompt Enrichment Chat` - Open the chat interface
- `Enrich Current Prompt` - Enrich a prompt with preview

## Configuration

Settings available in VS Code settings:

```json
{
  "promptEnrichment.mode": "chat",
  "promptEnrichment.selectedModel": "gpt-4",
  "promptEnrichment.autoIndex": true,
  "promptEnrichment.embeddingProvider": "local"
}
```

### Settings

- `promptEnrichment.mode` - Current mode (chat/agent)
- `promptEnrichment.selectedModel` - Selected AI model
- `promptEnrichment.autoIndex` - Auto-index on workspace open
- `promptEnrichment.embeddingProvider` - Embedding provider (openai/local)

## Development

### Build

```bash
npm install
npm run compile
```

### Watch Mode

```bash
npm run watch
```

### Package

```bash
npm install -g vsce
vsce package
```

## Architecture

```
┌─────────────────────────┐
│   GitHub Copilot API    │
└───────────┬─────────────┘
            │
┌───────────▼─────────────┐
│  Copilot Integration    │
└───────────┬─────────────┘
            │
┌───────────▼─────────────┐
│ Enrichment Engine       │
├─────────────────────────┤
│ • Template Manager      │
│ • Repo Indexer          │
│ • Context Retrieval     │
└───────────┬─────────────┘
            │
┌───────────▼─────────────┐
│  UI Components          │
├─────────────────────────┤
│ • Chat Panel            │
│ • Sidebar               │
│ • Status Bar            │
└─────────────────────────┘
```

## Technologies

- **Extension Core**: TypeScript
- **UI**: VS Code Webview API
- **Embeddings**: OpenAI / Local embeddings
- **Storage**: Local JSON/SQLite
- **Integration**: GitHub Copilot SDK

## Research References

This extension implements prompt engineering techniques from:

- *A Prompt Pattern Catalog* (White et al., 2023)
- *The Prompt Canvas* (Hewing & Leinhos, 2024)
- *Information-theoretic Approach to Prompt Engineering* (Sorensen et al., 2022)
- OpenAI, Google, and IBM prompt engineering guides

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check the documentation
- Review existing issues

## Roadmap

- [ ] Support for more AI models
- [ ] Custom template creation
- [ ] Export/import chat history
- [ ] Multi-language support
- [ ] Advanced agent tools
- [ ] Integration with more embedding providers
- [ ] Collaborative features

---

Built with ❤️ for developers who want smarter AI assistance

