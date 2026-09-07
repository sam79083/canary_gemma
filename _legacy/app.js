// ==========================================================================
// Gemma 4 Chat — App Logic
// ==========================================================================

// DOM elements
const downloadOverlay = document.getElementById('download-overlay');
const downloadBar = document.getElementById('download-bar');
const downloadPct = document.getElementById('download-pct');
const downloadStatus = document.getElementById('download-status');
const modelDot = document.getElementById('model-dot');
const modelStatus = document.getElementById('model-status');
const sidebarStatus = document.getElementById('sidebar-status');
const messagesEl = document.getElementById('messages');
const promptInput = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const themeToggle = document.getElementById('theme-toggle');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importLabel = importBtn?.closest('label');
const sessionSelect = document.getElementById('session-select');
const refreshSessionsBtn = document.getElementById('refresh-sessions-btn');
const fileTree = document.getElementById('file-tree');
const searchBtn = document.getElementById('search-btn');
// Full-screen editor
const editorOverlay = document.getElementById('editor-overlay');
const editorPath = document.getElementById('editor-path');
const editorTextarea = document.getElementById('editor-textarea');
const editorStatus = document.getElementById('editor-status');
const editorDirty = document.getElementById('editor-dirty');
const editorCount = document.getElementById('editor-count');
const editorCloseBtn = document.getElementById('editor-close-btn');
const editorCancelBtn = document.getElementById('editor-cancel-btn');
const editorSaveBtn = document.getElementById('editor-save-btn');
const editorSendBtn = document.getElementById('editor-send-btn');
const editorInstruction = document.getElementById('editor-instruction');
const editorAiBtn = document.getElementById('editor-ai-btn');
const editorToast = document.getElementById('editor-toast');
const quotaText = document.getElementById('quota-text');
const quotaRefreshBtn = document.getElementById('quota-refresh-btn');
const quotaBox = document.querySelector('.quota-box');

// State
let session = null;
let isStreaming = false;
let sessionCreationTriggered = false;
let messageHistory = [];

// Editor state — the file currently open in the full-screen editor
let currentEditingPath = null;
let originalEditorContent = '';
let isAiEditing = false;

// Constants
const STORAGE_KEY = 'gemma4-chat-history';
const THEME_KEY = 'theme';

function addMessage(content, role = 'assistant') {
    messageHistory.push({ role, content });
    saveHistory();

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    const avatar = role === 'user' ? 'U' : 'G';
    msgDiv.innerHTML = `
        <div class="avatar">${avatar}</div>
        <div class="content">${escapeHtml(content)}</div>
    `;
    messagesEl.appendChild(msgDiv);
    scrollToBottom();
}

function addTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = `
        <div class="avatar">G</div>
        <div class="content">
            <div class="typing-indicator">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        </div>
    `;
    messagesEl.appendChild(typingDiv);
    scrollToBottom();
}

function removeTypingIndicator() {
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
}

function appendStreamingContent(textChunk) {
    let contentEl = document.getElementById('streaming-content');
    if (!contentEl) {
        const typing = document.getElementById('typing-indicator');
        if (typing) {
            typing.removeAttribute('id');
            typing.innerHTML = '<div class="avatar">G</div><div class="content" id="streaming-content"></div>';
            contentEl = document.getElementById('streaming-content');
        } else {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message assistant';
            msgDiv.innerHTML = '<div class="avatar">G</div><div class="content" id="streaming-content"></div>';
            messagesEl.appendChild(msgDiv);
            contentEl = document.getElementById('streaming-content');
            scrollToBottom();
        }
    }
    contentEl.innerHTML += escapeHtml(textChunk);
    scrollToBottom();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function saveHistory() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messageHistory));
    } catch (e) {
        console.error('Failed to save history:', e);
    }
}

function loadHistory() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            messageHistory = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load history:', e);
    }
}

function clearHistory() {
    messageHistory = [];
    localStorage.removeItem(STORAGE_KEY);
}

function renderHistory(history) {
    messagesEl.innerHTML = '';
    messageHistory = [];
    for (const msg of history) {
        addMessage(msg.content, msg.role);
    }
    scrollToBottom();
}

async function restoreSession(history) {
    if (!('LanguageModel' in self)) {
        setModelStatus('LanguageModel not supported', false);
        return;
    }

    const availability = await LanguageModel.availability();
    if (availability === 'unavailable') {
        setModelStatus('Model unavailable', false);
        return;
    }

    try {
        setModelStatus('Restoring…', true);
        session = await LanguageModel.create({
            monitor(m) {
                m.addEventListener('downloadprogress', (e) => {
                    const pct = e.loaded * 100;
                    showDownload(true, pct, `Downloading Gemma 4… ${Math.round(pct)}%`);
                    setModelStatus(`Downloading… ${Math.round(pct)}%`, true);
                });
            },
        });

        showDownload(false);

        for (const msg of history) {
            await session.append(`${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`);
        }

        setModelStatus('Ready — Gemma 4 on-device', true);
        setReadyState(true);
        promptInput.focus();
    } catch (err) {
        setModelStatus(`Error: ${err.message}`, false);
        session = null;
    }
}

// Server-based session persistence
function generateTitle(history) {
    const firstUser = history.find(m => m.role === 'user');
    if (!firstUser) return 'New conversation';
    const text = firstUser.content.slice(0, 50);
    return text.length >= 50 ? text + '…' : text;
}

async function saveSessionToServer() {
    if (messageHistory.length === 0) return;
    try {
        const title = generateTitle(messageHistory);
        const payload = { title, messages: messageHistory, timestamp: Date.now() };
        await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error('Auto-save to server failed:', e);
    }
}

async function loadSessionList() {
    if (!sessionSelect) return;
    try {
        const resp = await fetch('/api/sessions');
        const data = await resp.json();
        if (data.sessions && data.sessions.length > 0) {
            sessionSelect.innerHTML = '<option value="">💬 Load session…</option>' +
                data.sessions.map(s => `<option value="${s.filename}">${s.title} (${new Date(s.timestamp).toLocaleString()})</option>`).join('');
        } else {
            sessionSelect.innerHTML = '<option value="">No saved sessions</option>';
        }
    } catch (e) {
        sessionSelect.innerHTML = '<option value="">(server unavailable)</option>';
    }
}

async function loadSessionFromFile(filename) {
    if (!filename) return;
    try {
        const resp = await fetch(`/api/session/${filename}`);
        const data = await resp.json();
        const history = data.messages || data; // backward compat
        if (Array.isArray(history)) {
            renderHistory(history);
            destroySession();
            await restoreSession(history);
        }
    } catch (e) {
        console.error('Failed to load session:', e);
    }
}

// SerpAPI quota — searches left this month
async function loadQuota() {
    if (!quotaText) return;
    quotaText.textContent = '🔍 Checking searches left…';
    try {
        const resp = await fetch('/api/quota');
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        const left = data.total_searches_left ?? data.plan_searches_left;
        const total = data.searches_per_month;
        quotaText.textContent =
            `🔍 ${left} / ${total} searches left (${data.plan_name || 'plan'}, renews ${data.plan_renewal_date || '?'})`;
        quotaBox?.classList.toggle('low', typeof left === 'number' && left < 25);
        console.log('[quota]', data);
    } catch (e) {
        quotaText.textContent = '🔍 Quota unavailable';
        console.warn('[quota] failed:', e);
    }
}

function showDownload(show, pct = 0, status = '') {
    if (show) {
        downloadOverlay.classList.remove('hidden');
        downloadBar.style.width = pct + '%';
        downloadPct.textContent = Math.round(pct) + '%';
        if (status) downloadStatus.textContent = status;
    } else {
        downloadOverlay.classList.add('hidden');
    }
}

function setModelStatus(text, isOnline = true) {
    modelStatus.textContent = text;
    modelDot.style.background = isOnline ? '#2e7d32' : '#ccc';
    sidebarStatus.textContent = text;
}

function setReadyState(ready) {
    promptInput.disabled = !ready;
    sendBtn.disabled = !ready;
    if (searchBtn) searchBtn.disabled = !ready;
    newChatBtn.disabled = !ready;
}

async function checkAvailability() {
    if (!('LanguageModel' in self)) {
        setModelStatus('Not supported — use Chrome 148+ / Canary', false);
        return false;
    }

    try {
        const availability = await LanguageModel.availability();
        setModelStatus(`Available: ${availability}`, availability !== 'unavailable');
        return availability !== 'unavailable';
    } catch (err) {
        setModelStatus(`Error: ${err.message}`, false);
        return false;
    }
}

async function createSession() {
    if (sessionCreationTriggered || session !== null) return;

    sessionCreationTriggered = true;
    setReadyState(false);

    try {
        setModelStatus('Downloading Gemma 4…', true);
        showDownload(true, 0, 'Starting download…');

        session = await LanguageModel.create({
            monitor(m) {
                m.addEventListener('downloadprogress', (e) => {
                    const pct = e.loaded * 100;
                    showDownload(true, pct, pct < 100
                        ? `Downloading Gemma 4… ${Math.round(pct)}%`
                        : 'Extracting model…'
                    );
                    setModelStatus(`Downloading… ${Math.round(pct)}%`, true);
                });
            },
        });

        showDownload(false);
        setModelStatus('Ready — Gemma 4 on-device', true);
        setReadyState(true);

    } catch (err) {
        setModelStatus(`Error: ${err.message}`, false);
        showDownload(false);
        session = null;
    } finally {
        sessionCreationTriggered = false;
    }
}

function destroySession() {
    if (session) {
        session.destroy();
        session = null;
    }
    setModelStatus('Session destroyed', false);
    setReadyState(false);
}

async function handleSend() {
    if (!session || isStreaming) return;

    const prompt = promptInput.value.trim();
    if (!prompt) return;

    isStreaming = true;
    sendBtn.disabled = true;
    if (searchBtn) searchBtn.disabled = true;
    promptInput.value = '';
    promptInput.disabled = true;
    sendBtn.textContent = '●';

    addMessage(prompt, 'user');
    addTypingIndicator();

    let fullResponse = '';

    try {
        const stream = session.promptStreaming(prompt);
        for await (const chunk of stream) {
            fullResponse += chunk;
            appendStreamingContent(chunk);
        }
        if (fullResponse.trim()) {
            messageHistory.push({ role: 'assistant', content: fullResponse });
            saveHistory();
        }
    } catch (err) {
        removeTypingIndicator();
        addMessage(`Error: ${err.message}`);
    } finally {
        isStreaming = false;
        sendBtn.disabled = false;
        if (searchBtn) searchBtn.disabled = false;
        promptInput.disabled = false;
        sendBtn.textContent = '➤';
        removeTypingIndicator();
        const prevStreaming = document.getElementById('streaming-content');
        if (prevStreaming) prevStreaming.removeAttribute('id');
        promptInput.focus();
        await saveSessionToServer();
    }
}

function destroySessionAndReset() {
    destroySession();
    clearHistory();
    messagesEl.innerHTML = '';
    checkAvailability().then(supported => {
        if (supported) createSession();
    });
}

// File tree — server-based CRUD
async function loadFileTree(path = '') {
    if (!fileTree) return;
    try {
        const resp = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
        const data = await resp.json();
        if (data.error) {
            fileTree.innerHTML = `<div style="padding:8px;color:var(--text-muted);font-size:13px;">${data.error}</div>`;
            return;
        }
        renderFileTree(data.entries, path, fileTree);
    } catch (e) {
        fileTree.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:13px;">Failed to load files</div>';
    }
}

function setupFileTreeContextMenu() {
    if (!fileTree) return;
    fileTree.addEventListener('contextmenu', (e) => {
        // Empty-area only: item right-clicks are handled on the item itself.
        // (Old check `closest('.file-tree') === fileTree` also matched items → double menu.)
        if (e.target === fileTree) {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, true, '', '');
        }
    });
}

function renderFileTree(entries, parentPath, container) {
    if (!container) return;
    container.innerHTML = '';
    for (const entry of entries) {
        const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

        if (entry.kind === 'directory') {
            // Wrapper keeps the row and its children stacked (not flex-row),
            // so nested levels indent hierarchically.
            const wrapper = document.createElement('div');
            wrapper.className = 'file-tree-folder';

            const item = document.createElement('div');
            item.className = 'file-tree-item folder';
            item.innerHTML = `<span class="arrow">▸</span><span class="icon">📁</span><span class="name">${escapeHtml(entry.name)}</span>`;

            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'file-tree-children collapsed';

            // Whole row left-click expands / collapses
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                const collapsed = childrenContainer.classList.toggle('collapsed');
                wrapper.classList.toggle('open', !collapsed);
                if (collapsed) return;
                // Load children on expand
                childrenContainer.innerHTML = '<div style="padding:4px 8px;font-size:12px;color:var(--status-text);">Loading…</div>';
                try {
                    const resp = await fetch(`/api/files?path=${encodeURIComponent(fullPath)}`);
                    const data = await resp.json();
                    if (data.entries) {
                        if (data.entries.length === 0) {
                            childrenContainer.innerHTML = '<div style="padding:4px 8px;font-size:12px;color:var(--status-text);">(empty)</div>';
                        } else {
                            renderFileTree(data.entries, fullPath, childrenContainer);
                        }
                    } else {
                        childrenContainer.innerHTML = `<div style="padding:4px 8px;font-size:12px;">${escapeHtml(data.error || 'Failed to load')}</div>`;
                    }
                } catch (err) {
                    console.error('Failed to load subdirectory:', err);
                    childrenContainer.innerHTML = '<div style="padding:4px 8px;font-size:12px;">Failed to load</div>';
                }
            });

            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(e.clientX, e.clientY, true, fullPath, parentPath);
            });

            wrapper.appendChild(item);
            wrapper.appendChild(childrenContainer);
            container.appendChild(wrapper);
            continue;
        }

        const item = document.createElement('div');
        item.className = 'file-tree-item';
        item.innerHTML = `<span class="arrow-placeholder"></span><span class="icon">📄</span><span class="name">${escapeHtml(entry.name)}</span>`;
        item.addEventListener('click', () => {
            openFileEditor(fullPath);
        });

        // Context menu
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, false, fullPath, parentPath);
        });

        container.appendChild(item);
    }
}

function showContextMenu(x, y, isDir, fullPath, parentPath) {
    const existing = document.getElementById('file-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'file-context-menu';
    menu.style.cssText = `
        position: fixed; left: ${x}px; top: ${y}px;
        background: var(--model-bar-bg); border: 1px solid var(--border);
        border-radius: 6px; padding: 4px 0; z-index: 1000;
        min-width: 160px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;

    const name = fullPath.split('/').pop();

    const actions = [];

    if (isDir) {
        actions.push({ label: '📄 New File', fn: async () => {
            const fname = prompt('File name:');
            if (fname) {
                const newFullPath = fullPath ? `${fullPath}/${fname}` : fname;
                await fetch('/api/file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: newFullPath, content: '' })
                });
                loadFileTree(parentPath);
                openFileEditor(newFullPath);
            }
        }});
        actions.push({ label: '📁 New Folder', fn: async () => {
            const fname = prompt('Folder name:');
            if (fname) {
                const newFullPath = fullPath ? `${fullPath}/${fname}` : fname;
                await fetch('/api/mkdir', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: newFullPath })
                });
                loadFileTree(parentPath);
            }
        }});
    } else {
        actions.push({ label: '✏️ Edit', fn: () => {
            openFileEditor(fullPath);
        }});
        actions.push({ label: '📋 Copy Path', fn: () => {
            navigator.clipboard.writeText(fullPath);
        }});
    }

    // Never offer Delete for the background/root entry — that would target BASE_DIR
    if (fullPath) {
        actions.push({ label: '🗑️ Delete', fn: async () => {
            if (confirm(`Delete ${name}?`)) {
                await fetch(`/api/file?path=${encodeURIComponent(fullPath)}`, { method: 'DELETE' });
                loadFileTree(parentPath);
            }
        }});
    }

    actions.push({ label: 'Cancel', fn: () => {} });

    for (const a of actions) {
        const btn = document.createElement('div');
        btn.textContent = a.label;
        btn.style.cssText = 'padding: 8px 12px; cursor: pointer; font-size: 13px;';
        btn.onmouseover = () => btn.style.background = 'var(--border)';
        btn.onmouseout = () => btn.style.background = 'transparent';
        btn.onclick = () => { menu.remove(); a.fn(); };
        menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    document.addEventListener('click', () => menu.remove(), { once: true });
}

// Full-screen file editor — user edits here, model sees contents via "Send to Model"
async function openFileEditor(fullPath) {
    if (!editorOverlay) return;
    currentEditingPath = fullPath;
    originalEditorContent = '';
    editorPath.textContent = fullPath;
    editorTextarea.value = '';
    editorStatus.textContent = 'Loading…';
    editorDirty.classList.add('hidden');
    updateEditorCount();
    editorOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    editorTextarea.focus();

    try {
        const resp = await fetch(`/api/file?path=${encodeURIComponent(fullPath)}`);
        const data = await resp.json();
        if (data.content !== undefined) {
            originalEditorContent = data.content;
            editorTextarea.value = data.content;
            editorStatus.textContent = '';
        } else {
            editorStatus.textContent = data.error || 'Failed to read file';
        }
    } catch (e) {
        editorStatus.textContent = 'Failed to read file: ' + e.message;
    }
    updateEditorCount();
    updateEditorDirty();
    editorTextarea.focus();
}

function closeFileEditor() {
    if (!editorOverlay) return;
    if (editorTextarea.value !== originalEditorContent) {
        if (!confirm('Discard unsaved changes?')) return;
    }
    editorOverlay.classList.add('hidden');
    document.body.style.overflow = '';
    currentEditingPath = null;
}

async function saveFileEditor() {
    if (!currentEditingPath) return false;
    const content = editorTextarea.value;
    // No-op save was confusing ("nothing happens") — say so explicitly
    if (content === originalEditorContent) {
        editorStatus.textContent = 'No changes — file already up to date ✓';
        editorStatus.classList.remove('success');
        showEditorToast('No changes to save');
        console.log('[Save] no changes, skipping POST');
        return 'unchanged';
    }
    editorStatus.textContent = 'Saving…';
    editorStatus.classList.remove('success');
    console.log('[Save] POST /api/file', currentEditingPath, content.length + ' chars');
    try {
        const resp = await fetch('/api/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentEditingPath, content })
        });
        const data = await resp.json();
        console.log('[Save] response:', resp.status, data);
        if (data.success === false || !resp.ok) {
            const msg = 'Save failed: ' + (data.error || resp.status);
            editorStatus.textContent = msg;
            showEditorToast(msg, true);
            return false;
        }
        // Verify: re-read from disk and compare — proves it really saved
        try {
            const verify = await fetch(`/api/file?path=${encodeURIComponent(currentEditingPath)}`);
            const vdata = await verify.json();
            if (vdata.content === content) {
                const lines = content === '' ? 0 : content.split('\n').length;
                const msg = `Saved ✓ ${currentEditingPath} (${lines} lines, ${content.length} chars) — verified on disk at ${new Date().toLocaleTimeString()}`;
                originalEditorContent = content;
                updateEditorDirty();
                editorStatus.textContent = msg;
                editorStatus.classList.add('success');
                showEditorToast(`Saved ✓ ${currentEditingPath}`);
                loadFileTree();
                console.log('[Save] verified OK');
                return true;
            } else {
                const msg = 'Save sent but verify mismatch — disk differs!';
                editorStatus.textContent = msg;
                showEditorToast(msg, true);
                console.warn('[Save] verify mismatch', { sent: content.length, got: (vdata.content || '').length });
                return false;
            }
        } catch (verr) {
            // POST succeeded but verify read failed — still treat as saved
            originalEditorContent = content;
            updateEditorDirty();
            editorStatus.textContent = `Saved ✓ ${new Date().toLocaleTimeString()} (verify read failed: ${verr.message})`;
            editorStatus.classList.add('success');
            showEditorToast(`Saved ✓ ${currentEditingPath}`);
            loadFileTree();
            return true;
        }
    } catch (e) {
        console.error('[Save] failed:', e);
        editorStatus.textContent = 'Save failed: ' + e.message;
        showEditorToast('Save failed: ' + e.message, true);
        return false;
    }
}

let editorToastTimer = null;
function showEditorToast(msg, isError = false) {
    if (!editorToast) return;
    editorToast.textContent = msg;
    editorToast.classList.toggle('error', isError);
    editorToast.classList.remove('hidden');
    clearTimeout(editorToastTimer);
    editorToastTimer = setTimeout(() => editorToast.classList.add('hidden'), 3000);
}

// Simple factual diff: common prefix/suffix trim, middle = changed hunk
function summarizeDiff(oldText, newText, maxPreview = 12) {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    let prefix = 0;
    while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
    let suffix = 0;
    while (
        suffix < oldLines.length - prefix &&
        suffix < newLines.length - prefix &&
        oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
    ) suffix++;
    const oldMid = oldLines.slice(prefix, oldLines.length - suffix);
    const newMid = newLines.slice(prefix, newLines.length - suffix);
    const preview = [];
    preview.push(`--- lines ${prefix + 1}–${prefix + oldMid.length} removed (${oldMid.length}) / added (${newMid.length}) ---`);
    for (const l of oldMid.slice(0, maxPreview)) preview.push('- ' + (l.length > 160 ? l.slice(0, 160) + '…' : l));
    if (oldMid.length > maxPreview) preview.push(`… (${oldMid.length - maxPreview} more removed)`);
    for (const l of newMid.slice(0, maxPreview)) preview.push('+ ' + (l.length > 160 ? l.slice(0, 160) + '…' : l));
    if (newMid.length > maxPreview) preview.push(`… (${newMid.length - maxPreview} more added)`);
    if (oldMid.length === 0 && newMid.length === 0) preview.push('(no line changes — whitespace only?)');
    return {
        oldCount: oldLines.length, newCount: newLines.length,
        removed: oldMid.length, added: newMid.length,
        preview: preview.join('\n')
    };
}

async function sendFileToModelAndClose() {
    if (!currentEditingPath) return;
    // Auto-save first if dirty so disk + model stay in sync
    if (editorTextarea.value !== originalEditorContent) {
        await saveFileEditor();
    }
    const content = editorTextarea.value;
    const header = `File: ${currentEditingPath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
    // Put the full file contents into the chat input so both you and the model see it
    if (promptInput.value.trim()) {
        promptInput.value = promptInput.value.trimEnd() + '\n\n' + header;
    } else {
        promptInput.value = header;
    }
    editorOverlay.classList.add('hidden');
    document.body.style.overflow = '';
    currentEditingPath = null;
    promptInput.focus();
}

function updateEditorDirty() {
    if (!editorDirty) return;
    const dirty = editorTextarea.value !== originalEditorContent;
    editorDirty.classList.toggle('hidden', !dirty);
}

function updateEditorCount() {
    if (!editorCount) return;
    const len = editorTextarea.value.length;
    const lines = editorTextarea.value === '' ? 0 : editorTextarea.value.split('\n').length;
    editorCount.textContent = `${lines} lines • ${len} chars`;
}

function initFileEditor() {
    if (!editorOverlay) return;
    editorCloseBtn?.addEventListener('click', closeFileEditor);
    editorCancelBtn?.addEventListener('click', closeFileEditor);
    editorSaveBtn?.addEventListener('click', saveFileEditor);
    editorSendBtn?.addEventListener('click', sendFileToModelAndClose);
    editorAiBtn?.addEventListener('click', handleAiEdit);
    editorInstruction?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAiEdit();
        }
        e.stopPropagation();
    });
    editorTextarea?.addEventListener('input', () => {
        updateEditorDirty();
        updateEditorCount();
        if (editorStatus.textContent.startsWith('Saved') || editorStatus.textContent.startsWith('No changes')) {
            editorStatus.textContent = '';
            editorStatus.classList.remove('success');
        }
    });
    document.addEventListener('keydown', (e) => {
        if (editorOverlay.classList.contains('hidden')) return;
        // Don't hijack Esc / Ctrl+S while typing the AI instruction — let input behave normally except Enter
        if (document.activeElement === editorInstruction) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveFileEditor();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeFileEditor();
        }
    });
}

function stripCodeFences(text) {
    let t = text.trim();
    // Remove a single wrapping ```...``` block (with optional language tag).
    // Allow missing trailing newline: ```js\ncode\n``` or ```js\ncode```
    const fenceMatch = t.match(/^```[\w+-]*\s*\n([\s\S]*?)\s*```$/);
    if (fenceMatch) return fenceMatch[1].trim();
    // Fallback: strip stray leading/trailing fence lines
    t = t.replace(/^```[\w+-]*\s*\n/, '').replace(/\s*\n?```$/, '').trim();
    return t;
}

async function handleAiEdit() {
    console.log('[AI Edit] clicked', { path: currentEditingPath, isAiEditing, hasSession: !!session, isStreaming });
    if (!currentEditingPath) {
        console.warn('[AI Edit] no file open');
        if (editorStatus) editorStatus.textContent = 'Open a file first';
        return;
    }
    if (isAiEditing) {
        console.warn('[AI Edit] already running');
        return;
    }
    const instruction = editorInstruction?.value.trim() || promptInput.value.trim();
    console.log('[AI Edit] instruction:', instruction);
    if (!instruction) {
        editorStatus.textContent = 'Type an instruction for the AI first';
        editorInstruction?.focus();
        return;
    }
    if (!session) {
        console.warn('[AI Edit] session is null — model not ready');
        editorStatus.textContent = 'Model not ready yet — wait for "Ready — Gemma 4" in the top bar (see F12 Console)';
        return;
    }
    if (isStreaming) {
        editorStatus.textContent = 'Model is busy in chat — wait a moment';
        return;
    }

    isAiEditing = true;
    editorAiBtn.disabled = true;
    editorAiBtn.textContent = '⏳ Editing…';
    editorStatus.textContent = 'AI is reading the file and rewriting it… (watch F12 Console)';

    const currentContent = editorTextarea.value;
    console.log('[AI Edit] file chars:', currentContent.length, 'path:', currentEditingPath);
    const aiPrompt =
        `You are an expert code editor. Rewrite the file exactly as instructed.\n\n` +
        `File path: ${currentEditingPath}\n\n` +
        `<FILE>\n${currentContent}\n</FILE>\n\n` +
        `Instruction: ${instruction}\n\n` +
        `Rules:\n` +
        `- Return ONLY the complete updated file contents, nothing else.\n` +
        `- No explanations, no markdown fences, no commentary.\n` +
        `- Preserve everything unrelated to the instruction.`;

    // Keep a backup so a bad AI result never loses work
    const backup = currentContent;

    try {
        let result = '';
        let gotChunk = false;
        try {
            console.log('[AI Edit] calling session.promptStreaming…');
            const stream = session.promptStreaming(aiPrompt);
            for await (const chunk of stream) {
                gotChunk = true;
                result += chunk;
                // Live preview: stream directly into the editor so you SEE it working
                editorTextarea.value = stripCodeFences(result);
                updateEditorCount();
                editorStatus.textContent = `AI writing… ${result.length} chars (live preview)`;
            }
            console.log('[AI Edit] stream done, total chars:', result.length, 'gotChunk:', gotChunk);
        } catch (streamErr) {
            console.warn('[AI Edit] promptStreaming failed, trying session.prompt:', streamErr);
            editorStatus.textContent = 'Streaming failed, retrying non-stream…';
            result = await session.prompt(aiPrompt);
            console.log('[AI Edit] session.prompt done, chars:', result?.length);
        }
        result = stripCodeFences(result);
        console.log('[AI Edit] after fence-strip chars:', result.length);
        if (!result) {
            editorStatus.textContent = 'AI returned empty output — nothing applied (restored original)';
            editorTextarea.value = backup;
            updateEditorCount();
            return;
        }
        editorTextarea.value = result;
        updateEditorDirty();
        updateEditorCount();
        editorStatus.textContent = '✨ AI edit applied — saving…';
        console.log('[AI Edit] applied to textarea, now auto-saving…');
        const diff = summarizeDiff(backup, result);
        console.log('[AI Edit] diff:', diff);
        const saveOk = await saveFileEditor();
        console.log('[AI Edit] save finished:', saveOk, editorStatus.textContent);
        // Post to chat history so you can SEE what changed (close editor to view)
        const userMsg = `✨ AI Edit ${currentEditingPath}: ${instruction}`;
        const aiMsg =
            `Edited ${currentEditingPath} (${diff.oldCount}→${diff.newCount} lines, +${diff.added}/-${diff.removed}). ` +
            (saveOk === true ? 'Saved ✓ verified on disk.' : saveOk === 'unchanged' ? 'No save needed — output identical.' : 'Save FAILED — see editor status.') +
            `\n\n${diff.preview}`;
        addMessage(userMsg, 'user');
        addMessage(aiMsg, 'assistant');
        saveSessionToServer();
        if (editorInstruction) editorInstruction.value = '';
        showEditorToast(saveOk === false ? 'AI edit applied but save FAILED' : `AI edit saved ✓ ${currentEditingPath}`);
    } catch (err) {
        console.error('[AI Edit] failed:', err);
        editorStatus.textContent = 'AI edit failed: ' + err.message + ' (see F12 Console)';
    } finally {
        isAiEditing = false;
        editorAiBtn.disabled = false;
        editorAiBtn.textContent = '✨ AI Edit';
    }
}

// Web Search — via backend /api/search proxy (avoids CORS, keeps key server-side)
async function webSearch(query) {
    try {
        console.log('[search] querying /api/search:', query);
        const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const text = await resp.text();
        console.log('[search] raw status:', resp.status, 'first 200 chars:', text.slice(0, 200));
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            // Backend returned HTML (usually old server.py without /api/search → 404 page)
            if (text.trimStart().startsWith('<')) {
                return { results: [], error: `Backend returned HTML, not JSON (HTTP ${resp.status}). Restart server.py to load the new /api/search endpoint.` };
            }
            return { results: [], error: `Bad JSON from backend (HTTP ${resp.status})` };
        }
        console.log('[search] backend response:', resp.status, data);
        if (!resp.ok) {
            return { results: [], error: data.error || `Search HTTP ${resp.status}` };
        }
        return { results: data.results || [], error: data.error || null };
    } catch (e) {
        console.warn('[search] failed:', e);
        return { results: [], error: e.message };
    }
}

async function handleSearchAndAsk() {
    if (!session || isStreaming) return;

    const prompt = promptInput.value.trim();
    if (!prompt) return;

    isStreaming = true;
    sendBtn.disabled = true;
    searchBtn.disabled = true;
    promptInput.value = '';
    promptInput.disabled = true;
    sendBtn.textContent = '●';
    searchBtn.textContent = '⏳';

    addMessage(prompt, 'user');
    addTypingIndicator();

    let fullResponse = '';

    try {
        // Fetch search results via backend proxy
        setModelStatus('Searching the web…', true);
        removeTypingIndicator();
        addMessage(`🔍 Searching Google for: "${prompt}"…`, 'assistant');
        addTypingIndicator();
        const { results: searchResults, error: searchError } = await webSearch(prompt);

        if (searchError || searchResults.length === 0) {
            removeTypingIndicator();
            addMessage(
                `⚠️ Web search failed${searchError ? ': ' + searchError : ' — no results returned'}. ` +
                `Check the server terminal for [search] logs and F12 Console for [search] details. ` +
                `Asking the model without fresh results…`,
                'assistant'
            );
            addTypingIndicator();
        } else {
            removeTypingIndicator();
            const srcList = searchResults.map((r, i) => `${i + 1}. ${r.title} — ${r.url}`).join('\n');
            addMessage(`✅ Found ${searchResults.length} results:\n${srcList}`, 'assistant');
            addTypingIndicator();
        }

        let context = '';
        if (searchResults.length > 0) {
            context = '\n\n--- Web Search Results (fresh from Google, use these to answer) ---\n';
            for (const r of searchResults) {
                context += `\n[${r.source}] ${r.title}: ${r.snippet}\nSource: ${r.url}\n`;
            }
            context += '--- End Search Results ---\n\n';
        }

        const fullPrompt =
            context +
            `User question: ${prompt}\n\n` +
            (searchResults.length > 0
                ? `Instructions: Answer using the Web Search Results above. Do NOT claim you lack real-time access when results are provided. Cite sources by URL. If the results contain the answer (e.g. weather), state it directly.`
                : `Instructions: No search results were available. Answer from your own knowledge and say that live search failed.`);

        const stream = session.promptStreaming(fullPrompt);
        for await (const chunk of stream) {
            fullResponse += chunk;
            appendStreamingContent(chunk);
        }
        if (fullResponse.trim()) {
            messageHistory.push({ role: 'assistant', content: fullResponse });
            saveHistory();
        }
    } catch (err) {
        removeTypingIndicator();
        addMessage(`Error: ${err.message}`);
    } finally {
        isStreaming = false;
        sendBtn.disabled = false;
        searchBtn.disabled = false;
        promptInput.disabled = false;
        sendBtn.textContent = '➤';
        searchBtn.textContent = '🔍';
        removeTypingIndicator();
        const prevStreaming = document.getElementById('streaming-content');
        if (prevStreaming) prevStreaming.removeAttribute('id');
        promptInput.focus();
        setModelStatus('Ready — Gemma 4 on-device', true);
        await saveSessionToServer();
        loadQuota();
    }
}
function initEventHandlers() {
    newChatBtn.addEventListener('click', destroySessionAndReset);
    sendBtn.addEventListener('click', handleSend);
    searchBtn?.addEventListener('click', handleSearchAndAsk);
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // Theme toggle
    const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    document.body.classList.toggle('dark', savedTheme === 'dark');
    themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

    themeToggle.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark');
        themeToggle.textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    });

    // Export / Import (buttons removed from UI — handlers kept null-safe in case re-added)
    exportBtn?.addEventListener('click', () => {
        if (messageHistory.length === 0) {
            alert('No chat history to export.');
            return;
        }
        const dataStr = JSON.stringify(messageHistory, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `gemma4-chat-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    });

    importLabel?.addEventListener('click', () => { importBtn.value = ''; });
    importBtn?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const history = JSON.parse(text);
            if (!Array.isArray(history)) throw new Error('Invalid format');
            renderHistory(history);
            if (confirm('Restore this conversation into a new LanguageModel session?')) {
                destroySession();
                await restoreSession(history);
            }
        } catch (err) {
            alert('Failed to import: ' + err.message);
        }
    });

    // Session select / refresh
    sessionSelect?.addEventListener('change', async () => {
        const filename = sessionSelect.value;
        if (filename) await loadSessionFromFile(filename);
    });

    refreshSessionsBtn?.addEventListener('click', loadSessionList);
    quotaRefreshBtn?.addEventListener('click', loadQuota);

    // Full-screen editor + file-tree background right-click
    initFileEditor();
    setupFileTreeContextMenu();

    // Load session list and file tree on startup
    loadSessionList();
    loadFileTree();
    loadQuota();
}

// Initialize
initEventHandlers();

loadHistory();
checkAvailability().then(async (supported) => {
    if (!supported) return;

    loadHistory();
    const hasHistory = messageHistory.length > 0;

    if (hasHistory && confirm(`Found a previous conversation (${messageHistory.length} messages). Restore it?`)) {
        renderHistory(messageHistory);
        await restoreSession(messageHistory);
    } else if (hasHistory) {
        clearHistory();
        messagesEl.innerHTML = '';
        await createSession();
    } else {
        await createSession();
    }
});