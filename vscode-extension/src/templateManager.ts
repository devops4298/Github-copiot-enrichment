import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { cosineSimilarity, getEmbeddingProvider, EmbeddingProvider } from './utils/embeddings';

export interface PromptTemplate {
    id: string;
    name: string;
    description: string;
    category: string;
    structure: Record<string, string>;
    example: string;
}

export class TemplateManager {
    private templates: PromptTemplate[] = [];
    private embeddingProvider: EmbeddingProvider;
    private templateEmbeddings: Map<string, number[]> = new Map();

    constructor(private extensionPath: string) {
        this.embeddingProvider = getEmbeddingProvider();
    }

    async loadTemplates(): Promise<void> {
        const templatesPath = path.join(this.extensionPath, 'templates');
        
        try {
            const files = fs.readdirSync(templatesPath);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(templatesPath, file);
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const template = JSON.parse(content) as PromptTemplate;
                    this.templates.push(template);
                }
            }

            // Generate embeddings for templates
            await this.generateTemplateEmbeddings();
            
            console.log(`Loaded ${this.templates.length} prompt templates`);
        } catch (error) {
            console.error('Error loading templates:', error);
            vscode.window.showErrorMessage(`Failed to load prompt templates: ${error}`);
        }
    }

    private async generateTemplateEmbeddings(): Promise<void> {
        for (const template of this.templates) {
            const text = `${template.name} ${template.description} ${template.category} ${template.example}`;
            const embedding = await this.embeddingProvider.generateEmbedding(text);
            this.templateEmbeddings.set(template.id, embedding);
        }
    }

    async selectBestTemplate(userPrompt: string): Promise<PromptTemplate | null> {
        if (this.templates.length === 0) {
            return null;
        }

        const promptEmbedding = await this.embeddingProvider.generateEmbedding(userPrompt);

        let bestTemplate: PromptTemplate | null = null;
        let bestScore = -1;

        for (const template of this.templates) {
            const templateEmbedding = this.templateEmbeddings.get(template.id);
            if (!templateEmbedding) {
                continue;
            }

            const score = cosineSimilarity(promptEmbedding, templateEmbedding);
            if (score > bestScore) {
                bestScore = score;
                bestTemplate = template;
            }
        }

        return bestTemplate;
    }

    getTemplateById(id: string): PromptTemplate | undefined {
        return this.templates.find(t => t.id === id);
    }

    getAllTemplates(): PromptTemplate[] {
        return [...this.templates];
    }

    getTemplatesByCategory(category: string): PromptTemplate[] {
        return this.templates.filter(t => t.category === category);
    }

    formatPromptWithTemplate(userPrompt: string, template: PromptTemplate, context?: Record<string, string>): string {
        let formattedPrompt = '';

        // Build formatted prompt based on template structure
        for (const [key, value] of Object.entries(template.structure)) {
            let line = value;

            // Replace placeholders with context or user prompt
            if (context) {
                for (const [contextKey, contextValue] of Object.entries(context)) {
                    line = line.replace(`{${contextKey}}`, contextValue);
                }
            }

            // Replace {task} with user prompt by default
            line = line.replace('{task}', userPrompt);
            line = line.replace('{question}', userPrompt);
            line = line.replace('{problem}', userPrompt);

            formattedPrompt += line + '\n\n';
        }

        return formattedPrompt.trim();
    }

    // Manual template selection
    async showTemplateQuickPick(): Promise<PromptTemplate | undefined> {
        const items = this.templates.map(template => ({
            label: template.name,
            description: template.category,
            detail: template.description,
            template: template
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a prompt template',
            matchOnDescription: true,
            matchOnDetail: true
        });

        return selected?.template;
    }

    // Get template suggestions based on keywords
    suggestTemplates(keywords: string[]): PromptTemplate[] {
        const suggestions: Set<PromptTemplate> = new Set();

        for (const keyword of keywords) {
            const lowerKeyword = keyword.toLowerCase();
            
            for (const template of this.templates) {
                const searchText = `${template.name} ${template.description} ${template.category}`.toLowerCase();
                if (searchText.includes(lowerKeyword)) {
                    suggestions.add(template);
                }
            }
        }

        return Array.from(suggestions);
    }

    // Extract keywords from user prompt
    private extractKeywords(prompt: string): string[] {
        const keywords = [
            'explain', 'compare', 'analyze', 'design', 'implement', 'optimize',
            'debug', 'refactor', 'test', 'review', 'architecture', 'pattern',
            'example', 'steps', 'how', 'what', 'why', 'alternatives'
        ];

        const promptLower = prompt.toLowerCase();
        return keywords.filter(k => promptLower.includes(k));
    }

    // Smart template selection with fallback
    async getRecommendedTemplate(userPrompt: string): Promise<{
        template: PromptTemplate | null;
        confidence: number;
        alternatives: PromptTemplate[];
    }> {
        const keywords = this.extractKeywords(userPrompt);
        const suggestions = this.suggestTemplates(keywords);
        
        const bestTemplate = await this.selectBestTemplate(userPrompt);
        
        return {
            template: bestTemplate,
            confidence: bestTemplate ? 0.8 : 0,
            alternatives: suggestions.slice(0, 3)
        };
    }
}

