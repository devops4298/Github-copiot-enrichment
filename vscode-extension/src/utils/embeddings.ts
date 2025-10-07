import * as vscode from 'vscode';
import { OpenAI } from 'openai';

export interface EmbeddingProvider {
    generateEmbedding(text: string): Promise<number[]>;
    generateEmbeddings(texts: string[]): Promise<number[][]>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
    private client: OpenAI | null = null;
    private apiKey: string | undefined;

    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY;
    }

    private getClient(): OpenAI {
        if (!this.client) {
            if (!this.apiKey) {
                throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
            }
            this.client = new OpenAI({ apiKey: this.apiKey });
        }
        return this.client;
    }

    async generateEmbedding(text: string): Promise<number[]> {
        try {
            const client = this.getClient();
            const response = await client.embeddings.create({
                model: 'text-embedding-3-small',
                input: text,
            });
            return response.data[0].embedding;
        } catch (error) {
            console.error('Error generating embedding:', error);
            throw error;
        }
    }

    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        try {
            const client = this.getClient();
            const response = await client.embeddings.create({
                model: 'text-embedding-3-small',
                input: texts,
            });
            return response.data.map(d => d.embedding);
        } catch (error) {
            console.error('Error generating embeddings:', error);
            throw error;
        }
    }
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
    // Simple local embedding using TF-IDF-like approach
    private vocabulary: Map<string, number> = new Map();

    async generateEmbedding(text: string): Promise<number[]> {
        const tokens = this.tokenize(text);
        const embedding = new Array(384).fill(0);
        
        tokens.forEach((token, idx) => {
            const hash = this.simpleHash(token) % 384;
            embedding[hash] += 1 / (idx + 1);
        });

        return this.normalize(embedding);
    }

    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        return Promise.all(texts.map(text => this.generateEmbedding(text)));
    }

    private tokenize(text: string): string[] {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 0);
    }

    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    private normalize(vector: number[]): number[] {
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        return magnitude > 0 ? vector.map(v => v / magnitude) : vector;
    }
}

export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error('Vectors must have the same length');
    }
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        magnitudeA += a[i] * a[i];
        magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
}

export function getEmbeddingProvider(provider: string = 'local'): EmbeddingProvider {
    const config = vscode.workspace.getConfiguration('promptEnrichment');
    const providerType = provider || config.get<string>('embeddingProvider', 'local');

    switch (providerType) {
        case 'openai':
            return new OpenAIEmbeddingProvider();
        case 'local':
        default:
            return new LocalEmbeddingProvider();
    }
}

