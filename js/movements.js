(function (MRS) {
    'use strict';

    var TYPES = Object.freeze(['IN', 'OUT']);
    var TYPE_LABELS = Object.freeze({
        IN: 'Receipt',
        OUT: 'Issue'
    });

    function all() {
        if (!MRS.db || !Array.isArray(MRS.db.movements)) return [];
        return MRS.db.movements.filter(function (movement) {
            return movement && typeof movement === 'object';
        });
    }

    function typeLabel(type) {
        return TYPE_LABELS[type] || type || 'Movement';
    }

    function movementFrom(sourceRequestId) {
        return all().find(function (movement) {
            return movement.sourceRequestId === sourceRequestId;
        }) || null;
    }

    function pushMovement(movement) {
        if (!MRS.db) return;
        if (!Array.isArray(MRS.db.movements)) MRS.db.movements = [];
        MRS.db.movements.push(movement);
    }

    function buildOutbound(request) {
        return {
            id: MRS.utils.uid('mv'),
            type: 'OUT',
            itemId: request.itemId,
            itemPn: request.itemPn,
            itemName: request.itemName,
            itemSubcategory: request.itemSubcategory || '',
            stockLocation: request.stockLocation || '',
            unit: request.unit || 'pc',
            quantity: Number(request.quantity) || 0,
            reference: request.requestNumber || '',
            note: 'Fulfilled request ' + (request.requestNumber || request.id),
            sourceRequestId: request.id,
            sourceRequestNumber: request.requestNumber || '',
            actorId: request.handledById || '',
            actorName: request.handledByName || 'Logistics',
            createdAt: Number(request.completedAt) || Number(request.updatedAt) || Date.now(),
            updatedAt: Number(request.completedAt) || Number(request.updatedAt) || Date.now()
        };
    }

    function recordOutboundForRequest(request, options) {
        if (!request || request.status !== 'DONE') {
            return { ok: false, error: 'Only fulfilled requests create stock issues.' };
        }
        var existing = movementFrom(request.id);
        if (existing) return { ok: true, movement: existing, duplicate: true };

        var movement = buildOutbound(request);
        pushMovement(movement);
        var settings = options || {};
        if (!settings.skipSave) MRS.storage.save();
        return { ok: true, movement: movement };
    }

    function ensureFromRequests() {
        if (!MRS.db) return { ok: false, created: 0 };
        var created = 0;
        MRS.requests.all().forEach(function (request) {
            if (request.status !== 'DONE') return;
            if (movementFrom(request.id)) return;
            pushMovement(buildOutbound(request));
            created++;
        });
        if (created) MRS.storage.save({ silent: true });
        return { ok: true, created: created };
    }

    function validateInbound(payload) {
        var data = payload || {};
        var errors = {};
        var item = MRS.catalog.getById(String(data.itemId || '').trim());
        var quantity = Number(data.quantity);
        var reference = String(data.reference || '').trim();
        var note = String(data.note || '').trim();

        if (!item) errors.itemId = 'Select an active catalog item.';
        if (!isFinite(quantity) || quantity <= 0) errors.quantity = 'Quantity must be greater than zero.';
        else if (quantity > MRS.config.TECH.maxRequestQuantity) errors.quantity = 'Quantity is too large.';
        if (reference.length > 80) errors.reference = 'Reference must have at most 80 characters.';
        if (note.length > 240) errors.note = 'Note must have at most 240 characters.';

        return {
            ok: Object.keys(errors).length === 0,
            errors: errors,
            item: item,
            data: {
                itemId: String(data.itemId || '').trim(),
                quantity: quantity,
                reference: reference,
                note: note
            }
        };
    }

    function recordInbound(payload) {
        if (!MRS.auth.requireRole('LOGISTICS')) {
            return { ok: false, error: 'Permission denied.', errors: {} };
        }
        var validation = validateInbound(payload);
        if (!validation.ok) {
            return { ok: false, error: 'Check the highlighted fields.', errors: validation.errors };
        }

        var item = validation.item;
        var data = validation.data;
        var user = MRS.currentUser;
        var now = Date.now();
        var movement = {
            id: MRS.utils.uid('mv'),
            type: 'IN',
            itemId: item.id,
            itemPn: item.pn,
            itemName: item.name,
            itemSubcategory: item.subcategory,
            stockLocation: item.stockLocation || '',
            unit: item.unit || 'pc',
            quantity: data.quantity,
            reference: data.reference,
            note: data.note,
            sourceRequestId: '',
            sourceRequestNumber: '',
            actorId: user ? user.id : '',
            actorName: user ? user.name : 'Logistics',
            createdAt: now,
            updatedAt: now
        };

        pushMovement(movement);
        MRS.storage.save();
        return { ok: true, movement: movement };
    }

    function stats() {
        var movements = all();
        var inbound = movements.filter(function (movement) { return movement.type === 'IN'; });
        var outbound = movements.filter(function (movement) { return movement.type === 'OUT'; });
        var itemIds = {};
        movements.forEach(function (movement) {
            if (movement.itemId) itemIds[movement.itemId] = true;
        });
        var lastAt = movements.reduce(function (latest, movement) {
            return Math.max(latest, Number(movement.createdAt) || 0);
        }, 0);

        return {
            total: movements.length,
            inbound: inbound.length,
            outbound: outbound.length,
            itemsTracked: Object.keys(itemIds).length,
            lastAt: lastAt
        };
    }

    function balances(query) {
        var term = MRS.utils.normalizeSearch(query);
        var map = {};
        var order = [];

        MRS.catalog.activeItems().forEach(function (item) {
            map[item.id] = {
                itemId: item.id,
                itemPn: item.pn,
                itemName: item.name,
                unit: item.unit || 'pc',
                stockLocation: item.stockLocation || '',
                received: 0,
                issued: 0,
                balance: 0,
                active: true
            };
            order.push(item.id);
        });

        all().forEach(function (movement) {
            var key = movement.itemId || movement.itemPn;
            if (!map[key]) {
                map[key] = {
                    itemId: key,
                    itemPn: movement.itemPn,
                    itemName: movement.itemName,
                    unit: movement.unit || 'pc',
                    stockLocation: movement.stockLocation || '',
                    received: 0,
                    issued: 0,
                    balance: 0,
                    active: false
                };
                order.push(key);
            }
            if (movement.type === 'IN') map[key].received += Number(movement.quantity) || 0;
            if (movement.type === 'OUT') map[key].issued += Number(movement.quantity) || 0;
        });

        var rows = order.map(function (key) {
            var row = map[key];
            row.balance = row.received - row.issued;
            return row;
        }).filter(function (row) {
            if (!term) return true;
            return MRS.utils.normalizeSearch(row.itemPn + ' ' + row.itemName + ' ' + row.stockLocation).indexOf(term) !== -1;
        });

        rows.sort(function (a, b) {
            return String(a.itemPn).localeCompare(String(b.itemPn));
        });
        return rows;
    }

    function list(type, query) {
        var filter = String(type || 'ALL').toUpperCase();
        var term = MRS.utils.normalizeSearch(query);
        return all().filter(function (movement) {
            if (filter !== 'ALL' && movement.type !== filter) return false;
            if (!term) return true;
            return MRS.utils.normalizeSearch([
                movement.itemPn,
                movement.itemName,
                movement.reference,
                movement.note,
                movement.actorName,
                movement.sourceRequestNumber
            ].join(' ')).indexOf(term) !== -1;
        }).sort(function (a, b) {
            return Number(b.createdAt || 0) - Number(a.createdAt || 0);
        });
    }

    MRS.movements = {
        TYPES: TYPES,
        isReady: true,
        all: all,
        typeLabel: typeLabel,
        getBySourceRequestId: movementFrom,
        recordOutboundForRequest: recordOutboundForRequest,
        ensureFromRequests: ensureFromRequests,
        validateInbound: validateInbound,
        recordInbound: recordInbound,
        stats: stats,
        balances: balances,
        list: list
    };

}(window.MRS = window.MRS || {}));
