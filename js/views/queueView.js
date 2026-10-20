(function (MRS) {
    'use strict';

    var state = {
        filter: 'OPEN',
        rejectId: ''
    };

    function photoFor(request) {
        var safe = MRS.utils.safeImageUrl(request.itemPhoto || '');
        if (!safe) {
            return '<span class="queue-photo-empty">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"></path><path d="M4 7.5 12 12l8-4.5M12 12v9"></path></svg></span>';
        }
        return '<img src="' + MRS.utils.escapeAttr(safe) + '" alt="' + MRS.utils.escapeAttr(request.itemName) + '" loading="lazy">';
    }

    function renderStats() {
        var stats = MRS.requests.stats();
        MRS.utils.setText('queueStatNew', stats.new);
        MRS.utils.setText('queueStatWorking', stats.working);
        MRS.utils.setText('queueStatUrgent', stats.urgentOpen);
        MRS.utils.setText('queueStatDone', stats.doneToday);
    }

    function renderFilters() {
        var host = MRS.utils.$('queueFilters');
        if (!host) return;
        var counts = MRS.requests.statusCounts();
        var entries = [
            { key: 'OPEN', label: 'Open queue', count: counts.OPEN },
            { key: 'NEW', label: 'New', count: counts.NEW },
            { key: 'WORKING', label: 'Working', count: counts.WORKING },
            { key: 'DONE', label: 'Done', count: counts.DONE },
            { key: 'REJECTED', label: 'Rejected', count: counts.REJECTED },
            { key: 'ALL', label: 'All', count: counts.ALL }
        ];

        host.innerHTML = entries.map(function (entry) {
            return '<button type="button" class="filter-chip' + (state.filter === entry.key ? ' active' : '') + '" data-action="queue-filter" data-status="' + entry.key + '">' +
                entry.label + ' <span>' + entry.count + '</span></button>';
        }).join('');
    }

    function actionButtons(request) {
        var actions = '';
        if (request.status === 'NEW') {
            actions += '<button type="button" class="btn btn-secondary btn-sm" data-action="queue-start" data-id="' + MRS.utils.escapeAttr(request.id) + '">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 5v14l11-7z"></path></svg>' +
                'Start working</button>';
        }
        if (request.status === 'WORKING') {
            actions += '<button type="button" class="btn btn-success btn-sm" data-action="queue-done" data-id="' + MRS.utils.escapeAttr(request.id) + '">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"></path></svg>' +
                'Mark done</button>';
        }
        if (request.status === 'NEW' || request.status === 'WORKING') {
            actions += '<button type="button" class="btn btn-reject btn-sm" data-action="queue-reject" data-id="' + MRS.utils.escapeAttr(request.id) + '">Reject</button>';
        }
        return actions;
    }

    function handlerLine(request) {
        if (request.status === 'WORKING' && request.startedAt) {
            return 'Started by ' + (request.startedByName || 'logistics') + ' · ' + MRS.utils.formatDateTime(request.startedAt);
        }
        if (request.status === 'DONE' && request.completedAt) {
            return 'Fulfilled by ' + (request.handledByName || 'logistics') + ' · ' + MRS.utils.formatDateTime(request.completedAt);
        }
        if (request.status === 'REJECTED' && request.rejectedAt) {
            return 'Rejected by ' + (request.handledByName || 'logistics') + ' · ' + MRS.utils.formatDateTime(request.rejectedAt);
        }
        return 'Waiting in the queue since ' + MRS.utils.formatDateTime(request.createdAt);
    }

    function renderQueue() {
        var host = MRS.utils.$('queueList');
        var empty = MRS.utils.$('queueEmpty');
        var emptyTitle = MRS.utils.$('queueEmptyTitle');
        var emptyText = MRS.utils.$('queueEmptyText');
        var meta = MRS.utils.$('queueMeta');
        if (!host) return;

        var requests = MRS.requests.listQueue(state.filter);
        var all = MRS.requests.all();
        if (meta) {
            meta.textContent = requests.length + ' of ' + all.length + ' requests · urgent items are pinned to the top';
        }

        if (!requests.length) {
            host.innerHTML = '';
            host.classList.add('hidden');
            if (empty) empty.classList.remove('hidden');
            var hasAnyRequests = MRS.requests.all().length > 0;
            if (emptyTitle) {
                emptyTitle.textContent = !hasAnyRequests
                    ? 'No requests yet'
                    : (state.filter === 'OPEN' ? 'Queue clear' : 'No matching requests');
            }
            if (emptyText) {
                emptyText.textContent = !hasAnyRequests
                    ? 'New requester submissions will appear here immediately.'
                    : (state.filter === 'OPEN'
                        ? 'The queue is clear. New requester submissions will appear here immediately.'
                        : 'No requests match this filter.');
            }
            return;
        }

        host.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');

        host.innerHTML = requests.map(function (request) {
            var rejectionNote = request.rejectionNote
                ? '<small class="rejection-note">Note: ' + MRS.utils.escapeHtml(request.rejectionNote) + '</small>'
                : '';
            var rejection = request.status === 'REJECTED'
                ? '<div class="queue-rejection"><strong>Rejection reason</strong><span>' + MRS.utils.escapeHtml(request.rejectionReason || 'No reason recorded.') + rejectionNote + '</span></div>'
                : '';
            var closedClass = request.status === 'DONE' || request.status === 'REJECTED' ? ' closed' : '';
            return '<article class="queue-card ' + MRS.utils.escapeAttr(request.status) + (request.urgency === 'URGENT' ? ' urgent' : '') + closedClass + '">' +
                '<div class="queue-top">' +
                '<div class="queue-id">' +
                '<span class="request-status ' + MRS.utils.escapeAttr(request.status) + '">' + MRS.utils.escapeHtml(MRS.requests.statusLabel(request.status)) + '</span>' +
                (request.urgency === 'URGENT' ? '<span class="request-urgency">Urgent</span>' : '<span class="request-urgency normal">Normal</span>') +
                '<span class="request-number">' + MRS.utils.escapeHtml(request.requestNumber || request.id) + '</span>' +
                '</div>' +
                '<span class="queue-age">' + MRS.utils.escapeHtml(MRS.utils.formatRelative(request.createdAt)) + '</span>' +
                '</div>' +
                '<div class="queue-main">' +
                '<div class="queue-photo">' + photoFor(request) + '</div>' +
                '<div class="queue-item">' +
                '<span class="request-result-pn">' + MRS.utils.escapeHtml(request.itemPn) + '</span>' +
                '<strong>' + MRS.utils.escapeHtml(request.itemName) + '</strong>' +
                '<span class="queue-stock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"></path><circle cx="12" cy="11" r="2.2"></circle></svg>' + MRS.utils.escapeHtml(request.stockLocation || 'No location') + '</span>' +
                '</div>' +
                '<div class="queue-qty"><strong>' + MRS.utils.escapeHtml(MRS.requests.formatQuantity(request.quantity)) + '</strong><span>' + MRS.utils.escapeHtml(request.unit) + '</span></div>' +
                '</div>' +
                '<div class="queue-meta">' +
                '<div><span>Requester</span><strong>' + MRS.utils.escapeHtml(request.requesterName) + '</strong></div>' +
                '<div><span>Requesting area</span><strong>' + MRS.utils.escapeHtml(request.requestingArea) + '</strong></div>' +
                '<div><span>Drop-off</span><strong>' + MRS.utils.escapeHtml(request.dropOff) + '</strong></div>' +
                '<div><span>Job number</span><strong>' + MRS.utils.escapeHtml(request.jobNumber) + '</strong></div>' +
                '</div>' +
                rejection +
                '<div class="queue-foot">' +
                '<span class="queue-handler">' + MRS.utils.escapeHtml(handlerLine(request)) + '</span>' +
                '<div class="queue-actions">' + actionButtons(request) + '</div>' +
                '</div>' +
                '</article>';
        }).join('');
    }

    function render() {
        if (!MRS.currentUser || !MRS.auth.hasRole('LOGISTICS')) return;
        renderStats();
        renderFilters();
        renderQueue();
    }

    function filterQueue(status) {
        state.filter = String(status || 'OPEN').toUpperCase();
        renderFilters();
        renderQueue();
    }

    function startRequest(id) {
        var result = MRS.requests.startWorking(id);
        if (!result.ok) {
            MRS.utils.toast(result.error || 'Could not start the request.', 'error');
            return;
        }
        MRS.utils.toast(result.request.requestNumber + ' is now in progress.', 'success');
        render();
        if (MRS.views.requests) MRS.views.requests.render();
    }

    function completeRequest(id) {
        var request = MRS.requests.getById(id);
        if (!request) {
            MRS.utils.toast('Request not found.', 'error');
            return;
        }
        MRS.views.app.openConfirm({
            title: 'Mark request as done',
            message: 'Fulfill ' + request.requestNumber + ' for ' + request.itemPn + ' (' + MRS.requests.formatQuantity(request.quantity) + ' ' + request.unit + ')? This closes the request.',
            onConfirm: function () {
                var result = MRS.requests.markDone(id);
                if (!result.ok) {
                    MRS.utils.toast(result.error || 'Could not complete the request.', 'error');
                    return;
                }
                MRS.utils.toast(result.request.requestNumber + ' marked as done. Stock issue recorded.', 'success', 4200);
                render();
                if (MRS.views.requests) MRS.views.requests.render();
                if (MRS.views.admin) MRS.views.admin.renderStats();
            }
        });
    }

    function setRejectNoteState() {
        var reason = MRS.utils.$('rejectReason');
        var note = MRS.utils.$('rejectNote');
        var label = MRS.utils.$('rejectNoteLabel');
        var hint = MRS.utils.$('rejectNoteHint');
        var isOther = !!reason && reason.value === 'Other';
        if (note) note.required = isOther;
        if (label) label.textContent = isOther ? 'Additional note (required)' : 'Additional note (optional)';
        if (hint) hint.textContent = isOther
            ? 'Required because Other is selected. Add the details the requester needs.'
            : 'Optional context for the requester. Required when Other is selected.';
    }

    function onReasonChange() {
        setRejectNoteState();
        MRS.utils.setText('rejectFormError', '');
    }

    function openReject(id) {
        var request = MRS.requests.getById(id);
        if (!request) {
            MRS.utils.toast('Request not found.', 'error');
            return;
        }
        state.rejectId = id;
        MRS.utils.setText('rejectRequestSummary', request.requestNumber + ' · ' + request.itemPn + ' · ' + MRS.requests.formatQuantity(request.quantity) + ' ' + request.unit + ' · ' + request.requesterName);
        MRS.utils.$('rejectReason').value = '';
        MRS.utils.$('rejectNote').value = '';
        setRejectNoteState();
        MRS.utils.setText('rejectFormError', '');
        MRS.utils.openModal('modalReject');
    }

    function submitReject() {
        var reason = MRS.utils.$('rejectReason').value;
        var note = MRS.utils.$('rejectNote').value;
        var errorBox = MRS.utils.$('rejectFormError');
        if (errorBox) errorBox.textContent = '';
        var result = MRS.requests.reject(state.rejectId, reason, note);
        if (!result.ok) {
            if (errorBox) errorBox.textContent = result.error || 'Could not reject the request.';
            MRS.utils.toast(result.error || 'Could not reject the request.', 'error');
            return;
        }
        MRS.utils.closeModal('modalReject');
        MRS.utils.toast(result.request.requestNumber + ' rejected.', 'warn');
        state.rejectId = '';
        render();
        if (MRS.views.requests) MRS.views.requests.render();
        if (MRS.views.admin) MRS.views.admin.renderStats();
    }

    MRS.views = MRS.views || {};
    MRS.views.queue = {
        render: render,
        filterQueue: filterQueue,
        startRequest: startRequest,
        completeRequest: completeRequest,
        openReject: openReject,
        onReasonChange: onReasonChange,
        submitReject: submitReject
    };

}(window.MRS = window.MRS || {}));
