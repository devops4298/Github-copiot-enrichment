import * as vscode from 'vscode';
import { RepoIndexer } from './repoIndexer';
import { TemplateManager } from './templateManager';
import { PromptEnrichmentEngine } from './enrichmentEngine';
import { CopilotIntegration, ModelMode } from './copilotIntegration';
import { StatusBarManager } from './ui/statusBar';
import { getSidebarHtml } from './ui/sidebar';
import { getChatPanelHtml } from './ui/chatPanel';
import { FileWatcher } from './utils/fileWatcher';

export function activate(context: vscode.ExtensionContext) {
    console.log('Intelligent Prompt Enrichment extension is now active!');

    // Initialize core modules
    const repoIndexer = new RepoIndexer(context);
    const templateManager = new TemplateManager(context.extensionPath);
    const enrichmentEngine = new PromptEnrichmentEngine(repoIndexer, templateManager);
    const copilotIntegration = new CopilotIntegration(context);
    const statusBarManager = new StatusBarManager(context);

    // File watcher for auto-indexing
    let fileWatcher: FileWatcher | undefined;

    // Webview panels
    let chatPanel: vscode.WebviewPanel | undefined;
    let sidebarProvider: SidebarProvider | undefined;

    // Initialize
    initialize();

    async function initialize() {
        // Load templates
        await templateManager.loadTemplates();

        // Check if workspace is available
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            // Try to load existing index
            const indexLoaded = await repoIndexer.loadIndex();
            
            // Auto-index if enabled and no index exists
            const config = vscode.workspace.getConfiguration('promptEnrichment');
            const autoIndex = config.get<boolean>('autoIndex', true);
            
            if (!indexLoaded && autoIndex) {
                vscode.window.showInformationMessage(
                    'Would you like to index your repository for better prompt enrichment?',
                    'Yes', 'Later'
                ).then(async (choice) => {
                    if (choice === 'Yes') {
                        await indexRepository();
                    }
                });
            }

            // Setup file watcher
            setupFileWatcher(workspaceFolder);
        }

        // Update status bar
        updateStatusBar();

        // Initialize sidebar
        sidebarProvider = new SidebarProvider(
            context.extensionUri,
            repoIndexer,
            copilotIntegration
        );
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                'promptEnrichmentSidebar',
                sidebarProvider
            )
        );
    }

    function setupFileWatcher(workspaceFolder: vscode.WorkspaceFolder) {
        fileWatcher = new FileWatcher(async (uri) => {
            // Update index for changed file
            if (repoIndexer.getIndexStatus().isIndexed) {
                await repoIndexer.updateFile(uri.fsPath, workspaceFolder.uri.fsPath);
                updateStatusBar();
            }
        });
        fileWatcher.start(workspaceFolder);
        context.subscriptions.push({
            dispose: () => fileWatcher?.dispose()
        });
    }

    function updateStatusBar() {
        const mode = copilotIntegration.getMode();
        const model = copilotIntegration.getSelectedModel();
        const indexStatus = repoIndexer.getIndexStatus();

        statusBarManager.updateMode(mode);
        statusBarManager.updateModel(model?.name || 'No Model');
        statusBarManager.updateIndexStatus(indexStatus);
    }

    // Command: Reindex Repository
    const reindexRepoCommand = vscode.commands.registerCommand(
        'promptEnrichment.reindexRepo',
        async () => {
            await indexRepository();
        }
    );

    async function indexRepository() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('No workspace folder open');
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Indexing repository (fast keyword-based)...',
                cancellable: false
            },
            async (progress) => {
                // Use FAST indexing (keyword-based, like Cursor)
                await repoIndexer.indexRepositoryFast(workspaceFolder, (percent) => {
                    progress.report({ increment: percent });
                });
                updateStatusBar();
                if (sidebarProvider) {
                    sidebarProvider.refresh();
                }
            }
        );
    }

    // Command: Generate Semantic Index
    const generateSemanticIndexCommand = vscode.commands.registerCommand(
        'promptEnrichment.generateSemanticIndex',
        async () => {
            await repoIndexer.generateSemanticIndex();
            updateStatusBar();
            if (sidebarProvider) {
                sidebarProvider.refresh();
            }
        }
    );

    // Command: Show Templates
    const showTemplatesCommand = vscode.commands.registerCommand(
        'promptEnrichment.showTemplates',
        async () => {
            const template = await templateManager.showTemplateQuickPick();
            if (template) {
                const panel = vscode.window.createWebviewPanel(
                    'templatePreview',
                    `Template: ${template.name}`,
                    vscode.ViewColumn.Beside,
                    {}
                );

                panel.webview.html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { 
                                font-family: var(--vscode-font-family);
                                padding: 20px;
                                color: var(--vscode-foreground);
                            }
                            .field { margin-bottom: 20px; }
                            .label { font-weight: bold; color: var(--vscode-textLink-foreground); }
                            .value { margin-top: 5px; white-space: pre-wrap; }
                            .example { 
                                background: var(--vscode-textCodeBlock-background);
                                padding: 15px;
                                border-radius: 4px;
                                margin-top: 10px;
                            }
                        </style>
                    </head>
                    <body>
                        <h1>${template.name}</h1>
                        <div class="field">
                            <div class="label">Description:</div>
                            <div class="value">${template.description}</div>
                        </div>
                        <div class="field">
                            <div class="label">Category:</div>
                            <div class="value">${template.category}</div>
                        </div>
                        <div class="field">
                            <div class="label">Example:</div>
                            <div class="example">${template.example.replace(/\n/g, '<br>')}</div>
                        </div>
                    </body>
                    </html>
                `;
            }
        }
    );

    // Command: Switch to Chat Mode
    const switchToChatModeCommand = vscode.commands.registerCommand(
        'promptEnrichment.switchToChatMode',
        async () => {
            await copilotIntegration.switchMode('chat');
            updateStatusBar();
            if (sidebarProvider) {
                sidebarProvider.refresh();
            }
        }
    );

    // Command: Switch to Agent Mode
    const switchToAgentModeCommand = vscode.commands.registerCommand(
        'promptEnrichment.switchToAgentMode',
        async () => {
            await copilotIntegration.switchMode('agent');
            updateStatusBar();
            if (sidebarProvider) {
                sidebarProvider.refresh();
            }
        }
    );

    // Command: Toggle Mode
    const toggleModeCommand = vscode.commands.registerCommand(
        'promptEnrichment.toggleMode',
        async () => {
            const currentMode = copilotIntegration.getMode();
            const newMode: ModelMode = currentMode === 'chat' ? 'agent' : 'chat';
            await copilotIntegration.switchMode(newMode);
            updateStatusBar();
            if (sidebarProvider) {
                sidebarProvider.refresh();
            }
        }
    );

    // Command: Change Model
    const changeModelCommand = vscode.commands.registerCommand(
        'promptEnrichment.changeModel',
        async () => {
            await copilotIntegration.showModelSelector();
            updateStatusBar();
            if (sidebarProvider) {
                sidebarProvider.refresh();
            }
        }
    );

    // Command: Open Chat
    const openChatCommand = vscode.commands.registerCommand(
        'promptEnrichment.openChat',
        () => {
            createOrShowChatPanel();
        }
    );

    // Command: Enrich Prompt
    const enrichPromptCommand = vscode.commands.registerCommand(
        'promptEnrichment.enrichPrompt',
        async () => {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter your prompt',
                placeHolder: 'e.g., Create a REST API endpoint for user authentication'
            });

            if (input) {
                const enriched = await enrichmentEngine.enrichPrompt(input);
                const approved = await enrichmentEngine.showEnrichmentPreview(enriched);

                if (approved) {
                    vscode.window.showInformationMessage('Enriched prompt approved!');
                }
            }
        }
    );

    function createOrShowChatPanel() {
        if (chatPanel) {
            chatPanel.reveal(vscode.ViewColumn.One);
            return;
        }
        
        chatPanel = vscode.window.createWebviewPanel(
            'promptEnrichmentChat',
            'Prompt Enrichment Chat',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        updateChatPanel();

        chatPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'sendMessage':
                        await handleSendMessage(message.prompt);
                        break;
                    case 'enrichPrompt':
                        await handleEnrichPrompt(message.prompt);
                        break;
                    case 'applyAgentAction':
                        await handleApplyAction();
                        break;
                    case 'rejectAgentAction':
                        await handleRejectAction();
                        break;
                }
            }
        );

        chatPanel.onDidDispose(() => {
            chatPanel = undefined;
        });
    }

    function updateChatPanel() {
        if (!chatPanel) {
            return;
        }

        const messages = copilotIntegration.getChatHistory();
        chatPanel.webview.html = getChatPanelHtml(messages);
    }

    async function handleSendMessage(prompt: string) {
        try {
            console.log('Sending message:', prompt);
            
            // Enrich the prompt
            const enriched = await enrichmentEngine.enrichPrompt(prompt);
            console.log('Prompt enriched, sending to Copilot...');

            // Send to Copilot
            const response = await copilotIntegration.sendMessage(enriched.enrichedPrompt);
            console.log('Received response from Copilot:', response.content.substring(0, 100));

            // Force update chat panel with new messages
            const messages = copilotIntegration.getChatHistory();
            console.log('Total messages in history:', messages.length);
            
            if (chatPanel) {
                chatPanel.webview.html = getChatPanelHtml(messages);
                
                // Scroll to bottom
                chatPanel.webview.postMessage({ command: 'scrollToBottom' });
            }

            // Notify completion
            chatPanel?.webview.postMessage({ command: 'messageComplete' });
            
            // Show agent actions if any
            if (response.actions && response.actions.length > 0) {
                const actionsDesc = response.actions.map(a => `• ${a.description}`).join('\n');
                vscode.window.showInformationMessage(
                    `🤖 Agent actions executed:\n${actionsDesc}`
                );
            }
        } catch (error) {
            console.error('Error sending message:', error);
            vscode.window.showErrorMessage(`Error: ${error}`);
            chatPanel?.webview.postMessage({
                command: 'error',
                error: String(error)
            });
        }
    }

    // UPDATED: Inline enrichment - updates input field instead of showing preview
    async function handleEnrichPrompt(prompt: string) {
        try {
            const enriched = await enrichmentEngine.enrichPrompt(prompt);
            
            // Send enriched prompt back to update input field
            chatPanel?.webview.postMessage({
                command: 'enrichedPrompt',
                enrichedPrompt: enriched.enrichedPrompt
            });
            
            // Show info about enrichment
            const templateInfo = enriched.template 
                ? `using ${enriched.template.name}` 
                : 'with professional formatting';
            
            vscode.window.showInformationMessage(
                `✨ Prompt enriched ${templateInfo}. Review and click Send!`
            );
        } catch (error) {
            console.error('Error enriching prompt:', error);
            chatPanel?.webview.postMessage({
                command: 'error',
                error: String(error)
            });
        }
    }

    // NEW: Handle Apply Action
    async function handleApplyAction() {
        try {
            console.log('User clicked Apply, executing agent action...');
            const result = await copilotIntegration.executeAgentAction();
            
            // Update chat history with result
            const messages = copilotIntegration.getChatHistory();
            if (chatPanel) {
                chatPanel.webview.html = getChatPanelHtml(messages);
                chatPanel.webview.postMessage({ command: 'scrollToBottom' });
            }
            
            vscode.window.showInformationMessage('✅ Action applied successfully!');
        } catch (error) {
            console.error('Error applying action:', error);
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    }

    // NEW: Handle Reject Action
    async function handleRejectAction() {
        try {
            console.log('User clicked Reject, cancelling agent action...');
            const result = copilotIntegration.rejectAgentAction();
            
            // Update chat history with rejection message
            const messages = copilotIntegration.getChatHistory();
            if (chatPanel) {
                chatPanel.webview.html = getChatPanelHtml(messages);
                chatPanel.webview.postMessage({ command: 'scrollToBottom' });
            }
            
            vscode.window.showInformationMessage('Action cancelled');
        } catch (error) {
            console.error('Error rejecting action:', error);
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    }

    // Register all commands
    context.subscriptions.push(
        reindexRepoCommand,
        generateSemanticIndexCommand,
        showTemplatesCommand,
        switchToChatModeCommand,
        switchToAgentModeCommand,
        toggleModeCommand,
        changeModelCommand,
        openChatCommand,
        enrichPromptCommand,
        statusBarManager
    );

    // Show welcome message
    vscode.window.showInformationMessage(
        'Intelligent Prompt Enrichment is ready! Click the status bar to get started.',
        'Open Chat'
    ).then((choice) => {
        if (choice === 'Open Chat') {
            vscode.commands.executeCommand('promptEnrichment.openChat');
        }
    });
}

class SidebarProvider implements vscode.WebviewViewProvider {
    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly repoIndexer: RepoIndexer,
        private readonly copilotIntegration: CopilotIntegration
    ) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        this.updateView(webviewView);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'reindexRepo':
                    await vscode.commands.executeCommand('promptEnrichment.reindexRepo');
                    this.updateView(webviewView);
                    break;
                case 'switchMode':
                    await this.copilotIntegration.switchMode(message.mode);
                    this.updateView(webviewView);
                    break;
                case 'changeModel':
                    await this.copilotIntegration.changeModel(message.modelId);
                    this.updateView(webviewView);
                    break;
                case 'openChat':
                    await vscode.commands.executeCommand('promptEnrichment.openChat');
                    break;
                case 'showTemplates':
                    await vscode.commands.executeCommand('promptEnrichment.showTemplates');
                    break;
                case 'clearHistory':
                    this.copilotIntegration.clearHistory();
                    vscode.window.showInformationMessage('Chat history cleared');
                    break;
            }
        });

        this.webviewView = webviewView;
    }

    private webviewView?: vscode.WebviewView;

    private updateView(webviewView: vscode.WebviewView) {
        const indexStatus = this.repoIndexer.getIndexStatus();
        const currentModel = this.copilotIntegration.getSelectedModel();
        const currentMode = this.copilotIntegration.getMode();
        const availableModels = this.copilotIntegration.getAvailableModels();

        webviewView.webview.html = getSidebarHtml({
            indexStatus,
            currentModel: currentModel?.id || 'unknown',
            currentMode,
            availableModels
        });
    }

    refresh() {
        if (this.webviewView) {
            this.updateView(this.webviewView);
        }
    }
}

export function deactivate() {
    console.log('Intelligent Prompt Enrichment extension is now deactivated');
}
