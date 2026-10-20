(function (MRS) {
    'use strict';

    function editIcon() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 16-1 4 4-1L19 8l-3-3z"></path><path d="m14 7 3 3"></path></svg>';
    }

    function powerIcon() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v8"></path><path d="M7.5 6.8a7 7 0 1 0 9 0"></path></svg>';
    }

    function renderStats() {
        var stats = MRS.storage.getStats();
        MRS.utils.setText('systemItems', stats.items);
        MRS.utils.setText('systemRequests', stats.requests);
        MRS.utils.setText('systemMovements', stats.movements);
        MRS.utils.setText('systemVersion', MRS.config.APP_VERSION);
    }

    function renderUsers() {
        var host = MRS.utils.$('usersTable');
        if (!host) return;
        var users = MRS.auth.listUsers();
        MRS.utils.setText('userCount', users.length);

        host.innerHTML = users.map(function (user) {
            var active = user.active !== false;
            var isSelf = MRS.currentUser && MRS.currentUser.id === user.id;
            var safeId = MRS.utils.escapeAttr(user.id);
            return '<tr>' +
                '<td><span class="user-cell"><span class="mini-avatar">' + MRS.utils.escapeHtml(MRS.utils.initials(user.name)) + '</span><span><strong>' +
                MRS.utils.escapeHtml(user.name) + (isSelf ? ' (you)' : '') + '</strong><small>Since ' + MRS.utils.escapeHtml(MRS.utils.formatDate(user.createdAt)) + '</small></span></span></td>' +
                '<td><span class="username-cell">' + MRS.utils.escapeHtml(user.username) + '</span></td>' +
                '<td><span class="role-badge ' + MRS.utils.escapeAttr(user.role) + '">' + MRS.utils.escapeHtml(MRS.ROLE_LABELS[user.role] || user.role) + '</span></td>' +
                '<td><span class="status-chip' + (active ? '' : ' inactive') + '">' + (active ? 'Active' : 'Inactive') + '</span></td>' +
                '<td><div class="table-actions">' +
                '<button type="button" class="icon-btn" data-action="user-edit" data-id="' + safeId + '" title="Edit user" aria-label="Edit ' + MRS.utils.escapeAttr(user.username) + '">' + editIcon() + '</button>' +
                '<button type="button" class="icon-btn danger" data-action="user-toggle" data-id="' + safeId + '" title="' + (active ? 'Deactivate user' : 'Reactivate user') + '" aria-label="' + (active ? 'Deactivate ' : 'Reactivate ') + MRS.utils.escapeAttr(user.username) + '">' + powerIcon() + '</button>' +
                '</div></td>' +
                '</tr>';
        }).join('');
    }

    function renderSync() {
        var input = MRS.utils.$('adminSyncUrl');
        var url = MRS.sync.getFirebaseUrl();
        if (input && document.activeElement !== input) input.value = url;
        MRS.sync.updateSyncBadge();
    }

    function render() {
        if (!MRS.currentUser || !MRS.auth.hasRole('ADMIN')) return;
        renderUsers();
        renderStats();
        renderSync();
    }

    function resetUserForm() {
        MRS.utils.$('userId').value = '';
        MRS.utils.$('userName').value = '';
        MRS.utils.$('userUsername').value = '';
        MRS.utils.$('userUsername').readOnly = false;
        MRS.utils.$('userPassword').value = '';
        MRS.utils.$('userRole').value = 'REQUESTER';
        MRS.utils.$('userActive').checked = true;
        MRS.utils.setText('userFormError', '');
        MRS.utils.setText('userPasswordHint', 'Required for new users. Leave blank when editing to keep the current password.');
    }

    function openAdd() {
        if (!MRS.auth.requireRole('ADMIN')) return;
        resetUserForm();
        MRS.utils.setText('userModalTitle', 'Add user');
        MRS.utils.setText('userSaveBtn', 'Create user');
        MRS.utils.openModal('modalUser');
    }

    function openEdit(id) {
        if (!MRS.auth.requireRole('ADMIN')) return;
        var user = MRS.storage.findUserById(id);
        if (!user) {
            MRS.utils.toast('User not found.', 'error');
            return;
        }

        resetUserForm();
        MRS.utils.$('userId').value = user.id;
        MRS.utils.$('userName').value = user.name;
        MRS.utils.$('userUsername').value = user.username;
        MRS.utils.$('userUsername').readOnly = true;
        MRS.utils.$('userRole').value = user.role;
        MRS.utils.$('userActive').checked = user.active !== false;
        MRS.utils.setText('userModalTitle', 'Edit user');
        MRS.utils.setText('userSaveBtn', 'Save changes');
        MRS.utils.setText('userPasswordHint', 'Leave the password blank to keep the current password.');
        MRS.utils.openModal('modalUser');
    }

    function saveFromForm() {
        var id = MRS.utils.$('userId').value;
        var payload = {
            id: id,
            name: MRS.utils.$('userName').value,
            username: MRS.utils.$('userUsername').value,
            password: MRS.utils.$('userPassword').value,
            role: MRS.utils.$('userRole').value,
            active: MRS.utils.$('userActive').checked
        };
        var errorBox = MRS.utils.$('userFormError');
        if (errorBox) errorBox.textContent = '';

        var result = id
            ? MRS.auth.updateUser(id, payload)
            : MRS.auth.createUser(payload);

        if (!result.ok) {
            if (errorBox) errorBox.textContent = result.error || 'Could not save the user.';
            MRS.utils.toast(result.error || 'Could not save the user.', 'error');
            return;
        }

        MRS.utils.closeModal('modalUser');
        MRS.utils.toast(id ? 'User updated.' : 'User created.', 'success');
        render();

        if (MRS.currentUser && !MRS.auth.hasRole('ADMIN')) {
            MRS.views.app.switchView(MRS.views.app.defaultView());
        }
    }

    function toggleUser(id) {
        if (!MRS.auth.requireRole('ADMIN')) return;
        var user = MRS.storage.findUserById(id);
        if (!user) return;
        var reactivate = user.active === false;
        MRS.views.app.openConfirm({
            title: reactivate ? 'Reactivate user' : 'Deactivate user',
            message: (reactivate ? 'Reactivate ' : 'Deactivate ') + user.name + ' (' + user.username + ')?',
            onConfirm: function () {
                var result = MRS.auth.updateUser(id, { active: reactivate });
                if (!result.ok) {
                    MRS.utils.toast(result.error, 'error');
                    return;
                }
                MRS.utils.toast(reactivate ? 'User reactivated.' : 'User deactivated.', 'success');
                render();
            }
        });
    }

    function saveSyncUrl() {
        if (!MRS.auth.requireRole('ADMIN')) return;
        var input = MRS.utils.$('adminSyncUrl');
        var result = MRS.sync.setFirebaseUrl(input ? input.value : '');
        if (!result.ok) {
            MRS.utils.toast(result.error, 'error');
            MRS.sync.updateSyncBadge();
            return;
        }
        MRS.utils.toast(result.url ? 'Firebase URL saved. Connecting...' : 'Cloud sync disabled.', result.url ? 'success' : 'warn');
        MRS.sync.updateSyncBadge();
        renderStats();
    }

    function clearSyncUrl() {
        if (!MRS.auth.requireRole('ADMIN')) return;
        MRS.views.app.openConfirm({
            title: 'Disconnect cloud sync',
            message: 'Remove the Firebase URL from this browser? Local data stays on this device.',
            onConfirm: function () {
                MRS.sync.setFirebaseUrl('');
                MRS.utils.toast('Cloud sync disabled.', 'success');
                render();
            }
        });
    }

    MRS.views = MRS.views || {};
    MRS.views.admin = {
        render: render,
        renderStats: renderStats,
        openAdd: openAdd,
        openEdit: openEdit,
        saveFromForm: saveFromForm,
        toggleUser: toggleUser,
        saveSyncUrl: saveSyncUrl,
        clearSyncUrl: clearSyncUrl
    };

}(window.MRS = window.MRS || {}));
