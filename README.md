# VS Code Intelligent Prompt Enrichment Extension

> Enhance GitHub Copilot with intelligent prompt enrichment, repository indexing, and 20 research-based prompt engineering templates.

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]() 
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85.0+-blue)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.0-blue)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

**Developer**: [@devops4298](https://github.com/devops4298) | **Location**: Chicago, IL USA

---

## ✨ Features

- **🎯 Intelligent Prompt Enrichment** - Automatically enhances prompts with relevant code context
- **📚 Repository Indexing** - Semantic search across your codebase
- **📝 20 Research-Based Templates** - Proven prompt engineering patterns
- **🤖 Agent/Chat Modes** - Switch between conversational and autonomous modes
- **🎨 Modern UI** - Beautiful chat interface with real-time updates
- **⚡ Fast & Lightweight** - Efficient indexing and quick responses
- **🔄 Auto-Sync** - Automatic index updates on file changes

---

## 🚀 Quick Start

### Installation

```bash
cd vscode-extension
npm install
npm run compile
```

### Run in Development

1. Open `vscode-extension` folder in VS Code
2. Press `F5` to launch Extension Development Host
3. Test the extension in the new window

### Build for Production

```bash
cd vscode-extension
npm run compile
npm run package  # Creates .vsix file
```

### Install Extension

```bash
code --install-extension intelligent-prompt-enrichment-0.1.0.vsix
```

---

## 📖 Usage

### 1. Index Your Repository

- Open Command Palette (`Cmd/Ctrl+Shift+P`)
- Run: `Prompt Enrichment: Reindex Repository`
- Wait for indexing to complete

### 2. Open Chat Interface

- Command Palette → `Open Prompt Enrichment Chat`
- Or click the sidebar icon

### 3. Start Chatting

Type your prompt:
```
Create a REST API endpoint for user authentication
```

Click **"✨ Enrich"** to preview enrichment or **"📤 Send"** to send directly.

### 4. Switch Modes

- **Chat Mode** (💬): Conversational AI assistance
- **Agent Mode** (🤖): Autonomous task execution
- Toggle via status bar or Command Palette

---

## 📝 Prompt Templates

20 research-based templates from academic papers:

| Template | Category | Best For |
|----------|----------|----------|
| Persona Pattern | Role-based | Role assignment & expertise |
| Chain of Thought | Reasoning | Step-by-step problem solving |
| Few-Shot Examples | Example-based | Learning from examples |
| Recipe Pattern | Instructional | Sequential procedures |
| Alternative Approaches | Exploration | Multiple solution options |
| Context Manager | Context-control | Complex scenarios |
| Cognitive Verifier | Verification | Solution validation |
| Reflection Pattern | Self-improvement | Code review & refinement |
| Comparative Analysis | Analysis | Technology comparisons |

...and 11 more! View all via: `Prompt Enrichment: Show Templates`

---

## 🏗️ Architecture

```
Extension Core
├── Repository Indexer (Semantic search)
├── Template Manager (20 patterns)
├── Enrichment Engine (Context + Templates)
├── Copilot Integration (AI communication)
└── UI Layer (Chat, Sidebar, Status Bar)
```

---

## ⚙️ Configuration

```json
{
  "promptEnrichment.mode": "chat",
  "promptEnrichment.selectedModel": "gpt-4",
  "promptEnrichment.autoIndex": true,
  "promptEnrichment.embeddingProvider": "local"
}
```

### Embedding Providers

**Local** (Default) - No API key required, works offline
```json
{
  "promptEnrichment.embeddingProvider": "local"
}
```

**OpenAI** - Higher quality, requires API key
```bash
export OPENAI_API_KEY=your-key
```
```json
{
  "promptEnrichment.embeddingProvider": "openai"
}
```

---

## 🛠️ Development

### Project Structure

```
vscode-extension/
├── src/
│   ├── extension.ts              # Main entry point
│   ├── repoIndexer.ts            # Code indexing
│   ├── templateManager.ts        # Template system
│   ├── enrichmentEngine.ts       # Prompt enrichment
│   ├── copilotIntegration.ts     # AI integration
│   ├── ui/                       # UI components
│   └── utils/                    # Utilities
├── templates/                    # 20 JSON templates
└── package.json
```

### Available Scripts

```bash
npm run compile     # Compile TypeScript
npm run watch       # Watch mode
npm run lint        # Lint code
npm run package     # Build .vsix package
```

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📚 Research Foundation

This extension implements techniques from:

- **A Prompt Pattern Catalog** (White et al., 2023) - [arXiv:2302.11382](https://arxiv.org/abs/2302.11382)
- **The Prompt Canvas** (Hewing & Leinhos, 2024) - [arXiv:2412.05127](https://arxiv.org/abs/2412.05127)
- **Information-theoretic Approach** (Sorensen et al., 2022) - [arXiv:2203.11364](https://arxiv.org/abs/2203.11364)
- **OpenAI Prompt Engineering Guide** - [OpenAI Docs](https://platform.openai.com/docs/guides/prompt-engineering)
- **Google Cloud Prompt Engineering** - [Google Cloud](https://cloud.google.com/discover/what-is-prompt-engineering)

---

## 🎯 Commands

| Command | Description |
|---------|-------------|
| `Prompt Enrichment: Reindex Repository` | Index/reindex your codebase |
| `Prompt Enrichment: Show Templates` | Browse prompt templates |
| `Copilot: Switch to Chat Mode` | Enable chat mode |
| `Copilot: Switch to Agent Mode` | Enable agent mode |
| `Copilot: Change Model` | Select AI model |
| `Open Prompt Enrichment Chat` | Open chat interface |

---

## 📊 Performance

- **Extension Activation**: <1 second
- **Repository Indexing**: 10-60 seconds (varies by size)
- **Prompt Enrichment**: <2 seconds
- **Memory Usage**: ~50-100MB

---

## 🐛 Troubleshooting

### Extension Not Activating
```bash
# Reload VS Code
Cmd/Ctrl+Shift+P → "Reload Window"
```

### Indexing Fails
- Ensure workspace has code files
- Check Output panel: View → Output → Extension Host
- Try manual reindex

### Chat Not Working
- Check GitHub Copilot authentication
- Open Developer Tools: Help → Toggle Developer Tools
- Check console for errors

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🤝 Connect

- **GitHub**: [@devops4298](https://github.com/devops4298)
- **LinkedIn**: [chetanchauhan13](https://www.linkedin.com/in/chetanchauhan13)
- **Location**: Chicago, IL USA

---

## 🙏 Acknowledgments

- Research papers and authors for prompt engineering techniques
- VS Code Extension API documentation
- GitHub Copilot team
- Open source community

---

**Built with ❤️ in Chicago** | **October 2025**

⭐ Star this repo if you find it useful!
