/**
 * KBaaS Widget — Development Build
 * Calls the KBaaS streaming API and renders an inline chat interface.
 * Replace this file with the production widget script when ready.
 */

;(function (window) {
  'use strict';

  var KBaaSWidget = {
    _config: null,
    _messagesEl: null,
    _inputEl: null,
    _sendBtn: null,
    _isStreaming: false,

    /* ── Init ─────────────────────────────────────── */
    init: function (config) {
      this._config = config || {};

      var container = document.getElementById('kbaas-widget');
      if (!container) {
        console.warn('[KBaaS] Container #kbaas-widget not found.');
        return;
      }

      this._render(container);
      this._bindEvents();
      this._addMessage('bot', '👋 Hallo..!');
    },

    /* ── Build DOM ────────────────────────────────── */
    _render: function (container) {
      container.innerHTML =
        '<div class="kbaas-chat">' +
          '<div class="kbaas-messages" id="kbaas-messages"></div>' +
          '<div class="kbaas-input-row">' +
            '<input' +
            '  type="text"' +
            '  class="kbaas-input"' +
            '  id="kbaas-input"' +
            '  placeholder="Tulis pertanyaan kamu..."' +
            '  autocomplete="off"' +
            '/>' +
            '<button class="kbaas-send-btn" id="kbaas-send-btn">Ask!</button>' +
          '</div>' +
        '</div>';

      this._messagesEl = container.querySelector('#kbaas-messages');
      this._inputEl    = container.querySelector('#kbaas-input');
      this._sendBtn    = container.querySelector('#kbaas-send-btn');
    },

    /* ── Events ───────────────────────────────────── */
    _bindEvents: function () {
      var self = this;

      this._sendBtn.addEventListener('click', function () {
        self._handleSend();
      });

      this._inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          self._handleSend();
        }
      });
    },

    _handleSend: function () {
      if (this._isStreaming) return;
      var query = this._inputEl.value.trim();
      if (!query) return;

      this._inputEl.value = '';
      this._addMessage('user', query);
      this._streamResponse(query);
    },

    /* ── Message Helpers ──────────────────────────── */
    _addMessage: function (role, text) {
      var msgEl   = document.createElement('div');
      msgEl.className = 'kbaas-msg ' + role;

      var bubble  = document.createElement('div');
      bubble.className = 'kbaas-bubble';
      bubble.textContent = text;

      msgEl.appendChild(bubble);
      this._messagesEl.appendChild(msgEl);
      this._scrollToBottom();
      return msgEl;
    },

    _scrollToBottom: function () {
      if (this._messagesEl) {
        this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
      }
    },

    _setStreaming: function (state) {
      this._isStreaming      = state;
      this._sendBtn.disabled = state;
      this._inputEl.disabled = state;
      if (!state) { this._inputEl.focus(); }
    },

    /* ── Streaming API Call ───────────────────────── */
    _streamResponse: async function (query) {
      var self    = this;
      var config  = this._config;
      var apiUrl  = (config.apiUrl  || 'http://localhost:8000/api').replace(/\/$/, '');
      var apiKey  = config.apiKey   || '';

      // Create empty bot bubble & show typing dots
      var msgEl  = this._addMessage('bot', '');
      var bubble = msgEl.querySelector('.kbaas-bubble');
      bubble.innerHTML =
        '<div class="kbaas-typing">' +
          '<span></span><span></span><span></span>' +
        '</div>';

      this._setStreaming(true);

      var fullText   = '';
      var firstChunk = true;

      try {
        var response = await fetch(apiUrl + '/chat/stream', {
          method: 'POST',
          headers: {
            'accept':       'application/json',
            'x-api-key':    apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: query }),
        });

        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ' ' + response.statusText);
        }

        var reader  = response.body.getReader();
        var decoder = new TextDecoder();

        while (true) {
          var result = await reader.read();
          if (result.done) break;

          var chunk = decoder.decode(result.value, { stream: true });
          var lines = chunk.split('\n');

          for (var i = 0; i < lines.length; i++) {
            var text = self._parseLine(lines[i]);
            if (text === null) continue;

            if (firstChunk) {
              bubble.textContent = '';
              firstChunk = false;
            }
            fullText += text;
            bubble.textContent = self._stripCitations(fullText);
            self._scrollToBottom();
          }
        }

        if (!fullText.trim()) {
          bubble.textContent = 'Maaf, tidak ada respons dari server.';
        } else {
          bubble.textContent = self._stripCitations(fullText);
        }

      } catch (err) {
        console.error('[KBaaS] Stream error:', err);
        bubble.textContent = 'Terjadi kesalahan: ' + err.message;
        bubble.style.color = '#ff6b6b';
      }

      this._setStreaming(false);
    },

    /* ── Response Parsers ─────────────────────────── */
    _parseLine: function (line) {
      if (!line.trim()) return null;

      // SSE format: "data: ..."
      if (line.startsWith('data: ')) {
        var data = line.slice(6).trim();
        if (data === '[DONE]') return null;
        return this._extractText(data);
      }

      // Plain JSON line or raw text
      return this._extractText(line);
    },

    _stripCitations: function (text) {
      // Remove any trailing/inline JSON blobs that are not part of the answer
      // e.g. {"cited_sources": [1, 2]} or {"sources": [...]} appended to text
      return text
        .replace(/\s*\{[^{}]*"cited_sources"[^{}]*\}/g, '')
        .replace(/\s*\{[^{}]*"sources"[^{}]*\}/g, '')
        .trimEnd();
    },

    _extractText: function (raw) {
      try {
        var json = JSON.parse(raw);
        // Only render llm_chunk events; silently drop everything else
        if (json.type !== undefined && json.type !== 'llm_chunk') return null;
        return json.text
          || json.content
          || (json.delta  && json.delta.content)
          || json.answer
          || json.response
          || json.message
          || null;
      } catch (e) {
        return raw.trim() || null;
      }
    },
  };

  // Expose globally; do not overwrite if production widget already loaded
  if (!window.KBaaSWidget) {
    window.KBaaSWidget = KBaaSWidget;
  }

})(window);
