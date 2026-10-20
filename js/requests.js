(function (MRS) {
    'use strict';

    var STATUSES = Object.freeze(['NEW', 'WORKING', 'DONE', 'REJECTED']);
    var URGENCIES = Object.freeze(['NORMAL', 'URGENT']);
    var OPEN_STATUSES = Object.freeze(['NEW', 'WORKING']);
    var REJECTION_REASONS = Object.freeze([
        'Out of stock',
        'Aisle blocked',
        'Forklift down',
        'Item not found at location',
        'Damaged material',
        'Duplicate request',
        'Other'
    ]);
    var STATUS_LABELS = Object.freeze({
        NEW: 'New',
        WORKING: 'Working',
        DONE: 'Done',
        REJECTED: 'Rejected'
    });
    var URGENCY_LABELS = Object.freeze({
        NORMAL: 'Normal',
        URGENT: 'Urgent'
    });
    var STATUS_RANK = Object.freeze({
        NEW: 0,
        WORKING: 1,
        DONE: 2,
        REJECTED: 3
    });
    var TRANSITIONS = Object.freeze({
        NEW: Object.freeze(['WORKING', 'REJECTED']),
        WORKING: Object.freeze(['DONE', 'REJECTED']),
        DONE: Object.freeze([]),
        REJECTED: Object.freeze([])
    });

    function all() {
        if (!MRS.db || !Array.isArray(MRS.db.requests)) return [];
        return MRS.db.requests.filter(function (request) {
            return request && typeof request === 'object';
        });
    }

    function getById(id) {
        if (!id) return null;
        return all().find(function (request) { return request.id === id; }) || null;
    }

    function isOpen(request) {
        return !!request && OPEN_STATUSES.indexOf(request.status) !== -1;
    }

    function sortNewest(a, b) {
        return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    }

    function sortQueue(a, b) {
        var rankA = STATUS_RANK[a.status] === undefined ? 9 : STATUS_RANK[a.status];
        var rankB = STATUS_RANK[b.status] === undefined ? 9 : STATUS_RANK[b.status];
        if (rankA !== rankB) return rankA - rankB;

        var open = OPEN_STATUSES.indexOf(a.status) !== -1;
        if (open) {
            var urgencyA = a.urgency === 'URGENT' ? 0 : 1;
            var urgencyB = b.urgency === 'URGENT' ? 0 : 1;
            if (urgencyA !== urgencyB) return urgencyA - urgencyB;
            return Number(a.createdAt || 0) - Number(b.createdAt || 0);
        }

        var closedA = Number(a.completedAt || a.rejectedAt || a.updatedAt || 0);
        var closedB = Number(b.completedAt || b.rejectedAt || b.updatedAt || 0);
        return closedB - closedA;
    }

    function listForUser(userId, statusFilter) {
        if (!userId) return [];
        var filter = String(statusFilter || 'ALL').toUpperCase();
        return all().filter(function (request) {
            if (request.requesterId !== userId) return false;
            return filter === 'ALL' || request.status === filter;
        }).sort(sortNewest);
    }

    function listQueue(statusFilter) {
        var filter = String(statusFilter || 'OPEN').toUpperCase();
        return all().filter(function (request) {
            if (filter === 'ALL') return true;
            if (filter === 'OPEN') return isOpen(request);
            return request.status === filter;
        }).sort(sortQueue);
    }

    function statusCounts() {
        var counts = { ALL: 0, OPEN: 0, NEW: 0, WORKING: 0, DONE: 0, REJECTED: 0 };
        all().forEach(function (request) {
            if (counts[request.status] !== undefined) counts[request.status]++;
            counts.ALL++;
            if (isOpen(request)) counts.OPEN++;
        });
        return counts;
    }

    function startOfToday() {
        var date = new Date();
        date.setHours(0, 0, 0, 0);
        return date.getTime();
    }

    function stats() {
        var start = startOfToday();
        var counts = statusCounts();
        var urgentOpen = all().filter(function (request) {
            return isOpen(request) && request.urgency === 'URGENT';
        }).length;
        var doneToday = all().filter(function (request) {
            return request.status === 'DONE' && Number(request.completedAt || 0) >= start;
        }).length;
        var rejectedToday = all().filter(function (request) {
            return request.status === 'REJECTED' && Number(request.rejectedAt || 0) >= start;
        }).length;

        return {
            total: counts.ALL,
            open: counts.OPEN,
            new: counts.NEW,
            working: counts.WORKING,
            done: counts.DONE,
            rejected: counts.REJECTED,
            urgentOpen: urgentOpen,
            doneToday: doneToday,
            rejectedToday: rejectedToday
        };
    }

    function two(value) {
        return String(value).padStart(2, '0');
    }

    function requestNumber(now) {
        var settings = MRS.normalizeSettings(MRS.db.settings);
        var date = new Date(now);
        var stem = settings.requestNumberPrefix + '-' +
            date.getFullYear() + two(date.getMonth() + 1) + two(date.getDate());
        var highest = 0;

        all().forEach(function (request) {
            var value = String(request.requestNumber || '');
            if (value.indexOf(stem + '-') !== 0) return;
            var sequence = Number(value.slice(stem.length + 1));
            if (isFinite(sequence) && sequence > highest) highest = sequence;
        });

        return stem + '-' + String(highest + 1).padStart(3, '0');
    }

    function cleanData(payload) {
        var data = payload || {};
        return {
            itemId: String(data.itemId || '').trim(),
            quantity: Number(data.quantity),
            requestingArea: String(data.requestingArea || '').trim(),
            dropOff: String(data.dropOff || '').trim(),
            jobNumber: String(data.jobNumber || '').trim(),
            urgency: String(data.urgency || 'NORMAL').trim().toUpperCase()
        };
    }

    function validate(payload) {
        var data = cleanData(payload);
        var errors = {};
        var item = MRS.catalog.getById(data.itemId);
        var maxQuantity = MRS.config.TECH.maxRequestQuantity;

        if (!data.itemId) errors.itemId = 'Select a material from the catalog.';
        else if (!item) errors.itemId = 'That material is no longer available in the catalog.';

        if (!isFinite(data.quantity) || data.quantity <= 0) {
            errors.quantity = 'Quantity must be greater than zero.';
        } else if (data.quantity > maxQuantity) {
            errors.quantity = 'Quantity cannot exceed ' + maxQuantity.toLocaleString('en-US') + '.';
        }

        if (!data.requestingArea) errors.requestingArea = 'Requesting area is required.';
        else if (data.requestingArea.length > 80) errors.requestingArea = 'Requesting area must have at most 80 characters.';

        if (!data.dropOff) errors.dropOff = 'Drop-off location is required.';
        else if (data.dropOff.length > 120) errors.dropOff = 'Drop-off location must have at most 120 characters.';

        if (!data.jobNumber) errors.jobNumber = 'Job number is required. Use N/A if there is no job.';
        else if (data.jobNumber.length > 60) errors.jobNumber = 'Job number must have at most 60 characters.';

        if (URGENCIES.indexOf(data.urgency) === -1) errors.urgency = 'Select a valid urgency.';

        return {
            ok: Object.keys(errors).length === 0,
            errors: errors,
            data: data,
            item: item
        };
    }

    function create(payload) {
        if (!MRS.auth.requireRole('REQUESTER')) {
            return { ok: false, error: 'Permission denied.', errors: {} };
        }
        var validation = validate(payload);
        if (!validation.ok) {
            return { ok: false, error: 'Check the highlighted fields.', errors: validation.errors };
        }

        var data = validation.data;
        var item = validation.item;
        var user = MRS.currentUser;
        var now = Date.now();
        var request = {
            id: MRS.utils.uid('rq'),
            requestNumber: requestNumber(now),
            itemId: item.id,
            itemPn: item.pn,
            itemName: item.name,
            itemSubcategory: item.subcategory,
            itemPhoto: item.photo || '',
            stockLocation: item.stockLocation || '',
            unit: item.unit || 'pc',
            quantity: data.quantity,
            requesterId: user.id,
            requesterName: user.name,
            requestingArea: data.requestingArea,
            dropOff: data.dropOff,
            jobNumber: data.jobNumber,
            urgency: data.urgency,
            status: 'NEW',
            rejectionReason: '',
            rejectionNote: '',
            createdAt: now,
            updatedAt: now,
            startedAt: 0,
            completedAt: 0,
            rejectedAt: 0,
            startedById: '',
            startedByName: '',
            handledById: '',
            handledByName: '',
            history: [{
                status: 'NEW',
                at: now,
                byId: user.id,
                byName: user.name,
                note: ''
            }]
        };

        MRS.db.requests.push(request);
        MRS.storage.save();
        return { ok: true, request: request };
    }

    function transition(id, nextStatus, options) {
        if (!MRS.auth.requireRole('LOGISTICS')) {
            return { ok: false, error: 'Permission denied.' };
        }
        var request = getById(id);
        if (!request) return { ok: false, error: 'Request not found.' };

        var next = String(nextStatus || '').toUpperCase();
        var allowed = TRANSITIONS[request.status] || [];
        if (allowed.indexOf(next) === -1) {
            return { ok: false, error: 'This request cannot move from ' + statusLabel(request.status) + ' to ' + statusLabel(next) + '.' };
        }

        var settings = options || {};
        var reason = String(settings.reason || '').trim();
        var note = String(settings.note || '').trim();
        if (next === 'REJECTED') {
            if (!reason) return { ok: false, error: 'Select a rejection reason.' };
            if (REJECTION_REASONS.indexOf(reason) === -1) return { ok: false, error: 'Select a valid rejection reason.' };
            if (reason === 'Other' && !note) return { ok: false, error: 'Enter a note when the rejection reason is Other.' };
            if (note.length > 280) return { ok: false, error: 'Rejection note must have at most 280 characters.' };
        }

        var user = MRS.currentUser;
        var now = Math.max(Date.now(), Number(request.updatedAt || 0) + 1);
        request.status = next;
        request.updatedAt = now;

        if (next === 'WORKING') {
            request.startedAt = now;
            request.startedById = user.id;
            request.startedByName = user.name;
        } else if (next === 'DONE') {
            request.completedAt = now;
            request.handledById = user.id;
            request.handledByName = user.name;
        } else if (next === 'REJECTED') {
            request.rejectedAt = now;
            request.rejectionReason = reason;
            request.rejectionNote = note;
            request.handledById = user.id;
            request.handledByName = user.name;
        }

        request.history = Array.isArray(request.history) ? request.history : [];
        request.history.push({
            status: next,
            at: now,
            byId: user.id,
            byName: user.name,
            note: next === 'REJECTED' ? (note ? reason + ' - ' + note : reason) : ''
        });

        if (next === 'DONE' && MRS.movements) {
            MRS.movements.recordOutboundForRequest(request, { skipSave: true });
        }

        MRS.storage.save();
        return { ok: true, request: request };
    }

    function startWorking(id) {
        return transition(id, 'WORKING');
    }

    function markDone(id) {
        return transition(id, 'DONE');
    }

    function reject(id, reason, note) {
        return transition(id, 'REJECTED', { reason: reason, note: note });
    }

    function statusLabel(status) {
        return STATUS_LABELS[status] || status || 'Unknown';
    }

    function urgencyLabel(urgency) {
        return URGENCY_LABELS[urgency] || urgency || 'Normal';
    }

    function formatQuantity(value) {
        var quantity = Number(value);
        if (!isFinite(quantity)) return '0';
        return quantity.toLocaleString('en-US', { maximumFractionDigits: 3 });
    }

    MRS.requests = {
        STATUSES: STATUSES,
        URGENCIES: URGENCIES,
        OPEN_STATUSES: OPEN_STATUSES,
        REJECTION_REASONS: REJECTION_REASONS,
        STATUS_LABELS: STATUS_LABELS,
        URGENCY_LABELS: URGENCY_LABELS,
        isReady: true,
        all: all,
        getById: getById,
        isOpen: isOpen,
        listForUser: listForUser,
        listQueue: listQueue,
        statusCounts: statusCounts,
        stats: stats,
        validate: validate,
        create: create,
        transition: transition,
        startWorking: startWorking,
        markDone: markDone,
        reject: reject,
        statusLabel: statusLabel,
        urgencyLabel: urgencyLabel,
        formatQuantity: formatQuantity,
        requestNumber: requestNumber
    };

}(window.MRS = window.MRS || {}));
