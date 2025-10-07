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
}

export interface IndexedRepo {
    chunks: CodeChunk[];
    lastIndexed: Date;
    workspaceRoot: string;
}

export class RepoIndexer {
    private indexedRepo: IndexedRepo | null = null;
    private embeddingProvider: EmbeddingProvider;
    private indexPath: string;
    private isIndexing: boolean = false;

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

    async indexRepository(workspaceFolder: vscode.WorkspaceFolder, progressCallback?: (progress: number) => void): Promise<void> {
        if (this.isIndexing) {
            vscode.window.showWarningMessage('Repository indexing already in progress');
            return;
        }

        this.isIndexing = true;
        
        try {
            const chunks: CodeChunk[] = [];
            const files = await this.getAllCodeFiles(workspaceFolder.uri.fsPath);
            
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    const fileChunks = await this.parseFile(file, workspaceFolder.uri.fsPath);
                    chunks.push(...fileChunks);
                    
                    if (progressCallback) {
                        progressCallback((i + 1) / files.length * 100);
                    }
                } catch (error) {
                    console.error(`Error parsing file ${file}:`, error);
                }
            }

            // Generate embeddings for all chunks
            vscode.window.showInformationMessage(`Generating embeddings for ${chunks.length} code chunks...`);
            await this.generateEmbeddings(chunks);

            this.indexedRepo = {
                chunks,
                lastIndexed: new Date(),
                workspaceRoot: workspaceFolder.uri.fsPath
            };

            await this.saveIndex();
            vscode.window.showInformationMessage(`Repository indexed: ${chunks.length} chunks indexed`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error indexing repository: ${error}`);
            throw error;
        } finally {
            this.isIndexing = false;
        }
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

                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    walk(fullPath);
                } else if (stat.isFile() && isCodeFile(fullPath)) {
                    files.push(fullPath);
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

        // Simple parsing: split by functions/classes
        let currentChunk: string[] = [];
        let startLine = 0;
        let chunkType: 'function' | 'class' | 'method' | 'snippet' = 'snippet';
        let chunkName: string | undefined;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Detect function/class declarations
            const functionMatch = line.match(/(?:function|def|fn|func|fun|method)\s+(\w+)/);
            const classMatch = line.match(/(?:class|interface|struct)\s+(\w+)/);

            if (functionMatch || classMatch) {
                // Save previous chunk if exists
                if (currentChunk.length > 0) {
                    chunks.push({
                        id: `${relativePath}:${startLine}`,
                        filePath: relativePath,
                        content: currentChunk.join('\n'),
                        startLine,
                        endLine: i - 1,
                        type: chunkType,
                        name: chunkName
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
                    chunks.push({
                        id: `${relativePath}:${startLine}`,
                        filePath: relativePath,
                        content: currentChunk.join('\n'),
                        startLine,
                        endLine: i,
                        type: chunkType,
                        name: chunkName
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
            chunks.push({
                id: `${relativePath}:${startLine}`,
                filePath: relativePath,
                content: currentChunk.join('\n'),
                startLine,
                endLine: lines.length - 1,
                type: chunkType,
                name: chunkName
            });
        }

        return chunks;
    }

    private async generateEmbeddings(chunks: CodeChunk[]): Promise<void> {
        const batchSize = 10;
        
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
            const texts = batch.map(chunk => `${chunk.name || 'code'}: ${chunk.content.substring(0, 500)}`);
            
            try {
                const embeddings = await this.embeddingProvider.generateEmbeddings(texts);
                batch.forEach((chunk, idx) => {
                    chunk.embedding = embeddings[idx];
                });
            } catch (error) {
                console.error(`Error generating embeddings for batch ${i}:`, error);
            }
        }
    }

    async queryRelevantCode(query: string, topK: number = 5): Promise<CodeChunk[]> {
        if (!this.indexedRepo || this.indexedRepo.chunks.length === 0) {
            return [];
        }

        const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);

        const scored = this.indexedRepo.chunks
            .filter(chunk => chunk.embedding)
            .map(chunk => ({
                chunk,
                score: cosineSimilarity(queryEmbedding, chunk.embedding!)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        return scored.map(s => s.chunk);
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
                this.indexedRepo = JSON.parse(data);
                return true;
            }
        } catch (error) {
            console.error('Error loading index:', error);
        }
        return false;
    }

    getIndexStatus(): { isIndexed: boolean; chunkCount: number; lastIndexed?: Date } {
        return {
            isIndexed: this.indexedRepo !== null,
            chunkCount: this.indexedRepo?.chunks.length || 0,
            lastIndexed: this.indexedRepo?.lastIndexed
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

            // Add new chunks
            const newChunks = await this.parseFile(filePath, workspaceRoot);
            await this.generateEmbeddings(newChunks);
            this.indexedRepo.chunks.push(...newChunks);

            await this.saveIndex();
        } catch (error) {
            console.error(`Error updating file ${filePath}:`, error);
        }
    }
}

