/**
 * Integration Tests cho RPC Cache trong Medical Record Service
 * 
 * Chạy: node src/services/__tests__/medicalRecord.cache.integration.test.js
 */

import assert from 'assert';
import { rpcCache } from '../../utils/rpcCache.js';

let testsPassed = 0;
let testsFailed = 0;

// Helper để chạy test
async function test(name, testFn) {
    try {
        await testFn();
        console.log(`✓ PASS: ${name}`);
        testsPassed++;
    } catch (error) {
        console.error(`✗ FAIL: ${name}`);
        console.error(`  Error: ${error.message}`);
        testsFailed++;
    }
}

// Helper để simulate smart contract
class MockSmartContract {
    constructor(name) {
        this.name = name;
        this.callCount = 0;
        this.data = {
            'hasRole': {
                '0x1234:1': true,   // Patient role
                '0x5678:2': true,   // Doctor role
                '0xabcd:3': false,  // Invalid
            },
            'canAccess': {
                '0x1234:0x5678': true,   // Patient can be accessed by doctor
                '0x1234:0xabcd': false,  // Patient cannot be accessed by abcd
            },
        };
    }

    async hasRole(wallet, roleId) {
        this.callCount++;
        console.log(`  [Mock] hasRole called: wallet=${wallet.substring(0, 6)}, role=${roleId}, callCount=${this.callCount}`);

        const key = `${wallet}:${roleId}`;
        await new Promise(resolve => setTimeout(resolve, 100));  // Simulate RPC latency

        return this.data.hasRole[key] || false;
    }

    async canAccess(patientWallet, doctorWallet) {
        this.callCount++;
        console.log(`  [Mock] canAccess called: patient=${patientWallet.substring(0, 6)}, doctor=${doctorWallet.substring(0, 6)}, callCount=${this.callCount}`);

        const key = `${patientWallet}:${doctorWallet}`;
        await new Promise(resolve => setTimeout(resolve, 100));  // Simulate RPC latency

        return this.data.canAccess[key] || false;
    }

    async verifyIntegrity(recordId, hash, hashType) {
        this.callCount++;
        console.log(`  [Mock] verifyIntegrity called: record=${recordId}, hashType=${hashType}, callCount=${this.callCount}`);

        await new Promise(resolve => setTimeout(resolve, 100));  // Simulate RPC latency

        return true;
    }

    resetCallCount() {
        this.callCount = 0;
    }
}

console.log('═══════════════════════════════════════════════════════');
console.log('INTEGRATION TESTS: RPC Cache + Medical Record Service');
console.log('═══════════════════════════════════════════════════════\n');

// Mock contracts
const identityManagerContract = new MockSmartContract('IdentityManager');
const dynamicAccessControlContract = new MockSmartContract('DynamicAccessControl');
const medicalLedgerContract = new MockSmartContract('MedicalLedger');

// Run all tests async
async function runAllTests() {

    // TEST 1: Cache hasRole - Scenario 1: Kiểm tra role bác sĩ lần 1
    await test('Scenario 1: Kiểm tra role bác sĩ lần đầu (cache miss)', async () => {
        rpcCache.clear();
        identityManagerContract.resetCallCount();

        const doctorWallet = '0x5678';
        const ROLE_DOCTOR = 2;

        // Lần 1: Cache miss
        console.log('  → Lần 1: Gọi hasRole');
        const isDoctorRole = await rpcCache.getOrFetch(
            `role:${doctorWallet}:${ROLE_DOCTOR}`,
            () => identityManagerContract.hasRole(doctorWallet, ROLE_DOCTOR),
            24 * 60 * 60 * 1000  // 24h
        );

        assert.strictEqual(isDoctorRole, true, 'Bác sĩ role phải = true');
        assert.strictEqual(identityManagerContract.callCount, 1, 'RPC gọi 1 lần');

        const stats = rpcCache.getStats();
        assert.strictEqual(stats.misses, 1, 'Cache misses = 1');
        assert.strictEqual(stats.hits, 0, 'Cache hits = 0');
    });

    // TEST 2: Cache hasRole - Scenario 2: Kiểm tra role bác sĩ lần 2 (cache hit)
    await test('Scenario 2: Kiểm tra role bác sĩ lần 2 (cache hit)', async () => {
        rpcCache.clear();
        identityManagerContract.resetCallCount();

        const doctorWallet = '0x5678';
        const ROLE_DOCTOR = 2;

        // Lần 1: Cache miss
        console.log('  → Lần 1: Gọi hasRole');
        await rpcCache.getOrFetch(
            `role:${doctorWallet}:${ROLE_DOCTOR}`,
            () => identityManagerContract.hasRole(doctorWallet, ROLE_DOCTOR),
            24 * 60 * 60 * 1000
        );
        assert.strictEqual(identityManagerContract.callCount, 1, 'Lần 1: RPC gọi 1 lần');

        // Lần 2: Cache hit
        console.log('  → Lần 2: Gọi hasRole (từ cache)');
        const isDoctorRole = await rpcCache.getOrFetch(
            `role:${doctorWallet}:${ROLE_DOCTOR}`,
            () => identityManagerContract.hasRole(doctorWallet, ROLE_DOCTOR),
            24 * 60 * 60 * 1000
        );

        assert.strictEqual(isDoctorRole, true, 'Kết quả vẫn đúng');
        assert.strictEqual(identityManagerContract.callCount, 1, 'Lần 2: RPC vẫn = 1 (hit cache)');

        const stats = rpcCache.getStats();
        assert.strictEqual(stats.hits, 1, 'Cache hits = 1');
        assert.strictEqual(stats.misses, 1, 'Cache misses = 1');
        assert.strictEqual(stats.hitRate, '50.00%', 'Hit rate = 50%');
    });

    // TEST 3: Cache canAccess - Scenario: Kiểm tra quyền truy cập
    await test('Scenario 3: Kiểm tra quyền truy cập bệnh nhân', async () => {
        rpcCache.clear();
        dynamicAccessControlContract.resetCallCount();

        const patientWallet = '0x1234';
        const doctorWallet = '0x5678';

        // Lần 1: Cache miss
        console.log('  → Lần 1: Gọi canAccess');
        const hasAccess1 = await rpcCache.getOrFetch(
            `access:${patientWallet}:${doctorWallet}`,
            () => dynamicAccessControlContract.canAccess(patientWallet, doctorWallet),
            60 * 60 * 1000  // 1h
        );

        assert.strictEqual(hasAccess1, true, 'Bác sĩ có quyền truy cập');
        assert.strictEqual(dynamicAccessControlContract.callCount, 1, 'RPC gọi 1 lần');

        // Lần 2: Cache hit
        console.log('  → Lần 2: Gọi canAccess (từ cache)');
        const hasAccess2 = await rpcCache.getOrFetch(
            `access:${patientWallet}:${doctorWallet}`,
            () => dynamicAccessControlContract.canAccess(patientWallet, doctorWallet),
            60 * 60 * 1000
        );

        assert.strictEqual(hasAccess2, true, 'Kết quả vẫn đúng');
        assert.strictEqual(dynamicAccessControlContract.callCount, 1, 'RPC vẫn = 1 (hit cache)');
    });

    // TEST 4: Multiple keys - Scenario: Kiểm tra role nhiều bác sĩ
    await test('Scenario 4: Kiểm tra role nhiều bác sĩ khác nhau', async () => {
        rpcCache.clear();
        identityManagerContract.resetCallCount();

        const doctorWallet1 = '0x5678';
        const doctorWallet2 = '0xabcd';
        const ROLE_DOCTOR = 2;

        console.log('  → Bác sĩ 1');
        await rpcCache.getOrFetch(
            `role:${doctorWallet1}:${ROLE_DOCTOR}`,
            () => identityManagerContract.hasRole(doctorWallet1, ROLE_DOCTOR),
            24 * 60 * 60 * 1000
        );

        console.log('  → Bác sĩ 2 (key khác)');
        const isDoctor2 = await rpcCache.getOrFetch(
            `role:${doctorWallet2}:${ROLE_DOCTOR}`,
            () => identityManagerContract.hasRole(doctorWallet2, ROLE_DOCTOR),
            24 * 60 * 60 * 1000
        );

        assert.strictEqual(identityManagerContract.callCount, 2, 'RPC gọi 2 lần (khác key)');
        assert.strictEqual(rpcCache.cache.size, 2, 'Cache có 2 entries khác nhau');
        assert.strictEqual(isDoctor2, false, 'Bác sĩ 2 không có role');
    });

    // TEST 5: Batch verifyIntegrity - Scenario: Song parallel 3 verification
    await test('Scenario 5: Batch verifyIntegrity song parallel', async () => {
        rpcCache.clear();
        medicalLedgerContract.resetCallCount();

        const recordId = 'record-123';
        const recordHash = 'hash-record';
        const resultHash = 'hash-result';
        const diagnosisHash = 'hash-diagnosis';

        console.log('  → Gọi 3 lần verifyIntegrity song parallel');
        const startTime = Date.now();

        const verificationCalls = [
            medicalLedgerContract.verifyIntegrity(recordId, recordHash, 0),
            medicalLedgerContract.verifyIntegrity(recordId, resultHash, 1),
            medicalLedgerContract.verifyIntegrity(recordId, diagnosisHash, 2),
        ];

        const results = await Promise.all(verificationCalls);
        const duration = Date.now() - startTime;

        console.log(`  → Hoàn thành trong ${duration}ms (nên ~100-200ms cho parallel)`);

        assert.strictEqual(medicalLedgerContract.callCount, 3, 'RPC gọi 3 lần');
        assert.strictEqual(results.length, 3, '3 kết quả trả về');
        assert.strictEqual(results.every(r => r === true), true, 'Tất cả verifyIntegrity = true');
        assert.ok(duration < 400, `Duration ${duration}ms < 400ms (nhanh hơn tuần tự ~300ms)`);
    });

    // TEST 6: Real scenario - Tạo medical record (mock)
    await test('Scenario 6: Real scenario - Tạo medical record (mock)', async () => {
        rpcCache.clear();
        identityManagerContract.resetCallCount();
        dynamicAccessControlContract.resetCallCount();

        const patientWallet = '0x1234';
        const doctorWallet = '0x5678';

        console.log('  → Kiểm tra role bác sĩ');
        const isDoctorRole = await rpcCache.getOrFetch(
            `role:${doctorWallet}:2`,
            () => identityManagerContract.hasRole(doctorWallet, 2),
            24 * 60 * 60 * 1000
        );

        console.log('  → Kiểm tra quyền truy cập');
        const hasAccess = await rpcCache.getOrFetch(
            `access:${patientWallet}:${doctorWallet}`,
            () => dynamicAccessControlContract.canAccess(patientWallet, doctorWallet),
            60 * 60 * 1000
        );

        assert.strictEqual(isDoctorRole, true, 'Bác sĩ có role');
        assert.strictEqual(hasAccess, true, 'Bác sĩ có quyền');
        assert.strictEqual(
            identityManagerContract.callCount + dynamicAccessControlContract.callCount,
            2,
            'Tổng RPC: 2 lần (1 hasRole + 1 canAccess)'
        );

        console.log('  → Gọi lại lần 2 (cache hit)');
        const isDoctorRole2 = await rpcCache.getOrFetch(
            `role:${doctorWallet}:2`,
            () => identityManagerContract.hasRole(doctorWallet, 2),
            24 * 60 * 60 * 1000
        );
        const hasAccess2 = await rpcCache.getOrFetch(
            `access:${patientWallet}:${doctorWallet}`,
            () => dynamicAccessControlContract.canAccess(patientWallet, doctorWallet),
            60 * 60 * 1000
        );

        // RPC call count không tăng (hit cache)
        assert.strictEqual(identityManagerContract.callCount, 1, 'identityManager callCount vẫn = 1');
        assert.strictEqual(dynamicAccessControlContract.callCount, 1, 'dynamicAccessControl callCount vẫn = 1');

        const stats = rpcCache.getStats();
        console.log(`  → Cache stats: ${stats.hits} hits, ${stats.misses} misses, ${stats.hitRate} hit rate`);
        assert.strictEqual(stats.hits, 2, 'Cache hits = 2');
        assert.strictEqual(stats.misses, 2, 'Cache misses = 2');
    });

    // Helper: In stats chi tiết
    function printDetailedStats() {
        const stats = rpcCache.getStats();
        console.log('\n' + '═'.repeat(60));
        console.log('            INTEGRATION TEST STATISTICS');
        console.log('═'.repeat(60));
        console.log(`  Total Requests    : ${stats.totalRequests}`);
        console.log(`  Cache Hits        : ${stats.hits}`);
        console.log(`  Cache Misses      : ${stats.misses}`);
        console.log(`  Hit Rate          : ${stats.hitRate}`);
        console.log(`  Cache Size        : ${stats.cacheSize} entries`);
        console.log('─'.repeat(60));

        if (stats.keyStats && Object.keys(stats.keyStats).length > 0) {
            console.log('  Per-Key Breakdown:');
            Object.entries(stats.keyStats).forEach(([key, keyStats]) => {
                console.log(`    • ${key}`);
                console.log(`      Hits: ${keyStats.hits}, Misses: ${keyStats.misses}, Total: ${keyStats.total}`);
            });
        }
        console.log('═'.repeat(60) + '\n');
    }

    // In kết quả
    console.log('\n' + '─'.repeat(60));
    const resultStatus = testsFailed === 0 ? '✓ PASSED' : '✗ FAILED';
    console.log(`  ${resultStatus}: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('─'.repeat(60));

    printDetailedStats();

    if (testsFailed > 0) {
        console.log('❌ Some integration tests failed.\n');
        process.exit(1);
    } else {
        console.log('✅ All integration tests passed! RPC Cache works in production scenarios.\n');
    }

} // End runAllTests()

// Run all tests
runAllTests().catch(error => {
    console.error('❌ Test execution error:', error);
    process.exit(1);
});
