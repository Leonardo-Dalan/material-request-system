(function (MRS) {
    'use strict';

    var currentView = 'catalog';
    var pendingConfirm = null;
    var bound = false;
    var clockTimer = null;

    var ACCESS = {
        request: 'REQUESTER',
        requests: 'REQUESTER',
        dashboard: 'LOGISTICS',
        queue: 'LOGISTICS',
        catalog: 'REQUESTER',
        stock: 'LOGISTICS',
        reports: 'LOGISTICS',
        admin: 'ADMIN'
    };

    var TITLES = {
        request: 'New request',
        requests: 'My requests',
        dashboard: 'Dashboard',
        queue: 'Logistics queue',
        catalog: 'Catalog',
        stock: 'Stock',
        reports: 'Reports',
        admin: 'Administration'
    };

    function elementForView(name) {
        return MRS.utils.$('view' + name.charAt(0).toUpperCase() + name.slice(1));
    }

    function canAccess(name) {
        return !!MRS.currentUser && MRS.auth.hasRole(ACCESS[name] || 'ADMIN');
    }

    function defaultView() {
        if (!MRS.currentUser) return null;
        if (MRS.currentUser.role === 'ADMIN') return 'admin';
        return 'catalog';
    }

    function ensureActiveNavVisible() {
        var nav = document.querySelector('.main-nav');
        if (!nav) return;
        var active = nav.querySelector('.nav-tab.active');
        if (!active) return;
        var navRect = nav.getBoundingClientRect();
        var activeRect = active.getBoundingClientRect();
        if (activeRect.left < navRect.left) nav.scrollLeft += activeRect.left - navRect.left;
        else if (activeRect.right > navRect.right) nav.scrollLeft += activeRect.right - navRect.right;
    }

    function switchView(name, options) {
        if (!MRS.currentUser) {
            showLogin();
            return false;
        }
        if (!elementForView(name) || !canAccess(name)) {
            MRS.utils.toast('This area is not available for your role.', 'warn');
            return false;
        }

        MRS.utils.$$('.view').forEach(function (view) {
            view.classList.add('hidden');
        });
        var target = elementForView(name);
        target.classList.remove('hidden');

        MRS.utils.$$('.nav-tab').forEach(function (tab) {
            tab.classList.toggle('active', tab.getAttribute('data-nav') === name);
        });
        ensureActiveNavVisible();

        currentView = name;
        document.title = TITLES[name] + ' // Material Request';

        if (name === 'catalog' && MRS.views.catalog) MRS.views.catalog.render();
        if (name === 'request' && MRS.views.request) MRS.views.request.render();
        if (name === 'requests' && MRS.views.requests) MRS.views.requests.render();
        if (name === 'dashboard' && MRS.views.dashboard) MRS.views.dashboard.render();
        if (name === 'queue' && MRS.views.queue) MRS.views.queue.render();
        if (name === 'stock' && MRS.views.stock) MRS.views.stock.render();
        if (name === 'reports' && MRS.views.reports) MRS.views.reports.render();
        if (name === 'admin' && MRS.views.admin) MRS.views.admin.render();

        if (!options || !options.preserveScroll) {
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        }
        return true;
    }

    function renderCurrentView() {
        if (!MRS.currentUser) return;
        if (!canAccess(currentView)) currentView = defaultView();
        if (currentView === 'catalog' && MRS.views.catalog) MRS.views.catalog.render();
        if (currentView === 'request' && MRS.views.request) MRS.views.request.render();
        if (currentView === 'requests' && MRS.views.requests) MRS.views.requests.render();
        if (currentView === 'dashboard' && MRS.views.dashboard) MRS.views.dashboard.render();
        if (currentView === 'queue' && MRS.views.queue) MRS.views.queue.render();
        if (currentView === 'stock' && MRS.views.stock) MRS.views.stock.render();
        if (currentView === 'reports' && MRS.views.reports) MRS.views.reports.render();
        if (currentView === 'admin' && MRS.views.admin) MRS.views.admin.render();
    }

    function showLogin() {
        MRS.utils.closeAllModals();
        MRS.utils.$('viewLogin').classList.remove('hidden');
        MRS.utils.$('appShell').classList.add('hidden');
        var error = MRS.utils.$('loginError');
        if (error) error.textContent = '';
        var password = MRS.utils.$('loginPass');
        if (password) password.value = '';
        document.title = 'Material Request System';
    }

    function onLogin() {
        MRS.utils.$('viewLogin').classList.add('hidden');
        MRS.utils.$('appShell').classList.remove('hidden');
        MRS.auth.updateTopbar();
        MRS.auth.applyRoleVisibility();
        if (MRS.views.request) MRS.views.request.resetForm();
        switchView(defaultView());
        startClock();
    }

    function startClock() {
        updateClock();
        if (clockTimer) clearInterval(clockTimer);
        clockTimer = setInterval(updateClock, 15000);
    }

    function updateClock() {
        var clock = MRS.utils.$('topbarClock');
        if (clock) clock.textContent = MRS.utils.formatClock(Date.now());
    }

    function openConfirm(options) {
        var settings = options || {};
        MRS.utils.setText('confirmTitle', settings.title || 'Are you sure?');
        MRS.utils.setText('confirmMessage', settings.message || 'This action cannot be undone.');
        pendingConfirm = typeof settings.onConfirm === 'function' ? settings.onConfirm : null;
        MRS.utils.openModal('modalConfirm');
    }

    function closeConfirm() {
        pendingConfirm = null;
        MRS.utils.closeModal('modalConfirm');
    }

    function handleAction(action, source) {
        if (!action) return;

        if (action === 'logout') {
            MRS.auth.logout();
            return;
        }
        if (action === 'modal-close') {
            MRS.utils.closeModal(source.getAttribute('data-modal'));
            return;
        }
        if (action === 'confirm-cancel') {
            closeConfirm();
            return;
        }
        if (action === 'confirm-ok') {
            var callback = pendingConfirm;
            closeConfirm();
            if (callback) callback();
            return;
        }
        if (action === 'demo-login') {
            var result = MRS.auth.loginWithCredentials(source.getAttribute('data-user'), source.getAttribute('data-pass'));
            var error = MRS.utils.$('loginError');
            if (!result.ok && error) error.textContent = result.error;
            return;
        }

        if (!MRS.auth.requireLogin()) return;

        if (action === 'catalog-add' && MRS.views.catalog) MRS.views.catalog.openAdd();
        else if (action === 'catalog-import' && MRS.views.catalog) MRS.views.catalog.openImport();
        else if (action === 'catalog-export' && MRS.views.catalog) MRS.views.catalog.exportCatalog();
        else if (action === 'catalog-clear-search' && MRS.views.catalog) MRS.views.catalog.clearSearch();
        else if (action === 'subcat-filter' && MRS.views.catalog) MRS.views.catalog.filterSubcategory(source.getAttribute('data-subcat') || '');
        else if (action === 'item-edit' && MRS.views.catalog) MRS.views.catalog.openEdit(source.getAttribute('data-id'));
        else if (action === 'item-delete' && MRS.views.catalog) MRS.views.catalog.confirmDelete(source.getAttribute('data-id'));
        else if (action === 'photo-clear' && MRS.views.catalog) MRS.views.catalog.clearPhoto();
        else if (action === 'import-submit' && MRS.views.catalog) MRS.views.catalog.submitImport();
        else if (action === 'user-add' && MRS.views.admin) MRS.views.admin.openAdd();
        else if (action === 'user-edit' && MRS.views.admin) MRS.views.admin.openEdit(source.getAttribute('data-id'));
        else if (action === 'user-toggle' && MRS.views.admin) MRS.views.admin.toggleUser(source.getAttribute('data-id'));
        else if (action === 'sync-save' && MRS.views.admin) MRS.views.admin.saveSyncUrl();
        else if (action === 'sync-clear' && MRS.views.admin) MRS.views.admin.clearSyncUrl();
        else if (action === 'catalog-request' && MRS.views.request) {
            if (MRS.views.request.openItem(source.getAttribute('data-id'))) switchView('request');
        }
        else if (action === 'request-select' && MRS.views.request) MRS.views.request.selectItem(source.getAttribute('data-id'));
        else if (action === 'request-clear-item' && MRS.views.request) MRS.views.request.clearSelectedItem();
        else if (action === 'request-reset' && MRS.views.request) MRS.views.request.resetForm();
        else if (action === 'request-filter' && MRS.views.requests) MRS.views.requests.filterRequests(source.getAttribute('data-status'));
        else if (action === 'request-again' && MRS.views.requests) MRS.views.requests.requestAgain(source.getAttribute('data-id'));
        else if (action === 'queue-filter' && MRS.views.queue) MRS.views.queue.filterQueue(source.getAttribute('data-status'));
        else if (action === 'queue-start' && MRS.views.queue) MRS.views.queue.startRequest(source.getAttribute('data-id'));
        else if (action === 'queue-done' && MRS.views.queue) MRS.views.queue.completeRequest(source.getAttribute('data-id'));
        else if (action === 'queue-reject' && MRS.views.queue) MRS.views.queue.openReject(source.getAttribute('data-id'));
        else if (action === 'stock-receipt' && MRS.views.stock) MRS.views.stock.openReceipt();
        else if (action === 'stock-filter' && MRS.views.stock) MRS.views.stock.filter(source.getAttribute('data-type'));
        else if (action === 'report-period' && MRS.views.reports) MRS.views.reports.setPeriod(source.getAttribute('data-period'));
        else if (action === 'report-shift' && MRS.views.reports) MRS.views.reports.shift(source.getAttribute('data-delta'));
        else if (action === 'report-current' && MRS.views.reports) MRS.views.reports.current();
        else if (action === 'report-export-all' && MRS.views.reports) MRS.views.reports.exportAll();
    }

    function onClick(event) {
        var modalBackdrop = event.target.classList && event.target.classList.contains('modal-backdrop')
            ? event.target
            : null;
        if (modalBackdrop) {
            MRS.utils.closeModal(modalBackdrop.id);
            return;
        }

        var nav = event.target.closest('[data-nav]');
        if (nav) {
            event.preventDefault();
            switchView(nav.getAttribute('data-nav'));
            return;
        }

        var actionSource = event.target.closest('[data-action]');
        if (!actionSource) return;
        event.preventDefault();
        handleAction(actionSource.getAttribute('data-action'), actionSource);
    }

    function onSubmit(event) {
        if (event.target.id === 'loginForm') {
            event.preventDefault();
            MRS.auth.doLogin();
        } else if (event.target.id === 'itemForm') {
            event.preventDefault();
            if (MRS.views.catalog) MRS.views.catalog.saveFromForm();
        } else if (event.target.id === 'userForm') {
            event.preventDefault();
            if (MRS.views.admin) MRS.views.admin.saveFromForm();
        } else if (event.target.id === 'requestForm') {
            event.preventDefault();
            if (MRS.views.request) MRS.views.request.submitRequest();
        } else if (event.target.id === 'requestRejectForm') {
            event.preventDefault();
            if (MRS.views.queue) MRS.views.queue.submitReject();
        } else if (event.target.id === 'receiptForm') {
            event.preventDefault();
            if (MRS.views.stock) MRS.views.stock.submitReceipt();
        }
    }

    function onKeydown(event) {
        if (event.key !== 'Escape') return;
        var open = MRS.utils.$$('.modal-backdrop.open');
        if (!open.length) return;
        var top = open[open.length - 1];
        if (top.id === 'modalConfirm') closeConfirm();
        else MRS.utils.closeModal(top.id);
    }

    function bind() {
        if (bound) return;
        bound = true;

        document.addEventListener('click', onClick);
        document.addEventListener('submit', onSubmit);
        document.addEventListener('keydown', onKeydown);
        window.addEventListener('resize', MRS.utils.debounce(ensureActiveNavVisible, 100));

        var search = MRS.utils.$('catalogSearch');
        if (search) {
            search.addEventListener('input', MRS.utils.debounce(function () {
                if (MRS.views.catalog) MRS.views.catalog.onSearchInput();
            }, MRS.config.TECH.searchDebounceMs));
        }

        var requestSearch = MRS.utils.$('requestItemSearch');
        if (requestSearch) {
            requestSearch.addEventListener('input', MRS.utils.debounce(function () {
                if (MRS.views.request) MRS.views.request.onSearchInput();
            }, MRS.config.TECH.searchDebounceMs));
        }

        var importFile = MRS.utils.$('importFile');
        if (importFile) {
            importFile.addEventListener('change', function () {
                if (MRS.views.catalog) MRS.views.catalog.onImportFile();
            });
        }

        var importText = MRS.utils.$('importText');
        if (importText) {
            importText.addEventListener('input', function () {
                if (MRS.views.catalog) MRS.views.catalog.onImportTextInput();
            });
        }

        var stockSearch = MRS.utils.$('stockSearch');
        if (stockSearch) {
            stockSearch.addEventListener('input', MRS.utils.debounce(function () {
                if (MRS.views.stock) MRS.views.stock.onSearchInput();
            }, MRS.config.TECH.searchDebounceMs));
        }

        var photoFile = MRS.utils.$('itemPhotoFile');
        if (photoFile) {
            photoFile.addEventListener('change', function () {
                if (MRS.views.catalog) MRS.views.catalog.onPhotoFile();
            });
        }

        var photoUrl = MRS.utils.$('itemPhotoUrl');
        if (photoUrl) {
            photoUrl.addEventListener('input', function () {
                if (MRS.views.catalog) MRS.views.catalog.onPhotoUrlInput();
            });
        }

        var rejectReason = MRS.utils.$('rejectReason');
        if (rejectReason) {
            rejectReason.addEventListener('change', function () {
                if (MRS.views.queue) MRS.views.queue.onReasonChange();
            });
        }

        MRS.utils.$$('.modal-backdrop').forEach(function (backdrop) {
            backdrop.addEventListener('click', function (event) {
                if (event.target !== backdrop) return;
                if (backdrop.id === 'modalConfirm') closeConfirm();
                else MRS.utils.closeModal(backdrop.id);
            });
        });
    }

    MRS.views = MRS.views || {};
    MRS.views.app = {
        bind: bind,
        switchView: switchView,
        currentView: function () { return currentView; },
        defaultView: defaultView,
        onLogin: onLogin,
        showLogin: showLogin,
        renderCurrentView: renderCurrentView,
        refreshCurrentView: function () { renderCurrentView(); },
        openConfirm: openConfirm,
        closeConfirm: closeConfirm,
        canAccess: canAccess
    };

}(window.MRS = window.MRS || {}));
