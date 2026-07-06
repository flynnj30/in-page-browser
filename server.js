const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Proxy endpoint - fetches any URL and modifies it for iframe display
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
        return res.status(400).json({ 
            error: 'URL parameter is required',
            example: '/proxy?url=https://example.com'
        });
    }

    // Validate URL
    try {
        new URL(targetUrl);
    } catch (e) {
        return res.status(400).json({ 
            error: 'Invalid URL format',
            message: 'Please provide a valid URL including protocol (http:// or https://)'
        });
    }

    try {
        console.log(`🔄 Fetching: ${targetUrl}`);
        
        // Make request to target URL
        const response = await axios({
            method: 'GET',
            url: targetUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            },
            maxRedirects: 5,
            timeout: 30000,
            responseType: 'arraybuffer',
            validateStatus: function (status) {
                return status >= 200 && status < 400;
            }
        });

        // Get content type
        const contentType = response.headers['content-type'] || 'text/html';
        const isHtml = contentType.includes('text/html') || contentType.includes('text/plain');
        
        // For HTML content, modify it to work in iframe
        if (isHtml) {
            let html = response.data.toString('utf-8');
            
            // Use cheerio to modify HTML
            const $ = cheerio.load(html);
            
            // Fix base URL
            if (!$('base').length) {
                $('head').prepend(`<base href="${targetUrl}" target="_blank">`);
            }

            // Fix all links
            $('a[href]').each((i, el) => {
                let href = $(el).attr('href');
                if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                    try {
                        const absolute = new URL(href, targetUrl).href;
                        // Store original URL as data attribute
                        $(el).attr('data-original-href', absolute);
                        // Use postMessage to navigate
                        $(el).attr('href', '#');
                        $(el).attr('onclick', `event.preventDefault(); window.parent.postMessage({ type: 'navigate', url: '${absolute.replace(/'/g, "\\'")}' }, '*'); return false;`);
                        $(el).css('cursor', 'pointer');
                    } catch (e) {
                        // Invalid URL, leave as is
                    }
                }
            });

            // Fix form actions
            $('form[action]').each((i, el) => {
                let action = $(el).attr('action');
                if (action && !action.startsWith('javascript:')) {
                    try {
                        const absolute = new URL(action, targetUrl).href;
                        $(el).attr('data-original-action', absolute);
                        $(el).attr('action', '#');
                        $(el).attr('onsubmit', `event.preventDefault(); const form = this; const formData = new FormData(form); const url = form.getAttribute('data-original-action'); window.parent.postMessage({ type: 'formSubmit', url: url, data: Object.fromEntries(formData) }, '*'); return false;`);
                    } catch (e) {
                        // Invalid URL
                    }
                }
            });

            // Fix image sources
            $('img[src]').each((i, el) => {
                let src = $(el).attr('src');
                if (src && !src.startsWith('data:') && !src.startsWith('http://') && !src.startsWith('https://')) {
                    try {
                        const absolute = new URL(src, targetUrl).href;
                        $(el).attr('src', absolute);
                    } catch (e) {}
                }
            });

            // Fix CSS links
            $('link[rel="stylesheet"]').each((i, el) => {
                let href = $(el).attr('href');
                if (href && !href.startsWith('http://') && !href.startsWith('https://')) {
                    try {
                        const absolute = new URL(href, targetUrl).href;
                        $(el).attr('href', absolute);
                    } catch (e) {}
                }
            });

            // Fix script sources
            $('script[src]').each((i, el) => {
                let src = $(el).attr('src');
                if (src && !src.startsWith('http://') && !src.startsWith('https://')) {
                    try {
                        const absolute = new URL(src, targetUrl).href;
                        $(el).attr('src', absolute);
                    } catch (e) {}
                }
            });

            // Add proxy frame detection and communication script
            $('body').append(`
                <script>
                    // Detect if page is loaded in iframe
                    if (window.top !== window.self) {
                        console.log('✅ Page loaded in iframe via proxy');
                        console.log('🔗 Original URL: ${targetUrl}');
                        
                        // Handle navigation requests from iframe
                        window.addEventListener('message', function(event) {
                            if (event.data && event.data.type === 'navigate') {
                                window.parent.postMessage({ 
                                    type: 'navigate', 
                                    url: event.data.url 
                                }, '*');
                            }
                        });
                        
                        // Intercept click events on links with data-proxy-href
                        document.addEventListener('click', function(e) {
                            const link = e.target.closest('a[data-proxy-href]');
                            if (link) {
                                e.preventDefault();
                                const url = link.getAttribute('data-proxy-href');
                                window.parent.postMessage({ type: 'navigate', url: url }, '*');
                            }
                        });
                    }
                <\/script>
            `);

            // Add styles for better iframe display
            $('head').append(`
                <style>
                    /* Ensure content works well in iframe */
                    body { 
                        min-height: 100vh;
                        background: #ffffff;
                    }
                    /* Improve link styling */
                    a[href="#"] {
                        color: #0066cc;
                        text-decoration: underline;
                    }
                    a[href="#"]:hover {
                        color: #004499;
                    }
                    /* Fix for fixed position elements */
                    .fixed, [style*="position: fixed"] {
                        position: relative !important;
                    }
                </style>
            `);

            // Send modified HTML
            res.set({
                'Content-Type': 'text/html; charset=utf-8',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'SAMEORIGIN'
            });
            res.send($.html());
            
        } else {
            // For non-HTML content, send as is
            res.set({
                'Content-Type': contentType,
                'Content-Disposition': response.headers['content-disposition'] || 'inline'
            });
            res.send(response.data);
        }

    } catch (error) {
        console.error('❌ Proxy error:', error.message);
        
        // Send friendly error page
        const errorHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Proxy Error</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif;
                        background: #15151f; 
                        color: #f0f0ff; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        height: 100vh; 
                        margin: 0;
                        padding: 20px;
                    }
                    .error-container {
                        background: #282a3a;
                        padding: 40px;
                        border-radius: 16px;
                        max-width: 500px;
                        width: 100%;
                        text-align: center;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                    }
                    .error-icon { font-size: 64px; margin-bottom: 20px; display: block; }
                    h1 { color: #ff6b6b; font-size: 24px; margin-bottom: 15px; }
                    .url { 
                        color: #7a7af0; 
                        word-break: break-all;
                        background: #1a1b2b;
                        padding: 10px 15px;
                        border-radius: 8px;
                        margin: 15px 0;
                        display: block;
                        font-size: 14px;
                    }
                    .error-details {
                        color: #b6b8d4;
                        font-size: 14px;
                        margin: 15px 0;
                        line-height: 1.6;
                    }
                    .error-code {
                        color: #8a8aaa;
                        font-size: 12px;
                        margin-top: 10px;
                    }
                    .buttons {
                        display: flex;
                        gap: 10px;
                        justify-content: center;
                        margin-top: 20px;
                        flex-wrap: wrap;
                    }
                    .btn {
                        padding: 10px 24px;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        transition: 0.2s;
                        text-decoration: none;
                        display: inline-block;
                    }
                    .btn-primary {
                        background: #7a7af0;
                        color: white;
                    }
                    .btn-primary:hover {
                        background: #5a5ad0;
                        transform: scale(1.05);
                    }
                    .btn-secondary {
                        background: transparent;
                        color: #b6b8d4;
                        border: 1px solid #4a4a6a;
                    }
                    .btn-secondary:hover {
                        background: #3d3f5a;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <span class="error-icon">⚠️</span>
                    <h1>Failed to Load Page</h1>
                    <span class="url">${targetUrl}</span>
                    <div class="error-details">
                        ${error.message || 'Could not fetch the requested URL. The site might be blocking access or is temporarily unavailable.'}
                    </div>
                    <div class="error-code">Error: ${error.code || 'UNKNOWN'}</div>
                    <div class="buttons">
                        <button class="btn btn-primary" onclick="window.parent.postMessage({ type: 'navigate', url: '${targetUrl.replace(/'/g, "\\'")}' }, '*')">
                            🔄 Try Again
                        </button>
                        <button class="btn btn-secondary" onclick="window.open('${targetUrl.replace(/'/g, "\\'")}', '_blank')">
                            ↗ Open in New Tab
                        </button>
                        <button class="btn btn-secondary" onclick="window.parent.postMessage({ type: 'navigate', url: 'https://example.com' }, '*')">
                            🏠 Home
                        </button>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        res.status(500).set('Content-Type', 'text/html').send(errorHtml);
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0'
    });
});

// Catch-all route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log('\x1b[32m%s\x1b[0m', '🚀 In-Page Browser Server Started!');
    console.log('\x1b[36m%s\x1b[0m', `📡 Server running on: http://localhost:${PORT}`);
    console.log('\x1b[36m%s\x1b[0m', `🔗 Proxy endpoint: http://localhost:${PORT}/proxy?url=YOUR_URL`);
    console.log('\x1b[33m%s\x1b[0m', '📱 Open your browser and navigate to http://localhost:3000');
    console.log('\x1b[33m%s\x1b[0m', '💡 Press Ctrl+C to stop the server');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\x1b[31m%s\x1b[0m', '👋 Shutting down server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\x1b[31m%s\x1b[0m', '👋 Shutting down server...');
    process.exit(0);
});