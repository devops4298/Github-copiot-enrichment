# Quick Start Guide

Get up and running in 5 minutes!

## 1. Install Dependencies

```bash
cd vscode-extension
npm install
```

## 2. Compile

```bash
npm run compile
```

## 3. Run Extension

**Method 1: Debug Mode (Recommended)**
- Open `vscode-extension` folder in VS Code
- Press `F5`
- Extension launches in new window

**Method 2: Install Locally**
```bash
npm run package
code --install-extension *.vsix
```

## 4. First Use

1. **Open a workspace** with code files
2. **Index repository**: `Cmd/Ctrl+Shift+P` → "Reindex Repository"
3. **Open chat**: Click sidebar icon or Command Palette → "Open Prompt Enrichment Chat"
4. **Try a prompt**: "Create a function to validate email addresses"

## Next Steps

- Browse templates: Command Palette → "Show Templates"
- Switch modes: Click status bar mode indicator (💬/🤖)
- Change models: Click status bar model name

## Need Help?

See [README.md](README.md) for full documentation.
