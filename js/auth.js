(function (MRS) {
    'use strict';

    MRS.currentUser = null;

    function sessionStore(value) {
        try {
            if (value === undefined) {
                var raw = window.sessionStorage.getItem(MRS.config.SESSION_KEY);
                return raw ? JSON.parse(raw) : null;
            }
            if (value === null) window.sessionStorage.removeItem(MRS.config.SESSION_KEY);
            else window.sessionStorage.setItem(MRS.config.SESSION_KEY, JSON.stringify(value));
        } catch (error) {
            return null;
        }
        return null;
    }

    function publicUser(user) {
        return {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role
        };
    }

    function setCurrentUser(user) {
        MRS.currentUser = user ? publicUser(user) : null;
        if (user) sessionStore({ userId: user.id });
        else sessionStore(null);
        updateTopbar();
    }

    function updateTopbar() {
        if (!MRS.utils) return;
        var user = MRS.currentUser;
        MRS.utils.setText('topUserName', user ? user.name : 'User');
        MRS.utils.setText('topUserRole', user ? MRS.ROLE_LABELS[user.role] || user.role : 'Role');
        MRS.utils.setText('topUserInitials', user ? MRS.utils.initials(user.name) : '--');
    }

    function authenticate(username, password) {
        var user = MRS.storage.findUserByUsername(username);
        if (!user || user.active === false) return null;
        if (!MRS.crypto.verifyPassword(user, password)) return null;
        MRS.storage.save({ silent: true });
        return user;
    }

    function loginWithCredentials(username, password) {
        var cleanUsername = String(username || '').trim();
        if (!cleanUsername || !password) {
            return { ok: false, error: 'Enter your username and password.' };
        }

        var user = authenticate(cleanUsername, password);
        if (!user) {
            return { ok: false, error: 'Invalid username or password.' };
        }

        setCurrentUser(user);
        applyRoleVisibility();
        if (MRS.views && MRS.views.app) MRS.views.app.onLogin();
        MRS.utils.toast('Signed in as ' + user.name + '.', 'success');
        return { ok: true, user: publicUser(user) };
    }

    function doLogin() {
        var usernameInput = MRS.utils.$('loginUser');
        var passwordInput = MRS.utils.$('loginPass');
        var errorBox = MRS.utils.$('loginError');
        var username = usernameInput ? usernameInput.value : '';
        var password = passwordInput ? passwordInput.value : '';
        if (errorBox) errorBox.textContent = '';

        var result = loginWithCredentials(username, password);
        if (!result.ok) {
            if (errorBox) errorBox.textContent = result.error;
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
            MRS.utils.toast(result.error, 'error');
            return result;
        }

        if (passwordInput) passwordInput.value = '';
        return result;
    }

    function restoreSession() {
        var session = sessionStore();
        if (!session || !session.userId) return false;
        var user = MRS.storage.findUserById(session.userId);
        if (!user || user.active === false) {
            sessionStore(null);
            return false;
        }
        setCurrentUser(user);
        applyRoleVisibility();
        return true;
    }

    function logout() {
        setCurrentUser(null);
        MRS.utils.closeAllModals();
        if (MRS.views && MRS.views.app) MRS.views.app.showLogin();
        MRS.utils.toast('Signed out.', 'success');
    }

    function rankOf(role) {
        return MRS.ROLE_RANK[role] || 0;
    }

    function hasRole(minimum) {
        if (!MRS.currentUser) return false;
        return rankOf(MRS.currentUser.role) >= rankOf(minimum);
    }

    function requireRole(minimum) {
        if (hasRole(minimum)) return true;
        MRS.utils.toast(
            MRS.currentUser
                ? 'Your role (' + (MRS.ROLE_LABELS[MRS.currentUser.role] || MRS.currentUser.role) + ') cannot perform this action.'
                : 'Please sign in first.',
            'error'
        );
        return false;
    }

    function requireLogin() {
        if (MRS.currentUser) return true;
        MRS.utils.toast('Please sign in first.', 'error');
        return false;
    }

    function applyRoleVisibility() {
        var visible = MRS.currentUser;
        MRS.utils.$$('.nav-tab[data-min-role]').forEach(function (tab) {
            var minimum = tab.getAttribute('data-min-role');
            tab.classList.toggle('hidden', !visible || !hasRole(minimum));
        });

        var catalogActions = MRS.utils.$('catalogAdminActions');
        if (catalogActions) catalogActions.classList.toggle('hidden', !hasRole('LOGISTICS'));

        var adminAdd = document.querySelector('[data-action="user-add"]');
        if (adminAdd) adminAdd.classList.toggle('hidden', !hasRole('ADMIN'));
    }

    function listUsers() {
        if (!MRS.db) return [];
        return MRS.db.users.slice().sort(function (a, b) {
            return rankOf(b.role) - rankOf(a.role) || String(a.name).localeCompare(String(b.name));
        });
    }

    function usernameIsValid(username) {
        return /^[a-z0-9][a-z0-9._-]{2,39}$/i.test(String(username || '').trim());
    }

    function activeAdminCount(excludeId) {
        return (MRS.db.users || []).filter(function (user) {
            return user.id !== excludeId && user.role === 'ADMIN' && user.active !== false;
        }).length;
    }

    function createUser(data) {
        if (!requireRole('ADMIN')) return { ok: false, error: 'Permission denied.' };
        var payload = data || {};
        var username = String(payload.username || '').trim().toLowerCase();
        var name = String(payload.name || '').trim();
        var password = String(payload.password || '');
        var role = String(payload.role || 'REQUESTER').toUpperCase();

        if (!name) return { ok: false, error: 'Full name is required.' };
        if (!usernameIsValid(username)) return { ok: false, error: 'Username must be 3-40 characters: letters, numbers, dot, dash or underscore.' };
        if (password.length < 6) return { ok: false, error: 'Password must have at least 6 characters.' };
        if (MRS.config.ROLES.indexOf(role) === -1) return { ok: false, error: 'Invalid role.' };
        if (MRS.storage.findUserByUsername(username)) return { ok: false, error: 'That username already exists.' };

        var credentials = MRS.crypto.hashPassword(username, password);
        var user = {
            id: MRS.utils.uid('u'),
            username: username,
            name: name,
            role: role,
            salt: credentials.salt,
            hash: credentials.hash,
            active: true,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        MRS.db.users.push(user);
        MRS.storage.save();
        return { ok: true, user: user };
    }

    function updateUser(id, data) {
        if (!requireRole('ADMIN')) return { ok: false, error: 'Permission denied.' };
        var user = MRS.storage.findUserById(id);
        if (!user) return { ok: false, error: 'User not found.' };
        var payload = data || {};
        var name = payload.name !== undefined ? String(payload.name).trim() : user.name;
        var role = payload.role !== undefined ? String(payload.role).toUpperCase() : user.role;
        var active = payload.active !== undefined ? !!payload.active : user.active !== false;
        var password = payload.password !== undefined ? String(payload.password) : '';

        if (!name) return { ok: false, error: 'Full name is required.' };
        if (MRS.config.ROLES.indexOf(role) === -1) return { ok: false, error: 'Invalid role.' };
        if (MRS.currentUser && MRS.currentUser.id === user.id && !active) {
            return { ok: false, error: 'You cannot deactivate your own account.' };
        }
        if ((role !== 'ADMIN' || !active) && user.role === 'ADMIN' && activeAdminCount(user.id) === 0) {
            return { ok: false, error: 'At least one active admin account is required.' };
        }
        if (password && password.length < 6) {
            return { ok: false, error: 'Password must have at least 6 characters.' };
        }

        user.name = name;
        user.role = role;
        user.active = active;
        user.updatedAt = Date.now();
        if (password) {
            var credentials = MRS.crypto.hashPassword(user.username, password);
            user.salt = credentials.salt;
            user.hash = credentials.hash;
        }

        if (MRS.currentUser && MRS.currentUser.id === user.id) {
            setCurrentUser(user);
            applyRoleVisibility();
        }

        MRS.storage.save();
        return { ok: true, user: user };
    }

    function setUserActive(id, active) {
        return updateUser(id, { active: active });
    }

    function deleteUser(id) {
        if (!requireRole('ADMIN')) return { ok: false, error: 'Permission denied.' };
        var user = MRS.storage.findUserById(id);
        if (!user) return { ok: false, error: 'User not found.' };
        if (MRS.currentUser && MRS.currentUser.id === id) {
            return { ok: false, error: 'You cannot deactivate your own account.' };
        }
        if (user.role === 'ADMIN' && user.active !== false && activeAdminCount(user.id) === 0) {
            return { ok: false, error: 'At least one active admin account is required.' };
        }
        user.active = false;
        user.updatedAt = Date.now();
        MRS.storage.save();
        return { ok: true };
    }

    MRS.auth = {
        doLogin: doLogin,
        loginWithCredentials: loginWithCredentials,
        authenticate: authenticate,
        restoreSession: restoreSession,
        logout: logout,
        hasRole: hasRole,
        requireRole: requireRole,
        requireLogin: requireLogin,
        applyRoleVisibility: applyRoleVisibility,
        updateTopbar: updateTopbar,
        listUsers: listUsers,
        createUser: createUser,
        updateUser: updateUser,
        setUserActive: setUserActive,
        deleteUser: deleteUser,
        activeAdminCount: activeAdminCount,
        usernameIsValid: usernameIsValid
    };

}(window.MRS = window.MRS || {}));
