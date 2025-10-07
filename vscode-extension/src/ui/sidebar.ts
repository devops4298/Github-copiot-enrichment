// Sidebar webview content generator
// This file provides HTML for the sidebar webview

export function getSidebarHtml(data: {
    indexStatus: {
        isIndexed: boolean;
        chunkCount: number;
        lastIndexed?: Date;
    };
    currentModel: string;
    currentMode: string;
    availableModels: Array<{ id: string; name: string; provider: string }>;
}): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prompt Enrichment</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            padding: 16px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            font-size: 13px;
        }

        .section {
            margin-bottom: 24px;
        }

        .section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-foreground);
            margin-bottom: 8px;
            opacity: 0.8;
        }

        .card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 8px;
        }

        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 8px;
        }

        .status-indicator.active {
            background-color: #4caf50;
        }

        .status-indicator.inactive {
            background-color: #ff9800;
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            margin: 6px 0;
            font-size: 12px;
        }

        .info-label {
            color: var(--vscode-descriptionForeground);
        }

        .info-value {
            font-weight: 500;
        }

        button {
            width: 100%;
            padding: 8px 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
            font-family: var(--vscode-font-family);
            margin-top: 8px;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        select {
            width: 100%;
            padding: 6px;
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 2px;
            font-family: var(--vscode-font-family);
            font-size: 12px;
            margin-top: 8px;
        }

        .mode-toggle {
            display: flex;
            gap: 8px;
        }

        .mode-toggle button {
            flex: 1;
            margin-top: 0;
        }

        .mode-toggle button.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .divider {
            height: 1px;
            background-color: var(--vscode-panel-border);
            margin: 16px 0;
        }

        .badge {
            display: inline-block;
            padding: 2px 8px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 10px;
            font-size: 11px;
            font-weight: 500;
        }
    </style>
</head>
<body>
    <div class="section">
        <div class="section-title">Repository Index</div>
        <div class="card">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span class="status-indicator ${data.indexStatus.isIndexed ? 'active' : 'inactive'}"></span>
                <span>${data.indexStatus.isIndexed ? 'Indexed' : 'Not Indexed'}</span>
            </div>
            ${data.indexStatus.isIndexed ? `
                <div class="info-row">
                    <span class="info-label">Code Chunks:</span>
                    <span class="info-value">${data.indexStatus.chunkCount}</span>
                </div>
                ${data.indexStatus.lastIndexed ? `
                    <div class="info-row">
                        <span class="info-label">Last Indexed:</span>
                        <span class="info-value">${formatDate(data.indexStatus.lastIndexed)}</span>
                    </div>
                ` : ''}
            ` : ''}
            <button onclick="reindexRepo()">
                ${data.indexStatus.isIndexed ? 'Reindex Repository' : 'Index Repository'}
            </button>
        </div>
    </div>

    <div class="divider"></div>

    <div class="section">
        <div class="section-title">Mode</div>
        <div class="card">
            <div class="mode-toggle">
                <button 
                    class="${data.currentMode === 'chat' ? 'active' : 'secondary'}"
                    onclick="switchMode('chat')"
                >
                    💬 Chat
                </button>
                <button 
                    class="${data.currentMode === 'agent' ? 'active' : 'secondary'}"
                    onclick="switchMode('agent')"
                >
                    🤖 Agent
                </button>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Model</div>
        <div class="card">
            <div class="info-row">
                <span class="info-label">Current Model:</span>
                <span class="badge">${data.currentModel}</span>
            </div>
            <select id="modelSelect" onchange="changeModel()">
                ${data.availableModels.map(model => `
                    <option value="${model.id}" ${model.id === data.currentModel ? 'selected' : ''}>
                        ${model.name} (${model.provider})
                    </option>
                `).join('')}
            </select>
        </div>
    </div>

    <div class="divider"></div>

    <div class="section">
        <div class="section-title">Actions</div>
        <div class="card">
            <button onclick="openChat()">💬 Open Chat Panel</button>
            <button class="secondary" onclick="showTemplates()">📝 View Templates</button>
            <button class="secondary" onclick="clearHistory()">🗑️ Clear History</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function reindexRepo() {
            vscode.postMessage({ command: 'reindexRepo' });
        }

        function switchMode(mode) {
            vscode.postMessage({ command: 'switchMode', mode });
        }

        function changeModel() {
            const select = document.getElementById('modelSelect');
            const modelId = select.value;
            vscode.postMessage({ command: 'changeModel', modelId });
        }

        function openChat() {
            vscode.postMessage({ command: 'openChat' });
        }

        function showTemplates() {
            vscode.postMessage({ command: 'showTemplates' });
        }

        function clearHistory() {
            vscode.postMessage({ command: 'clearHistory' });
        }

        function formatDate(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            
            if (diffMins < 60) {
                return diffMins + 'm ago';
            }
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) {
                return diffHours + 'h ago';
            }
            const diffDays = Math.floor(diffHours / 24);
            return diffDays + 'd ago';
        }
    </script>
</body>
</html>
`;
}

function formatDate(date: Date): string {
    return date.toLocaleString();
}

