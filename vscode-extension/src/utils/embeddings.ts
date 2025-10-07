import * as vscode from 'vscode';

export interface EmbeddingProvider {
    generateEmbedding(text: string): Promise<number[]>;
    generateEmbeddings(texts: string[]): Promise<number[][]>;
}

// Local TF-IDF-based embedding (default, no API required)
export class LocalEmbeddingProvider implements EmbeddingProvider {
    private vocabulary: Map<string, number> = new Map();
    private idfScores: Map<string, number> = new Map();

    async generateEmbedding(text: string): Promise<number[]> {
        const tokens = this.tokenize(text);
        const embedding = new Array(384).fill(0);
        
        // Enhanced TF-IDF approach with position weighting
        tokens.forEach((token, idx) => {
            const hash = this.simpleHash(token) % 384;
            const positionWeight = 1 / (idx + 1); // Earlier words have more weight
            const tfScore = this.calculateTF(token, tokens);
            embedding[hash] += tfScore * positionWeight;
        });

        return this.normalize(embedding);
    }

    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        // Calculate IDF scores across all documents
        this.calculateIDF(texts);
        return Promise.all(texts.map(text => this.generateEmbedding(text)));
    }

    private tokenize(text: string): string[] {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2); // Filter out very short tokens
    }

    private calculateTF(term: string, tokens: string[]): number {
        const count = tokens.filter(t => t === term).length;
        return count / tokens.length;
    }

    private calculateIDF(documents: string[]): void {
        const docFreq = new Map<string, number>();
        
        documents.forEach(doc => {
            const tokens = new Set(this.tokenize(doc));
            tokens.forEach(token => {
                docFreq.set(token, (docFreq.get(token) || 0) + 1);
            });
        });

        docFreq.forEach((freq, term) => {
            this.idfScores.set(term, Math.log(documents.length / freq));
        });
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

// Enhanced local embedding with bigram support
export class EnhancedLocalEmbeddingProvider implements EmbeddingProvider {
    async generateEmbedding(text: string): Promise<number[]> {
        const tokens = this.tokenize(text);
        const bigrams = this.generateBigrams(tokens);
        const embedding = new Array(512).fill(0);
        
        // Unigram features
        tokens.forEach((token, idx) => {
            const hash = this.hash(token) % 384;
            embedding[hash] += 1 / (idx + 1);
        });

        // Bigram features
        bigrams.forEach((bigram, idx) => {
            const hash = this.hash(bigram) % 128;
            embedding[384 + hash] += 1 / (idx + 1);
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

    private generateBigrams(tokens: string[]): string[] {
        const bigrams: string[] = [];
        for (let i = 0; i < tokens.length - 1; i++) {
            bigrams.push(`${tokens[i]}_${tokens[i + 1]}`);
        }
        return bigrams;
    }

    private hash(str: string): number {
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

// BM25-based embedding for better code search
export class BM25EmbeddingProvider implements EmbeddingProvider {
    private k1 = 1.5;
    private b = 0.75;
    private avgDocLength = 0;
    private docLengths = new Map<string, number>();

    async generateEmbedding(text: string): Promise<number[]> {
        const tokens = this.tokenize(text);
        const embedding = new Array(384).fill(0);
        
        const docLength = tokens.length;
        const termFreq = this.calculateTermFrequency(tokens);
        
        termFreq.forEach((tf, term) => {
            const hash = this.hash(term) % 384;
            const score = this.bm25Score(tf, docLength);
            embedding[hash] += score;
        });

        return this.normalize(embedding);
    }

    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        // Calculate average document length
        this.avgDocLength = texts.reduce((sum, text) => {
            const len = this.tokenize(text).length;
            return sum + len;
        }, 0) / texts.length;

        return Promise.all(texts.map(text => this.generateEmbedding(text)));
    }

    private tokenize(text: string): string[] {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 0);
    }

    private calculateTermFrequency(tokens: string[]): Map<string, number> {
        const freq = new Map<string, number>();
        tokens.forEach(token => {
            freq.set(token, (freq.get(token) || 0) + 1);
        });
        return freq;
    }

    private bm25Score(tf: number, docLength: number): number {
        const normalization = 1 - this.b + this.b * (docLength / this.avgDocLength);
        return (tf * (this.k1 + 1)) / (tf + this.k1 * normalization);
    }

    private hash(str: string): number {
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

// Cosine similarity function
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

// Factory function to get embedding provider
export function getEmbeddingProvider(provider: string = 'local'): EmbeddingProvider {
    const config = vscode.workspace.getConfiguration('promptEnrichment');
    const providerType = provider || config.get<string>('embeddingProvider', 'local');

    switch (providerType) {
        case 'enhanced':
            return new EnhancedLocalEmbeddingProvider();
        case 'bm25':
            return new BM25EmbeddingProvider();
        case 'local':
        default:
            return new LocalEmbeddingProvider();
    }
}
