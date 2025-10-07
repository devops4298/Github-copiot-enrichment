import * as vscode from 'vscode';
import * as path from 'path';

export class FileWatcher {
    private watcher: vscode.FileSystemWatcher | undefined;
    private onFileChangeCallback: (uri: vscode.Uri) => void;

    constructor(onFileChange: (uri: vscode.Uri) => void) {
        this.onFileChangeCallback = onFileChange;
    }

    start(workspaceFolder: vscode.WorkspaceFolder): void {
        // Watch for changes in code files
        const pattern = new vscode.RelativePattern(
            workspaceFolder,
            '**/*.{ts,js,py,java,go,cpp,c,cs,rb,php,swift,kt}'
        );

        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.watcher.onDidCreate((uri) => {
            console.log(`File created: ${uri.fsPath}`);
            this.onFileChangeCallback(uri);
        });

        this.watcher.onDidChange((uri) => {
            console.log(`File changed: ${uri.fsPath}`);
            this.onFileChangeCallback(uri);
        });

        this.watcher.onDidDelete((uri) => {
            console.log(`File deleted: ${uri.fsPath}`);
            this.onFileChangeCallback(uri);
        });
    }

    dispose(): void {
        if (this.watcher) {
            this.watcher.dispose();
        }
    }
}

export function isCodeFile(filePath: string): boolean {
    const codeExtensions = [
        '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go',
        '.cpp', '.c', '.cs', '.rb', '.php', '.swift', '.kt',
        '.rs', '.scala', '.r', '.m', '.h', '.hpp'
    ];

    const ext = path.extname(filePath).toLowerCase();
    return codeExtensions.includes(ext);
}

export function shouldIgnoreFile(filePath: string): boolean {
    const ignorePaths = [
        'node_modules',
        'dist',
        'build',
        'out',
        '.git',
        '.vscode',
        'venv',
        '__pycache__',
        '.pytest_cache',
        'target',
        'bin',
        'obj'
    ];

    return ignorePaths.some(ignorePath => filePath.includes(ignorePath));
}

