(function() {
    'use strict';

    // DOM Elements
    const iframe = document.getElementById('browserFrame');
    const urlInput = document.getElementById('urlInput');
    const goBtn = document.getElementById('goBtn');
    const backBtn = document.getElementById('backBtn');
    const forwardBtn = document.getElementById('forwardBtn');
    const reloadBtn = document.getElementById('reloadBtn');
    const homeBtn = document.getElementById('homeBtn');
    const newWindowBtn = document.getElementById('newWindowBtn');
    const bookmarkBtn = document.getElementById('bookmarkBtn');
    const statusText = document.getElementById('statusText');
    const urlDisplay = document.getElementById('urlDisplay');
    const pageTitle = document.getElementById('pageTitle');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const secureBadge = document.getElementById('secureBadge');

    // Configuration
    const PROXY_SERVER = window.location.origin + '/proxy?url=';
    const HOME_URL = 'https://example.com';
    const SEARCH_ENGINE = 'https://www.google.com/search?q=';

    // State
    let historyStack = [];
    let historyIndex = -1;
    let currentUrl = HOME_URL;
    let isLoading = false;
    let bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');

    // ==================== Helper Functions ====================

    function updateNavButtons() {
        backBtn.disabled = historyIndex <= 0;
        forwardBtn.disabled = historyIndex >= historyStack.length - 1;
    }

    function showLoading(message = 'Loading via proxy...') {
        isLoading = true;
        loadingOverlay.classList.add('active');
        document.querySelector('.loading-text').textContent = message;
        statusText.innerText = '⏳ Loading...';
    }

    function hideLoading() {
        isLoading = false;
        loadingOverlay.classList.remove('active');
        statusText.innerText = '✅ Ready';
    }

    function updateStatus(message, isError = false) {
        statusText.innerText = message;
        if (isError) {
            statusText.style.color = '#ff6b6b';
        } else {
            statusText.style.color = '#b6b8d4';
        }
    }

    function updateSecureBadge(url) {
        if (url.startsWith('https://')) {
            secureBadge.textContent = '🔒';
            secureBadge.className = 'badge secure-badge';
            secureBadge.title = 'Secure connection';
        } else if (url.startsWith('http://')) {
            secureBadge.textContent = '🔓';
            secureBadge.className = 'badge secure-badge insecure';
            secureBadge.title = 'Insecure connection';
        } else {
            secureBadge.textContent = '🔗';
            secureBadge.className = 'badge secure-badge';
            secureBadge.title = 'Local or unknown protocol';
        }
    }

    function updateBookmarkButton() {
        if (bookmarks.includes(currentUrl)) {
            bookmarkBtn.textContent = '★';
            bookmarkBtn.style.color = '#ffd700';
            bookmarkBtn.title = 'Remove Bookmark';
        } else {
            bookmarkBtn.textContent = '⭐';
            bookmarkBtn.style.color = '#c6c8e0';
            bookmarkBtn.title = 'Add Bookmark';
        }
    }

    function formatUrl(input) {
        let url = input.trim();
        
        if (!url) return HOME_URL;
        
        if (url === 'about:blank' || url === '') {
            return HOME_URL;
        }
        
        // Check if it's already a valid URL with protocol
        try {
            const urlObj = new URL(url);
            if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
                return urlObj.href;
            }
        } catch (e) {
            // Not a valid URL with protocol
        }
        
        // Check if it looks like a domain
        if (/^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/.test(url)) {
            return 'https://' + url;
        }
        
        // Treat as search query
        return SEARCH_ENGINE + encodeURIComponent(url);
    }

    // ==================== Core Functions ====================

    function loadUrl(input, addToHistory = true) {
        if (!input) return;
        
        const finalUrl = formatUrl(input);
        currentUrl = finalUrl;
        
        // Update UI
        urlInput.value = finalUrl;
        urlDisplay.textContent = `🔗 ${finalUrl}`;
        updateSecureBadge(finalUrl);
        updateBookmarkButton();
        
        // Show loading
        showLoading('Fetching content...');
        
        // Load via proxy
        const proxyUrl = PROXY_SERVER + encodeURIComponent(finalUrl);
        
        try {
            iframe.src = proxyUrl;
        } catch (error) {
            console.error('Failed to load:', error);
            hideLoading();
            updateStatus('❌ Failed to load', true);
            return;
        }
        
        // Update history
        if (addToHistory) {
            // Remove forward history if navigating from middle
            if (historyIndex < historyStack.length - 1) {
                historyStack = historyStack.slice(0, historyIndex + 1);
            }
            // Prevent duplicate entries
            if (historyStack[historyStack.length - 1] !== finalUrl) {
                historyStack.push(finalUrl);
                historyIndex = historyStack.length - 1;
            }
        }
        
        updateNavButtons();
    }

    function reloadPage() {
        if (iframe.src) {
            showLoading('Reloading...');
            iframe.src = iframe.src;
        } else {
            loadUrl(currentUrl);
        }
    }

    function goBack() {
        if (historyIndex > 0) {
            const url = historyStack[--historyIndex];
            loadUrl(url, false);
            updateNavButtons();
        }
    }

    function goForward() {
        if (historyIndex < historyStack.length - 1) {
            const url = historyStack[++historyIndex];
            loadUrl(url, false);
            updateNavButtons();
        }
    }

    function goHome() {
        loadUrl(HOME_URL);
    }

    function openInNewWindow() {
        if (currentUrl && currentUrl !== 'about:blank') {
            window.open(currentUrl, '_blank');
            updateStatus('↗ Opened in new window');
            setTimeout(() => updateStatus('✅ Ready'), 2000);
        }
    }

    function toggleBookmark() {
        const index = bookmarks.indexOf(currentUrl);
        if (index > -1) {
            bookmarks.splice(index, 1);
            updateStatus('📕 Bookmark removed');
        } else {
            bookmarks.push(currentUrl);
            updateStatus('📗 Bookmark added');
        }
        localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
        updateBookmarkButton();
    }

    // ==================== Event Handlers ====================

    // Iframe load events
    iframe.addEventListener('load', function() {
        hideLoading();
        updateStatus('✅ Loaded');
        
        // Try to get page title
        try {
            const title = iframe.contentDocument?.title || iframe.contentWindow?.document?.title;
            if (title && title !== '') {
                pageTitle.textContent = title;
            }
        } catch (e) {
            // Cross-origin - can't access title
        }
        
        // Try to update URL from iframe
        try {
            const frameUrl = iframe.contentWindow.location.href;
            if (frameUrl && frameUrl !== 'about:blank' && !frameUrl.includes('/proxy?url=')) {
                urlInput.value = frameUrl;
                urlDisplay.textContent = `🔗 ${frameUrl}`;
                currentUrl = frameUrl;
                updateSecureBadge(frameUrl);
                updateBookmarkButton();
            }
        } catch (e) {
            // Cross-origin - can't access URL
        }
    });

    iframe.addEventListener('error', function() {
        hideLoading();
        updateStatus('❌ Failed to load page', true);
    });

    // Listen for messages from iframe
    window.addEventListener('message', function(event) {
        // Validate message origin
        if (event.origin !== window.location.origin) {
            return;
        }
        
        const data = event.data;
        
        if (data.type === 'navigate') {
            loadUrl(data.url);
        } else if (data.type === 'formSubmit') {
            // Handle form submissions
            console.log('Form submitted:', data);
            // For now, just navigate
            if (data.url) {
                loadUrl(data.url);
            }
        }
    }, false);

    // ==================== Button Event Listeners ====================

    // Navigation
    backBtn.addEventListener('click', goBack);
    forwardBtn.addEventListener('click', goForward);
    reloadBtn.addEventListener('click', reloadPage);
    homeBtn.addEventListener('click', goHome);
    newWindowBtn.addEventListener('click', openInNewWindow);
    bookmarkBtn.addEventListener('click', toggleBookmark);

    // Go button
    goBtn.addEventListener('click', function() {
        const url = urlInput.value.trim();
        if (url) {
            loadUrl(url);
        }
    });

    // URL input - Enter key
    urlInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const url = this.value.trim();
            if (url) {
                loadUrl(url);
            }
        }
    });

    // ==================== Keyboard Shortcuts ====================

    document.addEventListener('keydown', function(e) {
        // Ctrl+L or Cmd+L: Focus URL bar
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
            e.preventDefault();
            urlInput.focus();
            urlInput.select();
        }
        
        // Escape: Blur URL bar
        if (e.key === 'Escape' && document.activeElement === urlInput) {
            urlInput.blur();
        }
        
        // Ctrl+R or Cmd+R: Reload
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            reloadPage();
        }
        
        // Alt+Left: Back
        if (e.altKey && e.key === 'ArrowLeft') {
            e.preventDefault();
            goBack();
        }
        
        // Alt+Right: Forward
        if (e.altKey && e.key === 'ArrowRight') {
            e.preventDefault();
            goForward();
        }
        
        // Ctrl+D or Cmd+D: Bookmark
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            toggleBookmark();
        }
    });

    // ==================== Auto-focus ====================

    // Focus URL input on load
    urlInput.focus();
    urlInput.select();

    // ==================== Initialize ====================

    // Load home page
    loadUrl(HOME_URL);

    // Log startup
    console.log('🚀 In-Page Browser initialized');
    console.log('📡 Proxy server:', PROXY_SERVER);
    console.log('🏠 Home URL:', HOME_URL);
    console.log('📚 Bookmarks:', bookmarks.length);

    // Expose functions for debugging
    window.__browser = {
        loadUrl,
        reloadPage,
        goBack,
        goForward,
        goHome,
        currentUrl: () => currentUrl,
        history: () => historyStack,
        bookmarks: () => bookmarks
    };

    console.log('💡 For debugging, use window.__browser');
})();