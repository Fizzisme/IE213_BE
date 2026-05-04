/**
 * RPCCache - Tầng cache in-memory cho RPC calls
 * 
 * Tại sao dùng in-memory?
 * - Single server backend (không cần distributed cache)
 * - Roles/access tokens không thay đổi thường xuyên
 * - Transaction hash bất biến (immutable)
 * - Tốc độ: milliseconds (vs Redis: network I/O ~10-50ms)
 * 
 * Cache miss là chấp nhận được:
 * - Server restart -> re-query 1 lần
 * - Không ảnh hưởng logic
 */

class RPCCache {
    constructor() {
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            totalRequests: 0,
        };
        this.keyStats = new Map(); // Theo dõi thống kê cho từng key
    }

    /**
     * Lấy từ cache hoặc fetch từ RPC nếu cache miss
     * @param {string} key - Cache key (VD: "role:0x123...abc:2")
     * @param {Function} fetcher - Async function để lấy dữ liệu từ RPC
     * @param {number} ttl - Thời gian sống (milliseconds), mặc định 5 phút
     * @returns {Promise<any>} - Giá trị từ cache hoặc từ RPC
     */
    async getOrFetch(key, fetcher, ttl = 300000) {
        this.stats.totalRequests++;

        // Cache hit: Nếu key tồn tại và chưa hết hạn
        const cached = this.cache.get(key);
        if (cached && cached.expiry > Date.now()) {
            this.stats.hits++;
            this._updateKeyStats(key, 'hit');

            console.log(
                `[CACHE HIT] ${key} (expires in ${Math.round((cached.expiry - Date.now()) / 1000)}s)`
            );
            return cached.value;
        }

        // Cache miss: Fetch từ RPC
        this.stats.misses++;
        this._updateKeyStats(key, 'miss');

        console.log(`[CACHE MISS] ${key} - Fetching from RPC...`);

        try {
            const value = await fetcher();
            const expiryTime = Date.now() + ttl;

            this.cache.set(key, {
                value,
                expiry: expiryTime,
                createdAt: Date.now(),
            });

            console.log(
                `[CACHE SET] ${key} (TTL: ${Math.round(ttl / 1000)}s)`
            );

            return value;
        } catch (error) {
            console.error(`[CACHE ERROR] ${key}:`, error.message);
            throw error;
        }
    }

    /**
     * Xóa một cache entry
     */
    invalidate(key) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
            console.log(`[CACHE INVALIDATE] ${key}`);
        }
    }

    /**
     * Xóa toàn bộ cache (nếu cần reset)
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, totalRequests: 0 };
        this.keyStats.clear();
        console.log(`[CACHE CLEAR] Cleared ${size} entries`);
    }

    /**
     * Lấy thống kê cache
     */
    getStats() {
        const hitRate =
            this.stats.totalRequests > 0
                ? ((this.stats.hits / this.stats.totalRequests) * 100).toFixed(2)
                : '0.00';

        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            totalRequests: this.stats.totalRequests,
            hitRate: `${hitRate}%`,
            cacheSize: this.cache.size,
            keyStats: Array.from(this.keyStats.entries()).map(([key, stats]) => ({
                key,
                hits: stats.hits,
                misses: stats.misses,
            })),
        };
    }

    /**
     * Cập nhật thống kê cho mỗi key
     */
    _updateKeyStats(key, type) {
        if (!this.keyStats.has(key)) {
            this.keyStats.set(key, { hits: 0, misses: 0 });
        }

        const stats = this.keyStats.get(key);
        if (type === 'hit') {
            stats.hits++;
        } else if (type === 'miss') {
            stats.misses++;
        }
    }

    /**
     * Dọn dẹp các cache entries đã hết hạn (chạy định kỳ)
     */
    cleanupExpired() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.expiry <= now) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[CACHE CLEANUP] Removed ${cleaned} expired entries`);
        }
    }
}

// Instance singleton
export const rpcCache = new RPCCache();

// Dọn dẹp các cache entries đã hết hạn mỗi 5 phút
setInterval(() => {
    rpcCache.cleanupExpired();
}, 5 * 60 * 1000);

export default rpcCache;
