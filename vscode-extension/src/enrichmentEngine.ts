import * as vscode from 'vscode';
import { RepoIndexer, CodeChunk } from './repoIndexer';
import { TemplateManager, PromptTemplate } from './templateManager';

export interface EnrichedPrompt {
    originalPrompt: string;
    enrichedPrompt: string;
    template: PromptTemplate | null;
    codeContext: CodeChunk[];
    metadata: {
        timestamp: Date;
        templateUsed: string;
        contextChunks: number;
    };
}

export class PromptEnrichmentEngine {
    constructor(
        private repoIndexer: RepoIndexer,
        private templateManager: TemplateManager
    ) {}

    async enrichPrompt(
        userPrompt: string,
        options?: {
            maxContextChunks?: number;
            templateId?: string;
            includeRepoContext?: boolean;
        }
    ): Promise<EnrichedPrompt> {
        const maxContextChunks = options?.maxContextChunks || 5;
        const includeRepoContext = options?.includeRepoContext !== false;

        // Step 1: Get relevant code context from repository
        let codeContext: CodeChunk[] = [];
        if (includeRepoContext) {
            try {
                codeContext = await this.repoIndexer.queryRelevantCode(userPrompt, maxContextChunks);
            } catch (error) {
                console.error('Error querying code context:', error);
            }
        }

        // Step 2: Select best-fit template
        let template: PromptTemplate | null = null;
        if (options?.templateId) {
            template = this.templateManager.getTemplateById(options.templateId) || null;
        } else {
            template = await this.templateManager.selectBestTemplate(userPrompt);
        }

        // Step 3: Build enriched prompt
        const enrichedPrompt = this.buildEnrichedPrompt(userPrompt, template, codeContext);

        return {
            originalPrompt: userPrompt,
            enrichedPrompt,
            template,
            codeContext,
            metadata: {
                timestamp: new Date(),
                templateUsed: template?.name || 'none',
                contextChunks: codeContext.length
            }
        };
    }

    private buildEnrichedPrompt(
        userPrompt: string,
        template: PromptTemplate | null,
        codeContext: CodeChunk[]
    ): string {
        let enriched = '';

        // Add repository context if available
        if (codeContext.length > 0) {
            enriched += '## Repository Context\n\n';
            enriched += 'The following code snippets from the repository may be relevant:\n\n';

            for (const chunk of codeContext) {
                enriched += `### ${chunk.filePath}`;
                if (chunk.name) {
                    enriched += ` - ${chunk.name}`;
                }
                enriched += `\n`;
                enriched += `Lines ${chunk.startLine}-${chunk.endLine}\n`;
                enriched += '```\n';
                enriched += chunk.content.substring(0, 500); // Limit context size
                if (chunk.content.length > 500) {
                    enriched += '\n... (truncated)';
                }
                enriched += '\n```\n\n';
            }
        }

        // Apply template if available
        if (template) {
            enriched += '## Structured Prompt\n\n';
            const contextMap: Record<string, string> = {
                task: userPrompt,
                question: userPrompt,
                problem: userPrompt,
                context: codeContext.length > 0 
                    ? `Working in a codebase with ${codeContext.length} relevant code sections`
                    : 'No specific code context available'
            };

            enriched += this.templateManager.formatPromptWithTemplate(userPrompt, template, contextMap);
        } else {
            // No template - just add the original prompt
            enriched += '## User Request\n\n';
            enriched += userPrompt;
        }

        return enriched;
    }

    async showEnrichmentPreview(enrichedPrompt: EnrichedPrompt): Promise<boolean> {
        const panel = vscode.window.createWebviewPanel(
            'promptPreview',
            'Enriched Prompt Preview',
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );

        panel.webview.html = this.getPreviewHtml(enrichedPrompt);

        return new Promise((resolve) => {
            panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'approve':
                            panel.dispose();
                            resolve(true);
                            return;
                        case 'reject':
                            panel.dispose();
                            resolve(false);
                            return;
                    }
                }
            );

            panel.onDidDispose(() => {
                resolve(false);
            });
        });
    }

    private getPreviewHtml(enrichedPrompt: EnrichedPrompt): string {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prompt Preview</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .section {
            margin-bottom: 20px;
            padding: 15px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }
        .section h3 {
            margin-top: 0;
            color: var(--vscode-textLink-foreground);
        }
        .prompt {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 10px;
            border-left: 4px solid var(--vscode-textLink-foreground);
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
        }
        .metadata {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .buttons {
            margin-top: 20px;
            display: flex;
            gap: 10px;
        }
        button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <h2>Enriched Prompt Preview</h2>
    
    <div class="section">
        <h3>Original Prompt</h3>
        <div class="prompt">${this.escapeHtml(enrichedPrompt.originalPrompt)}</div>
    </div>

    <div class="section">
        <h3>Enriched Prompt</h3>
        <div class="prompt">${this.escapeHtml(enrichedPrompt.enrichedPrompt)}</div>
    </div>

    <div class="section">
        <h3>Metadata</h3>
        <div class="metadata">
            <p><strong>Template Used:</strong> ${enrichedPrompt.template?.name || 'None'}</p>
            <p><strong>Code Context Chunks:</strong> ${enrichedPrompt.codeContext.length}</p>
            <p><strong>Template Category:</strong> ${enrichedPrompt.template?.category || 'N/A'}</p>
        </div>
    </div>

    <div class="buttons">
        <button onclick="approve()">Use Enriched Prompt</button>
        <button class="secondary" onclick="reject()">Use Original</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function approve() {
            vscode.postMessage({ command: 'approve' });
        }
        
        function reject() {
            vscode.postMessage({ command: 'reject' });
        }
    </script>
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Quick enrichment without preview
    async quickEnrich(userPrompt: string): Promise<string> {
        const enriched = await this.enrichPrompt(userPrompt);
        return enriched.enrichedPrompt;
    }

    // Get enrichment statistics
    getStats(): {
        totalEnrichments: number;
        averageContextChunks: number;
        mostUsedTemplate: string;
    } {
        // This would track stats over time
        return {
            totalEnrichments: 0,
            averageContextChunks: 0,
            mostUsedTemplate: 'none'
        };
    }
}

