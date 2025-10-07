import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { EmbeddingProvider, getEmbeddingProvider, cosineSimilarity } from './utils/embeddings';
import { isCodeFile, shouldIgnoreFile } from './utils/fileWatcher';

export interface CodeChunk {
    id: string;
    filePath: string;
    content: string;
    startLine: number;
    endLine: number;
    type: 'function' | 'class' | 'method' | 'snippet';
    name?: string;
    embedding?: number[];
    keywords?: string[]; // For fast keyword-based search
}

export interface IndexedRepo {
    chunks: CodeChunk[];
    lastIndexed: Date | string;
    workspaceRoot: string;
    hasEmbeddings: boolean;
}

export class RepoIndexer {
    private indexedRepo: IndexedRepo | null = null;
    private embeddingProvider: EmbeddingProvider;
    private indexPath: string;
    private isIndexing: boolean = false;
    private maxFiles: number = 2000; // Like GitHub Copilot

    constructor(private context: vscode.ExtensionContext) {
        this.embeddingProvider = getEmbeddingProvider();
        this.indexPath = path.join(context.globalStorageUri.fsPath, 'repo-index.json');
        this.ensureStorageDirectory();
    }

    private ensureStorageDirectory(): void {
        const dir = path.dirname(this.indexPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // FAST INDEXING - Like Cursor/Copilot (keyword-based, instant)
    async indexRepositoryFast(workspaceFolder: vscode.WorkspaceFolder, progressCallback?: (progress: number) => void): Promise<void> {
        if (this.isIndexing) {
            vscode.window.showWarningMessage('Repository indexing already in progress');
            return;
        }

        this.isIndexing = true;
        
        try {
            const chunks: CodeChunk[] = [];
            const files = await this.getAllCodeFiles(workspaceFolder.uri.fsPath);
            
            // Limit files like Copilot does
            const filesToIndex = files.slice(0, this.maxFiles);
            
            if (files.length > this.maxFiles) {
                vscode.window.showWarningMessage(
                    `Found ${files.length} files. Indexing first ${this.maxFiles} files for performance.`
                );
            }

            // Parse files quickly (keyword-based only, no embeddings)
            for (let i = 0; i < filesToIndex.length; i++) {
                const file = filesToIndex[i];
                try {
                    const fileChunks = await this.parseFile(file, workspaceFolder.uri.fsPath);
                    chunks.push(...fileChunks);
                    
                    if (progressCallback) {
                        progressCallback(((i + 1) / filesToIndex.length) * 100);
                    }
                } catch (error) {
                    console.error(`Error parsing file ${file}:`, error);
                }
            }

            this.indexedRepo = {
                chunks,
                lastIndexed: new Date(),
                workspaceRoot: workspaceFolder.uri.fsPath,
                hasEmbeddings: false
            };

            await this.saveIndex();
            vscode.window.showInformationMessage(
                `✅ Repository indexed: ${chunks.length} chunks from ${filesToIndex.length} files (keyword-based)`
            );

            // Optionally generate embeddings in background
            this.generateEmbeddingsInBackground(chunks);

        } catch (error) {
            vscode.window.showErrorMessage(`Error indexing repository: ${error}`);
            throw error;
        } finally {
            this.isIndexing = false;
        }
    }

    // Background embedding generation (optional, non-blocking)
    private async generateEmbeddingsInBackground(chunks: CodeChunk[]): Promise<void> {
        // Ask user if they want semantic search
        const choice = await vscode.window.showInformationMessage(
            `Generate semantic embeddings for better search? (${chunks.length} chunks, ~${Math.ceil(chunks.length / 20)} seconds)`,
            'Yes', 'No', 'Later'
        );

        if (choice !== 'Yes') {
            return;
        }

        // Show progress in background
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Generating semantic embeddings...',
                cancellable: true
            },
            async (progress, token) => {
                const batchSize = 20;
                const totalBatches = Math.ceil(chunks.length / batchSize);
                
                for (let i = 0; i < chunks.length; i += batchSize) {
                    if (token.isCancellationRequested) {
                        vscode.window.showInformationMessage('Embedding generation cancelled');
                        return;
                    }

                    const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
                    const texts = batch.map(chunk => `${chunk.name || 'code'}: ${chunk.content.substring(0, 300)}`);
                    
                    try {
                        const embeddings = await this.embeddingProvider.generateEmbeddings(texts);
                        batch.forEach((chunk, idx) => {
                            chunk.embedding = embeddings[idx];
                        });
                        
                        const currentBatch = Math.floor(i / batchSize) + 1;
                        progress.report({ 
                            increment: (100 / totalBatches),
                            message: `${currentBatch}/${totalBatches} batches`
                        });
                    } catch (error) {
                        console.error(`Error generating embeddings for batch ${i}:`, error);
                    }
                }

                if (this.indexedRepo) {
                    this.indexedRepo.hasEmbeddings = true;
                    await this.saveIndex();
                }

                vscode.window.showInformationMessage('✅ Semantic embeddings generated!');
            }
        );
    }

    private async getAllCodeFiles(rootPath: string): Promise<string[]> {
        const files: string[] = [];

        const walk = (dir: string) => {
            const items = fs.readdirSync(dir);

            for (const item of items) {
                const fullPath = path.join(dir, item);
                
                if (shouldIgnoreFile(fullPath)) {
                    continue;
                }

                try {
                    const stat = fs.statSync(fullPath);

                    if (stat.isDirectory()) {
                        walk(fullPath);
                    } else if (stat.isFile() && isCodeFile(fullPath)) {
                        files.push(fullPath);
                    }
                } catch (error) {
                    // Skip files we can't access
                    continue;
                }
            }
        };

        walk(rootPath);
        return files;
    }

    private async parseFile(filePath: string, workspaceRoot: string): Promise<CodeChunk[]> {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const chunks: CodeChunk[] = [];
        const relativePath = path.relative(workspaceRoot, filePath);

        // Extract keywords for fast search
        const extractKeywords = (text: string): string[] => {
            return text.toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2)
                .slice(0, 50); // Limit keywords per chunk
        };

        // Simple parsing: split by functions/classes
        let currentChunk: string[] = [];
        let startLine = 0;
        let chunkType: 'function' | 'class' | 'method' | 'snippet' = 'snippet';
        let chunkName: string | undefined;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Detect function/class declarations
            const functionMatch = line.match(/(?:function|def|fn|func|fun|method|async\s+function)\s+(\w+)/);
            const classMatch = line.match(/(?:class|interface|struct|type)\s+(\w+)/);

            if (functionMatch || classMatch) {
                // Save previous chunk if exists
                if (currentChunk.length > 0) {
                    const chunkContent = currentChunk.join('\n');
                    chunks.push({
                        id: `${relativePath}:${startLine}`,
                        filePath: relativePath,
                        content: chunkContent,
                        startLine,
                        endLine: i - 1,
                        type: chunkType,
                        name: chunkName,
                        keywords: extractKeywords(chunkContent)
                    });
                }

                // Start new chunk
                currentChunk = [line];
                startLine = i;
                chunkType = functionMatch ? 'function' : 'class';
                chunkName = (functionMatch || classMatch)?.[1];
            } else {
                currentChunk.push(line);

                // Create chunks of reasonable size (max 50 lines)
                if (currentChunk.length >= 50) {
                    const chunkContent = currentChunk.join('\n');
                    chunks.push({
                        id: `${relativePath}:${startLine}`,
                        filePath: relativePath,
                        content: chunkContent,
                        startLine,
                        endLine: i,
                        type: chunkType,
                        name: chunkName,
                        keywords: extractKeywords(chunkContent)
                    });

                    currentChunk = [];
                    startLine = i + 1;
                    chunkType = 'snippet';
                    chunkName = undefined;
                }
            }
        }

        // Add final chunk
        if (currentChunk.length > 0) {
            const chunkContent = currentChunk.join('\n');
            chunks.push({
                id: `${relativePath}:${startLine}`,
                filePath: relativePath,
                content: chunkContent,
                startLine,
                endLine: lines.length - 1,
                type: chunkType,
                name: chunkName,
                keywords: extractKeywords(chunkContent)
            });
        }

        return chunks;
    }

    // FAST QUERY using keywords (like Cursor's @codebase)
    async queryRelevantCode(query: string, topK: number = 5): Promise<CodeChunk[]> {
        if (!this.indexedRepo || this.indexedRepo.chunks.length === 0) {
            return [];
        }

        // Check if this is a file creation query
        const isFileCreation = /create|add|new|make/i.test(query) && /file|feature/i.test(query);
        
        if (isFileCreation) {
            // For file creation, look for similar patterns or folder structures
            const folderMatch = query.match(/(?:in|to|under)\s+(\w+(?:\/\w+)*)/i);
            const folder = folderMatch ? folderMatch[1] : 'test';
            
            // Find chunks in similar folders
            const relevantChunks = this.indexedRepo.chunks
                .filter(chunk => chunk.filePath.toLowerCase().includes(folder.toLowerCase()))
                .slice(0, topK);
            
            if (relevantChunks.length > 0) {
                return relevantChunks;
            }
        }

        // Use embeddings if available, otherwise use keyword search
        if (this.indexedRepo.hasEmbeddings) {
            return await this.queryWithEmbeddings(query, topK);
        } else {
            return await this.queryWithKeywords(query, topK);
        }
    }

    // Fast keyword-based search (instant, no embeddings needed)
    private async queryWithKeywords(query: string, topK: number): Promise<CodeChunk[]> {
        const queryKeywords = query.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2);

        const scored = this.indexedRepo!.chunks
            .map(chunk => {
                const score = this.calculateKeywordScore(queryKeywords, chunk.keywords || []);
                return { chunk, score };
            })
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        return scored.map(s => s.chunk);
    }

    // Semantic search with embeddings (slower but better quality)
    private async queryWithEmbeddings(query: string, topK: number): Promise<CodeChunk[]> {
        const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);

        const scored = this.indexedRepo!.chunks
            .filter(chunk => chunk.embedding)
            .map(chunk => ({
                chunk,
                score: cosineSimilarity(queryEmbedding, chunk.embedding!)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        return scored.map(s => s.chunk);
    }

    // Simple keyword scoring (BM25-like)
    private calculateKeywordScore(queryKeywords: string[], chunkKeywords: string[]): number {
        let score = 0;
        const chunkKeywordSet = new Set(chunkKeywords);
        
        for (const keyword of queryKeywords) {
            if (chunkKeywordSet.has(keyword)) {
                // TF-IDF-like scoring
                score += 1;
            }
        }
        
        return score;
    }

    private async saveIndex(): Promise<void> {
        if (!this.indexedRepo) {
            return;
        }

        try {
            fs.writeFileSync(this.indexPath, JSON.stringify(this.indexedRepo, null, 2));
        } catch (error) {
            console.error('Error saving index:', error);
        }
    }

    async loadIndex(): Promise<boolean> {
        try {
            if (fs.existsSync(this.indexPath)) {
                const data = fs.readFileSync(this.indexPath, 'utf-8');
                const parsed = JSON.parse(data);
                
                // Convert lastIndexed string back to Date object
                if (parsed.lastIndexed) {
                    parsed.lastIndexed = new Date(parsed.lastIndexed);
                }
                
                this.indexedRepo = parsed;
                return true;
            }
        } catch (error) {
            console.error('Error loading index:', error);
        }
        return false;
    }

    getIndexStatus(): { isIndexed: boolean; chunkCount: number; lastIndexed?: Date; hasEmbeddings?: boolean } {
        return {
            isIndexed: this.indexedRepo !== null,
            chunkCount: this.indexedRepo?.chunks.length || 0,
            lastIndexed: this.indexedRepo?.lastIndexed ? new Date(this.indexedRepo.lastIndexed) : undefined,
            hasEmbeddings: this.indexedRepo?.hasEmbeddings || false
        };
    }

    async updateFile(filePath: string, workspaceRoot: string): Promise<void> {
        if (!this.indexedRepo) {
            return;
        }

        try {
            // Remove old chunks for this file
            const relativePath = path.relative(workspaceRoot, filePath);
            this.indexedRepo.chunks = this.indexedRepo.chunks.filter(
                chunk => chunk.filePath !== relativePath
            );

            // Add new chunks (keyword-based, instant)
            const newChunks = await this.parseFile(filePath, workspaceRoot);
            this.indexedRepo.chunks.push(...newChunks);

            await this.saveIndex();

            // Generate embeddings for new chunks if index has embeddings
            if (this.indexedRepo.hasEmbeddings && newChunks.length > 0) {
                const texts = newChunks.map(chunk => `${chunk.name || 'code'}: ${chunk.content.substring(0, 300)}`);
                const embeddings = await this.embeddingProvider.generateEmbeddings(texts);
                newChunks.forEach((chunk, idx) => {
                    chunk.embedding = embeddings[idx];
                });
                await this.saveIndex();
            }
        } catch (error) {
            console.error(`Error updating file ${filePath}:`, error);
        }
    }

    // Trigger semantic indexing manually
    async generateSemanticIndex(): Promise<void> {
        if (!this.indexedRepo) {
            vscode.window.showWarningMessage('Please index repository first');
            return;
        }

        if (this.indexedRepo.hasEmbeddings) {
            vscode.window.showInformationMessage('Semantic embeddings already generated');
            return;
        }

        const chunks = this.indexedRepo.chunks;
        
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Generating semantic embeddings...',
                cancellable: true
            },
            async (progress, token) => {
                const batchSize = 20;
                const totalBatches = Math.ceil(chunks.length / batchSize);
                
                for (let i = 0; i < chunks.length; i += batchSize) {
                    if (token.isCancellationRequested) {
                        vscode.window.showInformationMessage('Embedding generation cancelled');
                        return;
                    }

                    const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
                    const texts = batch.map(chunk => `${chunk.name || 'code'}: ${chunk.content.substring(0, 300)}`);
                    
                    try {
                        const embeddings = await this.embeddingProvider.generateEmbeddings(texts);
                        batch.forEach((chunk, idx) => {
                            chunk.embedding = embeddings[idx];
                        });
                        
                        const currentBatch = Math.floor(i / batchSize) + 1;
                        progress.report({ 
                            increment: (100 / totalBatches),
                            message: `${currentBatch}/${totalBatches} batches`
                        });
                    } catch (error) {
                        console.error(`Error generating embeddings:`, error);
                    }
                }

                if (this.indexedRepo) {
                    this.indexedRepo.hasEmbeddings = true;
                    await this.saveIndex();
                }

                vscode.window.showInformationMessage('✅ Semantic embeddings complete!');
            }
        );
    }
}
