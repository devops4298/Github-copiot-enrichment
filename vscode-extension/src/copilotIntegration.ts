import * as vscode from 'vscode';

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
}

export class CopilotIntegration {
    private mode: ModelMode = 'chat';
    private selectedModel: string = 'gpt-4';
    private chatHistory: ChatMessage[] = [];
    private availableModels: ModelConfig[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.loadConfiguration();
        this.initializeModels();
    }

    private loadConfiguration(): void {
        const config = vscode.workspace.getConfiguration('promptEnrichment');
        this.mode = config.get<ModelMode>('mode', 'chat');
        this.selectedModel = config.get<string>('selectedModel', 'gpt-4');
    }

    private initializeModels(): void {
        // These would be fetched from GitHub Copilot organization models
        this.availableModels = [
            {
                id: 'gpt-4',
                name: 'GPT-4',
                provider: 'OpenAI',
                capabilities: ['chat', 'agent', 'code-generation']
            },
            {
                id: 'gpt-4-turbo',
                name: 'GPT-4 Turbo',
                provider: 'OpenAI',
                capabilities: ['chat', 'agent', 'code-generation', 'function-calling']
            },
            {
                id: 'gpt-3.5-turbo',
                name: 'GPT-3.5 Turbo',
                provider: 'OpenAI',
                capabilities: ['chat', 'code-generation']
            },
            {
                id: 'claude-3-opus',
                name: 'Claude 3 Opus',
                provider: 'Anthropic',
                capabilities: ['chat', 'agent', 'code-generation']
            },
            {
                id: 'claude-3-sonnet',
                name: 'Claude 3 Sonnet',
                provider: 'Anthropic',
                capabilities: ['chat', 'agent', 'code-generation']
            }
        ];
    }

    async sendMessage(prompt: string, options?: {
        systemPrompt?: string;
        temperature?: number;
        maxTokens?: number;
    }): Promise<ChatResponse> {
        // Add user message to history
        this.chatHistory.push({
            role: 'user',
            content: prompt,
            timestamp: new Date()
        });

        try {
            // In a real implementation, this would use the GitHub Copilot API
            // For now, we'll simulate the response
            const response = await this.simulateCopilotRequest(prompt, options);

            // Add assistant response to history
            this.chatHistory.push({
                role: 'assistant',
                content: response.content,
                timestamp: new Date()
            });

            return response;
        } catch (error) {
            console.error('Error sending message to Copilot:', error);
            throw new Error(`Failed to get response from ${this.selectedModel}: ${error}`);
        }
    }

    private async simulateCopilotRequest(
        prompt: string,
        options?: {
            systemPrompt?: string;
            temperature?: number;
            maxTokens?: number;
        }
    ): Promise<ChatResponse> {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // This is a placeholder. In production, this would make actual API calls to GitHub Copilot
        // Using the authenticated organization credentials
        
        return {
            content: `[Simulated ${this.mode} mode response from ${this.selectedModel}]\n\n` +
                     `I received your enriched prompt:\n\n${prompt.substring(0, 200)}...\n\n` +
                     `This is a placeholder response. In production, this would be the actual AI response from GitHub Copilot.`,
            model: this.selectedModel,
            tokens: 150
        };
    }

    // Switch between Chat and Agent modes
    async switchMode(newMode: ModelMode): Promise<void> {
        this.mode = newMode;
        
        const config = vscode.workspace.getConfiguration('promptEnrichment');
        await config.update('mode', newMode, vscode.ConfigurationTarget.Global);
        
        vscode.window.showInformationMessage(`Switched to ${newMode} mode`);
    }

    getMode(): ModelMode {
        return this.mode;
    }

    // Change selected model
    async changeModel(modelId: string): Promise<void> {
        const model = this.availableModels.find(m => m.id === modelId);
        
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        // Check if model supports current mode
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

    // Show model selector quick pick
    async showModelSelector(): Promise<void> {
        const items = this.availableModels.map(model => ({
            label: model.name,
            description: model.provider,
            detail: `Capabilities: ${model.capabilities.join(', ')}`,
            modelId: model.id
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a model',
            matchOnDescription: true
        });

        if (selected) {
            await this.changeModel(selected.modelId);
        }
    }

    // Get chat history
    getChatHistory(): ChatMessage[] {
        return [...this.chatHistory];
    }

    // Clear chat history
    clearHistory(): void {
        this.chatHistory = [];
    }

    // Export chat history
    exportHistory(): string {
        return JSON.stringify(this.chatHistory, null, 2);
    }

    // Stream response (for future implementation)
    async streamMessage(
        prompt: string,
        onChunk: (chunk: string) => void,
        onComplete: () => void
    ): Promise<void> {
        // This would implement streaming responses
        // For now, just simulate it
        const response = await this.simulateCopilotRequest(prompt);
        
        const words = response.content.split(' ');
        for (const word of words) {
            onChunk(word + ' ');
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        onComplete();
    }

    // Agent-specific capabilities
    async executeAgentTask(task: string, tools: string[]): Promise<ChatResponse> {
        if (this.mode !== 'agent') {
            throw new Error('Agent mode is not enabled');
        }

        const agentPrompt = `You are an AI agent with access to the following tools: ${tools.join(', ')}\n\n` +
                          `Task: ${task}\n\n` +
                          `Execute this task step by step, using the available tools as needed.`;

        return this.sendMessage(agentPrompt);
    }

    // Check if Copilot is authenticated
    async checkAuthentication(): Promise<boolean> {
        try {
            // In production, this would check GitHub Copilot authentication status
            // For now, we'll assume it's authenticated
            return true;
        } catch (error) {
            console.error('Authentication check failed:', error);
            return false;
        }
    }

    // Get authentication status and prompt user if needed
    async ensureAuthenticated(): Promise<boolean> {
        const isAuthenticated = await this.checkAuthentication();
        
        if (!isAuthenticated) {
            const result = await vscode.window.showErrorMessage(
                'GitHub Copilot is not authenticated. Please sign in.',
                'Sign In'
            );

            if (result === 'Sign In') {
                // Open Copilot authentication
                vscode.commands.executeCommand('github.copilot.signIn');
            }
            
            return false;
        }

        return true;
    }
}

