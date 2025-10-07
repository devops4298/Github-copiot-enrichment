import * as vscode from 'vscode';
import { RepoIndexer, CodeChunk } from './repoIndexer';
import { TemplateManager, PromptTemplate } from './templateManager';
import * as path from 'path';
import * as fs from 'fs';

export interface EnrichedPrompt {
    originalPrompt: string;
    enrichedPrompt: string;
    template: PromptTemplate | null;
    codeContext: CodeChunk[];
    metadata: {
        timestamp: Date;
        templateUsed: string;
        contextChunks: number;
        selectionReason: string;
    };
}

export class PromptEnrichmentEngine {
    private workspaceRoot: string;

    constructor(
        private repoIndexer: RepoIndexer,
        private templateManager: TemplateManager
    ) {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    async enrichPrompt(
        userPrompt: string,
        options?: {
            maxContextChunks?: number;
            templateId?: string;
            includeRepoContext?: boolean;
        }
    ): Promise<EnrichedPrompt> {
        // Detect if already enriched
        let cleanPrompt = userPrompt;
        if (userPrompt.includes('**Task:**') || userPrompt.includes('**Location:**') || userPrompt.includes('**Steps:**')) {
            const createMatch = userPrompt.match(/Create (?:a new file named\s*\*\*)?(.+?)(?:\*\*|\n)/);
            if (createMatch) {
                cleanPrompt = 'Create ' + createMatch[1].replace(/\*\*/g, '');
            }
            console.log('Re-enrichment detected, using:', cleanPrompt);
        }

        // Extract file info AND topic
        const fileInfo = this.extractFileInfoAndTopic(cleanPrompt);
        console.log('Extracted file info:', fileInfo);

        // Check for existing files with similar names
        const existingFile = await this.findExistingFile(fileInfo.baseName, fileInfo.extension);
        if (existingFile) {
            console.log('Found existing file:', existingFile);
            
            // Ask user what to do
            const choice = await vscode.window.showQuickPick(
                [
                    { label: '📝 Update existing file', value: 'update', description: `Modify ${path.basename(existingFile)}` },
                    { label: '➕ Create new file', value: 'create', description: `Create ${fileInfo.fileName}` }
                ],
                { placeHolder: `File "${path.basename(existingFile)}" already exists. What would you like to do?` }
            );

            if (!choice || choice.value === 'update') {
                // User wants to update existing file
                fileInfo.fileName = path.basename(existingFile);
                fileInfo.existingFilePath = existingFile;
                fileInfo.isUpdate = true;
            }
        }

        // Get folder context with examples
        const folderContext = await this.getFolderContextWithExamples(fileInfo.extension, existingFile);
        console.log('Folder context:', { 
            path: folderContext.suggestedPath, 
            files: folderContext.existingFiles.length,
            hasExample: !!folderContext.exampleContent 
        });

        // Get relevant code context
        let codeContext: CodeChunk[] = [];
        try {
            codeContext = await this.getRelevantCodeContext(cleanPrompt, fileInfo, folderContext);
        } catch (error) {
            console.error('Error querying code context:', error);
        }

        // Select template
        const template = await this.templateManager.selectBestTemplate(cleanPrompt);
        const selectionReason = this.templateManager.getTemplateSelectionReason(cleanPrompt, template);

        // Build enriched prompt
        const enrichedPrompt = this.buildEnrichedPromptWithExamples(
            cleanPrompt,
            fileInfo,
            folderContext,
            codeContext,
            template
        );

        return {
            originalPrompt: cleanPrompt,
            enrichedPrompt,
            template,
            codeContext,
            metadata: {
                timestamp: new Date(),
                templateUsed: template?.name || 'direct',
                contextChunks: codeContext.length,
                selectionReason
            }
        };
    }

    // IMPROVED: Extract file info AND topic from prompt
    private extractFileInfoAndTopic(prompt: string): { 
        fileName: string; 
        extension: string; 
        baseName: string;
        topic: string;
        isUpdate: boolean;
        existingFilePath?: string;
    } {
        // Try to extract explicit filename
        const explicitPatterns = [
            /(?:named?|called)\s+[`"']?(\w+\.[\w]+)[`"']?/i,
            /[`"'](\w+\.[\w]+)[`"']/i,
            /(\w+\.feature)/i,
            /(\w+\.test\.ts)/i,
            /(\w+\.spec\.ts)/i,
            /(\w+\.tsx?)/i
        ];

        for (const pattern of explicitPatterns) {
            const match = prompt.match(pattern);
            if (match && match[1]) {
                const fullName = match[1];
                const ext = path.extname(fullName);
                const base = path.basename(fullName, ext);
                return {
                    fileName: fullName,
                    extension: ext,
                    baseName: base,
                    topic: base,
                    isUpdate: false
                };
            }
        }

        // Extract topic from prompt (login, signup, etc.)
        const topicPatterns = [
            /(?:for|about|of)\s+(?:my\s+)?(\w+)\s+(?:feature|test|functionality)/i,
            /(?:create|add|write)\s+(?:a\s+)?(\w+)\s+(?:feature|test)/i,
            /(\w+)\s+feature\s+file/i
        ];

        let topic = 'test';
        for (const pattern of topicPatterns) {
            const match = prompt.match(pattern);
            if (match && match[1]) {
                topic = match[1].toLowerCase();
                console.log('Extracted topic:', topic);
                break;
            }
        }

        // Infer file type from keywords
        let extension = '.txt';
        let fileName = `${topic}.txt`;

        if (/feature\s+file|feature\s+test|gherkin/i.test(prompt)) {
            extension = '.feature';
            fileName = `${topic}.feature`;
        } else if (/test\s+file|unit\s+test/i.test(prompt)) {
            extension = '.test.ts';
            fileName = `${topic}.test.ts`;
        } else if (/spec\s+file/i.test(prompt)) {
            extension = '.spec.ts';
            fileName = `${topic}.spec.ts`;
        }

        return {
            fileName,
            extension,
            baseName: topic,
            topic,
            isUpdate: false
        };
    }

    // NEW: Find existing file with similar name
    private async findExistingFile(baseName: string, extension: string): Promise<string | null> {
        const possibleNames = [
            `${baseName}${extension}`,
            `${baseName.toLowerCase()}${extension}`,
            `${baseName.toUpperCase()}${extension}`
        ];

        const walk = (dir: string, depth: number = 0): string | null => {
            if (depth > 4) return null;
            
            try {
                const items = fs.readdirSync(dir);
                
                for (const item of items) {
                    if (item.includes('node_modules') || item.startsWith('.')) continue;
                    
                    const fullPath = path.join(dir, item);
                    
                    try {
                        const stat = fs.statSync(fullPath);
                        
                        if (stat.isDirectory()) {
                            const found = walk(fullPath, depth + 1);
                            if (found) return found;
                        } else if (possibleNames.some(name => item.toLowerCase() === name.toLowerCase())) {
                            return path.relative(this.workspaceRoot, fullPath);
                        }
                    } catch (err) {}
                }
            } catch (err) {}
            
            return null;
        };

        return walk(this.workspaceRoot);
    }

    // Get relevant code context
    private async getRelevantCodeContext(
        prompt: string,
        fileInfo: { fileName: string; extension: string; topic: string },
        folderContext: { suggestedPath: string; existingFiles: string[] }
    ): Promise<CodeChunk[]> {
        const indexStatus = this.repoIndexer.getIndexStatus();
        if (!indexStatus.isIndexed) {
            return [];
        }

        const chunks = await this.repoIndexer.queryRelevantCode(prompt, 3);
        
        const relevantChunks = chunks.filter(chunk => {
            if (chunk.filePath.includes(folderContext.suggestedPath)) return true;
            if (path.extname(chunk.filePath) === fileInfo.extension) return true;
            
            if (fileInfo.extension === '.feature') {
                return chunk.filePath.includes('pageObject') || 
                       chunk.filePath.includes('steps') ||
                       chunk.filePath.includes('test');
            }
            
            return false;
        });

        console.log('Filtered to relevant chunks:', relevantChunks.length, 'from', chunks.length);
        return relevantChunks.slice(0, 1);
    }

    // Get folder context WITH actual example content
    private async getFolderContextWithExamples(fileExtension: string, existingFile?: string | null): Promise<{ 
        suggestedPath: string; 
        existingFiles: string[];
        exampleContent?: string;
        existingFileContent?: string;
    }> {
        const result: any = { suggestedPath: '', existingFiles: [], exampleContent: '', existingFileContent: '' };

        // If updating existing file, read its content
        if (existingFile) {
            try {
                const existingFilePath = path.join(this.workspaceRoot, existingFile);
                result.existingFileContent = fs.readFileSync(existingFilePath, 'utf-8');
                result.suggestedPath = path.dirname(existingFile);
                console.log('Loaded existing file content:', existingFile);
            } catch (error) {
                console.error('Error reading existing file:', error);
            }
        }

        const allFiles = this.findAllFilesWithExtension(fileExtension, 10);
        
        if (allFiles.length > 0) {
            result.existingFiles = allFiles;
            if (!result.suggestedPath) {
                result.suggestedPath = path.dirname(allFiles[0]);
            }

            // Read example from first file (if not using existing file as example)
            if (!existingFile || allFiles[0] !== existingFile) {
                try {
                    const exampleFilePath = path.join(this.workspaceRoot, allFiles[0]);
                    const content = fs.readFileSync(exampleFilePath, 'utf-8');
                    const lines = content.split('\n').slice(0, 30);
                    result.exampleContent = lines.join('\n').substring(0, 1000);
                    console.log('Loaded example from:', allFiles[0]);
                } catch (error) {
                    console.error('Error reading example:', error);
                }
            }
        } else {
            const fallbacks: Record<string, string> = {
                '.feature': 'src/test/features',
                '.test.ts': 'test',
                '.spec.ts': 'test',
                '.tsx': 'src/components',
                '.ts': 'src'
            };
            result.suggestedPath = fallbacks[fileExtension] || 'src';
        }

        return result;
    }

    private findAllFilesWithExtension(extension: string, maxFiles: number = 10): string[] {
        const files: string[] = [];
        
        const walk = (dir: string, depth: number = 0) => {
            if (depth > 4 || files.length >= maxFiles) return;
            
            try {
                const items = fs.readdirSync(dir);
                
                for (const item of items) {
                    if (files.length >= maxFiles) break;
                    
                    const fullPath = path.join(dir, item);
                    
                    if (item.includes('node_modules') || item.startsWith('.')) {
                        continue;
                    }

                    try {
                        const stat = fs.statSync(fullPath);
                        
                        if (stat.isDirectory()) {
                            walk(fullPath, depth + 1);
                        } else if (path.extname(item) === extension) {
                            files.push(path.relative(this.workspaceRoot, fullPath));
                        }
                    } catch (err) {}
                }
            } catch (err) {}
        };

        walk(this.workspaceRoot);
        return files;
    }

    // IMPROVED: Build enriched prompt with topic-specific requirements
    private buildEnrichedPromptWithExamples(
        userPrompt: string,
        fileInfo: { fileName: string; extension: string; topic: string; isUpdate: boolean; existingFilePath?: string },
        folderContext: { suggestedPath: string; existingFiles: string[]; exampleContent?: string; existingFileContent?: string },
        codeContext: CodeChunk[],
        template: PromptTemplate | null
    ): string {
        let enriched = '';

        // Action: Create or Update
        if (fileInfo.isUpdate) {
            enriched += `**Update the existing file** **${fileInfo.fileName}** in **${folderContext.suggestedPath}/**\n\n`;
            
            // Show existing content
            if (folderContext.existingFileContent) {
                enriched += `**Current File Content:**\n`;
                enriched += `\`\`\`\n`;
                enriched += folderContext.existingFileContent.substring(0, 1500);
                if (folderContext.existingFileContent.length > 1500) {
                    enriched += `\n...(truncated)`;
                }
                enriched += `\n\`\`\`\n\n`;
                enriched += `**Task:** Add or modify scenarios for **${fileInfo.topic}** functionality in the existing file above.\n\n`;
            }
        } else {
            enriched += `Create a new file named **${fileInfo.fileName}** in the **${folderContext.suggestedPath}/** directory.\n\n`;
        }

        // Show example format (if not updating)
        if (!fileInfo.isUpdate && folderContext.exampleContent) {
            enriched += `**Example Format (from ${path.basename(folderContext.existingFiles[0])}):**\n`;
            enriched += `\`\`\`\n`;
            enriched += folderContext.exampleContent;
            if (folderContext.exampleContent.length >= 1000) {
                enriched += `\n...(truncated)`;
            }
            enriched += `\n\`\`\`\n\n`;
            enriched += `**CRITICAL:** Use this EXACT format and structure. Follow the Gherkin syntax shown above.\n\n`;
        }

        // List other reference files
        if (folderContext.existingFiles.length > 1) {
            enriched += `**Other Files for Reference:**\n`;
            folderContext.existingFiles.slice(1, 6).forEach(f => {
                enriched += `- ${path.basename(f)}\n`;
            });
            enriched += `\n`;
        }

        // Only add code reference if relevant
        if (codeContext.length > 0) {
            const chunk = codeContext[0];
            if (chunk.filePath.includes(folderContext.suggestedPath) || 
                path.extname(chunk.filePath) === fileInfo.extension) {
                enriched += `**Related Code:** ${chunk.filePath}`;
                if (chunk.name) {
                    enriched += ` (${chunk.name})`;
                }
                enriched += `\n\n`;
            }
        }

        // SPECIFIC requirements based on topic and file type
        if (fileInfo.extension === '.feature') {
            enriched += `**Requirements for ${fileInfo.topic.toUpperCase()} Feature:**\n`;
            enriched += `- Follow Gherkin syntax exactly as shown in the example\n`;
            enriched += `- Feature title: "${this.capitalize(fileInfo.topic)}"\n`;
            enriched += `- Include Feature description and Background if needed\n`;
            enriched += `- Write comprehensive Scenarios for ${fileInfo.topic}:\n`;
            
            // Topic-specific scenarios
            if (fileInfo.topic === 'login') {
                enriched += `  • Successful login with valid credentials\n`;
                enriched += `  • Failed login with invalid credentials\n`;
                enriched += `  • Account lockout after failed attempts\n`;
                enriched += `  • Password recovery/reset\n`;
            } else if (fileInfo.topic === 'signup' || fileInfo.topic === 'registration') {
                enriched += `  • Successful registration with valid data\n`;
                enriched += `  • Email validation\n`;
                enriched += `  • Password strength requirements\n`;
            } else {
                enriched += `  • Cover common and edge cases for ${fileInfo.topic}\n`;
            }
            
            enriched += `- Use Given-When-Then format for all steps\n`;
            enriched += `- Add @tags like @${fileInfo.topic}, @regression for organization\n\n`;
        }

        enriched += `**Output:** Provide ONLY the complete file content in proper Gherkin format. No explanations, no markdown code blocks, just the file content ready to save.`;

        return enriched;
    }

    private capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
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
                    panel.dispose();
                    resolve(message.command === 'approve');
                }
            );
            panel.onDidDispose(() => resolve(false));
        });
    }

    private getPreviewHtml(enrichedPrompt: EnrichedPrompt): string {
        return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
    body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); }
    .section { margin: 15px 0; padding: 15px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
    h3 { margin-top: 0; color: var(--vscode-textLink-foreground); }
    .prompt { background: var(--vscode-textBlockQuote-background); padding: 15px; white-space: pre-wrap; line-height: 1.6; max-height: 500px; overflow-y: auto; }
    button { padding: 10px 20px; margin: 5px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; }
    .meta { font-size: 12px; color: var(--vscode-descriptionForeground); margin: 10px 0; }
</style>
</head><body>
    <h2>✨ Enriched Prompt</h2>
    <div class="section">
        <h3>Original</h3>
        <div class="prompt">${this.escapeHtml(enrichedPrompt.originalPrompt)}</div>
    </div>
    <div class="section">
        <h3>Enriched (With Examples)</h3>
        <div class="prompt">${this.escapeHtml(enrichedPrompt.enrichedPrompt)}</div>
        <div class="meta">Template: ${enrichedPrompt.template?.name || 'Direct'} | ${enrichedPrompt.metadata.selectionReason}</div>
    </div>
    <button onclick="vscode.postMessage({command:'approve'})">✅ Send to LLM</button>
    <button onclick="vscode.postMessage({command:'reject'})">❌ Cancel</button>
    <script>const vscode=acquireVsCodeApi();</script>
</body></html>`;
    }

    private escapeHtml(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async quickEnrich(userPrompt: string): Promise<string> {
        const enriched = await this.enrichPrompt(userPrompt);
        return enriched.enrichedPrompt;
    }

    getStats() {
        return { totalEnrichments: 0, averageContextChunks: 0, mostUsedTemplate: 'none' };
    }
}
