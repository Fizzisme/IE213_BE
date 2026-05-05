/**
 * Test Formatter Utility - Giúp in output test dễ nhìn hơn
 * 
 * Usage:
 *   import { formatter } from './testFormatter.js';
 *   
 *   formatter.header('Test Suite Name');
 *   formatter.section('Section Name');
 *   formatter.success('Message');
 *   formatter.error('Message');
 *   formatter.info('Message');
 *   formatter.summary('Test Name', 'PASS/FAIL', 'Details');
 */

export const formatter = {
    // Colors (ANSI codes)
    colors: {
        reset: '\x1b[0m',
        bright: '\x1b[1m',
        dim: '\x1b[2m',
        green: '\x1b[32m',
        red: '\x1b[31m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
    },

    // Header - Big title
    header(title) {
        console.log('\n' + '█'.repeat(70));
        console.log('█' + ' '.repeat(68) + '█');
        console.log('█' + title.padStart(Math.floor((68 + title.length) / 2)).padEnd(69) + '█');
        console.log('█' + ' '.repeat(68) + '█');
        console.log('█'.repeat(70) + '\n');
    },

    // Section header
    section(title) {
        console.log('\n' + '━'.repeat(70));
        console.log('  ' + title);
        console.log('━'.repeat(70) + '\n');
    },

    // Success message
    success(message) {
        console.log(this.colors.green + '✓ ' + this.colors.reset + message);
    },

    // Failure message
    error(message) {
        console.log(this.colors.red + '✗ ' + this.colors.reset + message);
    },

    // Info message
    info(message) {
        console.log(this.colors.cyan + 'ℹ ' + this.colors.reset + message);
    },

    // Warning message
    warn(message) {
        console.log(this.colors.yellow + '⚠ ' + this.colors.reset + message);
    },

    // Test result with details
    result(name, status, details = '') {
        const statusColor = status === 'PASS' ? this.colors.green : this.colors.red;
        const statusSymbol = status === 'PASS' ? '✓' : '✗';
        console.log(`${statusColor}${statusSymbol}${this.colors.reset} ${name}`);
        if (details) {
            console.log(`  ${this.colors.dim}${details}${this.colors.reset}`);
        }
    },

    // Statistics table
    stats(data) {
        console.log('\n' + '─'.repeat(70));
        console.log('  CACHE STATISTICS');
        console.log('─'.repeat(70));
        Object.entries(data).forEach(([key, value]) => {
            console.log(`  ${key.padEnd(20)} : ${value}`);
        });
        console.log('─'.repeat(70) + '\n');
    },

    // Summary line
    summary(total, passed, failed) {
        const status = failed === 0 ? this.colors.green + '✓ PASS' : this.colors.red + '✗ FAIL';
        console.log(`\n${status}${this.colors.reset}: ${passed}/${total} tests passed`);
    },

    // Separator line
    separator() {
        console.log('─'.repeat(70));
    },

    // Divider
    divider() {
        console.log('\n' + '═'.repeat(70) + '\n');
    },

    // Cache operation log
    cacheOp(operation, key, details = '') {
        const colors = {
            'HIT': this.colors.green,
            'MISS': this.colors.yellow,
            'SET': this.colors.cyan,
            'CLEAR': this.colors.blue,
            'ERROR': this.colors.red,
        };

        const opType = operation.split(':')[0];
        const color = colors[opType] || this.colors.white;

        console.log(`${color}[${operation}]${this.colors.reset} ${key}${details ? ' - ' + details : ''}`);
    },

    // Formatted test output
    testOutput(title, output) {
        console.log(this.colors.dim + '  ' + title + this.colors.reset);
        console.log(this.colors.dim + output.split('\n').map(line => '    ' + line).join('\n') + this.colors.reset);
    },
};

export default formatter;
