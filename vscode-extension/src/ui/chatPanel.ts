// Chat panel webview content generator

export function getChatPanelHtml(messages: Array<{
    role: string;
    content: string;
    timestamp: Date;
}>): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prompt Enrichment Chat</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .message {
            display: flex;
            flex-direction: column;
            max-width: 85%;
            animation: slideIn 0.2s ease-out;
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .message.user {
            align-self: flex-end;
        }

        .message.assistant {
            align-self: flex-start;
        }

        .message-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .message-avatar {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        }

        .message.user .message-avatar {
            background-color: var(--vscode-button-background);
        }

        .message.assistant .message-avatar {
            background-color: var(--vscode-textLink-foreground);
        }

        .message-content {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 8px;
            padding: 12px;
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.5;
        }

        .message.user .message-content {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }

        .message-timestamp {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }

        .input-container {
            border-top: 1px solid var(--vscode-panel-border);
            padding: 16px;
            background-color: var(--vscode-editor-background);
        }

        .input-wrapper {
            display: flex;
            gap: 8px;
            align-items: flex-end;
        }

        textarea {
            flex: 1;
            min-height: 40px;
            max-height: 200px;
            padding: 10px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            resize: vertical;
            outline: none;
        }

        textarea:focus {
            border-color: var(--vscode-focusBorder);
        }

        .button-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        button {
            padding: 10px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-family: var(--vscode-font-family);
            white-space: nowrap;
            transition: background-color 0.1s;
        }

        button:hover:not(:disabled) {
            background-color: var(--vscode-button-hoverBackground);
        }

        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover:not(:disabled) {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .enrichment-badge {
            display: inline-block;
            padding: 2px 8px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 10px;
            font-size: 10px;
            font-weight: 500;
            margin-left: 8px;
        }

        .loading-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        .loading-dots {
            display: flex;
            gap: 4px;
        }

        .loading-dots span {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background-color: var(--vscode-descriptionForeground);
            animation: pulse 1.4s infinite ease-in-out;
        }

        .loading-dots span:nth-child(1) {
            animation-delay: -0.32s;
        }

        .loading-dots span:nth-child(2) {
            animation-delay: -0.16s;
        }

        @keyframes pulse {
            0%, 80%, 100% {
                opacity: 0.3;
                transform: scale(0.8);
            }
            40% {
                opacity: 1;
                transform: scale(1);
            }
        }

        .empty-state {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 32px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }

        .empty-state-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
        }

        .empty-state-description {
            font-size: 13px;
            line-height: 1.6;
            max-width: 400px;
        }

        code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }

        pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
        }

        pre code {
            background: none;
            padding: 0;
        }
    </style>
</head>
<body>
    <div class="chat-container" id="chatContainer">
        ${messages.length === 0 ? `
            <div class="empty-state">
                <div class="empty-state-icon">💡</div>
                <div class="empty-state-title">Start a conversation</div>
                <div class="empty-state-description">
                    Type your prompt below and it will be enriched with repository context 
                    and structured using research-based prompt engineering templates.
                </div>
            </div>
        ` : messages.map(msg => `
            <div class="message ${msg.role}">
                <div class="message-header">
                    <div class="message-avatar">${msg.role === 'user' ? '👤' : '🤖'}</div>
                    <span>${msg.role === 'user' ? 'You' : 'Assistant'}</span>
                    ${msg.role === 'assistant' ? '<span class="enrichment-badge">Enriched</span>' : ''}
                </div>
                <div class="message-content">${escapeHtml(msg.content)}</div>
                <div class="message-timestamp">${formatTimestamp(msg.timestamp)}</div>
            </div>
        `).join('')}
        <div id="loadingIndicator" class="loading-indicator" style="display: none;">
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <span>Thinking...</span>
        </div>
    </div>

    <div class="input-container">
        <div class="input-wrapper">
            <textarea 
                id="promptInput" 
                placeholder="Enter your prompt here..."
                rows="3"
            ></textarea>
            <div class="button-group">
                <button id="enrichButton" onclick="enrichPrompt()">
                    ✨ Enrich
                </button>
                <button id="sendButton" class="secondary" onclick="sendMessage()">
                    📤 Send
                </button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const promptInput = document.getElementById('promptInput');
        const loadingIndicator = document.getElementById('loadingIndicator');
        const sendButton = document.getElementById('sendButton');
        const enrichButton = document.getElementById('enrichButton');

        // Auto-resize textarea
        promptInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });

        // Handle Enter key (Shift+Enter for new line, Enter to send)
        promptInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        function enrichPrompt() {
            const prompt = promptInput.value.trim();
            if (!prompt) {
                return;
            }

            setLoading(true);
            vscode.postMessage({
                command: 'enrichPrompt',
                prompt: prompt
            });
        }

        function sendMessage() {
            const prompt = promptInput.value.trim();
            if (!prompt) {
                return;
            }

            setLoading(true);
            vscode.postMessage({
                command: 'sendMessage',
                prompt: prompt
            });

            promptInput.value = '';
            promptInput.style.height = 'auto';
        }

        function setLoading(isLoading) {
            loadingIndicator.style.display = isLoading ? 'flex' : 'none';
            sendButton.disabled = isLoading;
            enrichButton.disabled = isLoading;
            promptInput.disabled = isLoading;

            if (isLoading) {
                scrollToBottom();
            }
        }

        function scrollToBottom() {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'messageComplete':
                    setLoading(false);
                    break;
                case 'error':
                    setLoading(false);
                    alert('Error: ' + message.error);
                    break;
            }
        });

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function formatTimestamp(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diffMs = now - date;
            const diffSecs = Math.floor(diffMs / 1000);
            
            if (diffSecs < 60) {
                return 'just now';
            }
            
            const diffMins = Math.floor(diffSecs / 60);
            if (diffMins < 60) {
                return diffMins + ' minute' + (diffMins > 1 ? 's' : '') + ' ago';
            }
            
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) {
                return diffHours + ' hour' + (diffHours > 1 ? 's' : '') + ' ago';
            }
            
            return date.toLocaleDateString();
        }

        // Initial scroll to bottom
        scrollToBottom();
    </script>
</body>
</html>
`;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatTimestamp(timestamp: Date): string {
    return timestamp.toLocaleTimeString();
}

