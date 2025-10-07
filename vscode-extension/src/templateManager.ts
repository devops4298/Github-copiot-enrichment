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

    // IMPROVED: Smarter template selection with keyword rules + semantic fallback
    async selectBestTemplate(userPrompt: string): Promise<PromptTemplate | null> {
        if (this.templates.length === 0) {
            return null;
        }

        const promptLower = userPrompt.toLowerCase();

        // Rule 1: Keyword-based selection (fast and accurate)
        const keywordRules: { keywords: string[]; templateId: string; category: string }[] = [
            { keywords: ['explain', 'how', 'what is', 'describe'], templateId: 'persona_pattern', category: 'explanation' },
            { keywords: ['step by step', 'steps', 'procedure', 'how to'], templateId: 'chain_of_thought', category: 'procedural' },
            { keywords: ['example', 'show me', 'demonstrate'], templateId: 'few_shot_examples', category: 'examples' },
            { keywords: ['create', 'build', 'implement', 'develop'], templateId: 'recipe_pattern', category: 'creation' },
            { keywords: ['compare', 'difference', 'versus', 'vs'], templateId: 'comparative_analysis', category: 'comparison' },
            { keywords: ['alternatives', 'options', 'approaches', 'ways'], templateId: 'alternative_approaches', category: 'exploration' },
            { keywords: ['refactor', 'improve', 'optimize', 'better'], templateId: 'reflection_pattern', category: 'improvement' },
            { keywords: ['design', 'architecture', 'structure'], templateId: 'persona_pattern', category: 'design' },
            { keywords: ['debug', 'error', 'fix', 'issue', 'problem'], templateId: 'cognitive_verifier', category: 'debugging' },
            { keywords: ['test', 'verify', 'validate', 'check'], templateId: 'cognitive_verifier', category: 'testing' },
            { keywords: ['visualize', 'diagram', 'draw', 'show flow'], templateId: 'visualization_generator', category: 'visual' },
            { keywords: ['review', 'analyze', 'evaluate'], templateId: 'fact_check_list', category: 'analysis' },
        ];

        // Check keyword rules first
        for (const rule of keywordRules) {
            for (const keyword of rule.keywords) {
                if (promptLower.includes(keyword)) {
                    const template = this.templates.find(t => t.id === rule.templateId);
                    if (template) {
                        console.log(`Template selected by keyword "${keyword}":`, template.name);
                        return template;
                    }
                }
            }
        }

        // Rule 2: Semantic similarity fallback
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

        if (bestTemplate) {
            console.log(`Template selected by semantic similarity (score: ${bestScore.toFixed(3)}):`, bestTemplate.name);
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

        for (const [key, value] of Object.entries(template.structure)) {
            let line = value;

            if (context) {
                for (const [contextKey, contextValue] of Object.entries(context)) {
                    line = line.replace(`{${contextKey}}`, contextValue);
                }
            }

            line = line.replace('{task}', userPrompt);
            line = line.replace('{question}', userPrompt);
            line = line.replace('{problem}', userPrompt);

            formattedPrompt += line + '\n\n';
        }

        return formattedPrompt.trim();
    }

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

    private extractKeywords(prompt: string): string[] {
        const keywords = [
            'explain', 'compare', 'analyze', 'design', 'implement', 'optimize',
            'debug', 'refactor', 'test', 'review', 'architecture', 'pattern',
            'example', 'steps', 'how', 'what', 'why', 'alternatives'
        ];

        const promptLower = prompt.toLowerCase();
        return keywords.filter(k => promptLower.includes(k));
    }

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

    getTemplateSelectionReason(prompt: string, template: PromptTemplate | null): string {
        if (!template) {
            return 'No specific template - using direct format';
        }

        const promptLower = prompt.toLowerCase();
        
        const keywordMap: Record<string, string[]> = {
            'explanation': ['explain', 'what is', 'describe'],
            'procedural': ['step by step', 'how to', 'steps'],
            'examples': ['example', 'show me', 'demonstrate'],
            'creation': ['create', 'build', 'implement'],
            'comparison': ['compare', 'versus', 'difference'],
            'debugging': ['debug', 'error', 'fix', 'issue']
        };

        for (const [reason, keywords] of Object.entries(keywordMap)) {
            for (const keyword of keywords) {
                if (promptLower.includes(keyword)) {
                    return `${template.name} (keyword: "${keyword}")`;
                }
            }
        }

        return `${template.name} (semantic match)`;
    }
}
