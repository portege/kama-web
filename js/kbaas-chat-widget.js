/**
 * KBaaS Embeddable Widget
 * A self-contained search and query widget that can be embedded in any HTML page
 * 
 * Usage:
 * 1. Include this script in your HTML: <script src="path/to/kbaas-widget.js"></script>
 * 2. Add a container: <div id="kbaas-widget"></div>
 * 3. Initialize: KBaaSWidget.init({ apiUrl: 'http://localhost:8000/api', apiKey: 'your-key', containerId: 'kbaas-widget' })
 */

const KBaaSWidget = (() => {
    // Private variables
    let config = {
        apiUrl: 'http://localhost:8000/api',
        apiKey: 'xxx',
        containerId: 'kbaas-chat-widget',
        apiBaseUrl: 'http://localhost:8000'
    };

    let isInitialized = false;
    let _shadowRoot = null;
    let sessionId = null;

    /**
     * Get or generate session ID
     */
    function getSessionId() {
        if (!sessionId) {
            // Try to get from localStorage first
            sessionId = localStorage.getItem('kbaas_session_id');
            
            if (!sessionId) {
                // Generate new UUID
                sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    const r = Math.random() * 16 | 0;
                    const v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
                
                // Store in localStorage
                localStorage.setItem('kbaas_session_id', sessionId);
            }
        }
        return sessionId;
    }

    /**
     * API Client class
     */
    class APIClient {
        constructor(baseURL, apiKey) {
            this.baseURL = baseURL;
            this.apiKey = apiKey;
        }

        async request(endpoint, options = {}) {
            const url = `${this.baseURL}${endpoint}`;
            
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'X-API-Key': this.apiKey,
                        'X-Session-ID': getSessionId(),
                        ...options.headers
                    }
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
                }

                return await response.json();
            } catch (error) {
                console.error(`API Error [${endpoint}]:`, error);
                throw error;
            }
        }

        async query(queryData) {
            return this.request('/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(queryData)
            });
        }

        async queryStream(queryData, onChunk, onComplete, onError) {
            const url = `${this.baseURL}/query/stream`;
            
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': this.apiKey,
                        'X-Session-ID': getSessionId()
                    },
                    body: JSON.stringify(queryData)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = JSON.parse(line.substring(6));
                            onChunk(data);
                        }
                    }
                }

                onComplete();
            } catch (error) {
                console.error('Stream error:', error);
                onError(error);
            }
        }

        async getSettings() {
            return this.request('/settings');
        }

        async healthCheck() {
            return fetch(`${config.apiBaseUrl}/health`)
                .then(res => res.json());
        }
    }

    let apiClient;

    // Helper: query element within the widget's shadow root
    function $id(id) { return _shadowRoot.getElementById(id); }

    /**
     * Inject CSS styles into the widget's shadow root for full isolation
     */
    function injectStyles(root) {
        // Inject Google Fonts into document head — fonts must be loaded globally
        if (!document.getElementById('kbaas-google-fonts')) {
            const preconnect = document.createElement('link');
            preconnect.rel = 'preconnect';
            preconnect.href = 'https://fonts.googleapis.com';
            document.head.appendChild(preconnect);
            const fontLink = document.createElement('link');
            fontLink.id = 'kbaas-google-fonts';
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=Boogaloo&display=swap';
            document.head.appendChild(fontLink);
        }

        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
            :root {
                --kbaas-bg-primary: #ffffff;
                --kbaas-bg-secondary: #f8f9fa;
                --kbaas-text-primary: #212529;
                --kbaas-text-secondary: #6c757d;
                --kbaas-border-color: #dee2e6;
                --kbaas-accent-color: #0d6efd;
                --kbaas-accent-hover: #0b5ed7;
                --kbaas-success-color: #198754;
                --kbaas-danger-color: #dc3545;
                --kbaas-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                --kbaas-widget-border: rgba(0, 0, 0, 0.18);
            }

            @media (prefers-color-scheme: dark) {
                :root {
                    --kbaas-bg-primary: #1a1a1a;
                    --kbaas-bg-secondary: #2d2d2d;
                    --kbaas-text-primary: #e0e0e0;
                    --kbaas-text-secondary: #a0a0a0;
                    --kbaas-border-color: #404040;
                    --kbaas-accent-color: #4a9eff;
                    --kbaas-accent-hover: #3d8de6;
                    --kbaas-widget-border: rgba(255, 255, 255, 0.75);
                }
            }

            /* Manual light override — applied via JS toggle */
            .kbaas-widget--light {
                --kbaas-bg-primary: #ffffff !important;
                --kbaas-bg-secondary: #f8f9fa !important;
                --kbaas-text-primary: #212529 !important;
                --kbaas-text-secondary: #6c757d !important;
                --kbaas-border-color: #dee2e6 !important;
                --kbaas-accent-color: #0d6efd !important;
                --kbaas-accent-hover: #0b5ed7 !important;
                --kbaas-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
                --kbaas-widget-border: rgba(0, 0, 0, 0.18) !important;
            }

            /* Manual dark override */
            .kbaas-widget--dark {
                --kbaas-bg-primary: #1a1a1a !important;
                --kbaas-bg-secondary: #2d2d2d !important;
                --kbaas-text-primary: #e0e0e0 !important;
                --kbaas-text-secondary: #a0a0a0 !important;
                --kbaas-border-color: #404040 !important;
                --kbaas-accent-color: #4a9eff !important;
                --kbaas-accent-hover: #3d8de6 !important;
                --kbaas-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
                --kbaas-widget-border: rgba(255, 255, 255, 0.75) !important;
            }

            .kbaas-widget-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                margin-bottom: 4px;
            }

            .kbaas-theme-toggle {
                flex-shrink: 0;
                margin: 0 24px 0 12px;
                background: var(--kbaas-bg-secondary);
                border: 1px solid var(--kbaas-border-color);
                color: var(--kbaas-text-secondary);
                border-radius: 999px;
                padding: 6px 16px;
                font-size: 0.85rem;
                font-family: system-ui, sans-serif;
                cursor: pointer;
                transition: background 0.2s, color 0.2s;
                white-space: nowrap;
            }

            .kbaas-theme-toggle:hover {
                background: var(--kbaas-accent-color);
                color: #fff;
                border-color: var(--kbaas-accent-color);
            }

            .kbaas-widget {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                background-color: var(--kbaas-bg-primary);
                color: var(--kbaas-text-primary);
                border-radius: 12px;
                border: 1.5px solid var(--kbaas-widget-border);
                box-shadow: 0 -4px 24px rgba(0,0,0,0.2);
                position: fixed;
                bottom: 16px;
                left: 50%;
                transform: translateX(-50%);
                width: 520px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
            }

            .kbaas-widget-titlebar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px 12px 20px;
                cursor: pointer;
                user-select: none;
                border-radius: 12px 12px 0 0;
            }

            .kbaas-widget-titlebar-left {
                display: flex;
                align-items: center;
                gap: 10px;
                flex: 1;
            }

            .kbaas-widget-titlebar:hover .kbaas-widget-title {
                opacity: 0.85;
            }

            .kbaas-widget-collapse-icon {
                font-size: 1rem;
                color: var(--kbaas-text-secondary);
                transition: transform 0.25s ease;
                flex-shrink: 0;
                margin-left: 8px;
            }

            .kbaas-widget.expanded .kbaas-widget-collapse-icon {
                transform: rotate(180deg);
            }

            .kbaas-widget-body {
                max-height: 0;
                overflow: hidden;
                transition: max-height 0.3s ease, opacity 0.25s ease;
                opacity: 0;
                padding: 0 20px;
            }

            .kbaas-widget.expanded .kbaas-widget-body {
                max-height: 80vh;
                overflow-y: auto;
                opacity: 1;
                padding: 0 20px 20px;
            }

            .kbaas-widget * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            .kbaas-widget-section {
                margin-bottom: 24px;
            }

            .kbaas-widget-title {
                display: block;
                font-family: 'Boogaloo', cursive;
                font-size: 1.7rem;
                font-weight: 400;
                margin: 0 0 6px 0;
                padding: 0 0 0 8px;
                background: linear-gradient(135deg, #f953c6, #ff6b6b, #feca57, #48dbfb);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                letter-spacing: 0.5px;
                line-height: 1.2;
            }

            .kbaas-query-form {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .kbaas-form-group {
                display: flex;
                flex-direction: column;
            }

            .kbaas-query-input {
                padding: 12px;
                border: 1px solid var(--kbaas-border-color);
                border-radius: 6px;
                font-size: 1rem;
                font-family: inherit;
                background-color: var(--kbaas-bg-primary);
                color: var(--kbaas-text-primary);
                transition: border-color 0.3s ease;
                resize: vertical;
                min-height: 80px;
            }

            .kbaas-query-input:focus {
                outline: none;
                border-color: var(--kbaas-accent-color);
                box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.25);
            }

            .kbaas-query-controls {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            }

            .kbaas-btn {
                padding: 10px 20px;
                border: none;
                border-radius: 6px;
                font-size: 1rem;
                cursor: pointer;
                transition: all 0.3s ease;
                font-weight: 500;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }

            .kbaas-btn-primary {
                background-color: var(--kbaas-accent-color);
                color: white;
            }

            .kbaas-btn-primary:hover:not(:disabled) {
                background-color: var(--kbaas-accent-hover);
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(13, 110, 253, 0.3);
            }

            .kbaas-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .kbaas-search-results {
            }

            .kbaas-search-results.hidden {
                display: none;
            }

            .kbaas-result-section {
                margin-bottom: 24px;
            }

            .kbaas-result-title {
                font-size: 1.1rem;
                font-weight: 600;
                margin-bottom: 12px;
                color: var(--kbaas-text-primary);
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .kbaas-source-toggle {
                display: flex;
                align-items: center;
                gap: 6px;
                background: none;
                border: none;
                cursor: pointer;
                font-size: 0.85rem;
                font-weight: 600;
                color: var(--kbaas-text-secondary);
                padding: 4px 0;
                font-family: inherit;
                letter-spacing: 0.02em;
                text-transform: uppercase;
            }

            .kbaas-source-toggle:hover {
                color: var(--kbaas-accent-color);
            }

            .kbaas-source-chevron {
                font-style: normal;
                transition: transform 0.2s ease;
                display: inline-block;
            }

            .kbaas-source-toggle.open .kbaas-source-chevron {
                transform: rotate(180deg);
            }

            .kbaas-source-body {
                overflow: hidden;
                max-height: 0;
                transition: max-height 0.25s ease, opacity 0.2s ease;
                opacity: 0;
            }

            .kbaas-source-body.open {
                max-height: 600px;
                opacity: 1;
            }

            .kbaas-llm-response {
                background-color: var(--kbaas-bg-secondary);
                padding: 16px;
                border-radius: 6px;
                margin-bottom: 16px;
                border-left: 4px solid var(--kbaas-accent-color);
                line-height: 1.8;
            }

            .kbaas-llm-response.hidden {
                display: none;
            }

            .kbaas-llm-content {
                max-height: 400px;
                overflow-y: auto;
                padding-right: 8px;
            }

            .kbaas-llm-content code {
                background-color: var(--kbaas-bg-primary);
                padding: 2px 6px;
                border-radius: 3px;
                font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
                font-size: 0.9em;
            }

            .kbaas-llm-content pre {
                background-color: var(--kbaas-bg-primary);
                padding: 12px;
                border-radius: 6px;
                overflow-x: auto;
                margin: 8px 0;
            }

            .kbaas-results-list {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 12px;
            }

            .kbaas-result-item {
                background-color: var(--kbaas-bg-secondary);
                padding: 12px;
                border-radius: 6px;
                border: 1px solid var(--kbaas-border-color);
                transition: all 0.3s ease;
                display: flex;
                flex-direction: column;
                gap: 8px;
                cursor: default;
            }

            .kbaas-result-item:hover {
                transform: translateY(-2px);
                box-shadow: var(--kbaas-shadow);
                border-color: var(--kbaas-accent-color);
            }

            .kbaas-result-header {
                display: flex;
                align-items: flex-start;
                gap: 8px;
            }

            .kbaas-result-filename {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 500;
                word-break: break-word;
                flex: 1;
                color: var(--kbaas-text-primary);
            }

            .kbaas-result-meta {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }

            .kbaas-result-score {
                display: inline-block;
                font-size: 0.8rem;
                font-weight: 500;
                padding: 2px 8px;
                border-radius: 4px;
                white-space: nowrap;
            }

            .kbaas-empty-state {
                color: var(--kbaas-text-secondary);
                font-style: italic;
                text-align: center;
                padding: 24px;
            }

            .kbaas-toast-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
            }

            .kbaas-toast {
                background-color: var(--kbaas-bg-primary);
                color: var(--kbaas-text-primary);
                padding: 14px 16px;
                border-radius: 6px;
                box-shadow: var(--kbaas-shadow);
                display: flex;
                align-items: center;
                gap: 12px;
                pointer-events: auto;
                animation: kbaas-slideIn 0.3s ease;
                border-left: 4px solid var(--kbaas-accent-color);
                min-width: 250px;
            }

            .kbaas-toast.success {
                border-left-color: var(--kbaas-success-color);
            }

            .kbaas-toast.error {
                border-left-color: var(--kbaas-danger-color);
            }

            .kbaas-toast.warning {
                border-left-color: var(--kbaas-warning-color);
            }

            @keyframes kbaas-slideIn {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes kbaas-slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(400px);
                    opacity: 0;
                }
            }

            .kbaas-streaming-cursor {
                display: inline-block;
                animation: kbaas-blink 1s infinite;
            }

            @keyframes kbaas-blink {
                0%, 49% { opacity: 1; }
                50%, 100% { opacity: 0; }
            }

            .kbaas-loading-spinner {
                display: inline-block;
                width: 4px;
                height: 4px;
                border-radius: 50%;
                background-color: var(--kbaas-accent-color);
                animation: kbaas-pulse 1.5s infinite;
            }

            @keyframes kbaas-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
            }

            /* Mobile Responsive Styles */
            @media screen and (max-width: 768px) {
                .kbaas-widget {
                    width: calc(100vw - 32px) !important;
                    max-width: 520px;
                    left: 16px !important;
                    transform: none !important;
                    bottom: 16px;
                }
            }

            @media screen and (max-width: 480px) {
                .kbaas-widget {
                    width: calc(100vw - 20px) !important;
                    left: 10px !important;
                    bottom: 10px;
                    border-radius: 8px;
                }

                .kbaas-widget-titlebar {
                    padding: 10px 12px;
                    border-radius: 8px 8px 0 0;
                }

                .kbaas-widget-title {
                    font-size: 0.95rem;
                }

                .kbaas-widget.expanded .kbaas-widget-body {
                    max-height: calc(85vh - 60px);
                    padding: 0 12px 12px;
                }

                .kbaas-widget-body {
                    padding: 0 12px;
                }

                .kbaas-search-input {
                    font-size: 14px;
                    padding: 10px 12px;
                }

                .kbaas-search-button {
                    padding: 10px 16px;
                    font-size: 14px;
                }

                .kbaas-result-section {
                    padding: 12px;
                    font-size: 14px;
                }

                .kbaas-source-item {
                    padding: 10px;
                }

                .kbaas-theme-toggle {
                    font-size: 12px;
                    padding: 4px 8px !important;
                    margin-right: 10px !important;
                }

                .kbaas-widget-collapse-icon {
                    font-size: 0.9rem;
                }
            }

            @media screen and (max-width: 360px) {
                .kbaas-widget {
                    width: calc(100vw - 16px) !important;
                    left: 8px !important;
                    bottom: 8px;
                }

                .kbaas-widget-titlebar {
                    padding: 8px 10px;
                }

                .kbaas-widget-title {
                    font-size: 0.9rem;
                }

                .kbaas-search-input {
                    font-size: 13px;
                    padding: 8px 10px;
                }

                .kbaas-search-button {
                    padding: 8px 12px;
                    font-size: 13px;
                }
            }
        `;

        root.appendChild(styleSheet);
    }

    /**
     * Create widget HTML structure
     */
    function createWidgetHTML() {
        return `
            <div class="kbaas-widget" id="kbaas-widgetRoot">
                <!-- Always-visible title bar -->
                <div class="kbaas-widget-titlebar" id="kbaas-titlebar">
                    <div class="kbaas-widget-titlebar-left">
                        <span class="kbaas-widget-collapse-icon">&#8964;</span>
                        <span class="kbaas-widget-title">Coba Tanya BABEH!</span>
                    </div>
                    <button class="kbaas-theme-toggle" id="kbaas-themeToggle" title="Toggle light/dark mode" style="margin-right:20px; padding-left:7px; padding-right:7px">Light</button>
                </div>

                <!-- Collapsible body -->
                <div class="kbaas-widget-body" id="kbaas-widgetBody">

                    <!-- Results (shown above the input after a search) -->
                    <div id="kbaas-searchResults" class="kbaas-search-results hidden" style="margin-top:8px">
                        <!-- LLM Response (no heading) -->
                        <div id="kbaas-llmResponse" class="kbaas-result-section kbaas-llm-response hidden">
                            <div class="kbaas-llm-content" id="kbaas-llmContent"></div>
                        </div>

                        <!-- Source Results (collapsible, default collapsed) -->
                        <div id="kbaas-sourceResults" class="kbaas-result-section">
                            <button class="kbaas-source-toggle" id="kbaas-sourceToggle">
                                <i class="kbaas-source-chevron">&#8964;</i> Source
                            </button>
                            <div class="kbaas-source-body" id="kbaas-sourceBody">
                                <div id="kbaas-resultsList" class="kbaas-results-list"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Query form -->
                    <div class="kbaas-query-form">
                        <div class="kbaas-form-group">
                            <textarea 
                                class="kbaas-query-input" 
                                id="kbaas-queryInput" 
                                placeholder="Enter your question here... (Ctrl+Enter to search)"
                            ></textarea>
                        </div>
                        <div class="kbaas-query-controls" style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <span style="font-size:0.75rem; color:var(--kbaas-text-secondary);">
                                Powered by <a href="https://babeh.com" target="_blank" rel="noopener" style="color:var(--kbaas-accent-color); text-decoration:none;">Babeh</a>
                            </span>
                            <button id="kbaas-searchBtn" class="kbaas-btn kbaas-btn-primary">
                                Ask!
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Toast Container -->
            <div id="kbaas-toastContainer" class="kbaas-toast-container"></div>
        `;
    }

    /**
     * Setup event listeners
     */
    function setupEventListeners() {
        const searchBtn = $id('kbaas-searchBtn');
        const queryInput = $id('kbaas-queryInput');

        searchBtn.addEventListener('click', performSearch);

        // Widget collapse toggle (title bar)
        const titlebar   = $id('kbaas-titlebar');
        const widgetRoot = $id('kbaas-widgetRoot');
        if (titlebar && widgetRoot) {
            titlebar.addEventListener('click', () => {
                widgetRoot.classList.toggle('expanded');
            });
        }

        // Source collapsible toggle
        const sourceToggle = $id('kbaas-sourceToggle');
        const sourceBody   = $id('kbaas-sourceBody');
        if (sourceToggle && sourceBody) {
            sourceToggle.addEventListener('click', () => {
                const isOpen = sourceBody.classList.toggle('open');
                sourceToggle.classList.toggle('open', isOpen);
            });
        }

        // Theme toggle
        const themeToggle = $id('kbaas-themeToggle');
        if (themeToggle) {
            const widget = $id('kbaas-widgetRoot');
            // Detect initial system preference
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            let isDark = prefersDark;
            widget.classList.add(isDark ? 'kbaas-widget--dark' : 'kbaas-widget--light');
            themeToggle.textContent = isDark ? 'Light' : 'Dark';

            themeToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                isDark = !isDark;
                widget.classList.toggle('kbaas-widget--dark', isDark);
                widget.classList.toggle('kbaas-widget--light', !isDark);
                themeToggle.textContent = isDark ? 'Light' : 'Dark';
            });
        }

        queryInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                performSearch();
            }
        });
    }

    /**
     * Perform search/query
     */
    async function performSearch() {
        const query = $id('kbaas-queryInput').value.trim();
        if (!query) {
            showToast('Please enter a search query', 'warning');
            return;
        }

        const searchBtn = $id('kbaas-searchBtn');
        const originalText = searchBtn.innerHTML;
        
        searchBtn.disabled = true;
        searchBtn.innerHTML = '&#128260; Searching...';

        const resultsContainer = $id('kbaas-searchResults');
        const llmResponseEl = $id('kbaas-llmResponse');
        const llmContent = $id('kbaas-llmContent');
        const resultsList = $id('kbaas-resultsList');

        try {
            let searchResults = [];
            let llmText = '';
            let citedSources = null;
            
            // Show results container
            resultsContainer.classList.remove('hidden');
            llmContent.innerHTML = '<span class="kbaas-streaming-cursor">▊</span>';
            llmResponseEl.classList.remove('hidden');
            
            // Show loading state for sources
            resultsList.innerHTML = '<p class="kbaas-empty-state">&#9203; Identifying relevant sources...</p>';

            // Load marked library if not already loaded
            if (typeof marked === 'undefined') {
                await loadMarkedLibrary();
            }

            await apiClient.queryStream(
                { query },
                (data) => {
                    if (data.type === 'results') {
                        searchResults = data.data;
                        // Don't render sources yet — wait for cited_sources from LLM
                    } else if (data.type === 'llm_chunk') {
                        llmText += data.text;
                        // Strip citation JSON from display while streaming
                        const displayText = stripCitationJson(llmText);
                        llmContent.innerHTML = marked.parse(displayText) + '<span class="kbaas-streaming-cursor">▊</span>';
                        llmContent.scrollTop = llmContent.scrollHeight;
                    } else if (data.type === 'cited_sources') {
                        // LLM has told us which sources it actually used
                        citedSources = data.sources || [];
                        renderCitedSources(citedSources);
                    } else if (data.type === 'final_answer') {
                        // Backend-stripped final text — replace accumulated stream
                        llmText = data.text || llmText;
                    }
                },
                () => {
                    // Stream complete — clean up
                    const displayText = stripCitationJson(llmText);
                    llmContent.innerHTML = marked.parse(displayText);
                    
                    // If backend didn't send cited_sources, fall back to score-based filtering
                    if (!citedSources) {
                        renderSearchResults(searchResults);
                    }
                    
                    const sourceCount = citedSources ? citedSources.length : searchResults.length;
                    showToast(`Found ${sourceCount} relevant sources`, 'success');
                    searchBtn.disabled = false;
                    searchBtn.innerHTML = originalText;
                },
                (error) => {
                    showToast(`Search failed: ${error.message}`, 'error');
                    searchBtn.disabled = false;
                    searchBtn.innerHTML = originalText;
                }
            );
        } catch (error) {
            showToast(`Search failed: ${error.message}`, 'error');
            searchBtn.disabled = false;
            searchBtn.innerHTML = originalText;
        }
    }

    /**
     * Strip the {"cited_sources": [...]} JSON from the LLM text for display
     */
    function stripCitationJson(text) {
        return text.replace(/\{[\s]*"cited_sources"[\s]*:[\s]*\[[\d\s,]*\][\s]*\}/g, '').trim();
    }

    /**
     * Load marked library dynamically
     */
    function loadMarkedLibrary() {
        return new Promise((resolve, reject) => {
            if (typeof marked !== 'undefined') {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Render search results (fallback when no cited_sources from LLM)
     */
    function renderSearchResults(results) {
        const resultsList = $id('kbaas-resultsList');
        if (results && results.length > 0) {
            // Configuration for filtering
            const RELEVANCE_THRESHOLD = 0.35;  // Lowered to match backend threshold
            const MAX_SOURCES = 5;
            
            const seenFilenames = new Set();
            const relevantResults = results
                .sort((a, b) => b.score - a.score)
                .filter(r => {
                    if (r.score <= RELEVANCE_THRESHOLD) return false;
                    if (seenFilenames.has(r.filename)) return false;
                    seenFilenames.add(r.filename);
                    return true;
                })
                .slice(0, MAX_SOURCES);

            if (relevantResults.length > 0) {
                resultsList.innerHTML = relevantResults.map(result => {
                    const scorePercent = (result.score * 100).toFixed(0);
                    const scoreColor = getScoreColor(result.score);
                    const scoreLabel = getScoreLabel(result.score);
                    const sourceUrl = result.source_url || result.metadata?.source;
                    
                    // Truncate filename to max 60 characters
                    const fullFilename = result.filename || 'Unknown';
                    const truncatedFilename = fullFilename.length > 60 ? fullFilename.substring(0, 57) + '...' : fullFilename;
                    
                    // Check if this is a URL document
                    const isUrlDocument = result.is_url || sourceUrl;
                    const filenameHtml = isUrlDocument && sourceUrl
                        ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--kbaas-text-primary);text-decoration:none;" title="${escapeHtml(fullFilename)}">${escapeHtml(truncatedFilename)}</a>`
                        : `<span title="${escapeHtml(fullFilename)}">${escapeHtml(truncatedFilename)}</span>`;
                    
                    return `
                        <div class="kbaas-result-item" style="display:flex!important;flex-direction:row!important;align-items:center;justify-content:space-between;gap:8px;padding:8px;">
                            <span class="kbaas-result-filename" style="font-size:0.85rem;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--kbaas-text-primary);">${filenameHtml}</span>
                            <span class="kbaas-result-score" style="background-color:${scoreColor};color:white;padding:2px 4px;border-radius:4px;font-size:0.75rem;font-weight:500;flex-shrink:0;">
                                ${scorePercent}%
                            </span>
                        </div>
                    `;
                }).join('');
            } else {
                resultsList.innerHTML = `<p class="kbaas-empty-state">No highly relevant sources found</p>`;
            }
        } else {
            resultsList.innerHTML = '<p class="kbaas-empty-state">No results found</p>';
        }
    }

    /**
     * Render sources cited by the LLM (preferred over score-based filtering)
     */
    function renderCitedSources(sources) {
        const resultsList = $id('kbaas-resultsList');
        
        if (!sources || sources.length === 0) {
            resultsList.innerHTML = '<p class="kbaas-empty-state">No sources were cited by the AI for this answer</p>';
            return;
        }

        // Deduplicate by filename, keep highest score
        const uniqueSources = new Map();
        sources.forEach(source => {
            const filename = source.filename;
            if (!uniqueSources.has(filename) || uniqueSources.get(filename).score < source.score) {
                uniqueSources.set(filename, source);
            }
        });

        const sortedSources = Array.from(uniqueSources.values())
            .sort((a, b) => (b.score || 0) - (a.score || 0));

        resultsList.innerHTML = sortedSources.map(source => {
            const scorePercent = ((source.score || 0) * 100).toFixed(0);
            const scoreColor = getScoreColor(source.score || 0);
            const scoreLabel = getScoreLabel(source.score || 0);
            
            // Truncate filename to max 60 characters
            const fullFilename = source.filename || 'Unknown';
            const truncatedFilename = fullFilename.length > 60 ? fullFilename.substring(0, 57) + '...' : fullFilename;
            
            // Check if this is a URL document (either by is_url flag or by having source_url)
            const isUrlDocument = source.is_url || source.source_url;
            const filenameHtml = isUrlDocument && source.source_url
                ? `<a href="${escapeHtml(source.source_url)}" target="_blank" rel="noopener noreferrer" style="color:var(--kbaas-text-primary);text-decoration:none;" title="${escapeHtml(fullFilename)}">${escapeHtml(truncatedFilename)}</a>`
                : `<span title="${escapeHtml(fullFilename)}">${escapeHtml(truncatedFilename)}</span>`;
            
            return `
                <div class="kbaas-result-item" style="display:flex!important;flex-direction:row!important;align-items:center;justify-content:space-between;gap:8px;padding:8px;">
                    <span class="kbaas-result-filename" style="font-size:0.85rem;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--kbaas-text-primary);">${filenameHtml}</span>
                    <span class="kbaas-result-score" style="background-color:${scoreColor};color:white;padding:2px 4px;border-radius:4px;font-size:0.75rem;font-weight:500;flex-shrink:0;">
                        ${scorePercent}%
                    </span>
                </div>
            `;
        }).join('');
    }

    /**
     * Get color based on relevance score
     */
    function getScoreColor(score) {
        if (score >= 0.9) return '#10b981'; // Green - Highly relevant
        if (score >= 0.8) return '#3b82f6'; // Blue - Very relevant
        if (score >= 0.7) return '#f59e0b'; // Orange - Relevant
        return '#6b7280'; // Gray - Marginally relevant
    }

    /**
     * Get label based on relevance score
     */
    function getScoreLabel(score) {
        if (score >= 0.9) return '&#128293;'; // Highly relevant
        if (score >= 0.8) return '&#10024;'; // Very relevant
        return ''; // Just relevant
    }

    /**
     * Show toast notification
     */
    function showToast(message, type = 'success') {
        const container = $id('kbaas-toastContainer');
        const toast = document.createElement('div');
        toast.className = `kbaas-toast ${type}`;
        const icon = type === 'success' ? '&#9989;' : type === 'error' ? '&#10060;' : '&#9888;&#65039;';
        toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'kbaas-slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Escape HTML special characters
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Check backend connection
     */
    async function checkBackendConnection() {
        try {
            await apiClient.healthCheck();
            console.log('KBaaS Widget: Backend connection OK');
            return true;
        } catch (error) {
            console.warn('KBaaS Widget: Cannot connect to backend server', error);
            showToast('Cannot connect to backend server. Please check configuration.', 'error');
            return false;
        }
    }

    /**
     * Public API
     */
    return {
        /**
         * Initialize the widget
         * @param {Object} options - Configuration options
         * @param {string} options.apiUrl - Backend API URL (default: http://localhost:8000/api)
         * @param {string} options.apiKey - API key for authentication (default: xxx)
         * @param {string} options.containerId - Container element ID (default: kbaas-widget)
         * @param {string} options.apiBaseUrl - Base URL for health check (default: http://localhost:8000)
         */
        init: async function(options = {}) {
            if (isInitialized) {
                console.warn('KBaaS Widget already initialized');
                return;
            }

            // Merge options with config
            config = { ...config, ...options };

            // Find container
            const container = document.getElementById(config.containerId);
            if (!container) {
                console.error(`KBaaS Widget: Container with ID '${config.containerId}' not found`);
                return;
            }

            // Attach Shadow DOM — provides complete CSS isolation from the host page
            _shadowRoot = container.attachShadow({ mode: 'open' });

            // Inject styles into shadow root (not document.head)
            injectStyles(_shadowRoot);

            // Mount widget HTML inside shadow root
            const _wrapper = document.createElement('div');
            _wrapper.innerHTML = createWidgetHTML();
            while (_wrapper.firstChild) {
                _shadowRoot.appendChild(_wrapper.firstChild);
            }

            // Initialize API client
            apiClient = new APIClient(config.apiUrl, config.apiKey);

            // Setup event listeners
            setupEventListeners();

            // Check backend connection
            await checkBackendConnection();

            isInitialized = true;
            console.log('KBaaS Widget initialized successfully');
        },

        /**
         * Reconfigure the widget
         */
        configure: function(options = {}) {
            config = { ...config, ...options };
            console.log('KBaaS Widget configuration updated');
        },

        /**
         * Get current configuration
         */
        getConfig: function() {
            return { ...config };
        },

        /**
         * Check if widget is initialized
         */
        isInitialized: function() {
            return isInitialized;
        },

        /**
         * Programmatically perform a search
         */
        search: async function(query) {
            if (!isInitialized) {
                console.error('KBaaS Widget: Widget not initialized');
                return;
            }
            
            $id('kbaas-queryInput').value = query;
            performSearch();
        },

        /**
         * Clear search results and input
         */
        clear: function() {
            if (!isInitialized) {
                console.error('KBaaS Widget: Widget not initialized');
                return;
            }

            $id('kbaas-queryInput').value = '';
            $id('kbaas-searchResults').classList.add('hidden');
            $id('kbaas-llmResponse').classList.add('hidden');
            $id('kbaas-llmContent').innerHTML = '';
            $id('kbaas-resultsList').innerHTML = '';
        }
    };
})();

// Auto-initialize if data attributes are present on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    const widget = document.getElementById('kbaas-widget');
    if (widget && !KBaaSWidget.isInitialized()) {
        const config = {
            apiUrl: widget.dataset.apiUrl || 'http://localhost:8000/api',
            apiKey: widget.dataset.apiKey || 'xxx',
            apiBaseUrl: widget.dataset.apiBaseUrl || 'http://localhost:8000'
        };
        KBaaSWidget.init(config);
    }
});
