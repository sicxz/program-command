(function initializeUserManagement(global, document) {
    'use strict';

    let users = [];
    let currentUserId = null;
    let pendingRemoval = null;
    let usersRequestGeneration = 0;
    const dateFormatter = new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });

    function element(id) {
        return document.getElementById(id);
    }

    function formatDate(value) {
        if (!value) return 'Never';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 'Never' : dateFormatter.format(date);
    }

    function setError(message = '') {
        const errorBox = element('usersError');
        errorBox.textContent = message;
        errorBox.hidden = !message;
    }

    async function invokeAdminUsers(body) {
        const client = getSupabaseClient();
        if (!client?.functions) throw new Error('User administration is unavailable.');
        const { data, error } = await client.functions.invoke('admin-users', { body });
        if (error) throw new Error(error.message || 'The request could not be completed.');
        if (data?.error) throw new Error(data.error);
        return data || {};
    }

    function buildCell(text) {
        const cell = document.createElement('td');
        cell.textContent = text;
        return cell;
    }

    function openRemoveDialog(user) {
        pendingRemoval = user;
        const dialog = element('removeUserDialog');
        dialog.returnValue = '';
        element('removeUserMessage').textContent =
            `Remove ${user.email} from the scheduler? Their account will no longer be able to sign in.`;
        dialog.showModal();
    }

    function roleSelectFor(user) {
        const select = document.createElement('select');
        select.className = 'role-select';
        select.setAttribute('aria-label', `Role for ${user.email}`);
        select.disabled = user.id === currentUserId;
        [['participant', 'Participant'], ['admin', 'Administrator']].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            option.selected = value === user.role;
            select.append(option);
        });
        if (user.role === 'none') select.selectedIndex = -1;

        select.addEventListener('change', async () => {
            const previousRole = user.role;
            select.disabled = true;
            setError();
            try {
                await invokeAdminUsers({ action: 'setRole', userId: user.id, role: select.value });
                await loadUsers();
            } catch (error) {
                select.value = previousRole;
                setError(error.message);
            } finally {
                select.disabled = user.id === currentUserId;
            }
        });
        return select;
    }

    function renderUsers() {
        const tableBody = element('usersTableBody');
        tableBody.replaceChildren();
        element('userCount').textContent = `${users.length} ${users.length === 1 ? 'user' : 'users'}`;

        users.forEach((user) => {
            const row = document.createElement('tr');
            const identityCell = document.createElement('td');
            const email = document.createElement('strong');
            email.textContent = user.email;
            identityCell.append(email);
            if (user.id === currentUserId) {
                const you = document.createElement('span');
                you.className = 'you-label';
                you.textContent = 'You';
                identityCell.append(you);
            }
            row.append(identityCell);

            const status = user.status === 'active' ? 'Active' : 'Invited';
            const statusCell = buildCell(status);
            statusCell.dataset.status = status.toLowerCase();
            row.append(statusCell, buildCell(formatDate(user.lastSignInAt)));

            const roleCell = document.createElement('td');
            roleCell.append(roleSelectFor(user));
            row.append(roleCell);

            const actionsCell = document.createElement('td');
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'remove-user-button';
            removeButton.textContent = 'Remove';
            removeButton.disabled = user.id === currentUserId;
            removeButton.addEventListener('click', () => openRemoveDialog(user));
            actionsCell.append(removeButton);
            row.append(actionsCell);
            tableBody.append(row);
        });
    }

    async function loadUsers() {
        const generation = ++usersRequestGeneration;
        setError();
        element('userCount').textContent = 'Loading users…';
        try {
            const payload = await invokeAdminUsers({ action: 'list' });
            if (generation !== usersRequestGeneration) return;
            users = payload.users || [];
            renderUsers();
        } catch (error) {
            if (generation !== usersRequestGeneration) return;
            element('userCount').textContent = 'Users could not be loaded';
            setError(error.message);
        }
    }

    async function handleInvite(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const submit = form.querySelector('button[type="submit"]');
        const message = element('inviteMessage');
        submit.disabled = true;
        message.textContent = 'Sending invitation…';
        message.classList.remove('is-error');
        try {
            const payload = await invokeAdminUsers({
                action: 'invite',
                email: element('inviteEmail').value,
                role: element('inviteRole').value
            });
            message.textContent = `Invitation sent to ${payload.user.email}.`;
            form.reset();
            await loadUsers();
        } catch (error) {
            message.textContent = error.message;
            message.classList.add('is-error');
        } finally {
            submit.disabled = false;
        }
    }

    async function handleDialogClose() {
        const target = pendingRemoval;
        pendingRemoval = null;
        if (element('removeUserDialog').returnValue !== 'confirm' || !target) return;
        setError();
        try {
            await invokeAdminUsers({ action: 'remove', userId: target.id });
            await loadUsers();
        } catch (error) {
            setError(error.message);
        }
    }

    function showAdminOnly() {
        element('authorizationStatus').hidden = true;
        element('adminContent').hidden = true;
        element('adminOnlyPanel').hidden = false;
    }

    async function initializePage() {
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
        if (!client?.auth || !client?.from) {
            showAdminOnly();
            return;
        }

        try {
            const { data: userData, error: userError } = await client.auth.getUser();
            if (userError || !userData?.user?.id) {
                showAdminOnly();
                return;
            }
            currentUserId = userData.user.id;
            const { data: profile, error: profileError } = await client
                .from('user_profiles')
                .select('role')
                .eq('id', currentUserId)
                .maybeSingle();
            if (profileError || profile?.role !== 'admin') {
                showAdminOnly();
                return;
            }

            element('authorizationStatus').hidden = true;
            element('adminOnlyPanel').hidden = true;
            element('adminContent').hidden = false;
            await loadUsers();
        } catch (_error) {
            showAdminOnly();
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        element('inviteForm').addEventListener('submit', handleInvite);
        element('removeUserDialog').addEventListener('close', handleDialogClose);
        element('refreshUsersButton').addEventListener('click', loadUsers);
        initializePage();
    });
})(window, document);
