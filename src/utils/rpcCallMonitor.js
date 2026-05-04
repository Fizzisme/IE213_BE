/**
 * RPC Call Monitor - Theo dõi RPC calls để lấy metrics
 * 
 * Sử dụng: Để chứng minh giảm RPC calls trong Aspect 3
 */

class RPCCallMonitor {
    constructor() {
        this.calls = [];
        this.started = false;
        this.startTime = null;
    }

    /**
     * Bắt đầu theo dõi RPC calls
     */
    start() {
        this.calls = [];
        this.started = true;
        this.startTime = Date.now();
        console.log('[RPC MONITOR] Started tracking RPC calls');
    }

    /**
     * Dừng theo dõi và lấy report
     */
    stop() {
        if (!this.started) {
            console.warn('[RPC MONITOR] Monitor not started');
            return null;
        }

        this.started = false;
        const endTime = Date.now();
        const duration = endTime - this.startTime;

        return this.getReport(duration);
    }

    /**
     * Ghi lại một RPC call
     */
    logCall(method, args = [], result = null, duration = 0) {
        if (!this.started) return;

        this.calls.push({
            method,
            args,
            result,
            duration, // milliseconds
            timestamp: Date.now(),
        });

        console.log(
            `[RPC CALL] ${method}(${JSON.stringify(args)}) - ${duration}ms`
        );
    }

    /**
     * Ghi lại batch calls
     */
    logBatchCalls(methods, duration = 0) {
        if (!this.started) return;

        this.calls.push({
            type: 'BATCH',
            methods,
            duration,
            timestamp: Date.now(),
        });

        console.log(
            `[RPC BATCH] ${methods.join(', ')} - ${duration}ms`
        );
    }

    /**
     * Lấy report chi tiết
     */
    getReport(duration = 0) {
        const report = {
            totalCalls: this.calls.length,
            batchCalls: this.calls.filter(c => c.type === 'BATCH').length,
            singleCalls: this.calls.filter(c => !c.type).length,
            totalDuration: duration,
            avgDurationPerCall: this.calls.length > 0
                ? (duration / this.calls.length).toFixed(2)
                : 0,
            callDetails: this.calls,
            summary: {
                timestamp: new Date().toISOString(),
                duration: `${duration}ms`,
                totalRPCCalls: this.calls.length,
                methodBreakdown: this._getMethodBreakdown(),
            }
        };

        return report;
    }

    /**
     * Phân tích số lượng calls theo method
     */
    _getMethodBreakdown() {
        const breakdown = {};

        for (const call of this.calls) {
            if (call.type === 'BATCH') {
                for (const method of call.methods) {
                    breakdown[method] = (breakdown[method] || 0) + 1;
                }
            } else if (call.method) {
                breakdown[call.method] = (breakdown[call.method] || 0) + 1;
            }
        }

        return breakdown;
    }

    /**
     * Xuất report dạng JSON
     */
    exportJSON() {
        const report = this.getReport();
        return JSON.stringify(report, null, 2);
    }

    /**
     * Reset toàn bộ dữ liệu
     */
    reset() {
        this.calls = [];
        this.started = false;
        this.startTime = null;
    }
}

// Instance singleton
export const rpcMonitor = new RPCCallMonitor();

export default rpcMonitor;
