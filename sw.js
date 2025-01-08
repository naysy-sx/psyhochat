const CACHE_NAME = 'quote-chat-cache-v1';
const OFFLINE_URL = 'offline.html';
const STATIC_ASSETS = [
    './index.html',
    './styles.css',
    './app.js',
    './quotes.json',
    './offline.html',
    './sync-manager.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // Cache files one by one to prevent complete failure if one fails
                return Promise.all(
                    STATIC_ASSETS.map(url => {
                        return cache.add(url).catch(error => {
                            console.warn(`Failed to cache: ${url}`, error);
                        });
                    })
                );
            })
    );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        })
    );
});

// Helper function to check if URL is valid for caching
function isValidUrl(url) {
    try {
        const urlObj = new URL(url);
        return ['http:', 'https:'].includes(urlObj.protocol);
    } catch (e) {
        return false;
    }
}

// Fetch event - handle offline mode
self.addEventListener('fetch', (event) => {
    // Ignore non-GET requests and invalid URLs
    if (event.request.method !== 'GET' || !isValidUrl(event.request.url)) {
        return;
    }

    // For Firebase requests, try network first, then cache
    if (event.request.url.includes('firebaseio.com')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // For navigation requests (HTML pages)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(OFFLINE_URL))
        );
        return;
    }

    // For other requests, try cache first, then network
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request)
                    .then(response => {
                        // Check if we received a valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        if (isValidUrl(event.request.url)) {
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseToCache);
                                })
                                .catch(error => {
                                    console.warn('Failed to cache:', error);
                                });
                        }

                        return response;
                    })
                    .catch(() => {
                        // If both cache and network fail, return offline page for HTML
                        if (event.request.mode === 'navigate') {
                            return caches.match(OFFLINE_URL);
                        }
                        return null;
                    });
            })
    );
});