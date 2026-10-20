(function (MRS) {
    'use strict';

    var state = {
        filter: 'ALL',
        term: ''
    };

    function directionBadge(type) {
        return '<span class="movement-type ' + MRS.utils.escapeAttr(type) + '">' + MRS.utils.escapeHtml(MRS.movements.typeLabel(type)) + '</span>';
    }

    function renderStats() {
        var stats = MRS.movements.stats();
        MRS.utils.setText('stockStatItems', stats.itemsTracked);
        MRS.utils.setText('stockStatReceipts', stats.inbound);
        MRS.utils.setText('stockStatIssues', stats.outbound);
        MRS.utils.setText('stockStatLast', stats.lastAt ? MRS.utils.formatDateTime(stats.lastAt) : '--');
    }

    function renderBalances() {
        var host = MRS.utils.$('stockBalanceList');
        var empty = MRS.utils.$('stockBalanceEmpty');
        var meta = MRS.utils.$('stockBalanceMeta');
        if (!host) return;

        var rows = MRS.movements.balances(state.term);
        if (meta) meta.textContent = rows.length + ' item' + (rows.length === 1 ? '' : 's') + ' in the informational balance';
        if (!rows.length) {
            host.innerHTML = '';
            host.classList.add('hidden');
            if (empty) empty.classList.remove('hidden');
            return;
        }

        host.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');
        host.innerHTML = rows.map(function (row) {
            var balanceClass = row.balance < 0 ? ' negative' : (row.balance > 0 ? ' positive' : ' zero');
            return '<tr class="' + (row.active ? '' : 'is-inactive') + '">' +
                '<td><span class="stock-item-cell"><strong>' + MRS.utils.escapeHtml(row.itemPn) + '</strong><small>' + MRS.utils.escapeHtml(row.itemName) + '</small></span></td>' +
                '<td><span class="stock-location">' + MRS.utils.escapeHtml(row.stockLocation || '--') + '</span></td>' +
                '<td class="mono">' + MRS.utils.escapeHtml(row.unit) + '</td>' +
                '<td class="mono align-right">' + MRS.utils.escapeHtml(MRS.requests.formatQuantity(row.received)) + '</td>' +
                '<td class="mono align-right">' + MRS.utils.escapeHtml(MRS.requests.formatQuantity(row.issued)) + '</td>' +
                '<td class="mono align-right"><strong class="stock-balance' + balanceClass + '">' + MRS.utils.escapeHtml(MRS.requests.formatQuantity(row.balance)) + '</strong></td>' +
                '</tr>';
        }).join('');
    }

    function renderFilters() {
        var host = MRS.utils.$('stockFilters');
        if (!host) return;
        var stats = MRS.movements.stats();
        var entries = [
            { key: 'ALL', label: 'All movements', count: stats.total },
            { key: 'IN', label: 'Receipts', count: stats.inbound },
            { key: 'OUT', label: 'Issues', count: stats.outbound }
        ];
        host.innerHTML = entries.map(function (entry) {
            return '<button type="button" class="filter-chip' + (state.filter === entry.key ? ' active' : '') + '" data-action="stock-filter" data-type="' + entry.key + '">' +
                entry.label + ' <span>' + entry.count + '</span></button>';
        }).join('');
    }

    function renderLedger() {
        var host = MRS.utils.$('stockLedgerList');
        var empty = MRS.utils.$('stockLedgerEmpty');
        var meta = MRS.utils.$('stockLedgerMeta');
        if (!host) return;

        var movements = MRS.movements.list(state.filter, state.term);
        var shown = movements.slice(0, 120);
        if (meta) {
            meta.textContent = movements.length
                ? 'Showing ' + shown.length + ' of ' + movements.length + ' ledger entries'
                : 'No movements match this filter';
        }

        if (!shown.length) {
            host.innerHTML = '';
            host.classList.add('hidden');
            if (empty) empty.classList.remove('hidden');
            return;
        }

        host.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');
        host.innerHTML = shown.map(function (movement) {
            var reference = movement.reference || movement.sourceRequestNumber || '--';
            return '<tr>' +
                '<td><span class="ledger-time"><strong>' + MRS.utils.escapeHtml(MRS.utils.formatDate(movement.createdAt)) + '</strong><small>' + MRS.utils.escapeHtml(MRS.utils.formatClock(movement.createdAt)) + '</small></span></td>' +
                '<td>' + directionBadge(movement.type) + '</td>' +
                '<td><span class="stock-item-cell"><strong>' + MRS.utils.escapeHtml(movement.itemPn) + '</strong><small>' + MRS.utils.escapeHtml(movement.itemName) + '</small></span></td>' +
                '<td class="mono align-right"><strong>' + MRS.utils.escapeHtml(MRS.requests.formatQuantity(movement.quantity)) + '</strong> ' + MRS.utils.escapeHtml(movement.unit) + '</td>' +
                '<td><span class="ledger-ref">' + MRS.utils.escapeHtml(reference) + '</span>' + (movement.note ? '<small class="ledger-note">' + MRS.utils.escapeHtml(movement.note) + '</small>' : '') + '</td>' +
                '<td><span class="ledger-actor">' + MRS.utils.escapeHtml(movement.actorName || '--') + '</span></td>' +
                '</tr>';
        }).join('');
    }

    function render() {
        if (!MRS.currentUser || !MRS.auth.hasRole('LOGISTICS')) return;
        MRS.movements.ensureFromRequests();
        renderStats();
        renderFilters();
        renderBalances();
        renderLedger();
    }

    function filter(type) {
        state.filter = String(type || 'ALL').toUpperCase();
        renderFilters();
        renderLedger();
    }

    function onSearchInput() {
        var input = MRS.utils.$('stockSearch');
        state.term = input ? input.value.trim() : '';
        renderBalances();
        renderLedger();
    }

    function populateReceiptItems(selectedId) {
        var select = MRS.utils.$('receiptItem');
        if (!select) return;
        var items = MRS.catalog.activeItems().slice().sort(function (a, b) {
            return String(a.pn).localeCompare(String(b.pn));
        });
        select.innerHTML = '<option value="">Select a material...</option>' + items.map(function (item) {
            return '<option value="' + MRS.utils.escapeAttr(item.id) + '">' +
                MRS.utils.escapeHtml(item.pn + ' - ' + item.name + ' (' + item.unit + ')') +
                '</option>';
        }).join('');
        select.value = selectedId || '';
    }

    function openReceipt() {
        if (!MRS.auth.requireRole('LOGISTICS')) return;
        populateReceiptItems('');
        MRS.utils.$('receiptQty').value = '';
        MRS.utils.$('receiptRef').value = '';
        MRS.utils.$('receiptNote').value = '';
        MRS.utils.setText('receiptFormError', '');
        MRS.utils.openModal('modalReceipt');
    }

    function showReceiptErrors(errors) {
        var box = MRS.utils.$('receiptFormError');
        var fieldMap = { itemId: 'receiptItem', quantity: 'receiptQty', reference: 'receiptRef', note: 'receiptNote' };
        var parts = [];
        var first = null;
        Object.keys(errors || {}).forEach(function (key) {
            parts.push(errors[key]);
            if (!first && fieldMap[key]) first = MRS.utils.$(fieldMap[key]);
        });
        if (box) box.textContent = parts.join(' ');
        if (first) {
            first.focus();
            first.classList.add('invalid');
            setTimeout(function () { first.classList.remove('invalid'); }, 1800);
        }
    }

    function submitReceipt() {
        var errorBox = MRS.utils.$('receiptFormError');
        if (errorBox) errorBox.textContent = '';
        var result = MRS.movements.recordInbound({
            itemId: MRS.utils.$('receiptItem').value,
            quantity: MRS.utils.$('receiptQty').value,
            reference: MRS.utils.$('receiptRef').value,
            note: MRS.utils.$('receiptNote').value
        });

        if (!result.ok) {
            if (result.errors && Object.keys(result.errors).length) showReceiptErrors(result.errors);
            else if (errorBox) errorBox.textContent = result.error || 'Could not record the receipt.';
            MRS.utils.toast(result.error || 'Could not record the receipt.', 'error');
            return;
        }

        MRS.utils.closeModal('modalReceipt');
        MRS.utils.toast('Receipt recorded: ' + MRS.requests.formatQuantity(result.movement.quantity) + ' ' + result.movement.unit + ' of ' + result.movement.itemPn + '.', 'success', 4200);
        render();
        if (MRS.views.admin) MRS.views.admin.renderStats();
    }

    MRS.views = MRS.views || {};
    MRS.views.stock = {
        render: render,
        filter: filter,
        onSearchInput: onSearchInput,
        openReceipt: openReceipt,
        submitReceipt: submitReceipt
    };

}(window.MRS = window.MRS || {}));
