const fs = require("fs");
const path = require("path");

class AuditLogService {
    constructor() {
        this.maxLogs = 1000;
        this.logs = [];
        this.pointHistory = new Map(); // pointId -> Array of history events
        this.metrics = {
            startTime: Date.now(),
            totalRequests: 0,
            successCount: 0,
            errorCount: 0,
            endpointUsage: {},
        };
    }

    log(level, message, meta = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            message,
            ...meta,
        };
        this.logs.unshift(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }
        if (level === "error") {
            this.metrics.errorCount++;
        } else {
            this.metrics.successCount++;
        }
        return entry;
    }

    recordRequest(method, pathName, status, durationMs) {
        this.metrics.totalRequests++;
        const key = `${method} ${pathName}`;
        this.metrics.endpointUsage[key] = (this.metrics.endpointUsage[key] || 0) + 1;

        if (status >= 400) {
            this.log("error", `Request failed: ${method} ${pathName} [${status}] (${durationMs}ms)`);
        } else {
            this.log("info", `Request handled: ${method} ${pathName} [${status}] (${durationMs}ms)`);
        }
    }

    recordPointEvent(collection, pointId, action, details = {}) {
        const strId = String(pointId);
        if (!this.pointHistory.has(strId)) {
            this.pointHistory.set(strId, []);
        }
        const event = {
            timestamp: new Date().toISOString(),
            collection,
            pointId: strId,
            action,
            details,
        };
        const list = this.pointHistory.get(strId);
        list.unshift(event);
        if (list.length > 50) list.pop();

        this.log("info", `Point ${action} on ${collection} [ID: ${strId}]`, { pointId: strId, collection, action });
        return event;
    }

    getPointHistory(pointId) {
        const strId = String(pointId);
        return this.pointHistory.get(strId) || [];
    }

    getLogs(limit = 100, level = null) {
        let results = this.logs;
        if (level) {
            results = results.filter((l) => l.level === level.toUpperCase());
        }
        return results.slice(0, parseInt(limit, 10) || 100);
    }

    getMetrics() {
        const uptimeSeconds = Math.floor((Date.now() - this.metrics.startTime) / 1000);
        return {
            uptimeSeconds,
            ...this.metrics,
        };
    }
}

module.exports = new AuditLogService();
