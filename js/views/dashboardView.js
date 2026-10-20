(function (MRS) {
    'use strict';

    function emptyBlock(title, copy) {
        return '<div class="dash-empty"><strong>' + MRS.utils.escapeHtml(title) + '</strong><span>' + MRS.utils.escapeHtml(copy) + '</span></div>';
    }

    function renderKpis(data) {
        MRS.utils.setText('dashRequestsToday', data.requestsToday);
        MRS.utils.setText('dashDoneToday', data.doneToday);
        MRS.utils.setText('dashRejectedToday', data.rejectedToday);
        MRS.utils.setText('dashUrgentOpen', data.urgentOpen);
        MRS.utils.setText('dashAvgFulfillment', data.average.count ? MRS.utils.formatDuration(data.average.averageMs) : '--');
        MRS.utils.setText('dashAvgCaption', data.average.count
            ? 'Across ' + data.average.count + ' completed request' + (data.average.count === 1 ? '' : 's')
            : 'No completed requests yet');
    }

    function renderChart(data) {
        var host = MRS.utils.$('dashChart');
        var summary = MRS.utils.$('dashChartSummary');
        if (!host) return;

        var max = data.days.reduce(function (value, day) { return Math.max(value, day.count); }, 0);
        var total = data.days.reduce(function (sum, day) { return sum + day.count; }, 0);
        if (summary) {
            summary.textContent = total + ' request' + (total === 1 ? '' : 's') + ' across the last 14 days · peak ' + max + ' in a day';
        }

        host.innerHTML = data.days.map(function (day) {
            var height = day.count && max ? Math.max(7, Math.round(day.count / max * 100)) : 0;
            return '<div class="chart-column' + (day.isToday ? ' is-today' : '') + '" title="' + MRS.utils.escapeAttr(day.date + ': ' + day.count + ' requests') + '">' +
                '<div class="chart-track">' +
                '<div class="chart-bar' + (day.count ? '' : ' is-zero') + '" style="height:' + height + '%">' +
                (day.count ? '<span>' + day.count + '</span>' : '') +
                '</div>' +
                '</div>' +
                '<span class="chart-date">' + MRS.utils.escapeHtml(day.label) + '</span>' +
                '</div>';
        }).join('');
    }

    function renderPareto(data) {
        var host = MRS.utils.$('dashPareto');
        var meta = MRS.utils.$('dashParetoMeta');
        if (!host) return;

        if (!data.pareto.length) {
            if (meta) meta.textContent = 'No rejections recorded';
            host.innerHTML = emptyBlock('No rejection data', 'Rejection reasons will form a Pareto once requests are rejected.');
            return;
        }

        if (meta) meta.textContent = data.pareto.length + ' reason' + (data.pareto.length === 1 ? '' : 's') + ' · ' + data.pareto.reduce(function (sum, row) { return sum + row.count; }, 0) + ' rejected';
        var max = data.pareto[0].count;
        host.innerHTML = data.pareto.map(function (row) {
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

    function renderTopItems(data) {
        var host = MRS.utils.$('dashTopItems');
        var meta = MRS.utils.$('dashTopItemsMeta');
        if (!host) return;

        if (!data.topItems.length) {
            if (meta) meta.textContent = 'No requests recorded';
            host.innerHTML = emptyBlock('No item demand yet', 'Top requested items appear after the first request is submitted.');
            return;
        }

        if (meta) meta.textContent = 'Ranked by request count · all recorded requests';
        var max = data.topItems[0].requests;
        host.innerHTML = data.topItems.map(function (item, index) {
            var width = Math.max(4, Math.round(item.requests / max * 100));
            return '<div class="top-item-row">' +
                '<span class="top-item-rank">' + MRS.utils.escapeHtml(MRS.utils.pad2(index + 1)) + '</span>' +
                '<div class="top-item-main">' +
                '<span class="top-item-pn">' + MRS.utils.escapeHtml(item.itemPn) + '</span>' +
                '<strong>' + MRS.utils.escapeHtml(item.itemName) + '</strong>' +
                '<span class="top-item-meta">' + MRS.utils.escapeHtml(MRS.requests.formatQuantity(item.quantity)) + ' ' + MRS.utils.escapeHtml(item.unit) + ' requested</span>' +
                '</div>' +
                '<div class="top-item-count"><strong>' + item.requests + '</strong><span>req</span></div>' +
                '<div class="top-item-track"><i style="width:' + width + '%"></i></div>' +
                '</div>';
        }).join('');
    }

    function render() {
        if (!MRS.currentUser || !MRS.auth.hasRole('LOGISTICS')) return;
        if (MRS.movements) MRS.movements.ensureFromRequests();
        var data = MRS.reports.dashboard();
        MRS.utils.setText('dashTotalRequests', data.totalRequests);
        renderKpis(data);
        renderChart(data);
        renderPareto(data);
        renderTopItems(data);
    }

    MRS.views = MRS.views || {};
    MRS.views.dashboard = {
        render: render
    };

}(window.MRS = window.MRS || {}));
