/**
 * Pretty Test Runner - Format output cho dễ nhìn
 * 
 * Chạy: node run-tests-pretty.js
 */

import { spawn } from 'child_process';

console.clear();

// Header
console.log('\n' + '█'.repeat(70));
console.log('█' + ' '.repeat(68) + '█');
console.log('█' + '     TEST SUITE RUNNER - RPC CACHE SYSTEM'.padEnd(69) + '█');
console.log('█' + ' '.repeat(68) + '█');
console.log('█'.repeat(70) + '\n');

// Run Unit Tests
console.log('📋 STEP 1: Running Unit Tests...\n');
console.log('─'.repeat(70));

let unitTestPassed = false;

const unitTest = spawn('node', ['--experimental-modules', 'src/utils/__tests__/rpcCache.test.js'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: true
});

let unitOutput = '';
unitTest.stdout.on('data', (data) => {
    const output = data.toString();
    unitOutput += output;
    // Print with formatting
    if (output.includes('PASS') || output.includes('FAIL') || output.includes('CACHE')) {
        process.stdout.write(output);
    }
});

unitTest.stderr.on('data', (data) => {
    const output = data.toString();
    if (!output.includes('MODULE_TYPELESS') && !output.includes('Warning')) {
        process.stdout.write(output);
    }
});

unitTest.on('close', (code) => {
    unitTestPassed = code === 0;

    console.log('\n' + '─'.repeat(70));
    if (unitTestPassed) {
        console.log('✅ Unit Tests: PASSED\n');
    } else {
        console.log('❌ Unit Tests: FAILED\n');
    }

    // Run Integration Tests
    console.log('📋 STEP 2: Running Integration Tests...\n');
    console.log('─'.repeat(70));

    const integrationTest = spawn('node', ['--experimental-modules', 'src/services/__tests__/medicalRecord.cache.integration.test.js'], {
        cwd: process.cwd(),
        stdio: 'pipe',
        shell: true
    });

    let integrationOutput = '';
    integrationTest.stdout.on('data', (data) => {
        const output = data.toString();
        integrationOutput += output;
        if (output.includes('PASS') || output.includes('FAIL') || output.includes('Mock') || output.includes('Scenario')) {
            process.stdout.write(output);
        }
    });

    integrationTest.stderr.on('data', (data) => {
        const output = data.toString();
        if (!output.includes('MODULE_TYPELESS') && !output.includes('Warning')) {
            process.stdout.write(output);
        }
    });

    integrationTest.on('close', (integrationCode) => {
        const integrationTestPassed = integrationCode === 0;

        console.log('\n' + '─'.repeat(70));
        if (integrationTestPassed) {
            console.log('✅ Integration Tests: PASSED\n');
        } else {
            console.log('❌ Integration Tests: FAILED\n');
        }

        // Final Summary
        console.log('█'.repeat(70));
        console.log('█' + ' '.repeat(68) + '█');
        console.log('█' + '     FINAL RESULTS'.padEnd(69) + '█');
        console.log('█' + ' '.repeat(68) + '█');
        console.log('█'.repeat(70) + '\n');

        if (unitTestPassed && integrationTestPassed) {
            console.log('   ✅ ALL TESTS PASSED!');
            console.log('   ✅ RPC Cache system is working correctly.');
            console.log('   ✅ Ready for production deployment.\n');
            process.exit(0);
        } else {
            console.log('   ❌ SOME TESTS FAILED!');
            if (!unitTestPassed) console.log('   ❌ Unit Tests: FAILED');
            if (!integrationTestPassed) console.log('   ❌ Integration Tests: FAILED\n');
            process.exit(1);
        }
    });
});
