(function (MRS) {
    'use strict';

    var firebaseUrl = '';
    var channel = null;
    var pollTimer = null;
    var pullInFlight = false;
    var lastRemoteUpdatedAt = 0;
    var lastSyncAt = 0;
    var lastError = '';
    var status = 'off';

    function readStoredUrl() {
        try {
            return window.localStorage.getItem(MRS.config.FIREBASE_URL_KEY) || '';
        } catch (error) {
            return '';
        }
    }

    function cleanUrl(url) {
        return String(url || '').trim().replace(/\/+$/, '');
    }

    function stateUrl() {
        return firebaseUrl + '/' + MRS.config.FIREBASE_ROOT_PATH + '.json';
    }

    function init() {
        firebaseUrl = cleanUrl(readStoredUrl());
        setupChannel();
        window.addEventListener('storage', onStorageEvent);
        updateSyncBadge();

        if (firebaseUrl) {
            status = 'connecting';
            updateSyncBadge();
            startPolling();
            syncNow();
        }
    }

    function setupChannel() {
        if (channel || !('BroadcastChannel' in window)) return;
        try {
            channel = new BroadcastChannel(MRS.config.BROADCAST_CHANNEL);
            channel.onmessage = function (event) {
                if (!event.data || event.data.type !== 'DB_UPDATE') return;
                if (!MRS.db) return;
                if (Number(event.data.updatedAt) <= Number(MRS.db.updatedAt || 0)) return;
                reloadFromDisk();
            };
        } catch (error) {
            channel = null;
        }
    }

    function onStorageEvent(event) {
        if (event.key !== MRS.config.STORAGE_KEY) return;
        reloadFromDisk();
    }

    function reloadFromDisk() {
        MRS.storage.load();
        if (MRS.views && MRS.views.app) MRS.views.app.refreshCurrentView();
    }

    function notifyLocalChange() {
        if (!channel || !MRS.db) return;
        try {
            channel.postMessage({ type: 'DB_UPDATE', updatedAt: MRS.db.updatedAt });
        } catch (error) {
            channel = null;
        }
    }

    function recordStamp(record) {
        if (!record || typeof record !== 'object') return 0;
        return Number(record.updatedAt || record.createdAt || record.timestamp || 0);
    }

    function normalizeCollection(value) {
        return Array.isArray(value) ? value.filter(function (entry) {
            return entry && typeof entry === 'object';
        }) : [];
    }

    function mergeCollection(localRows, remoteRows) {
        var rows = normalizeCollection(localRows).slice();
        var index = {};
        rows.forEach(function (row, position) {
            index[row.id] = position;
        });

        var changed = false;
        normalizeCollection(remoteRows).forEach(function (remote) {
            if (!remote.id) return;
            var position = index[remote.id];
            if (position === undefined) {
                index[remote.id] = rows.length;
                rows.push(remote);
                changed = true;
                return;
            }
            if (recordStamp(remote) > recordStamp(rows[position])) {
                rows[position] = remote;
                changed = true;
            }
        });

        return { rows: rows, changed: changed };
    }

    function mergeRemote(local, remote) {
        var localDb = local;
        var remoteDb = remote;
        var changed = false;
        var remoteNewer = Number(remoteDb.updatedAt || 0) > Number(localDb.updatedAt || 0);

        var result = {
            version: Math.max(Number(localDb.version) || 1, Number(remoteDb.version) || 1),
            updatedAt: Math.max(Number(localDb.updatedAt) || 0, Number(remoteDb.updatedAt) || 0),
            settings: remoteNewer ? MRS.normalizeSettings(remoteDb.settings) : MRS.normalizeSettings(localDb.settings),
            users: localDb.users,
            items: localDb.items,
            requests: localDb.requests,
            movements: localDb.movements
        };

        if (JSON.stringify(result.settings) !== JSON.stringify(MRS.normalizeSettings(localDb.settings))) changed = true;

        ['users', 'items', 'requests', 'movements'].forEach(function (key) {
            var merged = mergeCollection(localDb[key], remoteDb[key]);
            result[key] = merged.rows;
            if (merged.changed) changed = true;
        });

        return { db: result, changed: changed };
    }

    function markState(next, error) {
        status = next;
        if (error) lastError = String(error.message || error);
        if (next === 'ok') {
            lastSyncAt = Date.now();
            lastError = '';
        }
        updateSyncBadge();
    }

    function persistRemote(db) {
        MRS.storage.adopt(db);
        MRS.storage.persist(MRS.db);
        if (MRS.views && MRS.views.app) MRS.views.app.refreshCurrentView();
    }

    function pullNow() {
        if (!firebaseUrl || !MRS.db || pullInFlight) return Promise.resolve(false);
        pullInFlight = true;
        return fetch(stateUrl(), { cache: 'no-store' })
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            })
            .then(function (remote) {
                pullInFlight = false;
                if (!remote || typeof remote !== 'object') {
                    lastRemoteUpdatedAt = 0;
                    return false;
                }
                var remoteUpdatedAt = Number(remote.updatedAt) || 0;
                if (remoteUpdatedAt && remoteUpdatedAt <= lastRemoteUpdatedAt) return false;
                lastRemoteUpdatedAt = remoteUpdatedAt;

                var migrated = MRS.storage.migrateDB(remote);
                var merged = mergeRemote(MRS.db, migrated);
                if (!merged.changed) {
                    markState('ok');
                    return false;
                }

                merged.db.updatedAt = Math.max(
                    Date.now(),
                    remoteUpdatedAt + 1,
                    Number(MRS.db.updatedAt || 0) + 1
                );
                persistRemote(merged.db);
                markState('ok');
                schedulePush();
                return true;
            })
            .catch(function (error) {
                pullInFlight = false;
                markState('error', error);
                return false;
            });
    }

    function pushNow() {
        if (!firebaseUrl || !MRS.db) return Promise.resolve(false);
        markState('syncing');
        return fetch(stateUrl(), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(MRS.db)
        })
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                markState('ok');
                return true;
            })
            .catch(function (error) {
                markState('error', error);
                return false;
            });
    }

    var schedulePush = MRS.utils.debounce(function () {
        if (firebaseUrl) pushNow();
    }, MRS.config.TECH.pushDebounceMs);

    function syncNow() {
        if (!firebaseUrl) return Promise.resolve(false);
        markState('syncing');
        return pullNow().then(function () {
            return pushNow();
        });
    }

    function setFirebaseUrl(url) {
        var cleaned = cleanUrl(url);
        if (cleaned && !/^https?:\/\/[^\s]+$/i.test(cleaned)) {
            return { ok: false, error: 'Enter a valid http(s) database URL.' };
        }

        firebaseUrl = cleaned;
        try {
            if (cleaned) window.localStorage.setItem(MRS.config.FIREBASE_URL_KEY, cleaned);
            else window.localStorage.removeItem(MRS.config.FIREBASE_URL_KEY);
        } catch (error) {
            return { ok: false, error: 'Could not write the URL to localStorage.' };
        }

        stopPolling();
        lastRemoteUpdatedAt = 0;
        lastError = '';

        if (firebaseUrl) {
            status = 'connecting';
            updateSyncBadge();
            startPolling();
            syncNow();
        } else {
            status = 'off';
            updateSyncBadge();
        }
        return { ok: true, url: firebaseUrl };
    }

    function getFirebaseUrl() {
        return firebaseUrl;
    }

    function startPolling() {
        stopPolling();
        if (!firebaseUrl) return;
        pollTimer = setInterval(function () {
            if (firebaseUrl) pullNow();
        }, MRS.config.TECH.cloudPollMs);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function getStatus() {
        return {
            state: firebaseUrl ? status : 'off',
            url: firebaseUrl,
            lastSyncAt: lastSyncAt,
            lastError: lastError
        };
    }

    function describeStatus() {
        if (!firebaseUrl) {
            return {
                state: 'off',
                dot: '',
                text: 'Local only',
                detail: 'Cloud sync is off. Data is stored on this device.',
                extra: 'Enter a Firebase Realtime Database URL in Admin to share data with other PCs.'
            };
        }
        if (status === 'error') {
            return {
                state: 'error',
                dot: 'error',
                text: 'Sync error',
                detail: 'Cloud sync error: ' + (lastError || 'unknown error') + '. Retrying automatically.',
                extra: firebaseUrl
            };
        }
        if (status === 'syncing') {
            return {
                state: 'syncing',
                dot: 'syncing',
                text: 'Syncing...',
                detail: 'Sending local changes to Firebase.',
                extra: firebaseUrl
            };
        }
        if (status === 'ok') {
            return {
                state: 'ok',
                dot: 'ok',
                text: 'Synced ' + MRS.utils.formatClock(lastSyncAt),
                detail: 'Connected to Firebase. Last sync at ' + MRS.utils.formatDateTime(lastSyncAt) + '.',
                extra: firebaseUrl
            };
        }
        return {
            state: 'connecting',
            dot: 'syncing',
            text: 'Connecting...',
            detail: 'Connecting to the Firebase Realtime Database...',
            extra: firebaseUrl
        };
    }

    function setClass(element, base, stateClass) {
        if (!element) return;
        element.className = base + (stateClass ? ' ' + stateClass : '');
    }

    function updateSyncBadge() {
        var info = describeStatus();
        var dot = MRS.utils.$('syncDot');
        var text = MRS.utils.$('syncText');
        var badge = MRS.utils.$('syncBadge');
        if (dot) setClass(dot, 'sync-dot', info.dot);
        if (text) text.textContent = info.text;
        if (badge) badge.setAttribute('title', info.extra || info.detail);

        var adminDot = MRS.utils.$('adminSyncDot');
        var adminChipText = MRS.utils.$('adminSyncChipText');
        var adminStatus = MRS.utils.$('adminSyncStatus');
        var adminDetail = MRS.utils.$('adminSyncDetail');
        if (adminDot) setClass(adminDot, 'sync-dot', info.dot);
        if (adminChipText) adminChipText.textContent = info.state === 'off' ? 'Local' : info.state.toUpperCase();
        if (adminStatus) adminStatus.textContent = info.detail;
        if (adminDetail) adminDetail.textContent = info.extra || '';
    }

    MRS.sync = {
        init: init,
        setFirebaseUrl: setFirebaseUrl,
        getFirebaseUrl: getFirebaseUrl,
        getStatus: getStatus,
        pushNow: pushNow,
        pullNow: pullNow,
        syncNow: syncNow,
        schedulePush: schedulePush,
        notifyLocalChange: notifyLocalChange,
        startPolling: startPolling,
        stopPolling: stopPolling,
        updateSyncBadge: updateSyncBadge,
        mergeRemote: mergeRemote,
        stateUrl: stateUrl,
        reloadFromDisk: reloadFromDisk
    };

}(window.MRS = window.MRS || {}));
