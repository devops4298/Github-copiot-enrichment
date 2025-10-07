import * as vscode from 'vscode';
import { AgentExecutor, AgentAction } from './agentMode';

export type ModelMode = 'chat' | 'agent';

export interface ModelConfig {
    id: string;
    name: string;
    provider: string;
    capabilities: string[];
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}

export interface ChatResponse {
    content: string;
    model: string;
    tokens?: number;
    actions?: AgentAction[];
    pendingApproval?: {
        actions: AgentAction[];
        generatedContent: string;
    };
}

export class CopilotIntegration {
    private mode: ModelMode = 'chat';
    private selectedModel: string = 'gpt-4-turbo';
    private chatHistory: ChatMessage[] = [];
    private availableModels: ModelConfig[] = [];
    private authSession: vscode.AuthenticationSession | undefined;
    private agentExecutor: AgentExecutor | undefined;
    private pendingAgentAction: { actions: AgentAction[]; content: string } | null = null;

    constructor(private context: vscode.ExtensionContext) {
        this.loadConfiguration();
        this.initializeModels();
        this.authenticate();
        
        // Initialize agent executor
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
            this.agentExecutor = new AgentExecutor(workspaceRoot);
        }
    }

    private loadConfiguration(): void {
        const config = vscode.workspace.getConfiguration('promptEnrichment');
        this.mode = config.get<ModelMode>('mode', 'chat');
        this.selectedModel = config.get<string>('selectedModel', 'gpt-4-turbo');
    }

    private initializeModels(): void {
        this.availableModels = [
            {
                id: 'copilot-gpt-4',
                name: 'Copilot GPT-4',
                provider: 'GitHub Copilot',
                capabilities: ['chat', 'agent', 'code-generation']
            },
            {
                id: 'copilot-gpt-3.5-turbo',
                name: 'Copilot GPT-3.5 Turbo',
                provider: 'GitHub Copilot',
                capabilities: ['chat', 'code-generation']
            },
            {
                id: 'gpt-4-turbo',
                name: 'GPT-4 Turbo',
                provider: 'OpenAI',
                capabilities: ['chat', 'agent', 'code-generation', 'function-calling']
            }
        ];
    }

    private async authenticate(): Promise<void> {
        try {
            this.authSession = await vscode.authentication.getSession('github', ['read:user', 'copilot'], { 
                createIfNone: false 
            });
            
            if (this.authSession) {
                console.log('GitHub authentication successful:', this.authSession.account.label);
            }
        } catch (error) {
            console.log('Not authenticated with GitHub. Will prompt on first use.');
        }
    }

    async ensureAuthenticated(): Promise<boolean> {
        if (!this.authSession) {
            try {
                this.authSession = await vscode.authentication.getSession('github', ['read:user', 'copilot'], { 
                    createIfNone: true 
                });
                
                if (this.authSession) {
                    vscode.window.showInformationMessage(
                        `✅ Authenticated with GitHub as ${this.authSession.account.label}`
                    );
                    return true;
                }
            } catch (error) {
                vscode.window.showErrorMessage(
                    'Failed to authenticate with GitHub. Some features may be limited.',
                    'Retry'
                ).then(async (selection) => {
                    if (selection === 'Retry') {
                        await this.ensureAuthenticated();
                    }
                });
                return false;
            }
        }
        return true;
    }

    async sendMessage(prompt: string, options?: {
        systemPrompt?: string;
        temperature?: number;
        maxTokens?: number;
    }): Promise<ChatResponse> {
        await this.ensureAuthenticated();

        // Add user message to history
        this.chatHistory.push({
            role: 'user',
            content: prompt,
            timestamp: new Date()
        });

        try {
            let response: ChatResponse;

            // In AGENT mode, detect and execute actions
            if (this.mode === 'agent' && this.agentExecutor) {
                response = await this.handleAgentMode(prompt, options);
            } else {
                // In CHAT mode, just get response
                response = await this.sendToLanguageModel(prompt, options);
            }

            // ALWAYS add assistant response to history
            this.chatHistory.push({
                role: 'assistant',
                content: response.content,
                timestamp: new Date()
            });

            console.log('Assistant message added to history. Total messages:', this.chatHistory.length);

            return response;
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Add error message to history
            const errorMsg = `Error: ${error}`;
            this.chatHistory.push({
                role: 'assistant',
                content: errorMsg,
                timestamp: new Date()
            });
            
            throw new Error(`Failed to get response: ${error}`);
        }
    }

    // UPDATED: Return preview for inline display, don't execute yet
    private async handleAgentMode(prompt: string, options?: any): Promise<ChatResponse> {
        console.log('Agent mode activated, detecting actions...');
        
        // Step 1: Detect what actions are needed
        const actions = this.agentExecutor!.detectActions(prompt);
        console.log('Actions detected:', actions.length);

        if (actions.length === 0) {
            // No file operations detected, just chat
            console.log('No file actions detected, using chat mode response');
            const response = await this.sendToLanguageModel(prompt, options);
            return response;
        }

        // Step 2: Get AI to generate the content for the action
        const enhancedPrompt = `${prompt}\n\nProvide ONLY the complete file content with proper formatting. Do not include explanations, just the file content ready to save.`;
        const aiResponse = await this.sendToLanguageModel(enhancedPrompt, options);

        // Step 3: Store pending action and return preview
        this.pendingAgentAction = {
            actions,
            content: aiResponse.content
        };

        console.log('Returning preview for inline display in chat');

        return {
            content: this.formatAgentPreview(actions, aiResponse.content),
            model: aiResponse.model,
            pendingApproval: {
                actions,
                generatedContent: aiResponse.content
            }
        };
    }

    // Format preview as HTML for inline display (editor-style)
    private formatAgentPreview(actions: AgentAction[], content: string): string {
        const lines = content.split('\n');
        const lineCount = lines.length;
        const charCount = content.length;
        
        // Truncate if too long, but show more than before
        const contentPreview = content.length > 2000 
            ? content.substring(0, 2000) + '\n\n... (truncated, full content will be saved)'
            : content;

        // Get file extension for icon
        const fileName = actions[0]?.filePath || '';
        const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
        const fileIcon = this.getFileIcon(fileExt);

        // Apply basic syntax highlighting for common patterns
        const highlightedContent = this.applySyntaxHighlighting(contentPreview, fileExt);

        // Get action description
        const actionDesc = actions[0]?.description || 'Create file';

        return `
<div class="agent-preview">
    <div class="preview-buttons-top">
        <div class="action-info">
            <span class="file-icon">${fileIcon}</span>
            <span class="action-text">${actionDesc}</span>
            <span class="file-stats">${lineCount} lines • ${charCount} chars</span>
        </div>
        <div class="button-group">
            <button class="apply-btn" onclick="applyAction()">✅ Apply</button>
            <button class="reject-btn" onclick="rejectAction()">❌ Reject</button>
        </div>
    </div>
    <div class="preview-content">
        <pre><code>${highlightedContent}</code></pre>
    </div>
</div>`;
    }

    // Get file icon based on extension
    private getFileIcon(extension: string): string {
        const icons: Record<string, string> = {
            'feature': '🥒',
            'ts': '📘',
            'js': '📜',
            'tsx': '⚛️',
            'jsx': '⚛️',
            'py': '🐍',
            'java': '☕',
            'json': '📋',
            'md': '📝',
            'css': '🎨',
            'html': '🌐'
        };
        return icons[extension] || '📄';
    }

    // Apply basic syntax highlighting (simple version)
    private applySyntaxHighlighting(content: string, fileType: string): string {
        let highlighted = this.escapeHtml(content);

        if (fileType === 'feature') {
            // Gherkin syntax highlighting
            highlighted = highlighted
                .replace(/^(@\w+)/gm, '<span style="color: var(--vscode-debugTokenExpression-name);">$1</span>')
                .replace(/^(Feature|Scenario|Scenario Outline|Background|Given|When|Then|And|But):/gm, '<span style="color: var(--vscode-debugTokenExpression-string); font-weight: bold;">$1:</span>')
                .replace(/"([^"]*)"/g, '<span style="color: var(--vscode-debugTokenExpression-number);">"$1"</span>')
                .replace(/^(\s*#.*)$/gm, '<span style="color: var(--vscode-descriptionForeground); font-style: italic;">$1</span>');
        } else if (fileType === 'ts' || fileType === 'js') {
            // TypeScript/JavaScript basic highlighting
            highlighted = highlighted
                .replace(/\b(const|let|var|function|class|interface|type|import|export|from|return|if|else|for|while|async|await)\b/g, '<span style="color: var(--vscode-debugTokenExpression-string); font-weight: bold;">$1</span>')
                .replace(/"([^"]*)"/g, '<span style="color: var(--vscode-debugTokenExpression-number);">"$1"</span>')
                .replace(/\/\/.*/g, '<span style="color: var(--vscode-descriptionForeground); font-style: italic;">$&</span>');
        }

        return highlighted;
    }

    private escapeHtml(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // NEW: Execute pending action
    async executeAgentAction(): Promise<string> {
        if (!this.pendingAgentAction) {
            return '❌ No pending action to execute';
        }

        const { actions, content } = this.pendingAgentAction;
        console.log('Executing approved agent actions...');

        const results: string[] = [];
        for (const action of actions) {
            const success = await this.agentExecutor!.executeAction(action, content);
            results.push(success ? `✅ ${action.description}` : `❌ Failed: ${action.description}`);
        }

        this.pendingAgentAction = null;

        const resultMessage = `**✅ Actions Executed Successfully!**\n\n${results.join('\n')}\n\nFile has been created and opened.`;
        
        // Add result to chat history
        this.chatHistory.push({
            role: 'assistant',
            content: resultMessage,
            timestamp: new Date()
        });

        return resultMessage;
    }

    // NEW: Reject pending action
    rejectAgentAction(): string {
        if (!this.pendingAgentAction) {
            return '❌ No pending action to reject';
        }

        const actions = this.pendingAgentAction.actions;
        this.pendingAgentAction = null;

        const rejectionMessage = `**❌ Action Rejected**\n\nThe following actions were cancelled:\n${actions.map(a => `• ${a.description}`).join('\n')}`;
        
        // Add rejection to chat history
        this.chatHistory.push({
            role: 'assistant',
            content: rejectionMessage,
            timestamp: new Date()
        });

        return rejectionMessage;
    }

    private async sendToLanguageModel(prompt: string, options?: any): Promise<ChatResponse> {
        try {
            console.log('Calling VS Code Language Model API...');
            
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: this.selectedModel.includes('gpt-4') ? 'gpt-4' : 'gpt-3.5-turbo'
            });

            if (models.length === 0) {
                throw new Error('No language models available. Please ensure GitHub Copilot is installed and enabled.');
            }

            const model = models[0];
            console.log('Using model:', model.name);
            
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];

            const chatRequest = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            let responseText = '';
            for await (const fragment of chatRequest.text) {
                responseText += fragment;
            }

            console.log('Language model response received, length:', responseText.length);

            return {
                content: responseText || 'No response received from the model.',
                model: model.name || this.selectedModel
            };

        } catch (error: any) {
            console.error('Language Model API error:', error);
            
            if (error.message?.includes('No language models available')) {
                return {
                    content: `⚠️ **GitHub Copilot Required**\n\n` +
                            `To get AI responses:\n` +
                            `1. Install GitHub Copilot extension\n` +
                            `2. Sign in to GitHub Copilot\n` +
                            `3. Ensure active subscription\n\n` +
                            `Your enriched prompt:\n${prompt.substring(0, 300)}...`,
                    model: 'none'
                };
            }

            throw error;
        }
    }

    async switchMode(newMode: ModelMode): Promise<void> {
        this.mode = newMode;
        const config = vscode.workspace.getConfiguration('promptEnrichment');
        await config.update('mode', newMode, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`🤖 Switched to ${newMode.toUpperCase()} mode`);
    }

    getMode(): ModelMode {
        return this.mode;
    }

    async changeModel(modelId: string): Promise<void> {
        const model = this.availableModels.find(m => m.id === modelId);
        
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        if (!model.capabilities.includes(this.mode)) {
            const shouldSwitch = await vscode.window.showWarningMessage(
                `${model.name} does not support ${this.mode} mode. Switch to chat mode?`,
                'Yes', 'No'
            );

            if (shouldSwitch === 'Yes') {
                await this.switchMode('chat');
            } else {
                return;
            }
        }

        this.selectedModel = modelId;
        const config = vscode.workspace.getConfiguration('promptEnrichment');
        await config.update('selectedModel', modelId, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Switched to ${model.name}`);
    }

    getSelectedModel(): ModelConfig | undefined {
        return this.availableModels.find(m => m.id === this.selectedModel);
    }

    getAvailableModels(): ModelConfig[] {
        return [...this.availableModels];
    }

    async showModelSelector(): Promise<void> {
        const items = this.availableModels.map(model => ({
            label: model.name,
            description: model.provider,
            detail: `Capabilities: ${model.capabilities.join(', ')}`,
            modelId: model.id
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a model'
        });

        if (selected) {
            await this.changeModel(selected.modelId);
        }
    }

    getChatHistory(): ChatMessage[] {
        console.log('Getting chat history, total messages:', this.chatHistory.length);
        return [...this.chatHistory];
    }

    clearHistory(): void {
        this.chatHistory = [];
        console.log('Chat history cleared');
    }

    exportHistory(): string {
        return JSON.stringify(this.chatHistory, null, 2);
    }

    async streamMessage(
        prompt: string,
        onChunk: (chunk: string) => void,
        onComplete: () => void
    ): Promise<void> {
        await this.ensureAuthenticated();

        try {
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot'
            });

            if (models.length === 0) {
                onChunk('⚠️ GitHub Copilot not available.');
                onComplete();
                return;
            }

            const model = models[0];
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            const chatRequest = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            for await (const fragment of chatRequest.text) {
                onChunk(fragment);
            }
            
            onComplete();
        } catch (error) {
            onChunk(`Error: ${error}`);
            onComplete();
        }
    }

    async executeAgentTask(task: string, tools: string[]): Promise<ChatResponse> {
        if (this.mode !== 'agent') {
            throw new Error('Agent mode is not enabled');
        }

        const agentPrompt = `You are an AI agent. Execute this task:\n\n${task}`;
        return this.sendMessage(agentPrompt);
    }

    async checkAuthentication(): Promise<boolean> {
        if (this.authSession) {
            return true;
        }
        return await this.ensureAuthenticated();
    }

    getAuthenticationInfo(): { authenticated: boolean; username?: string } {
        return {
            authenticated: !!this.authSession,
            username: this.authSession?.account.label
        };
    }

    async signOut(): Promise<void> {
        this.authSession = undefined;
        vscode.window.showInformationMessage('Signed out from GitHub');
    }

    async checkLanguageModelAvailability(): Promise<{ available: boolean; modelCount: number; models: string[] }> {
        try {
            const models = await vscode.lm.selectChatModels();
            return {
                available: models.length > 0,
                modelCount: models.length,
                models: models.map(m => `${m.vendor}/${m.family}`)
            };
        } catch (error) {
            return {
                available: false,
                modelCount: 0,
                models: []
            };
        }
    }
}
