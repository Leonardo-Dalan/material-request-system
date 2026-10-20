(function (MRS) {
    'use strict';

    var booted = false;

    function boot() {
        if (booted) return;
        booted = true;

        MRS.db = MRS.storage.load();
        if (MRS.movements) MRS.movements.ensureFromRequests();
        MRS.views.app.bind();
        MRS.views.app.showLogin();
        MRS.sync.init();

        if (MRS.auth.restoreSession()) {
            MRS.views.app.onLogin();
        } else {
            MRS.views.app.showLogin();
        }

        MRS.ready = true;
    }

    MRS.boot = boot;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

}(window.MRS = window.MRS || {}));
