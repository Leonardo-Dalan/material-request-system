(function (MRS) {
    'use strict';

    var state = {
        term: '',
        itemId: '',
        filter: 'ALL'
    };

    function settings() {
        return MRS.normalizeSettings(MRS.db ? MRS.db.settings : null);
    }

    function photoFallback() {
        return '<span class="request-photo-empty">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"></path>' +
            '<path d="M4 7.5 12 12l8-4.5M12 12v9"></path>' +
            '</svg></span>';
    }

    function itemPhoto(item) {
        var safe = MRS.utils.safeImageUrl(item.itemPhoto || item.photo || '');
        if (!safe) return photoFallback();
        return '<img src="' + MRS.utils.escapeAttr(safe) + '" alt="' + MRS.utils.escapeAttr(item.itemName || item.name || 'Material') + '" loading="lazy">';
    }

    function renderOptions() {
        var config = settings();
        var areas = MRS.utils.unique(config.requestingAreas.concat(
            MRS.requests.all().map(function (request) { return request.requestingArea; }).filter(Boolean)
        ));
        var dropOffs = MRS.utils.unique(config.dropOffLocations.concat(
            MRS.requests.all().map(function (request) { return request.dropOff; }).filter(Boolean)
        ));

        var areaList = MRS.utils.$('requestAreaOptions');
        if (areaList) {
            areaList.innerHTML = areas.map(function (area) {
                return '<option value="' + MRS.utils.escapeAttr(area) + '"></option>';
            }).join('');
        }

        var dropList = MRS.utils.$('requestDropOffOptions');
        if (dropList) {
            dropList.innerHTML = dropOffs.map(function (location) {
                return '<option value="' + MRS.utils.escapeAttr(location) + '"></option>';
            }).join('');
        }
    }

    function renderResults() {
        var host = MRS.utils.$('requestResults');
        var meta = MRS.utils.$('requestResultsMeta');
        if (!host) return;

        var allItems = MRS.catalog.filterItems(state.term);
        var results = allItems.slice(0, state.term ? 8 : 6);

        if (meta) {
            meta.textContent = state.term
                ? allItems.length + ' match' + (allItems.length === 1 ? '' : 'es') + ' for "' + state.term + '"'
                : 'Showing ' + results.length + ' of ' + allItems.length + ' materials';
        }

        if (!results.length) {
            host.innerHTML = '<div class="request-results-empty">No material matches this search. Try a part number, name or subcategory.</div>';
            return;
        }

        host.innerHTML = results.map(function (item) {
            var photo = MRS.utils.safeImageUrl(item.photo);
            var image = photo
                ? '<img src="' + MRS.utils.escapeAttr(photo) + '" alt="' + MRS.utils.escapeAttr(item.name) + '" loading="lazy">'
                : photoFallback();
            return '<button type="button" class="request-result' + (state.itemId === item.id ? ' selected' : '') + '" data-action="request-select" data-id="' + MRS.utils.escapeAttr(item.id) + '">' +
                '<span class="request-result-photo">' + image + '</span>' +
                '<span class="request-result-copy">' +
                '<span class="request-result-pn">' + MRS.utils.escapeHtml(item.pn) + '</span>' +
                '<strong>' + MRS.utils.escapeHtml(item.name) + '</strong>' +
                '<small>' + MRS.utils.escapeHtml(item.subcategory) + ' · ' + MRS.utils.escapeHtml(item.stockLocation || 'No location') + ' · ' + MRS.utils.escapeHtml(item.unit) + '</small>' +
                '</span>' +
                '<span class="request-result-select">Select</span>' +
                '</button>';
        }).join('');
    }

    function renderSelected() {
        var host = MRS.utils.$('requestSelected');
        var unitLabel = MRS.utils.$('requestQtyUnit');
        if (!host) return;

        var item = MRS.catalog.getById(state.itemId);
        if (!item) {
            state.itemId = '';
            host.className = 'request-selected is-empty';
            host.innerHTML = '<span class="request-selected-empty">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"></path><path d="M4 7.5 12 12l8-4.5M12 12v9"></path></svg>' +
                '<span><strong>No material selected</strong><small>Search above and choose the item you need from the warehouse.</small></span></span>';
            if (unitLabel) unitLabel.textContent = 'unit';
            return;
        }

        host.className = 'request-selected';
        host.innerHTML = '<div class="selected-photo">' + itemPhoto(item) + '</div>' +
            '<div class="selected-copy">' +
            '<span class="selected-label">SELECTED MATERIAL</span>' +
            '<span class="request-result-pn">' + MRS.utils.escapeHtml(item.pn) + '</span>' +
            '<strong>' + MRS.utils.escapeHtml(item.name) + '</strong>' +
            '<div class="selected-meta">' +
            '<span class="loc-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"></path><circle cx="12" cy="11" r="2.2"></circle></svg><span>' + MRS.utils.escapeHtml(item.stockLocation || 'No location') + '</span></span>' +
            '<span class="unit-chip">' + MRS.utils.escapeHtml(item.unit) + '</span>' +
            '<span class="selected-subcat">' + MRS.utils.escapeHtml(item.subcategory) + '</span>' +
            '</div></div>' +
            '<button type="button" class="icon-btn" data-action="request-clear-item" title="Clear selected material" aria-label="Clear selected material">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"></path></svg></button>';
        if (unitLabel) unitLabel.textContent = item.unit;
    }

    function showErrors(errors) {
        var box = MRS.utils.$('requestFormError');
        var fieldMap = {
            itemId: 'requestItemSearch',
            quantity: 'requestQty',
            requestingArea: 'requestArea',
            dropOff: 'requestDropOff',
            jobNumber: 'requestJob',
            urgency: 'requestUrgencyNormal'
        };
        var parts = [];
        var first = null;
        Object.keys(errors).forEach(function (key) {
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

    function renderSideStats() {
        var stats = MRS.requests.stats();
        MRS.utils.setText('requestQueueNew', stats.new);
        MRS.utils.setText('requestQueueWorking', stats.working);
        MRS.utils.setText('requestQueueUrgent', stats.urgentOpen);
    }

    function statusBadge(status) {
        return '<span class="request-status ' + MRS.utils.escapeAttr(status) + '">' + MRS.utils.escapeHtml(MRS.requests.statusLabel(status)) + '</span>';
    }

    function renderMyRequests() {
        var host = MRS.utils.$('requestList');
        var filters = MRS.utils.$('requestFilters');
        var empty = MRS.utils.$('requestsEmpty');
        var emptyTitle = MRS.utils.$('requestsEmptyTitle');
        var emptyText = MRS.utils.$('requestsEmptyText');
        var meta = MRS.utils.$('requestsMeta');
        if (!host || !MRS.currentUser) return;

        var mine = MRS.requests.listForUser(MRS.currentUser.id);
        var counts = { ALL: mine.length, NEW: 0, WORKING: 0, DONE: 0, REJECTED: 0 };
        mine.forEach(function (request) {
            if (counts[request.status] !== undefined) counts[request.status]++;
        });

        if (filters) {
            filters.innerHTML = ['ALL', 'NEW', 'WORKING', 'DONE', 'REJECTED'].map(function (status) {
                var label = status === 'ALL' ? 'All requests' : MRS.requests.statusLabel(status);
                return '<button type="button" class="filter-chip' + (state.filter === status ? ' active' : '') + '" data-action="request-filter" data-status="' + status + '">' +
                    label + ' <span>' + counts[status] + '</span></button>';
            }).join('');
        }

        var visible = mine.filter(function (request) {
            return state.filter === 'ALL' || request.status === state.filter;
        });
        if (meta) meta.textContent = visible.length + ' of ' + mine.length + ' requests';

        if (!visible.length) {
            host.innerHTML = '';
            host.classList.add('hidden');
            if (empty) empty.classList.remove('hidden');
            if (emptyTitle) {
                emptyTitle.textContent = mine.length ? 'No matching requests' : 'No requests yet';
            }
            if (emptyText) {
                emptyText.textContent = mine.length
                    ? 'No requests match this status filter.'
                    : 'Submit your first request and track its progress here.';
            }
            return;
        }

        host.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');

        host.innerHTML = visible.map(function (request) {
            var urgent = request.urgency === 'URGENT'
                ? '<span class="request-urgency">Urgent</span>'
                : '<span class="request-urgency normal">Normal</span>';
            var rejectionNote = request.rejectionNote
                ? '<small class="rejection-note">Note: ' + MRS.utils.escapeHtml(request.rejectionNote) + '</small>'
                : '';
            var rejection = request.status === 'REJECTED'
                ? '<div class="request-rejection"><strong>Rejected</strong><span>' + MRS.utils.escapeHtml(request.rejectionReason || 'No reason recorded.') + rejectionNote + '</span></div>'
                : '';
            var events = (request.history || []).map(function (event) {
                return '<span class="request-event ' + MRS.utils.escapeAttr(event.status) + '">' +
                    '<span class="event-dot"></span>' +
                    '<span><strong>' + MRS.utils.escapeHtml(MRS.requests.statusLabel(event.status)) + '</strong>' +
                    '<small>' + MRS.utils.escapeHtml(MRS.utils.formatDateTime(event.at)) + (event.byName ? ' · ' + MRS.utils.escapeHtml(event.byName) : '') + '</small></span>' +
                    '</span>';
            }).join('');

            return '<article class="request-card ' + MRS.utils.escapeAttr(request.status) + (request.urgency === 'URGENT' ? ' urgent' : '') + '">' +
                '<div class="request-card-top">' +
                '<div class="request-card-id">' + statusBadge(request.status) + urgent +
                '<span class="request-number">' + MRS.utils.escapeHtml(request.requestNumber || request.id) + '</span></div>' +
                '<span class="request-time">' + MRS.utils.escapeHtml(MRS.utils.formatRelative(request.createdAt)) + '</span>' +
                '</div>' +
                '<div class="request-card-main">' +
                '<div class="request-photo">' + itemPhoto(request) + '</div>' +
                '<div class="request-item-copy">' +
                '<span class="request-result-pn">' + MRS.utils.escapeHtml(request.itemPn) + '</span>' +
                '<strong>' + MRS.utils.escapeHtml(request.itemName) + '</strong>' +
                '<span class="request-location">Stock location ' + MRS.utils.escapeHtml(request.stockLocation || 'unknown') + '</span>' +
                '</div>' +
                '<div class="request-qty"><strong>' + MRS.utils.escapeHtml(MRS.requests.formatQuantity(request.quantity)) + '</strong><span>' + MRS.utils.escapeHtml(request.unit) + '</span></div>' +
                '</div>' +
                '<div class="request-meta">' +
                '<div><span>Requesting area</span><strong>' + MRS.utils.escapeHtml(request.requestingArea) + '</strong></div>' +
                '<div><span>Drop-off</span><strong>' + MRS.utils.escapeHtml(request.dropOff) + '</strong></div>' +
                '<div><span>Job number</span><strong>' + MRS.utils.escapeHtml(request.jobNumber) + '</strong></div>' +
                '<div><span>Submitted</span><strong>' + MRS.utils.escapeHtml(MRS.utils.formatDateTime(request.createdAt)) + '</strong></div>' +
                '</div>' +
                rejection +
                '<div class="request-events">' + events + '</div>' +
                '<div class="request-card-foot">' +
                '<button type="button" class="btn btn-secondary btn-sm" data-action="request-again" data-id="' + MRS.utils.escapeAttr(request.id) + '">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.5-5.8"></path><path d="M4 5v5h5"></path></svg>' +
                'Request again</button>' +
                '</div>' +
                '</article>';
        }).join('');
    }

    function render() {
        if (!MRS.db || !MRS.currentUser) return;
        renderOptions();
        renderResults();
        renderSelected();
        renderSideStats();
        renderMyRequests();
    }

    function selectItem(id) {
        var item = MRS.catalog.getById(id);
        if (!item) {
            MRS.utils.toast('That material is not available.', 'error');
            return;
        }
        state.itemId = item.id;
        MRS.utils.setText('requestFormError', '');
        renderSelected();
        renderResults();
        var quantity = MRS.utils.$('requestQty');
        if (quantity) {
            quantity.focus();
            quantity.select();
        }
    }

    function preselectItem(id) {
        var item = MRS.catalog.getById(id);
        if (!item) return false;
        state.itemId = item.id;
        state.term = '';
        var search = MRS.utils.$('requestItemSearch');
        if (search) search.value = '';
        MRS.utils.setText('requestFormError', '');
        renderSelected();
        renderResults();
        return true;
    }

    function openItem(id) {
        if (!MRS.catalog.getById(id)) {
            MRS.utils.toast('That material is not available.', 'error');
            return false;
        }
        resetForm();
        return preselectItem(id);
    }

    function clearSelectedItem() {
        state.itemId = '';
        renderSelected();
        var search = MRS.utils.$('requestItemSearch');
        if (search) search.focus();
    }

    function onSearchInput() {
        var search = MRS.utils.$('requestItemSearch');
        state.term = search ? search.value.trim() : '';
        renderResults();
    }

    function resetForm() {
        state.itemId = '';
        state.term = '';
        MRS.utils.$('requestQty').value = '';
        MRS.utils.$('requestArea').value = '';
        MRS.utils.$('requestDropOff').value = '';
        MRS.utils.$('requestJob').value = '';
        MRS.utils.$('requestItemSearch').value = '';
        MRS.utils.setText('requestFormError', '');
        var urgency = settings().defaultUrgency === 'URGENT' ? 'requestUrgencyUrgent' : 'requestUrgencyNormal';
        var radio = MRS.utils.$(urgency);
        if (radio) radio.checked = true;
        renderSelected();
        renderResults();
    }

    function collectForm() {
        var urgent = MRS.utils.$('requestUrgencyUrgent');
        return {
            itemId: state.itemId,
            quantity: MRS.utils.$('requestQty').value,
            requestingArea: MRS.utils.$('requestArea').value,
            dropOff: MRS.utils.$('requestDropOff').value,
            jobNumber: MRS.utils.$('requestJob').value,
            urgency: urgent && urgent.checked ? 'URGENT' : 'NORMAL'
        };
    }

    function submitRequest() {
        var errorBox = MRS.utils.$('requestFormError');
        if (errorBox) errorBox.textContent = '';
        var result = MRS.requests.create(collectForm());
        if (!result.ok) {
            if (result.errors && Object.keys(result.errors).length) showErrors(result.errors);
            else if (errorBox) errorBox.textContent = result.error || 'Could not submit the request.';
            MRS.utils.toast(result.error || 'Could not submit the request.', 'error');
            return;
        }

        var request = result.request;
        resetForm();
        state.filter = 'ALL';
        MRS.utils.toast('Request ' + request.requestNumber + ' sent to logistics.', 'success', 4200);
        if (MRS.views.app) MRS.views.app.switchView('requests');
        if (MRS.views.admin) MRS.views.admin.renderStats();
    }

    function filterRequests(status) {
        state.filter = String(status || 'ALL').toUpperCase();
        renderMyRequests();
    }

    function requestAgain(id) {
        var request = MRS.requests.getById(id);
        if (!request) {
            MRS.utils.toast('Request not found.', 'error');
            return;
        }

        var item = MRS.catalog.getById(request.itemId) || MRS.catalog.getByPn(request.itemPn);
        if (!item) {
            resetForm();
            state.term = request.itemPn;
            var search = MRS.utils.$('requestItemSearch');
            if (search) search.value = request.itemPn;
            if (MRS.views.app) MRS.views.app.switchView('request');
            render();
            MRS.utils.toast('The original material is no longer active. Choose a replacement.', 'warn', 4600);
            return;
        }

        preselectItem(item.id);
        MRS.utils.$('requestQty').value = String(request.quantity);
        MRS.utils.$('requestArea').value = request.requestingArea;
        MRS.utils.$('requestDropOff').value = request.dropOff;
        MRS.utils.$('requestJob').value = request.jobNumber;
        var radio = MRS.utils.$(request.urgency === 'URGENT' ? 'requestUrgencyUrgent' : 'requestUrgencyNormal');
        if (radio) radio.checked = true;
        if (MRS.views.app) MRS.views.app.switchView('request');
        MRS.utils.toast('Request details loaded. Review and submit.', 'success');
    }

    MRS.views = MRS.views || {};
    MRS.views.request = {
        render: render,
        selectItem: selectItem,
        preselectItem: preselectItem,
        openItem: openItem,
        clearSelectedItem: clearSelectedItem,
        onSearchInput: onSearchInput,
        resetForm: resetForm,
        submitRequest: submitRequest
    };
    MRS.views.requests = {
        render: render,
        filterRequests: filterRequests,
        requestAgain: requestAgain
    };

}(window.MRS = window.MRS || {}));
