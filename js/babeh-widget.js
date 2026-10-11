/**
 * KBaaS Chatbox Widget
 * Embeddable conversational chat bubble for any website.
 *
 * Usage:
 *   <script src="kbaas-chatbox-widget.js"></script>
 *   <script>
 *     KBaaSChat.init({
 *       apiBaseUrl: 'https://your-backend.com',
 *       apiKey:     'your-api-key',
 *       // optional:
 *       title:      'Tanya BABEH!',
 *       subtitle:   'Asisten otomotif Anda',
 *       position:   'right',          // 'right' | 'left'
 *       accentColor:'#7c6af7',
 *       suggestions: ['Harga BZ4X', 'Simulasi kredit'],
 *     });
 *   </script>
 */

const KBaaSChat = (() => {
  /* ── private state ──────────────────────────────────────── */
  let cfg = {
    apiBaseUrl:  'http://localhost:8000',
    apiKey:      '',
    title:       'Tanya BABEH!',
    subtitle:    'Asisten otomotif Anda',
    position:    'right',
    accentColor: '#7c6af7',
    suggestions: [
      'Harga Toyota BZ4X terbaru',
      'Bandingkan BZ4X vs Ioniq 5',
      'Simulasi kredit 60 bulan',
      'Halo!',
    ],
  };

  let isOpen             = false;
  let isStreaming        = false;
  let shadowRoot         = null;
  let initialized        = false;
  let articulation       = 'default';
  let conversationHistory = [];   // [{question, answer}, ...]

  /* ── session ────────────────────────────────────────────── */
  function sessionId() {
    const KEY = 'kbaas_chat_session';
    // sessionStorage is cleared on every page refresh — fresh context each visit
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      sessionStorage.setItem(KEY, id);
    }
    return id;
  }

  function resetSession() {
    sessionStorage.removeItem('kbaas_chat_session');
  }

  /* ── css ─────────────────────────────────────────────────── */
  function buildCSS() {
    const a = cfg.accentColor;
    const pos = cfg.position === 'left' ? 'left:24px;' : 'right:24px;';
    return `
      :host { all: initial; }

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      /* ── variables ── */
      .kbc-root {
        --a: ${a};
        --bg:  #0f0f13; --s1: #1a1a22; --s2: #22222e;
        --bd:  rgba(255,255,255,0.09);
        --tx:  #e4e4ef; --ts: rgba(228,228,239,0.55);
        --ubg: #2a2555; --bbg: #1e1e2a;
        --r:   16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .kbc-root.light {
        --bg:  #f0f0f5; --s1: #ffffff; --s2: #f5f5fa;
        --bd:  rgba(0,0,0,0.09);
        --tx:  #1a1a2e; --ts: rgba(26,26,46,0.5);
        --ubg: #e8e4ff; --bbg: #f5f5fa;
      }

      /* ── FAB bubble ── */
      .kbc-fab {
        position: fixed;
        bottom: 24px;
        ${pos}
        z-index: 99998;
        width: 58px; height: 58px;
        border-radius: 50%;
        background: var(--a);
        border: none;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.35);
        transition: transform 0.2s, box-shadow 0.2s;
        color: #fff;
      }
      .kbc-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,0,0,0.45); }
      .kbc-fab svg  { transition: transform 0.3s; }
      .kbc-fab.open svg.icon-chat { display: none; }
      .kbc-fab.open svg.icon-close { display: block !important; }
      .kbc-unread {
        position: absolute;
        top: 2px; right: 2px;
        width: 18px; height: 18px;
        border-radius: 50%;
        background: #ef4444;
        color: #fff;
        font-size: 10px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        border: 2px solid #fff;
        display: none;
      }
      .kbc-unread.show { display: flex; }

      /* ── panel ── */
      .kbc-panel {
        position: fixed;
        bottom: 96px;
        ${pos}
        z-index: 99999;
        width: 380px;
        max-width: calc(100vw - 24px);
        height: 560px;
        max-height: calc(100vh - 120px);
        background: var(--bg);
        border: 1px solid var(--bd);
        border-radius: 20px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform-origin: bottom ${cfg.position === 'left' ? 'left' : 'right'};
        transform: scale(0.85);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), opacity 0.2s;
      }
      .kbc-panel.open {
        transform: scale(1);
        opacity: 1;
        pointer-events: all;
      }

      /* ── header ── */
      .kbc-header {
        display: flex; align-items: center; gap: 10px;
        padding: 14px 16px;
        background: var(--s1);
        border-bottom: 1px solid var(--bd);
        flex-shrink: 0;
      }
      .kbc-hav {
        width: 38px; height: 38px; border-radius: 50%;
        background: linear-gradient(135deg, #f953c6, var(--a), #48dbfb);
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; flex-shrink: 0;
      }
      .kbc-htitle {
        font-weight: 700; font-size: 15px; color: var(--tx);
        background: linear-gradient(135deg, #f953c6, #ff6b6b, #feca57, #48dbfb);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .kbc-hsub { font-size: 11px; color: var(--ts); margin-top: 1px; }
      .kbc-hactions { margin-left: auto; display: flex; gap: 6px; }
      .kbc-hbtn {
        background: var(--s2); border: 1px solid var(--bd);
        color: var(--ts); border-radius: 8px;
        padding: 5px 10px; font-size: 11px; font-weight: 500;
        cursor: pointer; font-family: inherit;
        transition: background 0.2s;
      }
      .kbc-hbtn:hover { background: var(--a); color: #fff; border-color: var(--a); }
      .kbc-status { width: 8px; height: 8px; border-radius: 50%; background: #6b7280; flex-shrink:0; }
      .kbc-status.online { background: #22c55e; box-shadow: 0 0 5px #22c55e; }

      /* ── messages ── */
      .kbc-msgs {
        flex: 1; overflow-y: auto; padding: 16px 14px;
        display: flex; flex-direction: column; gap: 14px;
        scroll-behavior: smooth;
      }
      .kbc-msgs::-webkit-scrollbar { width: 3px; }
      .kbc-msgs::-webkit-scrollbar-thumb { background: var(--bd); border-radius: 3px; }

      .kbc-row { display: flex; gap: 8px; align-items: flex-end; }
      .kbc-row.user { flex-direction: row-reverse; }
      .kbc-av {
        width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
        background: linear-gradient(135deg, #f953c6, var(--a));
        display: flex; align-items: center; justify-content: center; font-size: 13px;
      }
      .kbc-row.user .kbc-av { background: linear-gradient(135deg, #48dbfb, var(--a)); }

      .kbc-bub {
        max-width: 100%; padding: 10px 14px;
        border-radius: var(--r); font-size: 13.5px; line-height: 1.65;
        word-break: break-word;
      }
      .kbc-av { display: none; }
      .kbc-row.user .kbc-bub { background: var(--ubg); border: 1px solid rgba(124,106,247,0.3); border-bottom-right-radius: 4px; color: var(--tx); }
      .kbc-row.err  .kbc-bub { background: rgba(220,53,69,0.12); border-color: rgba(220,53,69,0.3); color: #f87171; border-bottom-left-radius: 4px; }

      .kbc-bub p { margin-bottom: 6px; }
      .kbc-bub p:last-child { margin-bottom: 0; }
      .kbc-bub ul, .kbc-bub ol { margin: 4px 0 4px 18px; }
      .kbc-bub li { margin-bottom: 3px; }
      .kbc-bub code {
        background: rgba(124,106,247,0.15); padding: 1px 5px;
        border-radius: 4px; font-size: 0.88em;
      }
      .kbc-bub pre {
        background: var(--s2); border: 1px solid var(--bd);
        border-radius: 8px; padding: 10px; overflow-x: auto;
        margin: 6px 0; font-size: 12px;
      }
      .kbc-bub pre code { background: none; padding: 0; }

      .kbc-time { font-size: 10px; color: var(--ts); margin-top: 3px; padding: 0 2px; }
      .kbc-row.user .kbc-time { text-align: right; }

      /* cursor */
      .kbc-cursor {
        display: inline-block; width: 7px; height: 13px;
        background: var(--a); border-radius: 2px; vertical-align: text-bottom;
        margin-left: 2px; animation: kbc-blink 0.8s infinite;
      }
      @keyframes kbc-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }

      /* typing */
      .kbc-dots { display: flex; gap: 4px; align-items: center; padding: 2px 0; }
      .kbc-dots span {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--a); opacity: 0.6;
        animation: kbc-bounce 1.2s infinite;
      }
      .kbc-dots span:nth-child(2){animation-delay:.15s}
      .kbc-dots span:nth-child(3){animation-delay:.3s}
      @keyframes kbc-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}

      /* sources */
      .kbc-sources { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--bd); }
      .kbc-chip {
        background: var(--s2); border: 1px solid var(--bd);
        border-radius: 20px; padding: 2px 9px; font-size: 11px;
        color: var(--ts); white-space: nowrap; max-width: 180px;
        overflow: hidden; text-overflow: ellipsis;
      }
      .kbc-chip a { color: var(--a); text-decoration: none; }
      .kbc-chip a:hover { text-decoration: underline; }

      /* welcome */
      .kbc-welcome {
        flex:1; display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        gap:10px; padding:24px 20px; text-align:center; color:var(--ts);
      }
      .kbc-welcome-icon { font-size:40px; }
      .kbc-welcome h3 { font-size:15px; font-weight:600; color:var(--tx); }
      .kbc-welcome p  { font-size:12px; line-height:1.6; max-width:280px; }
      .kbc-chips      { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; margin-top:6px; }
      .kbc-sug {
        background: var(--s2); border: 1px solid var(--bd);
        border-radius: 20px; padding: 5px 12px;
        font-size: 12px; cursor: pointer; color: var(--tx);
        font-family: inherit;
        transition: background 0.2s, border-color 0.2s;
      }
      .kbc-sug:hover { background: var(--a); border-color: var(--a); color: #fff; }

      /* ── input ── */
      .kbc-input-wrap {
        flex-shrink: 0;
        padding: 10px 12px 14px;
        border-top: 1px solid var(--bd);
        background: var(--s1);
      }
      .kbc-input-row {
        display: flex; align-items: flex-end; gap: 8px;
        background: var(--bg); border: 1px solid var(--bd);
        border-radius: 14px; padding: 8px 10px;
        transition: border-color 0.2s;
      }
      .kbc-input-row:focus-within { border-color: var(--a); box-shadow: 0 0 0 3px color-mix(in srgb, var(--a) 20%, transparent); }
      .kbc-ta {
        flex:1; background:none; border:none; outline:none;
        resize:none; font-family:inherit; font-size:13px;
        color:var(--tx); min-height:22px; max-height:100px;
        overflow-y:auto; line-height:1.5;
      }
      .kbc-ta::placeholder { color:var(--ts); }
      .kbc-send {
        flex-shrink:0; width:34px; height:34px; border-radius:10px;
        background:var(--a); border:none; color:#fff; font-size:15px;
        cursor:pointer; display:flex; align-items:center; justify-content:center;
        transition:background 0.2s, transform 0.1s;
      }
      .kbc-send:hover:not(:disabled) { filter:brightness(1.15); transform:scale(1.06); }
      .kbc-send:disabled { opacity:0.4; cursor:not-allowed; transform:none; }
      .kbc-hint { font-size:10px; color:var(--ts); text-align:right; margin-top:5px; }

      /* articulation pill buttons */
      .kbc-art-wrap {
        margin-top:8px;
        display:flex; flex-direction:column; gap:5px;
      }
      .kbc-art-label { font-size:10px; color:var(--ts); letter-spacing:0.04em; text-transform:uppercase; }
      .kbc-art-pills {
        display:flex; flex-wrap:wrap; gap:5px;
      }
      .kbc-art-btn {
        padding:3px 10px; border-radius:20px;
        border:1px solid var(--bd); background:transparent;
        color:var(--ts); font-size:11px; font-family:inherit;
        cursor:pointer; transition:all 0.18s; white-space:nowrap;
      }
      .kbc-art-btn:hover { border-color:var(--a); color:var(--tx); }
      .kbc-art-btn.active {
        background:color-mix(in srgb, var(--a) 18%, transparent);
        border-color:var(--a); color:var(--a); font-weight:600;
      }

      /* powered by */
      .kbc-powered {
        font-size:10px; color:var(--ts); text-align:center;
        padding-bottom:2px;
      }
      .kbc-powered a { color:var(--a); text-decoration:none; }
    `;
  }

  /* ── html ────────────────────────────────────────────────── */
  function buildHTML() {
    const sugs = cfg.suggestions.map(s =>
      `<button class="kbc-sug" data-sug="${s.replace(/"/g, '&quot;')}">${s}</button>`
    ).join('');

    return `
      <div class="kbc-root" id="kbcRoot">

        <!-- FAB -->
        <button class="kbc-fab" id="kbcFab" title="Chat">
          <svg class="icon-chat" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <svg class="icon-close" style="display:none" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          <span class="kbc-unread" id="kbcUnread">1</span>
        </button>

        <!-- Panel -->
        <div class="kbc-panel" id="kbcPanel">

          <!-- Header -->
          <div class="kbc-header">
            <div class="kbc-hav">🤖</div>
            <div>
              <div class="kbc-htitle">${cfg.title}</div>
              <div class="kbc-hsub" id="kbcSub">${cfg.subtitle}</div>
            </div>
            <div class="kbc-status" id="kbcDot"></div>
            <div class="kbc-hactions">
              <button class="kbc-hbtn" id="kbcTheme">🌙</button>
              <button class="kbc-hbtn" id="kbcClear">Clear</button>
            </div>
          </div>

          <!-- Messages -->
          <div class="kbc-msgs" id="kbcMsgs">
            <div class="kbc-welcome" id="kbcWelcome">
              <div class="kbc-welcome-icon">💬</div>
              <h3>Halo! Ada yang bisa saya bantu?</h3>
              <p>Tanyakan seputar harga, spesifikasi, perbandingan, atau kredit.</p>
              <div class="kbc-chips">${sugs}</div>
            </div>
          </div>

          <!-- Input -->
          <div class="kbc-input-wrap">
            <div class="kbc-input-row">
              <textarea class="kbc-ta" id="kbcInput" rows="1" placeholder="Ketik pesan…"></textarea>
              <button class="kbc-send" id="kbcSend">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            <div class="kbc-hint">Enter to send &nbsp;·&nbsp; Shift+Enter new line</div>
            <div class="kbc-art-wrap">
              <span class="kbc-art-label">Gaya bicara</span>
              <div class="kbc-art-pills" id="kbcArticulation">
                <button class="kbc-art-btn active" data-art="default">Default</button>
                <button class="kbc-art-btn" data-art="format">Format</button>
                <button class="kbc-art-btn" data-art="english_casual">EN Casual</button>
                <button class="kbc-art-btn" data-art="indonesian_casual">ID Casual</button>
                <button class="kbc-art-btn" data-art="indonesian_seller">ID Seller</button>
                <button class="kbc-art-btn" data-art="indonesian_cowok">ID Cowok</button>
              </div>
            </div>
            <div class="kbc-powered">Powered by <a href="https://babeh.com" target="_blank" rel="noopener">Babeh</a></div>
          </div>

        </div>
      </div>
    `;
  }

  /* ── helpers ─────────────────────────────────────────────── */
  function $q(sel) { return shadowRoot.querySelector(sel); }
  function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function ts()   { return new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }
  function scrollBot() { const m = $q('#kbcMsgs'); m.scrollTop = m.scrollHeight; }

  function stripCitationJson(text) {
    return text.replace(/\{\s*"cited_sources"\s*:\s*\[[\d\s,]*\]\s*\}/g, '').trim();
  }

  /* ── marked (lazy load) ──────────────────────────────────── */
  function ensureMarked() {
    if (typeof marked !== 'undefined') return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  function mdParse(text) {
    if (typeof marked !== 'undefined') return marked.parse(text);
    return esc(text).replace(/\n/g, '<br>');
  }

  /* ── message builders ────────────────────────────────────── */
  function hideWelcome() {
    const w = $q('#kbcWelcome');
    if (w) w.style.display = 'none';
  }

  function appendUserMsg(text) {
    hideWelcome();
    const msgs = $q('#kbcMsgs');
    const row = document.createElement('div');
    row.className = 'kbc-row user';
    row.innerHTML = `
      <div>
        <div class="kbc-bub">${esc(text)}</div>
        <div class="kbc-time">${ts()}</div>
      </div>
    `;
    msgs.appendChild(row);
    scrollBot();
  }

  function showTyping() {
    const msgs = $q('#kbcMsgs');
    const row = document.createElement('div');
    row.className = 'kbc-row bot'; row.id = 'kbcTyping';
    row.innerHTML = `<div class="kbc-bub"><div class="kbc-dots"><span></span><span></span><span></span></div></div>`;
    msgs.appendChild(row);
    scrollBot();
  }

  function removeTyping() {
    const el = $q('#kbcTyping');
    if (el) el.remove();
  }

  function createBotRow() {
    const msgs = $q('#kbcMsgs');
    const row = document.createElement('div');
    row.className = 'kbc-row bot';
    const bub = document.createElement('div');
    bub.className = 'kbc-bub';
    const content = document.createElement('div');
    bub.appendChild(content);
    row.appendChild(bub);
    msgs.appendChild(row);
    scrollBot();
    return { row, bub, content };
  }

  function appendError(text) {
    const msgs = $q('#kbcMsgs');
    const row = document.createElement('div');
    row.className = 'kbc-row err';
    row.innerHTML = `<div class="kbc-bub">${esc(text)}</div>`;
    msgs.appendChild(row);
    scrollBot();
  }

  function renderSources(sources, bub) {
    if (!sources || !sources.length) return;
    const seen = new Set();
    const unique = sources.filter(s => { if (seen.has(s.filename)) return false; seen.add(s.filename); return true; });
    const wrap = document.createElement('div');
    wrap.className = 'kbc-sources';
    unique.slice(0, 5).forEach(s => {
      const chip = document.createElement('div');
      chip.className = 'kbc-chip';
      const name = (s.filename || 'Source').substring(0, 35);
      chip.innerHTML = s.source_url
        ? `<a href="${esc(s.source_url)}" target="_blank" rel="noopener">${esc(name)}</a>`
        : esc(name);
      wrap.appendChild(chip);
    });
    bub.appendChild(wrap);
  }

  /* ── send ────────────────────────────────────────────────── */
  async function send(text) {
    text = (text || '').trim();
    if (!text || isStreaming) return;

    isStreaming = true;
    const sendBtn = $q('#kbcSend');
    const input   = $q('#kbcInput');
    sendBtn.disabled = true;
    input.value = '';
    autoResize();

    appendUserMsg(text);
    showTyping();

    let llmText = '';
    let citedSources = null;
    let botRow = null;

    try {
      await ensureMarked();

      const resp = await fetch(cfg.apiBaseUrl + '/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': cfg.apiKey,
          'X-Session-ID': sessionId(),
        },
        body: JSON.stringify({ query: text, articulation, conversation_history: conversationHistory }),

      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let created = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }

          if (data.type === 'results') {
            removeTyping();
            if (!created) { botRow = createBotRow(); created = true; }
          } else if (data.type === 'llm_chunk') {
            if (!created) { removeTyping(); botRow = createBotRow(); created = true; }
            llmText += data.text || '';
            botRow.content.innerHTML = mdParse(stripCitationJson(llmText)) + '<span class="kbc-cursor"></span>';
            scrollBot();
          } else if (data.type === 'cited_sources') {
            citedSources = data.sources || [];
          } else if (data.type === 'final_answer') {
            if (data.text) llmText = data.text;
          }
        }
      }

      removeTyping();
      if (!botRow) { botRow = createBotRow(); }
      botRow.content.innerHTML = mdParse(stripCitationJson(llmText) || '*(Tidak ada jawaban)*');
      renderSources(citedSources, botRow.bub);
      botRow.bub.insertAdjacentHTML('afterend', `<div class="kbc-time">${ts()}</div>`);
      scrollBot();

      // Only save to history if the KB actually returned sources.
      // If there were no KB results the LLM had nothing real to say — don't
      // carry that turn forward or it will bleed into the next question.
      const hadKbResults = Array.isArray(citedSources) && citedSources.length > 0;
      if (llmText && hadKbResults) {
        conversationHistory.push({ question: text, answer: stripCitationJson(llmText) });
        if (conversationHistory.length > 10) conversationHistory.shift();
      }

      // Show unread badge if panel is closed
      if (!isOpen) {
        const badge = $q('#kbcUnread');
        badge.classList.add('show');
      }

    } catch (err) {
      removeTyping();
      appendError('Gagal menghubungi server: ' + err.message);
    } finally {
      isStreaming = false;
      sendBtn.disabled = false;
      $q('#kbcInput').focus();
    }
  }

  /* ── auto resize textarea ────────────────────────────────── */
  function autoResize() {
    const ta = $q('#kbcInput');
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
  }

  /* ── toggle panel ────────────────────────────────────────── */
  function togglePanel() {
    isOpen = !isOpen;
    const panel = $q('#kbcPanel');
    const fab   = $q('#kbcFab');
    const badge = $q('#kbcUnread');
    panel.classList.toggle('open', isOpen);
    fab.classList.toggle('open', isOpen);
    if (isOpen) {
      badge.classList.remove('show');
      $q('#kbcInput').focus();
    }
  }

  /* ── health ──────────────────────────────────────────────── */
  async function checkHealth() {
    try {
      const r = await fetch(cfg.apiBaseUrl + '/health');
      if (r.ok) {
        $q('#kbcDot').classList.add('online');
        $q('#kbcSub').textContent = 'Online · siap membantu';
      }
    } catch { /* stay offline */ }
  }

  /* ── public API ──────────────────────────────────────────── */
  return {
    destroy() {
      const host = document.getElementById('kbaas-chat-host');
      if (host) host.remove();
      shadowRoot  = null;
      initialized = false;
      isOpen      = false;
      isStreaming  = false;
      cfg = {
        apiBaseUrl:  '',
        apiKey:      '',
        title:       'Tanya BABEH!',
        subtitle:    'AI-powered assistant',
        position:    'right',
        accentColor: '#7c6af7',
        suggestions: [],
      };
    },

    init(options = {}) {
      // Auto-destroy previous instance if re-initializing
      if (initialized) {
        this.destroy();
      }
      cfg = { ...cfg, ...options };

      // Create host element
      const host = document.createElement('div');
      host.id = 'kbaas-chat-host';
      const mountParent = cfg._mountTarget
        ? (document.querySelector(cfg._mountTarget) || document.body)
        : document.body;
      mountParent.appendChild(host);

      // Attach shadow root
      shadowRoot = host.attachShadow({ mode: 'open' });

      // Inject styles
      const style = document.createElement('style');
      style.textContent = buildCSS();
      shadowRoot.appendChild(style);

      // Inject HTML
      const wrapper = document.createElement('div');
      wrapper.innerHTML = buildHTML();
      while (wrapper.firstChild) shadowRoot.appendChild(wrapper.firstChild);

      // Wire events
      $q('#kbcFab').addEventListener('click', togglePanel);

      $q('#kbcClear').addEventListener('click', () => {
        resetSession();
        const msgs = $q('#kbcMsgs');
        msgs.innerHTML = '';
        // Re-append welcome
        const sugs = cfg.suggestions.map(s =>
          `<button class="kbc-sug" data-sug="${esc(s)}">${s}</button>`
        ).join('');
        msgs.innerHTML = `
          <div class="kbc-welcome" id="kbcWelcome">
            <div class="kbc-welcome-icon">💬</div>
            <h3>Halo! Ada yang bisa saya bantu?</h3>
            <p>Tanyakan seputar harga, spesifikasi, perbandingan, atau kredit.</p>
            <div class="kbc-chips">${sugs}</div>
          </div>
        `;
        bindSuggestions();
      });

      let dark = true;
      $q('#kbcTheme').addEventListener('click', () => {
        dark = !dark;
        $q('#kbcRoot').classList.toggle('light', !dark);
        $q('#kbcTheme').textContent = dark ? '🌙' : '☀️';
      });

      $q('#kbcArticulation').addEventListener('click', e => {
        const btn = e.target.closest('.kbc-art-btn');
        if (!btn) return;
        shadowRoot.querySelectorAll('.kbc-art-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        articulation = btn.dataset.art;
      });

      $q('#kbcSend').addEventListener('click', () => send($q('#kbcInput').value));

      $q('#kbcInput').addEventListener('input', autoResize);
      $q('#kbcInput').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($q('#kbcInput').value); }
      });

      // Inline/embedded mode — panel always open, FAB hidden
      if (cfg._mountTarget) {
        const override = document.createElement('style');
        override.textContent = `
          .kbc-fab  { display: none !important; }
          .kbc-panel {
            position: absolute !important;
            inset: 44px 0 0 0 !important;
            bottom: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            max-height: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            border: none !important;
            transform: scale(1) !important;
            opacity: 1 !important;
            pointer-events: all !important;
          }
          :host { position: absolute; inset: 0; display: block; }
        `;
        shadowRoot.appendChild(override);
        $q('.kbc-panel').classList.add('open');
        isOpen = true;
      }

      bindSuggestions();
      checkHealth();

      initialized = true;
    },

    open()  { if (!isOpen) togglePanel(); },
    close() { if  (isOpen) togglePanel(); },
    setArticulation(val) { articulation = val; },
    clearHistory() { conversationHistory = []; },
    send,
  };

  function bindSuggestions() {
    shadowRoot.querySelectorAll('.kbc-sug').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!isOpen) togglePanel();
        send(btn.dataset.sug || btn.textContent);
      });
    });
  }
})();

// Auto-init via data attributes on the script tag
(function autoInit() {
  const me = document.currentScript;
  if (!me) return;
  const apiBaseUrl  = me.dataset.apiBaseUrl  || me.dataset.apibase;
  const apiKey      = me.dataset.apiKey      || me.dataset.apikey;
  if (apiBaseUrl && apiKey) {
    document.addEventListener('DOMContentLoaded', () => {
      KBaaSChat.init({ apiBaseUrl, apiKey });
    });
  }
})();
