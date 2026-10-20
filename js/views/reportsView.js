(function (MRS) {
    'use strict';

    var state = {
        period: 'week',
        anchor: Date.now()
    };

    var PERIOD_LABELS = {
        day: 'Day',
        week: 'Week',
        month: 'Month',
        quarter: 'Quarter',
        year: 'Year'
    };

    function emptyBlock(title, copy) {
        return '<div class="dash-empty"><strong>' + MRS.utils.escapeHtml(title) + '</strong><span>' + MRS.utils.escapeHtml(copy) + '</span></div>';
    }

    function renderPeriodControls() {
        var host = MRS.utils.$('reportPeriods');
        if (host) {
            host.innerHTML = MRS.reports.PERIODS.map(function (period) {
                return '<button type="button" class="filter-chip' + (state.period === period ? ' active' : '') + '" data-action="report-period" data-period="' + period + '">' +
                    PERIOD_LABELS[period] + '</button>';
            }).join('');
        }
        var range = MRS.reports.rangeFor(state.period, state.anchor);
        MRS.utils.setText('reportRangeLabel', range.label);
        return range;
    }

    function renderSummary(data) {
        MRS.utils.setText('reportStatRequested', data.requested.length);
        MRS.utils.setText('reportStatDone', data.fulfilled.length);
        MRS.utils.setText('reportStatRejected', data.rejected.length);
        MRS.utils.setText('reportStatAvg', data.average.count ? MRS.utils.formatDuration(data.average.averageMs) : '--');
        MRS.utils.setText('reportStatAvgCaption', data.average.count
            ? 'Across ' + data.average.count + ' completed request' + (data.average.count === 1 ? '' : 's')
            : 'No completed requests in this period');
        MRS.utils.setText('reportMeta', data.union.length + ' request' + (data.union.length === 1 ? '' : 's') + ' touch this period');
    }

    function renderTop(data) {
        var host = MRS.utils.$('reportTopItems');
        if (!host) return;
        var items = MRS.reports.topItems(data.requested, 10);
        if (!items.length) {
            host.innerHTML = emptyBlock('No requests in this period', 'Try another period or submit a new request.');
            return;
        }
        var max = items[0].requests;
        host.innerHTML = items.map(function (item, index) {
            var width = Math.max(4, Math.round(item.requests / max * 100));
            return '<div class="top-item-row">' +
                '<span class="top-item-rank">' + MRS.utils.escapeHtml(MRS.utils.pad2(index + 1)) + '</span>' +
                '<div class="top-item-main">' +
                '<span class="top-item-pn">' + MRS.utils.escapeHtml(item.itemPn) + '</span>' +
                '<strong>' + MRS.utils.escapeHtml(item.itemName) + '</strong>' +
                '<span class="top-item-meta">' + MRS.utils.escapeHtml(MRS.requests.formatQuantity(item.quantity)) + ' ' + MRS.utils.escapeHtml(item.unit) + '</span>' +
                '</div>' +
                '<div class="top-item-count"><strong>' + item.requests + '</strong><span>req</span></div>' +
                '<div class="top-item-track"><i style="width:' + width + '%"></i></div>' +
                '</div>';
        }).join('');
    }

    function renderPareto(data) {
        var host = MRS.utils.$('reportPareto');
        if (!host) return;
        var rows = MRS.reports.rejectionPareto(data.rejected);
        if (!rows.length) {
            host.innerHTML = emptyBlock('No rejections in this period', 'Rejection reasons and cumulative share will appear here.');
            return;
        }
        var max = rows[0].count;
        host.innerHTML = rows.map(function (row) {
            var width = Math.max(4, Math.round(row.count / max * 100));
            return '<div class="pareto-row">' +
                '<div class="pareto-line">' +
                '<span class="pareto-rank">' + MRS.utils.escapeHtml(MRS.utils.pad2(row.rank)) + '</span>' +
                '<span class="pareto-reason">' + MRS.utils.escapeHtml(row.reason) + '</span>' +
                '<strong>' + row.count + '</strong>' +
                '<em>' + Math.round(row.cumulative * 100) + '%</em>' +
                '</div>' +
                '<div class="pareto-track"><i style="width:' + width + '%"></i></div>' +
                '</div>';
        }).join('');
    }

    function handlingLine(request) {
        if (request.status === 'DONE') {
            return 'Done by ' + (request.handledByName || 'logistics') + '<small>' + MRS.utils.escapeHtml(MRS.utils.formatDateTime(request.completedAt)) + '</small>';
        }
        if (request.status === 'WORKING') {
            return 'Started by ' + (request.startedByName || 'logistics') + '<small>' + MRS.utils.escapeHtml(MRS.utils.formatDateTime(request.startedAt)) + '</small>';
        }
        if (request.status === 'REJECTED') {
            return 'Rejected by ' + (request.handledByName || 'logistics') + '<small>' + MRS.utils.escapeHtml(MRS.utils.formatDateTime(request.rejectedAt)) + '</small>';
        }
        return 'Waiting in queue';
    }

    function renderTable(data) {
        var host = MRS.utils.$('reportRequestRows');
        var empty = MRS.utils.$('reportTableEmpty');
        if (!host) return;
        if (!data.union.length) {
            host.innerHTML = '';
            host.classList.add('hidden');
            if (empty) empty.classList.remove('hidden');
            return;
        }
        host.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');
        host.innerHTML = data.union.map(function (request) {
            var lead = request.status === 'DONE'
                ? MRS.utils.formatDuration(MRS.reports.fulfillmentMs(request))
                : '--';
            var reason = request.status === 'REJECTED' ? request.rejectionReason : '';
            var reasonNote = request.status === 'REJECTED' && request.rejectionNote
                ? '<small class="report-reason-note">Note: ' + MRS.utils.escapeHtml(request.rejectionNote) + '</small>'
                : '';
            return '<tr>' +
                '<td><span class="report-request"><strong>' + MRS.utils.escapeHtml(request.requestNumber) + '</strong><small>' + MRS.utils.escapeHtml(MRS.utils.formatDateTime(request.createdAt)) + '</small></span></td>' +
                '<td><span class="stock-item-cell"><strong>' + MRS.utils.escapeHtml(request.itemPn) + '</strong><small>' + MRS.utils.escapeHtml(request.itemName) + '</small></span></td>' +
                '<td class="mono align-right">' + MRS.utils.escapeHtml(MRS.requests.formatQuantity(request.quantity)) + ' ' + MRS.utils.escapeHtml(request.unit) + '</td>' +
                '<td><span class="request-status ' + MRS.utils.escapeAttr(request.status) + '">' + MRS.utils.escapeHtml(MRS.requests.statusLabel(request.status)) + '</span></td>' +
                '<td><span class="report-request"><strong>' + MRS.utils.escapeHtml(request.requesterName) + '</strong><small>' + MRS.utils.escapeHtml(request.requestingArea) + '</small></span></td>' +
                '<td><span class="report-handling">' + handlingLine(request) + '</span></td>' +
                '<td class="mono">' + MRS.utils.escapeHtml(lead) + '</td>' +
                '<td><span class="report-reason">' + MRS.utils.escapeHtml(reason || '--') + reasonNote + '</span></td>' +
                '</tr>';
        }).join('');
    }

    function render() {
        if (!MRS.currentUser || !MRS.auth.hasRole('LOGISTICS')) return;
        MRS.movements.ensureFromRequests();
        renderPeriodControls();
        var data = MRS.reports.periodData(state.period, state.anchor);
        renderSummary(data);
        renderTop(data);
        renderPareto(data);
        renderTable(data);
    }

    function setPeriod(period) {
        if (MRS.reports.PERIODS.indexOf(period) === -1) return;
        state.period = period;
        state.anchor = Date.now();
        render();
    }

    function shift(delta) {
        state.anchor = MRS.reports.shiftAnchor(state.period, state.anchor, Number(delta) || 0);
        render();
    }

    function current() {
        state.anchor = Date.now();
        render();
    }

    function exportAll() {
        if (!MRS.auth.requireRole('LOGISTICS')) return;
        var result = MRS.exporter.exportXlsx();
        if (result.ok) MRS.utils.toast('All data exported as one Excel workbook.', 'success', 4200);
        else MRS.utils.toast(result.error || 'Could not export the workbook.', 'error', 5000);
    }

    MRS.views = MRS.views || {};
    MRS.views.reports = {
        render: render,
        setPeriod: setPeriod,
        shift: shift,
        current: current,
        exportAll: exportAll
    };

}(window.MRS = window.MRS || {}));
