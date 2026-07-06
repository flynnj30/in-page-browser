(function() {
    'use strict';

    // Constants & Configuration
    const HOME_URL = 'https://example.com';
    const SEARCH_ENGINE = 'https://www.google.com/search?q=';
    
    // DOM Elements
    const tabsContainer = document.getElementById('tabsContainer');
    const viewsContainer = document.getElementById('viewsContainer');
    const urlInput = document.getElementById('urlInput');
    const backBtn = document.getElementById('backBtn'), forwardBtn = document.getElementById('forwardBtn'), reloadBtn = document.getElementById('reloadBtn'), homeBtn = document.getElementById('homeBtn');
    const statusText = document.getElementById('statusText'), activeUrlDisplay = document.getElementById('activeUrlDisplay'), secureBadge = document.getElementById('secureBadge');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const bookmarkBtn = document.getElementById('bookmarkBtn');

    // CRM State
    let tabs = [];
    let activeTabId = null;
    let tabCounter = 0;
    let bookmarks = JSON.parse(localStorage.getItem('crm_bookmarks') || '[]');
    let clipboardHistory = JSON.parse(localStorage.getItem('crm_clipboard') || '[]');

    // ==================== TAB MANAGEMENT ====================

    function createTab(url = HOME_URL, activate = true) {
        const id = 'tab_' + (++tabCounter);
        
        // Data Structure
        const tabData = {
            id: id,
            url: url,
            title: 'Loading...',
            history: [url],
            historyIndex: 0
        };
        tabs.push(tabData);

        // Tab UI
        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
        tabEl.id = `ui_${id}`;
        tabEl.innerHTML = `<span class="tab-title">Loading...</span><button class="tab-close">✖</button>`;
        
        tabEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-close')) closeTab(id);
            else switchTab(id);
        });
        tabsContainer.appendChild(tabEl);

        // Iframe UI
        const viewEl = document.createElement('div');
        viewEl.className = 'webview';
        viewEl.id = `view_${id}`;
        viewsContainer.appendChild(viewEl);

        if (activate) switchTab(id);
        loadUrl(url, id, false);
        return id;
    }

    function switchTab(id) {
        activeTabId = id;
        
        // Update UI Tabs
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        const activeTabEl = document.getElementById(`ui_${id}`);
        if(activeTabEl) activeTabEl.classList.add('active');

        // Update UI Views
        document.querySelectorAll('.webview').forEach(v => v.classList.remove('active'));
        const activeViewEl = document.getElementById(`view_${id}`);
        if(activeViewEl) activeViewEl.classList.add('active');

        // Update Toolbar & Status
        const tab = tabs.find(t => t.id === id);
        if (tab) {
            urlInput.value = tab.url;
            activeUrlDisplay.textContent = `🔗 ${tab.url}`;
            updateNavButtons();
            updateSecureBadge(tab.url);
            updateBookmarkButton(tab.url);
        }
    }

    function closeTab(id) {
        const index = tabs.findIndex(t => t.id === id);
        if (index === -1) return;

        // Remove DOM elements
        document.getElementById(`ui_${id}`).remove();
        document.getElementById(`view_${id}`).remove();
        tabs.splice(index, 1);

        if (tabs.length === 0) {
            createTab(HOME_URL);
        } else if (activeTabId === id) {
            switchTab(tabs[Math.max(0, index - 1)].id);
        }
    }

    function updateNavButtons() {
        const tab = tabs.find(t => t.id === activeTabId);
        if(!tab) return;
        backBtn.disabled = tab.historyIndex <= 0;
        forwardBtn.disabled = tab.historyIndex >= tab.history.length - 1;
    }

    function updateTabMeta(id, url, title) {
        const tab = tabs.find(t => t.id === id);
        if (!tab) return;
        tab.url = url;
        if(title) tab.title = title;
        
        document.querySelector(`#ui_${id} .tab-title`).textContent = tab.title;
        if (id === activeTabId) {
            urlInput.value = url;
            activeUrlDisplay.textContent = `🔗 ${url}`;
            updateSecureBadge(url);
            updateBookmarkButton(url);
        }
    }

    function updateSecureBadge(url) {
        if (url.startsWith('https://')) { secureBadge.textContent = '🔒'; secureBadge.style.color = 'var(--success)'; }
        else if (url.startsWith('http://')) { secureBadge.textContent = '🔓'; secureBadge.style.color = 'var(--danger)'; }
        else { secureBadge.textContent = '🔗'; secureBadge.style.color = 'var(--text-main)'; }
    }

    document.getElementById('newTabBtn').addEventListener('click', () => createTab());

    // ==================== BROWSER NAVIGATION ====================

    function formatUrl(input) {
        let url = input.trim();
        if (!url || url === 'about:blank') return HOME_URL;
        try { if (['http:', 'https:'].includes(new URL(url).protocol)) return url; } catch (e) {}
        if (/^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}/.test(url)) return 'https://' + url;
        return SEARCH_ENGINE + encodeURIComponent(url);
    }

    function loadUrl(input, tabId = activeTabId, addToHistory = true) {
        const finalUrl = formatUrl(input);
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) return;

        updateTabMeta(tabId, finalUrl, 'Loading...');
        if(tabId === activeTabId) loadingOverlay.classList.add('active');

        // Check detection
        fetch('/___browser_api/detect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: finalUrl })
        }).then(res => res.json()).then(urlInfo => {
            const viewEl = document.getElementById(`view_${tabId}`);
            
            if (urlInfo.embed) {
                viewEl.innerHTML = `<div style="padding: 20px; background:var(--bg-main); height: 100%; overflow:auto;">${urlInfo.embed.html}</div>`;
                updateTabMeta(tabId, finalUrl, urlInfo.type + ' Embed');
                finalizeLoad();
            } else if (['netflix', 'amazon', 'google'].includes(urlInfo.type)) {
                viewEl.innerHTML = `<div class="redirect-page"><h2>Opening in New Tab</h2><p>This site blocks iframes.</p><button onclick="window.open('${finalUrl}', '_blank')">Open</button></div>`;
                updateTabMeta(tabId, finalUrl, 'Redirecting...');
                setTimeout(() => window.open(finalUrl, '_blank'), 500);
                finalizeLoad();
            } else {
                fetch('/___browser_api/set-target', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: finalUrl })
                }).then(res => res.json()).then(data => {
                    if (data.success) {
                        viewEl.innerHTML = `<iframe src="${data.pathname}" sandbox="allow-same-origin allow-scripts allow-forms allow-popups" class="webview active" id="iframe_${tabId}" style="width:100%; height:100%; background:#fff; border:none;"></iframe>`;
                        const iframe = document.getElementById(`iframe_${tabId}`);
                        iframe.onload = () => {
                            try { const doc = iframe.contentDocument || iframe.contentWindow.document; if(doc.title) updateTabMeta(tabId, finalUrl, doc.title); } catch(e){}
                        };
                        updateTabMeta(tabId, finalUrl, new URL(finalUrl).hostname);
                    } else {
                        viewEl.innerHTML = `<div class="error-page"><h2>Error</h2><p>Invalid URL mapping</p></div>`;
                        updateTabMeta(tabId, finalUrl, 'Error');
                    }
                    finalizeLoad();
                });
            }
        }).catch(err => {
            document.getElementById(`view_${tabId}`).innerHTML = `<div class="error-page"><h2>Connection Error</h2><p>${err.message}</p></div>`;
            updateTabMeta(tabId, finalUrl, 'Error');
            finalizeLoad();
        });

        function finalizeLoad() {
            if(tabId === activeTabId) loadingOverlay.classList.remove('active');
            if (addToHistory) {
                tab.history = tab.history.slice(0, tab.historyIndex + 1);
                if (tab.history[tab.history.length - 1] !== finalUrl) {
                    tab.history.push(finalUrl);
                    tab.historyIndex = tab.history.length - 1;
                }
            }
            if(tabId === activeTabId) updateNavButtons();
        }
    }

    urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadUrl(urlInput.value); });
    backBtn.addEventListener('click', () => { const t = tabs.find(x=>x.id===activeTabId); if(t && t.historyIndex > 0) { t.historyIndex--; loadUrl(t.history[t.historyIndex], activeTabId, false); } });
    forwardBtn.addEventListener('click', () => { const t = tabs.find(x=>x.id===activeTabId); if(t && t.historyIndex < t.history.length-1) { t.historyIndex++; loadUrl(t.history[t.historyIndex], activeTabId, false); } });
    reloadBtn.addEventListener('click', () => { const t = tabs.find(x=>x.id===activeTabId); if(t) loadUrl(t.url, activeTabId, false); });
    homeBtn.addEventListener('click', () => loadUrl(HOME_URL));

    // Handle Iframe Link Clicks
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'navigate' && event.data.url) loadUrl(event.data.url);
    });

    // ==================== CRM TOOLS & PANELS ====================

    // Draggable Function
    function makeDraggable(panel, header) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        header.onmousedown = (e) => {
            if(e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            pos3 = e.clientX; pos4 = e.clientY;
            document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
            document.onmousemove = (ev) => {
                ev.preventDefault();
                pos1 = pos3 - ev.clientX; pos2 = pos4 - ev.clientY;
                pos3 = ev.clientX; pos4 = ev.clientY;
                panel.style.top = (panel.offsetTop - pos2) + "px";
                panel.style.left = (panel.offsetLeft - pos1) + "px";
            };
        };
    }

    // Toggle Panels
    function togglePanel(id) { const p = document.getElementById(id); p.classList.toggle('hidden'); }
    document.querySelectorAll('.close-panel').forEach(btn => btn.addEventListener('click', (e) => e.target.closest('.floating-panel').classList.add('hidden')));

    // Calculator
    const calcPanel = document.getElementById('calcPanel');
    makeDraggable(calcPanel, document.getElementById('calcHeader'));
    document.getElementById('toggleCalcBtn').addEventListener('click', () => togglePanel('calcPanel'));
    
    window.calcPress = function(val) {
        const d = document.getElementById('calcDisplay');
        if (val === 'C') d.value = '';
        else if (val === '=') { try { d.value = eval(d.value) || ''; } catch(e){ d.value='Err'; } }
        else d.value += val;
    };

    // Timer
    const timerPanel = document.getElementById('timerPanel');
    makeDraggable(timerPanel, document.getElementById('timerHeader'));
    document.getElementById('toggleTimerBtn').addEventListener('click', () => togglePanel('timerPanel'));
    
    let timerInt, timerSecs = 0;
    const tDisplay = document.getElementById('timerDisplay');
    function updateTimerUI() {
        const h = String(Math.floor(timerSecs / 3600)).padStart(2, '0');
        const m = String(Math.floor((timerSecs % 3600) / 60)).padStart(2, '0');
        const s = String(timerSecs % 60).padStart(2, '0');
        tDisplay.textContent = `${h}:${m}:${s}`;
    }
    document.getElementById('timerStart').addEventListener('click', () => { clearInterval(timerInt); timerInt = setInterval(()=>{ timerSecs++; updateTimerUI(); }, 1000); });
    document.getElementById('timerPause').addEventListener('click', () => clearInterval(timerInt));
    document.getElementById('timerReset').addEventListener('click', () => { clearInterval(timerInt); timerSecs = 0; updateTimerUI(); });

    // Split Screen (Notes/Script)
    const dockedSidebar = document.getElementById('dockedSidebar');
    const notesArea = document.getElementById('dockedNotesArea');
    
    // Load notes from localstorage
    notesArea.value = localStorage.getItem('crm_notes') || '';
    notesArea.addEventListener('input', () => localStorage.setItem('crm_notes', notesArea.value));

    document.getElementById('toggleNotesBtn').addEventListener('click', () => dockedSidebar.classList.toggle('active'));
    document.getElementById('toggleScriptBtn').addEventListener('click', () => {
        dockedSidebar.classList.add('active');
        document.getElementById('dockedScriptArea').scrollIntoView({behavior: "smooth"});
    });
    document.getElementById('sidebarCloseBtn').addEventListener('click', () => dockedSidebar.classList.remove('active'));
    document.getElementById('sidebarFloatBtn').addEventListener('click', () => { alert('Floating mode available in next update!'); });

    // Clipboard History
    const clipPanel = document.getElementById('clipboardPanel');
    const clipList = document.getElementById('clipboardList');
    makeDraggable(clipPanel, document.getElementById('clipboardHeader'));
    document.getElementById('toggleClipboardBtn').addEventListener('click', () => togglePanel('clipboardPanel'));
    
    function renderClipboard() {
        clipList.innerHTML = '';
        clipboardHistory.forEach(text => {
            const li = document.createElement('li');
            li.textContent = text;
            li.title = "Click to copy";
            li.onclick = () => { navigator.clipboard.writeText(text); statusText.textContent = '✅ Copied to clipboard'; };
            clipList.appendChild(li);
        });
    }
    document.getElementById('captureClipboardBtn').addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if(text && !clipboardHistory.includes(text)) {
                clipboardHistory.unshift(text);
                if(clipboardHistory.length > 20) clipboardHistory.pop();
                localStorage.setItem('crm_clipboard', JSON.stringify(clipboardHistory));
                renderClipboard();
            }
        } catch(e) { alert("Please allow clipboard permissions or copy text manually."); }
    });
    renderClipboard();

    // ==================== WORKSPACE & SYSTEM ====================

    // Bookmarks
    function updateBookmarkButton(url) {
        bookmarkBtn.style.color = bookmarks.includes(url) ? '#ffd700' : 'inherit';
    }
    bookmarkBtn.addEventListener('click', () => {
        const tab = tabs.find(t => t.id === activeTabId);
        if(!tab) return;
        const idx = bookmarks.indexOf(tab.url);
        if (idx > -1) bookmarks.splice(idx, 1);
        else bookmarks.push(tab.url);
        localStorage.setItem('crm_bookmarks', JSON.stringify(bookmarks));
        updateBookmarkButton(tab.url);
    });

    // Theme Toggle
    document.getElementById('themeToggleBtn').addEventListener('click', () => {
        const html = document.documentElement;
        html.dataset.theme = html.dataset.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('crm_theme', html.dataset.theme);
    });
    if(localStorage.getItem('crm_theme') === 'light') document.documentElement.dataset.theme = 'light';

    // Fullscreen
    document.getElementById('fullscreenBtn').addEventListener('click', () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => console.log(err));
        else document.exitFullscreen();
    });

    // Save Workspace
    document.getElementById('workspaceSaveBtn').addEventListener('click', () => {
        const workspaceTabs = tabs.map(t => ({ url: t.url }));
        localStorage.setItem('crm_workspace', JSON.stringify(workspaceTabs));
        statusText.textContent = '✅ Workspace Saved';
        setTimeout(()=>statusText.textContent = '✅ Ready', 2000);
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); urlInput.focus(); urlInput.select(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 't') { e.preventDefault(); createTab(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'w') { e.preventDefault(); closeTab(activeTabId); }
    });

    // INITIALIZATION
    const savedWorkspace = JSON.parse(localStorage.getItem('crm_workspace') || '[]');
    if (savedWorkspace.length > 0) {
        savedWorkspace.forEach((t, i) => createTab(t.url, i === 0)); // Activate first tab
    } else {
        createTab(HOME_URL);
    }

})();
