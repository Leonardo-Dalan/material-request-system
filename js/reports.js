(function (MRS) {
    'use strict';

    var PERIODS = Object.freeze(['day', 'week', 'month', 'quarter', 'year']);
    var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function startOfDay(value) {
        var date = new Date(value);
        date.setHours(0, 0, 0, 0);
        return date;
    }

    function startOfRange(period, anchor) {
        var date = startOfDay(anchor || Date.now());
        if (period === 'week') {
            var offset = (date.getDay() + 6) % 7;
            date.setDate(date.getDate() - offset);
        } else if (period === 'month') {
            date.setDate(1);
        } else if (period === 'quarter') {
            date.setDate(1);
            date.setMonth(Math.floor(date.getMonth() / 3) * 3);
        } else if (period === 'year') {
            date.setDate(1);
            date.setMonth(0);
        }
        return date;
    }

    function shiftStart(period, start, delta) {
        var date = new Date(start.getTime());
        if (period === 'day') date.setDate(date.getDate() + delta);
        else if (period === 'week') date.setDate(date.getDate() + delta * 7);
        else if (period === 'month') date.setMonth(date.getMonth() + delta);
        else if (period === 'quarter') date.setMonth(date.getMonth() + delta * 3);
        else date.setFullYear(date.getFullYear() + delta);
        return date;
    }

    function endOfRange(period, start) {
        return shiftStart(period, start, 1);
    }

    function shortDate(value) {
        var date = new Date(value);
        return MONTHS_SHORT[date.getMonth()] + ' ' + date.getDate();
    }

    function rangeLabel(period, start, end) {
        var last = new Date(end.getTime() - 1);
        if (period === 'day') return shortDate(start) + ', ' + start.getFullYear();
        if (period === 'week') return shortDate(start) + ' - ' + shortDate(last) + ', ' + last.getFullYear();
        if (period === 'month') return MONTHS_SHORT[start.getMonth()] + ' ' + start.getFullYear();
        if (period === 'quarter') return 'Q' + (Math.floor(start.getMonth() / 3) + 1) + ' ' + start.getFullYear();
        return String(start.getFullYear());
    }

    function rangeFor(period, anchor) {
        var key = PERIODS.indexOf(period) === -1 ? 'week' : period;
        var start = startOfRange(key, anchor);
        var end = endOfRange(key, start);
        return {
            period: key,
            start: start.getTime(),
            end: end.getTime(),
            label: rangeLabel(key, start, end)
        };
    }

    function shiftAnchor(period, anchor, delta) {
        var key = PERIODS.indexOf(period) === -1 ? 'week' : period;
        var start = startOfRange(key, anchor);
        return shiftStart(key, start, delta).getTime();
    }

    function inRange(timestamp, range) {
        var value = Number(timestamp) || 0;
        return value >= range.start && value < range.end;
    }

    function allRequests() {
        return MRS.requests.all();
    }

    function requestDoneAt(request) {
        if (!request || request.status !== 'DONE') return 0;
        return Number(request.completedAt) || Number(request.updatedAt) || 0;
    }

    function requestRejectedAt(request) {
        if (!request || request.status !== 'REJECTED') return 0;
        return Number(request.rejectedAt) || Number(request.updatedAt) || 0;
    }

    function fulfillmentMs(request) {
        var done = requestDoneAt(request);
        var created = Number(request.createdAt) || 0;
        if (!done || !created || done < created) return 0;
        return done - created;
    }

    function averageFulfillment(requests) {
        var durations = requests.map(fulfillmentMs).filter(function (value) { return value > 0; });
        if (!durations.length) return { averageMs: 0, count: 0 };
        var total = durations.reduce(function (sum, value) { return sum + value; }, 0);
        return { averageMs: total / durations.length, count: durations.length };
    }

    function periodData(period, anchor) {
        var range = rangeFor(period, anchor);
        var requests = allRequests();
        var requested = requests.filter(function (request) { return inRange(request.createdAt, range); });
        var fulfilled = requests.filter(function (request) { return inRange(requestDoneAt(request), range); });
        var rejected = requests.filter(function (request) { return inRange(requestRejectedAt(request), range); });

        var seen = {};
        var union = [];
        function add(request) {
            if (seen[request.id]) return;
            seen[request.id] = true;
            union.push(request);
        }
        requested.forEach(add);
        fulfilled.forEach(add);
        rejected.forEach(add);
        union.sort(function (a, b) {
            var timeA = Math.max(Number(a.createdAt) || 0, requestDoneAt(a), requestRejectedAt(a));
            var timeB = Math.max(Number(b.createdAt) || 0, requestDoneAt(b), requestRejectedAt(b));
            return timeB - timeA;
        });

        return {
            range: range,
            requested: requested,
            fulfilled: fulfilled,
            rejected: rejected,
            union: union,
            average: averageFulfillment(fulfilled)
        };
    }

    function groupItems(requests) {
        var map = {};
        var order = [];
        requests.forEach(function (request) {
            var key = request.itemId || request.itemPn || request.id;
            if (!map[key]) {
                map[key] = {
                    key: key,
                    itemPn: request.itemPn || 'Unknown',
                    itemName: request.itemName || request.itemPn || 'Unknown material',
                    unit: request.unit || 'pc',
                    requests: 0,
                    quantity: 0
                };
                order.push(key);
            }
            map[key].requests++;
            map[key].quantity += Number(request.quantity) || 0;
            if (request.itemName) map[key].itemName = request.itemName;
        });
        return order.map(function (key) { return map[key]; }).sort(function (a, b) {
            if (b.requests !== a.requests) return b.requests - a.requests;
            if (b.quantity !== a.quantity) return b.quantity - a.quantity;
            return String(a.itemPn).localeCompare(String(b.itemPn));
        });
    }

    function topItems(requests, limit) {
        var max = Number(limit) || 10;
        return groupItems(requests).slice(0, max);
    }

    function rejectionPareto(requests) {
        var map = {};
        var order = [];
        requests.forEach(function (request) {
            var original = String(request.rejectionReason || '').trim() || 'No reason recorded';
            var key = original.toLowerCase();
            if (!map[key]) {
                map[key] = { reason: original, count: 0 };
                order.push(key);
            }
            map[key].count++;
        });

        var total = requests.length;
        var rows = order.map(function (key) { return map[key]; }).sort(function (a, b) {
            if (b.count !== a.count) return b.count - a.count;
            return String(a.reason).localeCompare(String(b.reason));
        });

        var cumulative = 0;
        return rows.map(function (row, index) {
            cumulative += row.count;
            return {
                reason: row.reason,
                count: row.count,
                share: total ? row.count / total : 0,
                cumulative: total ? cumulative / total : 0,
                rank: index + 1
            };
        });
    }

    function last14Days() {
        var today = startOfDay(Date.now());
        var requests = allRequests();
        var days = [];
        for (var index = 13; index >= 0; index--) {
            var start = new Date(today.getTime());
            start.setDate(start.getDate() - index);
            var end = new Date(start.getTime());
            end.setDate(end.getDate() + 1);
            var count = requests.filter(function (request) {
                var created = Number(request.createdAt) || 0;
                return created >= start.getTime() && created < end.getTime();
            }).length;
            days.push({
                label: shortDate(start.getTime()),
                date: MRS.utils.formatDate(start.getTime()),
                count: count,
                isToday: index === 0
            });
        }
        return days;
    }

    function dashboard() {
        var requests = allRequests();
        var todayStart = startOfDay(Date.now()).getTime();
        var tomorrowStart = shiftStart('day', new Date(todayStart), 1).getTime();
        var inToday = function (value) {
            var timestamp = Number(value) || 0;
            return timestamp >= todayStart && timestamp < tomorrowStart;
        };

        return {
            requestsToday: requests.filter(function (request) { return inToday(request.createdAt); }).length,
            doneToday: requests.filter(function (request) { return inToday(requestDoneAt(request)); }).length,
            rejectedToday: requests.filter(function (request) { return inToday(requestRejectedAt(request)); }).length,
            urgentOpen: MRS.requests.stats().urgentOpen,
            totalRequests: requests.length,
            average: averageFulfillment(requests.filter(function (request) { return request.status === 'DONE'; })),
            days: last14Days(),
            pareto: rejectionPareto(requests.filter(function (request) { return request.status === 'REJECTED'; })),
            topItems: topItems(requests, 10)
        };
    }

    function leadTimeHours(request) {
        var ms = fulfillmentMs(request);
        if (!ms) return '';
        return (ms / 3600000).toFixed(2);
    }

    MRS.reports = {
        PERIODS: PERIODS,
        isReady: true,
        startOfRange: startOfRange,
        rangeFor: rangeFor,
        shiftAnchor: shiftAnchor,
        inRange: inRange,
        averageFulfillment: averageFulfillment,
        fulfillmentMs: fulfillmentMs,
        periodData: periodData,
        topItems: topItems,
        rejectionPareto: rejectionPareto,
        last14Days: last14Days,
        dashboard: dashboard,
        leadTimeHours: leadTimeHours
    };

}(window.MRS = window.MRS || {}));
