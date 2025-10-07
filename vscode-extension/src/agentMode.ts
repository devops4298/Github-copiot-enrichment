import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface AgentAction {
    type: 'create_file' | 'modify_file' | 'delete_file' | 'run_command';
    filePath?: string;
    content?: string;
    command?: string;
    description: string;
}

export class AgentExecutor {
    private folderStructure: Map<string, string[]> = new Map();
    private allFolderPaths: string[] = [];

    constructor(private workspaceRoot: string) {
        this.scanFolderStructure();
    }

    private scanFolderStructure(): void {
        const scanDir = (dir: string, maxDepth: number = 4): string[] => {
            if (maxDepth <= 0) return [];
            
            const folders: string[] = [];
            try {
                const items = fs.readdirSync(dir);
                
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    
                    if (this.shouldIgnore(item)) {
                        continue;
                    }

                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.isDirectory()) {
                            const relativePath = path.relative(this.workspaceRoot, fullPath);
                            folders.push(relativePath);
                            this.allFolderPaths.push(relativePath);
                            folders.push(...scanDir(fullPath, maxDepth - 1));
                        }
                    } catch (err) {}
                }
            } catch (err) {}
            
            return folders;
        };

        const allFolders = scanDir(this.workspaceRoot);
        
        for (const folder of allFolders) {
            const folderName = path.basename(folder).toLowerCase();
            if (!this.folderStructure.has(folderName)) {
                this.folderStructure.set(folderName, []);
            }
            this.folderStructure.get(folderName)!.push(folder);
        }

        console.log('Discovered folders:', Array.from(this.folderStructure.keys()).slice(0, 20));
        console.log('Total folder paths:', this.allFolderPaths.length);
    }

    private shouldIgnore(name: string): boolean {
        const ignored = ['node_modules', '.git', 'dist', 'build', 'out', '.vscode', 'coverage', '.next'];
        return ignored.includes(name) || name.startsWith('.');
    }

    // ISSUE #3 FIX: Improved action detection for enriched prompts
    detectActions(prompt: string): AgentAction[] {
        const actions: AgentAction[] = [];

        console.log('Detecting actions in prompt:', prompt.substring(0, 150));

        // Check for **Location:** format (from enriched prompts)
        const locationMatch = prompt.match(/\*\*Location:\*\*\s*([\w\/\-\.]+)/i);
        if (locationMatch) {
            const fullPath = locationMatch[1];
            console.log('Found location in enriched prompt:', fullPath);
            
            actions.push({
                type: 'create_file',
                filePath: fullPath,
                description: `Create ${path.basename(fullPath)} in ${path.dirname(fullPath)}`
            });
            
            console.log('Action created from location:', actions[0]);
            return actions;
        }

        // Original detection patterns
        const filePatterns = [
            /Create file:\s*\*\*(\w+\.[\w]+)\*\*/i,  // "Create file: **login.feature**"
            /file\s+named?\s+[`"'\*]?(\w+\.[\w]+)[`"'\*]?/i,  // "file named login.feature"
            /[`"'](\w+\.[\w]+)[`"']/i,  // `login.feature`
            /(\w+\.feature)/i,  // login.feature
            /(\w+\.test\.ts)/i,  // login.test.ts
            /(\w+\.spec\.ts)/i   // login.spec.ts
        ];

        let fileName: string | undefined;
        for (const pattern of filePatterns) {
            const match = prompt.match(pattern);
            if (match && match[1]) {
                fileName = match[1];
                console.log('Detected file name:', fileName);
                break;
            }
        }

        if (fileName) {
            // Extract folder path - handle both formats
            let targetFolder: string = '';
            
            // Try multiple folder extraction patterns
            const folderPatterns = [
                /\*\*Location:\*\*\s*([\w\/\-]+)/i,
                /(?:in|to|at)\s+(?:the\s+)?[`"']?([\w\/\-]+(?:\/[\w\-]+)*)[`"']?\s*(?:\/|directory|folder)/i,
                /(?:in|to|at)\s+(?:the\s+)?([a-zA-Z\/\-_]+(?:\/[a-zA-Z\-_]+)+)/i
            ];
            
            for (const pattern of folderPatterns) {
                const match = prompt.match(pattern);
                if (match && match[1]) {
                    const extracted = match[1].replace(/\/$/, '');
                    if (!extracted.includes('.') && extracted.length > 2) {
                        targetFolder = extracted;
                        console.log('Extracted folder from prompt:', targetFolder);
                        break;
                    }
                }
            }
            
            // Verify folder exists or find closest match
            if (targetFolder) {
                if (this.allFolderPaths.includes(targetFolder)) {
                    console.log('Exact folder match:', targetFolder);
                } else {
                    const bestMatch = this.findBestMatchingFolder(targetFolder);
                    console.log('Best matching folder:', bestMatch);
                    targetFolder = bestMatch;
                }
            } else {
                // Infer from file extension
                targetFolder = this.inferFolderFromStructure(fileName);
                console.log('Inferred folder:', targetFolder);
            }
            
            const filePath = path.join(targetFolder, fileName);
            console.log('Final file path:', filePath);
            
            actions.push({
                type: 'create_file',
                filePath: filePath,
                description: `Create ${fileName} in ${targetFolder}`
            });
        }

        console.log('Total actions detected:', actions.length);
        return actions;
    }

    // Find best matching folder - prefers exact and longest matches
    private findBestMatchingFolder(folderHint: string): string {
        const hint = folderHint.toLowerCase().replace(/[`"'\/]+$/g, '');
        
        console.log('Finding best match for:', hint);
        
        // Exact match
        if (this.allFolderPaths.includes(hint)) {
            return hint;
        }

        // Contains all parts
        const hintParts = hint.split('/').filter(p => p.length > 0);
        const matches = this.allFolderPaths.filter(p => {
            const pathLower = p.toLowerCase();
            return hintParts.every(part => pathLower.includes(part));
        });

        if (matches.length > 0) {
            // Prefer longest (most specific) match
            const best = matches.reduce((a, b) => a.length > b.length ? a : b);
            console.log('Best match found:', best);
            return best;
        }

        // Fallback to partial match
        for (const fullPath of this.allFolderPaths) {
            if (fullPath.toLowerCase().includes(hint)) {
                console.log('Partial match:', fullPath);
                return fullPath;
            }
        }

        return hint;
    }

    private inferFolderFromStructure(fileName: string): string {
        const ext = fileName.split('.').pop()?.toLowerCase();
        
        const typeToFolderHints: Record<string, string[]> = {
            'feature': ['features', 'test'],
            'spec': ['test', 'tests'],
            'test': ['test', 'tests'],
            'tsx': ['components', 'src'],
            'ts': ['src']
        };

        const hints = typeToFolderHints[ext || ''] || ['src'];
        
        for (const hint of hints) {
            const matchingPaths = this.allFolderPaths.filter(p => 
                p.toLowerCase().includes(hint.toLowerCase())
            );
            
            if (matchingPaths.length > 0) {
                // For features, prefer path with "features"
                if (ext === 'feature') {
                    const withFeatures = matchingPaths.find(p => p.toLowerCase().includes('features'));
                    if (withFeatures) return withFeatures;
                }
                
                // Use deepest path
                const deepest = matchingPaths.reduce((a, b) => a.length > b.length ? a : b);
                return deepest;
            }
        }

        return 'src';
    }

    async executeAction(action: AgentAction, content?: string): Promise<boolean> {
        try {
            switch (action.type) {
                case 'create_file':
                    return await this.createFile(action.filePath!, content || '');
                case 'modify_file':
                    return await this.modifyFile(action.filePath!, content || '');
                case 'delete_file':
                    return await this.deleteFile(action.filePath!);
                case 'run_command':
                    return await this.runCommand(action.command!);
                default:
                    return false;
            }
        } catch (error) {
            console.error(`Error executing action:`, error);
            vscode.window.showErrorMessage(`Failed to ${action.description}: ${error}`);
            return false;
        }
    }

    private async createFile(relativePath: string, content: string): Promise<boolean> {
        const fullPath = path.join(this.workspaceRoot, relativePath);
        const dir = path.dirname(fullPath);

        console.log('Creating file at:', fullPath);

        if (!fs.existsSync(dir)) {
            console.log('Creating directory:', dir);
            fs.mkdirSync(dir, { recursive: true });
        }

        if (fs.existsSync(fullPath)) {
            const overwrite = await vscode.window.showWarningMessage(
                `File ${relativePath} already exists. Overwrite?`,
                'Yes', 'No'
            );
            if (overwrite !== 'Yes') {
                return false;
            }
        }

        fs.writeFileSync(fullPath, content, 'utf-8');
        console.log('File written successfully');
        
        const document = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(document);
        
        vscode.window.showInformationMessage(`✅ Created ${relativePath}`);
        return true;
    }

    private async modifyFile(relativePath: string, content: string): Promise<boolean> {
        const fullPath = path.join(this.workspaceRoot, relativePath);

        if (!fs.existsSync(fullPath)) {
            vscode.window.showErrorMessage(`File ${relativePath} not found`);
            return false;
        }

        fs.writeFileSync(fullPath, content, 'utf-8');
        
        const document = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(document);
        
        vscode.window.showInformationMessage(`✅ Modified ${relativePath}`);
        return true;
    }

    private async deleteFile(relativePath: string): Promise<boolean> {
        const fullPath = path.join(this.workspaceRoot, relativePath);

        if (!fs.existsSync(fullPath)) {
            vscode.window.showErrorMessage(`File ${relativePath} not found`);
            return false;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Delete ${relativePath}?`,
            'Delete', 'Cancel'
        );

        if (confirm !== 'Delete') {
            return false;
        }

        fs.unlinkSync(fullPath);
        vscode.window.showInformationMessage(`✅ Deleted ${relativePath}`);
        return true;
    }

    private async runCommand(command: string): Promise<boolean> {
        const terminal = vscode.window.createTerminal('Agent Executor');
        terminal.show();
        terminal.sendText(command);
        return true;
    }

    getFolderStructureSummary(): string {
        const folders = Array.from(this.folderStructure.entries())
            .slice(0, 20)
            .map(([name, paths]) => `• ${name}: ${paths[0]}`)
            .join('\n');
        
        return `Repository folder structure:\n${folders}`;
    }
}
