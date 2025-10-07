import * as vscode from 'vscode';
import { ModelMode } from '../copilotIntegration';

export class StatusBarManager {
    private modeStatusBar: vscode.StatusBarItem;
    private modelStatusBar: vscode.StatusBarItem;
    private indexStatusBar: vscode.StatusBarItem;

    constructor(private context: vscode.ExtensionContext) {
        // Create status bar items
        this.modeStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.modelStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            99
        );
        this.indexStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            98
        );

        this.setupStatusBars();
        this.show();
    }

    private setupStatusBars(): void {
        // Mode switcher
        this.modeStatusBar.command = 'promptEnrichment.toggleMode';
        this.modeStatusBar.tooltip = 'Click to switch between Chat and Agent mode';

        // Model selector
        this.modelStatusBar.command = 'promptEnrichment.changeModel';
        this.modelStatusBar.tooltip = 'Click to change model';

        // Index status
        this.indexStatusBar.command = 'promptEnrichment.reindexRepo';
        this.indexStatusBar.tooltip = 'Repository index status';
    }

    updateMode(mode: ModelMode): void {
        const icon = mode === 'chat' ? '$(comment-discussion)' : '$(robot)';
        this.modeStatusBar.text = `${icon} ${mode.toUpperCase()}`;
    }

    updateModel(modelName: string): void {
        this.modelStatusBar.text = `$(sparkle) ${modelName}`;
    }

    updateIndexStatus(status: {
        isIndexed: boolean;
        chunkCount: number;
        lastIndexed?: Date;
    }): void {
        if (!status.isIndexed) {
            this.indexStatusBar.text = '$(database) Not Indexed';
            this.indexStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.indexStatusBar.text = `$(database) ${status.chunkCount} chunks`;
            this.indexStatusBar.backgroundColor = undefined;
            
            if (status.lastIndexed) {
                const timeAgo = this.getTimeAgo(status.lastIndexed);
                this.indexStatusBar.tooltip = `Last indexed: ${timeAgo}\nClick to reindex`;
            }
        }
    }

    private getTimeAgo(date: Date): string {
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        
        if (seconds < 60) {
            return 'just now';
        }
        
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        }
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        }
        
        const days = Math.floor(hours / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }

    show(): void {
        this.modeStatusBar.show();
        this.modelStatusBar.show();
        this.indexStatusBar.show();
    }

    hide(): void {
        this.modeStatusBar.hide();
        this.modelStatusBar.hide();
        this.indexStatusBar.hide();
    }

    dispose(): void {
        this.modeStatusBar.dispose();
        this.modelStatusBar.dispose();
        this.indexStatusBar.dispose();
    }
}

