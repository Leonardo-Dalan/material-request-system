(function (MRS) {
    'use strict';

    MRS.db = null;

    function numberOr(value, fallback) {
        var number = Number(value);
        return isFinite(number) && number > 0 ? number : fallback;
    }

    function normalizeUser(raw, index) {
        if (!raw || typeof raw !== 'object') return null;
        var username = String(raw.username || '').trim();
        if (!username) return null;

        var user = {
            id: String(raw.id || 'u_' + index + '_' + username.toLowerCase()),
            username: username,
            name: String(raw.name || username),
            role: MRS.config.ROLES.indexOf(raw.role) !== -1 ? raw.role : 'REQUESTER',
            salt: typeof raw.salt === 'string' ? raw.salt : '',
            hash: typeof raw.hash === 'string' ? raw.hash : '',
            active: raw.active !== false,
            createdAt: numberOr(raw.createdAt, Date.now()),
            updatedAt: numberOr(raw.updatedAt, Date.now())
        };

        if (MRS.crypto.hasPlaintextPassword(raw)) {
            var upgraded = MRS.crypto.hashPassword(username, raw.pass);
            user.salt = upgraded.salt;
            user.hash = upgraded.hash;
        }

        if (!user.salt || !user.hash) return null;
        return user;
    }

    function normalizeItem(raw, index) {
        if (!raw || typeof raw !== 'object') return null;
        var pn = String(raw.pn || '').trim();
        var name = String(raw.name || '').trim();
        if (!pn || !name) return null;

        return {
            id: String(raw.id || 'it_' + index + '_' + pn.toLowerCase()),
            pn: pn,
            name: name,
            subcategory: String(raw.subcategory || 'Uncategorized').trim() || 'Uncategorized',
            stockLocation: String(raw.stockLocation || '').trim(),
            unit: String(raw.unit || 'pc').trim() || 'pc',
            photo: typeof raw.photo === 'string' ? raw.photo : '',
            accent: /^#[0-9a-f]{6}$/i.test(raw.accent || '') ? raw.accent : '',
            active: raw.active !== false,
            deleted: raw.deleted === true,
            createdAt: numberOr(raw.createdAt, Date.now()),
            updatedAt: numberOr(raw.updatedAt, Date.now())
        };
    }

    function normalizeHistory(raw, request) {
        var statuses = MRS.requests && MRS.requests.STATUSES
            ? MRS.requests.STATUSES
            : ['NEW', 'WORKING', 'DONE', 'REJECTED'];
        var entries = Array.isArray(raw) ? raw.filter(function (entry) {
            return entry && typeof entry === 'object';
        }).map(function (entry) {
            return {
                status: statuses.indexOf(entry.status) !== -1 ? entry.status : 'NEW',
                at: numberOr(entry.at, request.createdAt),
                byId: String(entry.byId || request.requesterId || ''),
                byName: String(entry.byName || request.requesterName || ''),
                note: String(entry.note || '')
            };
        }) : [];

        if (!entries.length) {
            entries.push({
                status: 'NEW',
                at: request.createdAt,
                byId: request.requesterId,
                byName: request.requesterName,
                note: ''
            });
        }
        return entries;
    }

    function normalizeRequest(raw, index) {
        if (!raw || typeof raw !== 'object') return null;
        var statuses = MRS.requests && MRS.requests.STATUSES
            ? MRS.requests.STATUSES
            : ['NEW', 'WORKING', 'DONE', 'REJECTED'];
        var urgencies = MRS.requests && MRS.requests.URGENCIES
            ? MRS.requests.URGENCIES
            : ['NORMAL', 'URGENT'];
        var createdAt = numberOr(raw.createdAt, Date.now());
        var updatedAt = numberOr(raw.updatedAt, createdAt);
        var quantity = Number(raw.quantity);

        var request = {
            id: String(raw.id || 'rq_' + index + '_' + createdAt),
            requestNumber: String(raw.requestNumber || '').trim(),
            itemId: String(raw.itemId || ''),
            itemPn: String(raw.itemPn || '').trim(),
            itemName: String(raw.itemName || '').trim(),
            itemSubcategory: String(raw.itemSubcategory || '').trim(),
            itemPhoto: typeof raw.itemPhoto === 'string' ? raw.itemPhoto : '',
            stockLocation: String(raw.stockLocation || '').trim(),
            unit: String(raw.unit || 'pc').trim() || 'pc',
            quantity: isFinite(quantity) && quantity > 0 ? quantity : 0,
            requesterId: String(raw.requesterId || ''),
            requesterName: String(raw.requesterName || 'Unknown requester').trim() || 'Unknown requester',
            requestingArea: String(raw.requestingArea || '').trim(),
            dropOff: String(raw.dropOff || '').trim(),
            jobNumber: String(raw.jobNumber || '').trim(),
            urgency: urgencies.indexOf(raw.urgency) !== -1 ? raw.urgency : 'NORMAL',
            status: statuses.indexOf(raw.status) !== -1 ? raw.status : 'NEW',
            rejectionReason: String(raw.rejectionReason || '').trim(),
            rejectionNote: String(raw.rejectionNote || '').trim(),
            createdAt: createdAt,
            updatedAt: updatedAt,
            startedAt: numberOr(raw.startedAt, 0),
            completedAt: numberOr(raw.completedAt, 0),
            rejectedAt: numberOr(raw.rejectedAt, 0),
            startedById: String(raw.startedById || ''),
            startedByName: String(raw.startedByName || ''),
            handledById: String(raw.handledById || ''),
            handledByName: String(raw.handledByName || '')
        };

        if (request.status === 'WORKING' && !request.startedAt) request.startedAt = updatedAt;
        if (request.status === 'DONE' && !request.completedAt) request.completedAt = updatedAt;
        if (request.status === 'REJECTED' && !request.rejectedAt) request.rejectedAt = updatedAt;

        request.history = normalizeHistory(raw.history, request);
        return request;
    }

    function normalizeMovement(raw, index) {
        if (!raw || typeof raw !== 'object') return null;
        var itemPn = String(raw.itemPn || '').trim();
        var quantity = Number(raw.quantity);
        if (!itemPn) return null;
        if (!isFinite(quantity) || quantity <= 0) return null;

        var type = raw.type === 'IN' || raw.type === 'OUT'
            ? raw.type
            : (raw.direction === 'IN' ? 'IN' : 'OUT');
        var createdAt = numberOr(raw.createdAt, Date.now());
        var movement = {
            id: String(raw.id || 'mv_' + index + '_' + createdAt),
            type: type,
            itemId: String(raw.itemId || ''),
            itemPn: itemPn,
            itemName: String(raw.itemName || itemPn).trim() || itemPn,
            itemSubcategory: String(raw.itemSubcategory || '').trim(),
            stockLocation: String(raw.stockLocation || '').trim(),
            unit: String(raw.unit || 'pc').trim() || 'pc',
            quantity: quantity,
            reference: String(raw.reference || '').trim(),
            note: String(raw.note || '').trim(),
            sourceRequestId: String(raw.sourceRequestId || ''),
            sourceRequestNumber: String(raw.sourceRequestNumber || '').trim(),
            actorId: String(raw.actorId || ''),
            actorName: String(raw.actorName || 'Logistics').trim() || 'Logistics',
            createdAt: createdAt,
            updatedAt: numberOr(raw.updatedAt, createdAt)
        };
        return movement;
    }

    function migrateDB(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return MRS.createDefaultDB();
        }

        var source = raw;
        var users = Array.isArray(source.users)
            ? source.users.map(normalizeUser).filter(Boolean)
            : [];
        if (!users.length) users = MRS.buildSeedUsers();

        var items = Array.isArray(source.items)
            ? source.items.map(normalizeItem).filter(Boolean)
            : MRS.seedItems();

        return {
            version: numberOr(source.version, 1),
            updatedAt: numberOr(source.updatedAt, Date.now()),
            settings: MRS.normalizeSettings(source.settings),
            users: users,
            items: items,
            requests: Array.isArray(source.requests)
                ? source.requests.map(normalizeRequest).filter(Boolean)
                : [],
            movements: Array.isArray(source.movements)
                ? source.movements.map(normalizeMovement).filter(Boolean)
                : []
        };
    }

    function readRaw() {
        try {
            var stored = window.localStorage.getItem(MRS.config.STORAGE_KEY);
            if (!stored) return null;
            return JSON.parse(stored);
        } catch (error) {
            return null;
        }
    }

    function persist(db) {
        try {
            window.localStorage.setItem(MRS.config.STORAGE_KEY, JSON.stringify(db));
            return true;
        } catch (error) {
            if (MRS.utils && MRS.utils.toast) {
                MRS.utils.toast('Local storage is full. Remove large photos or export the catalog.', 'error', 5000);
            }
            return false;
        }
    }

    function load() {
        var raw = readRaw();
        var db = migrateDB(raw);
        MRS.db = db;
        if (!raw) persist(db);
        return db;
    }

    function adopt(db) {
        MRS.db = migrateDB(db);
        return MRS.db;
    }

    function save(options) {
        if (!MRS.db) MRS.db = MRS.createDefaultDB();
        var previous = Number(MRS.db.updatedAt) || 0;
        MRS.db.updatedAt = Math.max(Date.now(), previous + 1);
        var saved = persist(MRS.db);

        var settings = options || {};
        if (!settings.silent && MRS.sync) {
            if (typeof MRS.sync.notifyLocalChange === 'function') MRS.sync.notifyLocalChange();
            if (typeof MRS.sync.schedulePush === 'function') MRS.sync.schedulePush();
        }

        return saved ? MRS.db : null;
    }

    function findUserByUsername(username) {
        var target = String(username || '').trim().toLowerCase();
        if (!target || !MRS.db) return null;
        return MRS.db.users.find(function (user) {
            return String(user.username).toLowerCase() === target;
        }) || null;
    }

    function findUserById(id) {
        if (!MRS.db || !id) return null;
        return MRS.db.users.find(function (user) { return user.id === id; }) || null;
    }

    function getStats() {
        var db = MRS.db || { items: [], requests: [], movements: [], users: [] };
        var items = (db.items || []).filter(function (item) { return item && !item.deleted; });
        return {
            items: items.length,
            users: (db.users || []).length,
            requests: (db.requests || []).length,
            movements: (db.movements || []).length,
            photos: items.filter(function (item) { return !!item.photo; }).length
        };
    }

    MRS.storage = {
        load: load,
        save: save,
        adopt: adopt,
        persist: persist,
        migrateDB: migrateDB,
        readRaw: readRaw,
        findUserByUsername: findUserByUsername,
        findUserById: findUserById,
        getStats: getStats
    };

}(window.MRS = window.MRS || {}));
