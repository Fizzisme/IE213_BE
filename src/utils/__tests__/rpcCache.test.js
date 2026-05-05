/**
 * Unit Tests cho RPCCache
 * 
 * Chạy: node src/utils/__tests__/rpcCache.test.js
 */

import assert from 'assert';
import { rpcCache } from '../rpcCache.js';

let testsPassed = 0;
let testsFailed = 0;

// Helper để chạy test
async function test(name, testFn) {
    try {
        // Cleanup expired entries trước test
        rpcCache.cleanupExpired();
        await testFn();
        console.log(`✓ PASS: ${name}`);
        testsPassed++;
    } catch (error) {
        console.error(`✗ FAIL: ${name}`);
        console.error(`  Error: ${error.message}`);
        testsFailed++;
    }
}

// Helper để tạo delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('═══════════════════════════════════════════════════════');
console.log('UNIT TESTS: RPCCache');
console.log('═══════════════════════════════════════════════════════\n');

// TEST 1: Cache miss - lần đầu gọi phải fetch
test('Cache miss: Lần đầu gọi phải gọi fetcher', async () => {
    rpcCache.clear();

    let fetcherCalled = false;
    const result = await rpcCache.getOrFetch(
        'test:key:1',
        async () => {
            fetcherCalled = true;
            return 'test-value';
        },
        5000
    );

    assert.strictEqual(fetcherCalled, true, 'Fetcher phải được gọi lần đầu');
    assert.strictEqual(result, 'test-value', 'Kết quả phải đúng');
    assert.strictEqual(rpcCache.cache.size, 1, 'Cache phải có 1 entry');
});

// TEST 2: Cache hit - lần thứ 2 không gọi fetcher
test('Cache hit: Lần thứ 2 không gọi fetcher', async () => {
    rpcCache.clear();

    let callCount = 0;
    const fetcher = async () => {
        callCount++;
        return 'test-value';
    };

    // Gọi lần 1
    await rpcCache.getOrFetch('test:key:2', fetcher, 5000);
    assert.strictEqual(callCount, 1, 'Lần 1: callCount = 1');

    // Gọi lần 2 - phải trả về cache
    const result = await rpcCache.getOrFetch('test:key:2', fetcher, 5000);
    assert.strictEqual(callCount, 1, 'Lần 2: callCount vẫn = 1 (không gọi fetcher)');
    assert.strictEqual(result, 'test-value', 'Kết quả từ cache phải đúng');
});

// TEST 3: Cache expiry - hết hạn phải gọi lại fetcher
test('Cache expiry: Hết hạn phải gọi lại fetcher', async () => {
    rpcCache.clear();

    let callCount = 0;
    const fetcher = async () => {
        callCount++;
        return `value-${callCount}`;
    };

    // Gọi lần 1 với TTL 100ms
    await rpcCache.getOrFetch('test:key:3', fetcher, 100);
    assert.strictEqual(callCount, 1, 'Lần 1: gọi fetcher');

    // Chờ 150ms để cache expire
    await delay(150);

    // Gọi lần 2 - cache đã expired → gọi lại fetcher
    const result = await rpcCache.getOrFetch('test:key:3', fetcher, 100);
    assert.strictEqual(callCount, 2, 'Lần 2: gọi lại fetcher (cache expired)');
    assert.strictEqual(result, 'value-2', 'Kết quả mới từ fetcher');
});

// TEST 4: Stats tracking - theo dõi hits/misses
test('Stats: Tracking hits và misses', async () => {
    rpcCache.clear();

    const fetcher = async () => 'value';

    // 3 misses (3 lần đầu tiên)
    await rpcCache.getOrFetch('test:stat:1', fetcher, 5000);
    await rpcCache.getOrFetch('test:stat:2', fetcher, 5000);
    await rpcCache.getOrFetch('test:stat:3', fetcher, 5000);

    // 2 hits (từ cache)
    await rpcCache.getOrFetch('test:stat:1', fetcher, 5000);
    await rpcCache.getOrFetch('test:stat:2', fetcher, 5000);

    const stats = rpcCache.getStats();
    assert.strictEqual(stats.totalRequests, 5, 'Tổng requests = 5');
    assert.strictEqual(stats.hits, 2, 'Hits = 2');
    assert.strictEqual(stats.misses, 3, 'Misses = 3');
    assert.strictEqual(stats.hitRate, '40.00', 'Hit rate = 40%');
});

// TEST 5: Invalidate - xóa cache entry
test('Invalidate: Xóa cache entry', async () => {
    rpcCache.clear();

    let callCount = 0;
    const fetcher = async () => {
        callCount++;
        return `value-${callCount}`;
    };

    // Gọi lần 1
    await rpcCache.getOrFetch('test:invalid:1', fetcher, 5000);
    assert.strictEqual(callCount, 1, 'Lần 1: gọi fetcher');

    // Invalidate (xóa cache)
    rpcCache.invalidate('test:invalid:1');

    // Gọi lần 2 - phải gọi fetcher lại (cache đã bị xóa)
    await rpcCache.getOrFetch('test:invalid:1', fetcher, 5000);
    assert.strictEqual(callCount, 2, 'Lần 2: gọi lại fetcher (cache bị invalidate)');
});

// TEST 6: Clear - xóa toàn bộ cache
test('Clear: Xóa toàn bộ cache', async () => {
    rpcCache.clear();

    const fetcher = async () => 'value';

    // Thêm vào cache
    await rpcCache.getOrFetch('test:clear:1', fetcher, 5000);
    await rpcCache.getOrFetch('test:clear:2', fetcher, 5000);
    assert.strictEqual(rpcCache.cache.size, 2, 'Cache có 2 entries');

    // Clear
    rpcCache.clear();
    assert.strictEqual(rpcCache.cache.size, 0, 'Sau clear: cache trống');

    const stats = rpcCache.getStats();
    assert.strictEqual(stats.hits, 0, 'Stats reset: hits = 0');
    assert.strictEqual(stats.misses, 0, 'Stats reset: misses = 0');
});

// TEST 7: Key-specific stats - theo dõi stats cho mỗi key
test('Key stats: Tracking per-key stats', async () => {
    rpcCache.clear();

    const fetcher = async () => 'value';

    // Key 1: 1 miss, 2 hits
    await rpcCache.getOrFetch('test:keystat:1', fetcher, 5000);
    await rpcCache.getOrFetch('test:keystat:1', fetcher, 5000);
    await rpcCache.getOrFetch('test:keystat:1', fetcher, 5000);

    // Key 2: 1 miss, 1 hit
    await rpcCache.getOrFetch('test:keystat:2', fetcher, 5000);
    await rpcCache.getOrFetch('test:keystat:2', fetcher, 5000);

    const stats = rpcCache.getStats();
    const key1Stats = stats.keyStats.find(s => s.key === 'test:keystat:1');
    const key2Stats = stats.keyStats.find(s => s.key === 'test:keystat:2');

    assert.strictEqual(key1Stats.hits, 2, 'Key 1: hits = 2');
    assert.strictEqual(key1Stats.misses, 1, 'Key 1: misses = 1');
    assert.strictEqual(key2Stats.hits, 1, 'Key 2: hits = 1');
    assert.strictEqual(key2Stats.misses, 1, 'Key 2: misses = 1');
});

// TEST 8: Cleanup expired - tự động xóa entries hết hạn
test('Cleanup: Tự động xóa entries hết hạn', async () => {
    rpcCache.clear();

    const fetcher = async () => 'value';

    // Thêm entry với TTL 50ms
    await rpcCache.getOrFetch('test:cleanup:1', fetcher, 50);
    assert.strictEqual(rpcCache.cache.size, 1, 'Trước cleanup: 1 entry');

    // Chờ để expire
    await delay(100);

    // Gọi cleanup
    rpcCache.cleanupExpired();
    assert.strictEqual(rpcCache.cache.size, 0, 'Sau cleanup: 0 entries (đã xóa expired)');
});

// TEST 9: Error handling - fetcher throw error
test('Error handling: Fetcher throw error', async () => {
    rpcCache.clear();

    const fetcher = async () => {
        throw new Error('RPC call failed');
    };

    try {
        await rpcCache.getOrFetch('test:error:1', fetcher, 5000);
        throw new Error('Phải throw error');
    } catch (error) {
        assert.strictEqual(error.message, 'RPC call failed', 'Error message phải đúng');
        assert.strictEqual(rpcCache.cache.size, 0, 'Lỗi → không lưu cache');
    }
});

// TEST 10: Parallel requests - nhiều requests cùng lúc
test('Parallel: Nhiều requests cùng lúc', async () => {
    rpcCache.clear();

    let callCount = 0;
    const fetcher = async () => {
        callCount++;
        await delay(100);  // Simulate RPC latency
        return `value-${callCount}`;
    };

    // 5 requests cùng lúc cho key khác nhau
    const results = await Promise.all([
        rpcCache.getOrFetch('test:parallel:1', fetcher, 5000),
        rpcCache.getOrFetch('test:parallel:2', fetcher, 5000),
        rpcCache.getOrFetch('test:parallel:3', fetcher, 5000),
        rpcCache.getOrFetch('test:parallel:4', fetcher, 5000),
        rpcCache.getOrFetch('test:parallel:5', fetcher, 5000),
    ]);

    assert.strictEqual(callCount, 5, 'Gọi fetcher 5 lần (mỗi key 1 lần)');
    assert.strictEqual(rpcCache.cache.size, 5, 'Cache có 5 entries');
    assert.strictEqual(results.length, 5, '5 kết quả trả về');
});

// Helper: In stats đẹp
function printStats() {
    const stats = rpcCache.getStats();
    console.log('\n' + '═'.repeat(60));
    console.log('                    CACHE STATISTICS');
    console.log('═'.repeat(60));
    console.log(`  Total Requests    : ${stats.totalRequests}`);
    console.log(`  Cache Hits        : ${stats.hits}`);
    console.log(`  Cache Misses      : ${stats.misses}`);
    console.log(`  Hit Rate          : ${stats.hitRate}`);
    console.log(`  Cache Size        : ${stats.cacheSize} entries`);
    console.log('═'.repeat(60) + '\n');
}

// In kết quả
console.log('\n' + '─'.repeat(60));
const resultStatus = testsFailed === 0 ? '✓ PASSED' : '✗ FAILED';
console.log(`  ${resultStatus}: ${testsPassed} passed, ${testsFailed} failed`);
console.log('─'.repeat(60));

printStats();

if (testsFailed > 0) {
    console.log('❌ Some tests failed. Check the output above.\n');
    process.exit(1);
} else {
    console.log('✅ All tests passed! RPC Cache is working correctly.\n');
}
