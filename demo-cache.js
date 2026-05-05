/**
 * Simple Demo - Chạy 3 ví dụ đơn giản về cache
 */

import { rpcCache } from './src/utils/rpcCache.js';

console.clear();
console.log('█'.repeat(70));
console.log('█' + ' '.repeat(68) + '█');
console.log('█' + '       RPC CACHE - LIVE DEMO'.padEnd(69) + '█');
console.log('█' + ' '.repeat(68) + '█');
console.log('█'.repeat(70) + '\n');

// Delay helper
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Demo 1: Cache Miss -> Cache Hit
async function demo1() {
    console.log('📋 DEMO 1: Cache Miss -> Cache Hit\n');
    console.log('─'.repeat(70));

    rpcCache.clear();
    let rpcCalls = 0;

    // Mock fetcher
    const fetcher = async () => {
        rpcCalls++;
        console.log('  [RPC Call #' + rpcCalls + '] Fetching from blockchain...');
        await delay(300);
        return 'doctor-wallet-verified';
    };

    // Request 1
    console.log('\n  🔵 Request 1: Check doctor role');
    const result1 = await rpcCache.getOrFetch('role:0x5678:DOCTOR', fetcher, 3600000);
    console.log('  ✓ Result: ' + result1);
    console.log('  💾 Cached: YES (first request)\n');

    // Request 2
    console.log('  🔵 Request 2: Check doctor role (same doctor)');
    const result2 = await rpcCache.getOrFetch('role:0x5678:DOCTOR', fetcher, 3600000);
    console.log('  ✓ Result: ' + result2);
    console.log('  💾 Cached: YES (from cache, no RPC)\n');

    // Stats
    const stats = rpcCache.getStats();
    console.log('  📊 Stats:');
    console.log('     • RPC calls made: ' + rpcCalls + ' (should be 1)');
    console.log('     • Cache hits: ' + stats.hits);
    console.log('     • Cache misses: ' + stats.misses);
    console.log('     • Hit rate: ' + stats.hitRate);

    console.log('\n' + '─'.repeat(70) + '\n');
    return rpcCalls === 1;
}

// Demo 2: Multiple cache keys
async function demo2() {
    console.log('📋 DEMO 2: Multiple Doctors (Different Cache Keys)\n');
    console.log('─'.repeat(70));

    rpcCache.clear();
    let rpcCalls = 0;

    const fetcher = async (doctor) => {
        rpcCalls++;
        console.log('  [RPC Call #' + rpcCalls + '] Fetching for ' + doctor);
        await delay(200);
        return doctor + '-verified';
    };

    // Doctor 1
    console.log('\n  🔵 Request 1: Check doctor A');
    await rpcCache.getOrFetch('role:doctorA:DOCTOR', () => fetcher('Doctor A'), 3600000);
    console.log('  ✓ Doctor A verified\n');

    // Doctor 2 (different key)
    console.log('  🔵 Request 2: Check doctor B');
    await rpcCache.getOrFetch('role:doctorB:DOCTOR', () => fetcher('Doctor B'), 3600000);
    console.log('  ✓ Doctor B verified\n');

    // Doctor 1 again (cache hit)
    console.log('  🔵 Request 3: Check doctor A again');
    await rpcCache.getOrFetch('role:doctorA:DOCTOR', () => fetcher('Doctor A'), 3600000);
    console.log('  ✓ Doctor A verified (from cache)\n');

    const stats = rpcCache.getStats();
    console.log('  📊 Stats:');
    console.log('     • RPC calls made: ' + rpcCalls + ' (should be 2)');
    console.log('     • Cache hits: ' + stats.hits);
    console.log('     • Cache misses: ' + stats.misses);
    console.log('     • Cache size: ' + stats.cacheSize + ' entries');

    console.log('\n' + '─'.repeat(70) + '\n');
    return rpcCalls === 2;
}

// Demo 3: Cache expiry
async function demo3() {
    console.log('📋 DEMO 3: Cache Expiry (TTL)\n');
    console.log('─'.repeat(70));

    rpcCache.clear();
    let rpcCalls = 0;

    const fetcher = async () => {
        rpcCalls++;
        console.log('  [RPC Call #' + rpcCalls + '] Fetching data...');
        return 'fresh-data';
    };

    // Request 1 - TTL 500ms
    console.log('\n  🔵 Request 1: Cache with TTL 500ms');
    await rpcCache.getOrFetch('temp:data', fetcher, 500);
    console.log('  ✓ Data cached\n');

    // Request 2 - Within TTL
    console.log('  🔵 Request 2: Access after 200ms (still valid)');
    await delay(200);
    await rpcCache.getOrFetch('temp:data', fetcher, 500);
    console.log('  ✓ From cache (no RPC)\n');

    // Request 3 - After TTL expires
    console.log('  🔵 Request 3: Access after 400ms total (TTL expired)');
    await delay(300);
    await rpcCache.getOrFetch('temp:data', fetcher, 500);
    console.log('  ✓ Refetched (cache expired)\n');

    console.log('  📊 Stats:');
    console.log('     • RPC calls made: ' + rpcCalls + ' (should be 2)');
    console.log('     • Cache hits: ' + rpcCache.getStats().hits);

    console.log('\n' + '─'.repeat(70) + '\n');
    return rpcCalls === 2;
}

// Run all demos
async function runAll() {
    try {
        const demo1Passed = await demo1();
        const demo2Passed = await demo2();
        const demo3Passed = await demo3();

        // Final summary
        console.log('█'.repeat(70));
        console.log('█' + ' '.repeat(68) + '█');

        if (demo1Passed && demo2Passed && demo3Passed) {
            console.log('█' + '       ✅ ALL DEMOS PASSED!'.padEnd(69) + '█');
        } else {
            console.log('█' + '       ⚠️ SOME DEMOS FAILED'.padEnd(69) + '█');
        }

        console.log('█' + ' '.repeat(68) + '█');
        console.log('█'.repeat(70) + '\n');

        console.log('💡 INSIGHTS:');
        console.log('   • Cache reduces RPC calls by reusing recent queries');
        console.log('   • Different keys = separate cache entries');
        console.log('   • TTL controls how long data stays fresh');
        console.log('   • Perfect for medical record access checks\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

runAll();
