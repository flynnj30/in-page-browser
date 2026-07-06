const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function getCookie(req, name) {
    const header = req.headers.cookie;
    if (!header) return null;
    const match = header.match(new RegExp('(^| )' + name + '=([^;]+)'));
    if (match) return match[2];
    return null;
}

app.use('/browser', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res, next) => {
    const dest = req.headers['sec-fetch-dest'];
    if (dest === 'document' || req.query.ui === 'true' || !getCookie(req, 'proxy_target')) {
        return res.redirect('/browser/index.html?ui=true');
    }
    next();
});

app.post('/___browser_api/detect', (req, res) => {
    const targetUrl = req.body.url;
    if (!targetUrl) return res.status(400).json({ error: 'URL parameter is required' });
    res.json(detectUrlType(targetUrl));
});

app.post('/___browser_api/set-target', (req, res) => {
    const targetUrl = req.body.url;
    try {
        const urlObj = new URL(targetUrl);
        res.setHeader('Set-Cookie', `proxy_target=${urlObj.origin}; Path=/; Max-Age=86400`);
        res.json({ success: true, origin: urlObj.origin, pathname: urlObj.pathname + urlObj.search + urlObj.hash });
    } catch (e) {
        res.status(400).json({ error: 'Invalid URL format' });
    }
});

function detectUrlType(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.replace('www.', '');
        if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return { type: 'youtube', embed: getYouTubeEmbed(url) };
        if (hostname.includes('spotify.com')) return { type: 'spotify', embed: getSpotifyEmbed(url) };
        if (hostname.includes('twitter.com') || hostname.includes('x.com')) return { type: 'twitter', embed: getTwitterEmbed(url) };
        if (hostname.includes('instagram.com')) return { type: 'instagram', embed: getInstagramEmbed(url) };
        if (hostname.includes('facebook.com') || hostname.includes('fb.com')) return { type: 'facebook', embed: getFacebookEmbed(url) };
        if (hostname.includes('vimeo.com')) return { type: 'vimeo', embed: getVimeoEmbed(url) };
        if (hostname.includes('soundcloud.com')) return { type: 'soundcloud', embed: getSoundCloudEmbed(url) };
        if (hostname.includes('twitch.tv')) return { type: 'twitch', embed: getTwitchEmbed(url) };
        if (hostname.includes('netflix.com')) return { type: 'netflix', embed: null };
        if (hostname.includes('amazon.com')) return { type: 'amazon', embed: null };
        if (hostname.includes('google.com') && !hostname.includes('youtube')) return { type: 'google', embed: null };
        return { type: 'generic', embed: null };
    } catch (e) {
        return { type: 'generic', embed: null };
    }
}

function getYouTubeEmbed(url) {
    try {
        let videoId = new URL(url).hostname.includes('youtu.be') ? new URL(url).pathname.substring(1) : new URLSearchParams(new URL(url).search).get('v');
        if (videoId) return { html: `<div class="embed-container"><iframe src="https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1" width="100%" height="100%" frameborder="0" allowfullscreen></iframe></div>`, type: 'youtube' };
    } catch (e) {} return null;
}
function getSpotifyEmbed(url) {
    try {
        const match = url.match(/spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
        if (match) return { html: `<div class="embed-container"><iframe src="https://open.spotify.com/embed/${match[1]}/${match[2]}" width="100%" height="380" frameborder="0" allow="encrypted-media"></iframe></div>`, type: 'spotify' };
    } catch (e) {} return null;
}
function getTwitterEmbed(url) { return { html: `<div class="embed-container"><blockquote class="twitter-tweet" data-theme="dark"><a href="${url}"></a></blockquote><script async src="https://platform.twitter.com/widgets.js"></script></div>`, type: 'twitter' }; }
function getInstagramEmbed(url) { return { html: `<div class="embed-container"><blockquote class="instagram-media" data-instgrm-permalink="${url}"><a href="${url}"></a></blockquote><script async src="//www.instagram.com/embed.js"></script></div>`, type: 'instagram' }; }
function getFacebookEmbed(url) { return { html: `<div class="embed-container"><script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v18.0"></script><div class="fb-post" data-href="${url}"></div></div>`, type: 'facebook' }; }
function getVimeoEmbed(url) {
    const match = url.match(/vimeo\.com\/(\d+)/);
    if (match) return { html: `<div class="embed-container"><iframe src="https://player.vimeo.com/video/${match[1]}" width="100%" height="500" frameborder="0" allowfullscreen></iframe></div>`, type: 'vimeo' };
    return null;
}
function getSoundCloudEmbed(url) { return { html: `<div class="embed-container"><iframe width="100%" height="300" src="https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}"></iframe></div>`, type: 'soundcloud' }; }
function getTwitchEmbed(url) {
    const match = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
    if (match) return { html: `<div class="embed-container"><iframe src="https://player.twitch.tv/?channel=${match[1]}&parent=localhost" width="100%" height="500" frameborder="0" allowfullscreen></iframe></div>`, type: 'twitch' };
    return null;
}

app.use(async (req, res) => {
    const targetOrigin = getCookie(req, 'proxy_target');
    if (!targetOrigin) return res.status(404).send('Not found and no proxy target active.');

    try {
        const targetUrl = targetOrigin + req.originalUrl;
        const options = { method: req.method, url: targetUrl, headers: { ...req.headers }, responseType: 'arraybuffer', validateStatus: () => true, maxRedirects: 0 };
        delete options.headers.host;
        options.headers.origin = targetOrigin;
        options.headers.referer = targetUrl;
        
        if (options.headers.cookie) {
            const cookies = options.headers.cookie.split(';').map(c => c.trim()).filter(c => !c.startsWith('proxy_target='));
            if (cookies.length > 0) options.headers.cookie = cookies.join('; '); else delete options.headers.cookie;
        }

        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            options.data = req.is('application/json') ? JSON.stringify(req.body) : req.is('application/x-www-form-urlencoded') ? new URLSearchParams(req.body).toString() : req.body;
        }

        const response = await axios(options);
        const headersToSkip = ['host', 'x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'strict-transport-security', 'transfer-encoding', 'content-encoding'];
        
        for (const [key, value] of Object.entries(response.headers)) {
            if (!headersToSkip.includes(key.toLowerCase())) {
                if (key.toLowerCase() === 'set-cookie') {
                    const cookies = Array.isArray(value) ? value : [value];
                    res.setHeader(key, cookies.map(c => c.replace(/Domain=[^;]+;?\s*/i, '').replace(/Secure;?\s*/i, '')));
                } else {
                    res.setHeader(key, value);
                }
            }
        }

        if (response.status >= 300 && response.status < 400 && response.headers.location) {
            const location = response.headers.location;
            if (location.startsWith('http')) {
                const locUrl = new URL(location);
                if (locUrl.origin !== targetOrigin) res.setHeader('Set-Cookie', `proxy_target=${locUrl.origin}; Path=/; Max-Age=86400`);
                res.setHeader('location', locUrl.pathname + locUrl.search);
            } else {
                res.setHeader('location', location);
            }
            return res.status(response.status).send(response.data);
        }

        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('text/html')) {
            let html = response.data.toString('utf-8');
            const escapedOrigin = targetOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            html = html.replace(new RegExp(`src=["']${escapedOrigin}(/[^"']*)["']`, 'gi'), 'src="$1"');
            html = html.replace(new RegExp(`href=["']${escapedOrigin}(/[^"']*)["']`, 'gi'), 'href="$1"');
            
            const scriptToInject = `
            <script>
                (function() {
                    const targetOrigin = "${targetOrigin}";
                    document.addEventListener('click', function(e) {
                        const link = e.target.closest('a');
                        if (link && link.href) {
                            try {
                                const url = new URL(link.href, window.location.href);
                                if (url.origin !== window.location.origin) {
                                    if (url.origin === targetOrigin) link.href = url.pathname + url.search + url.hash;
                                    else { e.preventDefault(); window.parent.postMessage({ type: 'navigate', url: link.href }, '*'); }
                                }
                            } catch(err) {}
                        }
                    });
                    const originalFetch = window.fetch;
                    window.fetch = function() {
                        try {
                            let reqUrl = arguments[0];
                            if (typeof reqUrl === 'string' || reqUrl instanceof URL) {
                                const url = new URL(reqUrl.toString(), window.location.href);
                                if (url.origin === targetOrigin) arguments[0] = url.pathname + url.search + url.hash;
                            } else if (reqUrl instanceof Request) {
                                const url = new URL(reqUrl.url, window.location.href);
                                if (url.origin === targetOrigin) arguments[0] = new Request(url.pathname + url.search + url.hash, reqUrl);
                            }
                        } catch(err) {}
                        return originalFetch.apply(this, arguments);
                    };
                    const originalOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url) {
                        try {
                            const parsedUrl = new URL(url.toString(), window.location.href);
                            if (parsedUrl.origin === targetOrigin) url = parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
                        } catch(err) {}
                        return originalOpen.apply(this, [method, url].concat(Array.prototype.slice.call(arguments, 2)));
                    };
                })();
            </script>`;
            html = html.includes('<head>') ? html.replace('<head>', '<head>' + scriptToInject) : scriptToInject + html;
            return res.status(response.status).send(html);
        }
        res.status(response.status).send(response.data);
    } catch (error) { res.status(502).send('Bad Gateway'); }
});

app.listen(PORT, () => {
    console.log('\x1b[32m%s\x1b[0m', '🚀 CRM Smart Browser Started on http://localhost:' + PORT);
});
