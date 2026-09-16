/**
 * Faculty Management Page
 * Maintains year-specific appointments and all-time faculty records.
 */

let facultyMembers = [];
let filteredFaculty = [];
let academicYears = [];
let rosterAppointments = [];
let currentRosterYearId = null;
let canEditFaculty = false;
let authStateSubscription = null;
const FACULTY_RANKS = ['Tenured', 'Tenure-track', 'Adjunct lecturer'];

document.addEventListener('DOMContentLoaded', async () => {
    await initializeFacultyPage();
});

async function initializeFacultyPage() {
    try {
        await initializeFacultyAuthState();
        const [facultyData, yearData] = await Promise.all([
            dbService.getFaculty(),
            dbService.getAcademicYears()
        ]);
        facultyMembers = facultyData || [];
        filteredFaculty = [...facultyMembers];
        academicYears = yearData || [];
        renderFacultyTable();
        await populateRosterYearSelector();
        await loadRoster();
    } catch (error) {
        console.error('Failed to load faculty:', error);
        showFacultyMessage('Failed to load faculty. Please refresh.', 'error');
    }
}

async function initializeFacultyAuthState() {
    try {
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
        if (!client?.auth?.getSession) {
            setFacultyWriteAccess(false);
            return;
        }

        const { data } = await client.auth.getSession();
        setFacultyWriteAccess(Boolean(data?.session));

        if (!authStateSubscription && typeof client.auth.onAuthStateChange === 'function') {
            const { data: authData } = client.auth.onAuthStateChange((_event, session) => {
                setFacultyWriteAccess(Boolean(session));
            });
            authStateSubscription = authData?.subscription || true;
        }
    } catch (error) {
        console.error('Failed to read authentication state:', error);
        setFacultyWriteAccess(false);
    }
}

function setFacultyWriteAccess(enabled) {
    canEditFaculty = enabled;
    const addRosterButton = document.getElementById('addRosterButton');
    const addFacultyButton = document.getElementById('addFacultyButton');
    const notice = document.getElementById('rosterAuthNotice');
    if (addRosterButton) addRosterButton.disabled = !enabled;
    if (addFacultyButton) addFacultyButton.disabled = !enabled;
    notice?.classList.toggle('ds-hidden', enabled);
    renderRosterTable();
    renderFacultyTable();
}

function writeDisabledAttribute() {
    return canEditFaculty ? '' : ' disabled';
}

async function refreshFaculty() {
    await initializeFacultyPage();
    showFacultyMessage('Faculty refreshed', 'success');
}

function switchFacultyTab(tab) {
    document.getElementById('tabRoster')?.classList.toggle('active', tab === 'roster');
    document.getElementById('tabPeople')?.classList.toggle('active', tab === 'people');
    document.getElementById('rosterContent')?.classList.toggle('active', tab === 'roster');
    document.getElementById('peopleContent')?.classList.toggle('active', tab === 'people');
}

async function populateRosterYearSelector() {
    const select = document.getElementById('rosterYear');
    if (!select) return;

    select.innerHTML = academicYears.map(year =>
        `<option value="${escapeFacultyAttribute(year.id ?? year.year)}">${escapeFacultyHtml(year.year)}</option>`
    ).join('');

    let defaultAcademicYear = null;
    try {
        const pinned = typeof dbService.getDefaultTerm === 'function'
            ? await dbService.getDefaultTerm()
            : null;
        defaultAcademicYear = typeof DefaultTerm !== 'undefined'
            ? DefaultTerm.resolve({ pinned, now: new Date() })?.academicYear
            : null;
    } catch (error) {
        defaultAcademicYear = null;
    }

    const defaultYear = academicYears.find(year => year.year === defaultAcademicYear) || academicYears[0];
    currentRosterYearId = defaultYear ? String(defaultYear.id ?? defaultYear.year) : null;
    if (currentRosterYearId !== null) select.value = currentRosterYearId;
}

async function handleRosterYearChange() {
    currentRosterYearId = document.getElementById('rosterYear')?.value || null;
    await loadRoster();
}

async function loadRoster() {
    if (!currentRosterYearId) {
        rosterAppointments = [];
        renderRosterTable();
        return;
    }

    try {
        rosterAppointments = await dbService.getRoster(currentRosterYearId) || [];
        renderRosterTable();
    } catch (error) {
        console.error('Failed to load roster:', error);
        showFacultyMessage(`Failed to load roster: ${error.message}`, 'error');
    }
}

function renderRosterTable() {
    const tbody = document.getElementById('rosterTableBody');
    const tableContainer = document.getElementById('rosterTableContainer');
    const emptyState = document.getElementById('rosterEmptyState');
    if (!tbody || !tableContainer || !emptyState) return;

    tableContainer.classList.remove('ds-hidden');
    emptyState.classList.add('ds-hidden');

    const renderAppointment = appointment => {
        const faculty = getAppointmentFaculty(appointment);
        return `
            <tr data-appointment-id="${escapeFacultyAttribute(appointment.id)}">
                <td>${escapeFacultyHtml(faculty.name)}</td>
                <td><span class="faculty-category">${escapeFacultyHtml(getFacultyCategoryLabel(getAppointmentCategory(appointment)))}</span></td>
                <td>${escapeFacultyHtml(isFacultyRank(appointment.rank) ? appointment.rank : '—')}</td>
                <td>${escapeFacultyHtml(appointment.fte ?? '')}</td>
                <td>${escapeFacultyHtml(appointment.teaching_target ?? '')}</td>
                <td>${escapeFacultyHtml(appointment.start_date || '')}</td>
                <td><div class="faculty-actions">
                    <button class="ds-btn ds-btn-secondary ds-btn-sm" type="button" data-appointment-id="${escapeFacultyAttribute(appointment.id)}" onclick="openEditAppointmentModal(this.dataset.appointmentId)"${writeDisabledAttribute()}>Edit</button>
                    <button class="ds-btn ds-btn-secondary ds-btn-sm" type="button" data-appointment-id="${escapeFacultyAttribute(appointment.id)}" onclick="removeRosterAppointment(this.dataset.appointmentId)"${writeDisabledAttribute()}>Remove</button>
                </div></td>
            </tr>
        `;
    };

    const groups = [
        { category: 'fullTime', label: 'Full-time' },
        { category: 'adjunct', label: 'Adjunct' }
    ];
    tbody.innerHTML = groups.map(group => {
        const appointments = rosterAppointments
            .filter(appointment => getAppointmentCategory(appointment) === group.category)
            .sort((a, b) => String(getAppointmentFaculty(a).name || '')
                .localeCompare(String(getAppointmentFaculty(b).name || '')));
        const rows = appointments.length
            ? appointments.map(renderAppointment).join('')
            : '<tr class="roster-group-empty"><td colspan="7" class="text-muted">None</td></tr>';
        return `
            <tr class="roster-group-header" data-roster-group="${group.category}">
                <th colspan="7" scope="rowgroup">${group.label} (${appointments.length})</th>
            </tr>
            ${rows}
        `;
    }).join('');
}

function getAppointmentFaculty(appointment) {
    const joinedFaculty = Array.isArray(appointment.faculty) ? appointment.faculty[0] : appointment.faculty;
    return joinedFaculty || facultyMembers.find(person => String(person.id) === String(appointment.faculty_id)) || {};
}

function getAppointmentCategory(appointment) {
    if (isFacultyRank(appointment.rank)) return categoryForRank(appointment.rank);
    return appointment.category || getAppointmentFaculty(appointment).category || '';
}

function isFacultyRank(rank) {
    return FACULTY_RANKS.includes(rank);
}

function categoryForRank(rank) {
    return rank === 'Adjunct lecturer' ? 'adjunct' : 'fullTime';
}

function getCurrentAppointmentRank(facultyId) {
    const appointment = rosterAppointments.find(item =>
        String(item.faculty_id) === String(facultyId)
    );
    return isFacultyRank(appointment?.rank) ? appointment.rank : '';
}

function renderFacultyTable() {
    const tbody = document.getElementById('facultyTableBody');
    const tableContainer = document.getElementById('facultyTableContainer');
    const emptyState = document.getElementById('facultyEmptyState');
    if (!tbody || !tableContainer || !emptyState) return;

    if (filteredFaculty.length === 0) {
        tbody.innerHTML = '';
        tableContainer.classList.add('ds-hidden');
        emptyState.classList.remove('ds-hidden');
        return;
    }

    tableContainer.classList.remove('ds-hidden');
    emptyState.classList.add('ds-hidden');
    tbody.innerHTML = filteredFaculty.map(faculty => {
        const category = escapeFacultyHtml(getFacultyCategoryLabel(faculty.category));
        const retireButton = faculty.category === 'former'
            ? ''
            : `<button class="ds-btn ds-btn-secondary ds-btn-sm" type="button" data-faculty-id="${escapeFacultyAttribute(faculty.id)}" onclick="retireFaculty(this.dataset.facultyId)"${writeDisabledAttribute()}>Retire</button>`;

        return `
            <tr data-faculty-id="${escapeFacultyAttribute(faculty.id)}">
                <td>${escapeFacultyHtml(faculty.name)}</td>
                <td>${escapeFacultyHtml(faculty.email || '')}</td>
                <td><span class="faculty-category">${category}</span></td>
                <td>${escapeFacultyHtml(faculty.max_workload ?? '')}</td>
                <td><div class="faculty-actions">
                    <button class="ds-btn ds-btn-secondary ds-btn-sm" type="button" data-faculty-id="${escapeFacultyAttribute(faculty.id)}" onclick="openEditFacultyModal(this.dataset.facultyId)"${writeDisabledAttribute()}>Edit</button>
                    ${retireButton}
                </div></td>
            </tr>
        `;
    }).join('');
}

function filterFaculty() {
    const query = String(document.getElementById('facultySearch')?.value || '').trim().toLowerCase();
    filteredFaculty = facultyMembers.filter(faculty => {
        return !query || [faculty.name, faculty.email, getFacultyCategoryLabel(faculty.category)]
            .some(value => String(value || '').toLowerCase().includes(query));
    });
    renderFacultyTable();
}

function openAddFacultyModal() {
    document.getElementById('facultyForm').reset();
    document.getElementById('facultyId').value = '';
    document.getElementById('facultyRank').value = '';
    document.getElementById('facultyMaxWorkload').value = '45';
    document.getElementById('facultyModalTitle').textContent = 'Add faculty';
    document.getElementById('facultyModal').classList.add('active');
    document.getElementById('facultyName').focus();
}

function openEditFacultyModal(id) {
    const faculty = facultyMembers.find(item => String(item.id) === String(id));
    if (!faculty) return;

    document.getElementById('facultyForm').reset();
    document.getElementById('facultyId').value = faculty.id;
    document.getElementById('facultyName').value = faculty.name || '';
    document.getElementById('facultyEmail').value = faculty.email || '';
    document.getElementById('facultyRank').value = getCurrentAppointmentRank(faculty.id);
    document.getElementById('facultyMaxWorkload').value = faculty.max_workload ?? 45;
    document.getElementById('facultyModalTitle').textContent = 'Edit faculty';
    document.getElementById('facultyModal').classList.add('active');
    document.getElementById('facultyName').focus();
}

function closeFacultyModal() {
    document.getElementById('facultyModal').classList.remove('active');
}

function readFacultyForm() {
    const rank = document.getElementById('facultyRank').value;
    return {
        name: document.getElementById('facultyName').value.trim(),
        email: document.getElementById('facultyEmail').value.trim(),
        rank,
        category: categoryForRank(rank),
        max_workload: Number(document.getElementById('facultyMaxWorkload').value)
    };
}

async function handleFacultySubmit(event) {
    event.preventDefault();
    const id = document.getElementById('facultyId').value;
    const fields = readFacultyForm();

    if (!isFacultyRank(fields.rank)) {
        showFacultyMessage('Select a rank.', 'error');
        return;
    }

    try {
        if (id) {
            const { rank: _rank, ...facultyFields } = fields;
            const updatedFaculty = await dbService.updateFaculty(id, facultyFields);
            replaceFacultyRow(updatedFaculty || { id, ...facultyFields });
            closeFacultyModal();
            showFacultyMessage('Faculty updated', 'success');
            return;
        }

        if (!currentRosterYearId) {
            showFacultyMessage('Select an academic year before adding faculty.', 'error');
            return;
        }
        const addedFaculty = await dbService.addFaculty({
            name: fields.name,
            email: fields.email,
            category: fields.category,
            maxWorkload: fields.max_workload
        });
        if (!addedFaculty) return;

        const existingFaculty = facultyMembers.find(faculty => String(faculty.id) === String(addedFaculty.id));
        if (existingFaculty) {
            showFacultyMessage(`That person already exists as ${existingFaculty.name}`, 'error');
            return;
        }

        const appointment = await dbService.saveAppointment({
            faculty_id: addedFaculty.id,
            academic_year_id: currentRosterYearId,
            category: fields.category,
            rank: fields.rank
        });
        facultyMembers.push(addedFaculty);
        if (appointment) {
            rosterAppointments.push({
                faculty_id: addedFaculty.id,
                academic_year_id: currentRosterYearId,
                category: fields.category,
                rank: fields.rank,
                ...appointment,
                faculty: addedFaculty
            });
            renderRosterTable();
        }
        filterFaculty();
        closeFacultyModal();
        showFacultyMessage('Faculty added', 'success');
    } catch (error) {
        console.error('Failed to save faculty:', error);
        showFacultyMessage(getFacultyWriteErrorMessage(error, 'Failed to save faculty'), 'error');
    }
}

function openAddAppointmentModal() {
    document.getElementById('appointmentForm').reset();
    document.getElementById('appointmentId').value = '';
    document.getElementById('appointmentModalTitle').textContent = 'Add to roster';
    document.getElementById('appointmentPersonGroup').classList.remove('ds-hidden');
    document.getElementById('appointmentFacultyId').required = true;
    populateAppointmentPeople();
    handleAppointmentPersonChange();
    document.getElementById('appointmentModal').classList.add('active');
    document.getElementById('appointmentFacultyId').focus();
}

function populateAppointmentPeople() {
    const select = document.getElementById('appointmentFacultyId');
    const activePeople = facultyMembers.filter(person => person.category !== 'former');
    select.innerHTML = '<option value="">Select person</option>' + activePeople.map(person =>
        `<option value="${escapeFacultyAttribute(person.id)}">${escapeFacultyHtml(person.name)}</option>`
    ).join('');
}

function handleAppointmentPersonChange() {
    document.getElementById('appointmentRank').value = '';
}

function openEditAppointmentModal(id) {
    const appointment = rosterAppointments.find(item => String(item.id) === String(id));
    if (!appointment) return;

    document.getElementById('appointmentForm').reset();
    document.getElementById('appointmentId').value = appointment.id;
    document.getElementById('appointmentFacultyId').value = appointment.faculty_id || '';
    document.getElementById('appointmentFacultyId').required = false;
    document.getElementById('appointmentPersonGroup').classList.add('ds-hidden');
    document.getElementById('appointmentRank').value = isFacultyRank(appointment.rank) ? appointment.rank : '';
    document.getElementById('appointmentFte').value = appointment.fte ?? '';
    document.getElementById('appointmentTeachingTarget').value = appointment.teaching_target ?? '';
    document.getElementById('appointmentStartDate').value = appointment.start_date || '';
    document.getElementById('appointmentEndDate').value = appointment.end_date || '';
    document.getElementById('appointmentNotes').value = appointment.notes || '';
    document.getElementById('appointmentModalTitle').textContent = `Edit ${getAppointmentFaculty(appointment).name || 'appointment'}`;
    document.getElementById('appointmentModal').classList.add('active');
    document.getElementById('appointmentRank').focus();
}

function closeAppointmentModal() {
    document.getElementById('appointmentModal').classList.remove('active');
}

function nullableNumber(value) {
    return value === '' ? null : Number(value);
}

function readAppointmentForm() {
    const id = document.getElementById('appointmentId').value;
    const existing = rosterAppointments.find(item => String(item.id) === String(id));
    const rank = document.getElementById('appointmentRank').value;
    return {
        ...(id ? { id } : {}),
        faculty_id: id ? existing?.faculty_id : document.getElementById('appointmentFacultyId').value,
        academic_year_id: currentRosterYearId,
        category: categoryForRank(rank),
        rank,
        fte: nullableNumber(document.getElementById('appointmentFte').value),
        teaching_target: nullableNumber(document.getElementById('appointmentTeachingTarget').value),
        start_date: document.getElementById('appointmentStartDate').value || null,
        end_date: document.getElementById('appointmentEndDate').value || null,
        notes: document.getElementById('appointmentNotes').value.trim() || null
    };
}

async function handleAppointmentSubmit(event) {
    event.preventDefault();
    const fields = readAppointmentForm();
    if (!fields.faculty_id || !fields.academic_year_id) {
        showFacultyMessage('Select a person and academic year.', 'error');
        return;
    }
    if (!isFacultyRank(fields.rank)) {
        showFacultyMessage('Select a rank.', 'error');
        return;
    }
    try {
        const saved = await dbService.saveAppointment(fields);
        const existingIndex = rosterAppointments.findIndex(item => String(item.id) === String(fields.id));
        const existing = existingIndex >= 0 ? rosterAppointments[existingIndex] : null;
        const row = {
            ...(existing || fields),
            ...(saved || fields),
            faculty: saved?.faculty || existing?.faculty ||
                facultyMembers.find(person => String(person.id) === String(fields.faculty_id))
        };
        if (existingIndex >= 0) rosterAppointments[existingIndex] = row;
        else rosterAppointments.push(row);
        renderRosterTable();
        closeAppointmentModal();
        showFacultyMessage('Appointment saved', 'success');
    } catch (error) {
        console.error('Failed to save appointment:', error);
        showFacultyMessage(getFacultyWriteErrorMessage(error, 'Failed to save appointment'), 'error');
    }
}

async function removeRosterAppointment(id) {
    const index = rosterAppointments.findIndex(item => String(item.id) === String(id));
    if (index < 0) return;
    const appointment = rosterAppointments[index];
    const faculty = getAppointmentFaculty(appointment);
    const academicYear = academicYears.find(year => String(year.id ?? year.year) === String(currentRosterYearId));
    const yearLabel = academicYear?.year || document.getElementById('rosterYear')?.selectedOptions?.[0]?.textContent || '';
    if (!window.confirm(`Remove ${faculty.name || 'this person'} from the ${yearLabel} roster? They stay on the People list.`)) return;

    try {
        await dbService.removeAppointment(id);
        rosterAppointments.splice(index, 1);
        renderRosterTable();
        showFacultyMessage('Removed from roster', 'success');
    } catch (error) {
        console.error('Failed to remove appointment:', error);
        showFacultyMessage(getFacultyWriteErrorMessage(error, 'Failed to remove appointment'), 'error');
    }
}

async function retireFaculty(id) {
    const faculty = facultyMembers.find(item => String(item.id) === String(id));
    if (!faculty) return;
    if (!window.confirm(`Retire ${faculty.name}? They will remain available in historical schedules.`)) return;

    try {
        const updatedFaculty = await dbService.updateFaculty(id, { category: 'former' });
        replaceFacultyRow(updatedFaculty || { ...faculty, category: 'former' });
        showFacultyMessage(`${faculty.name} retired`, 'success');
    } catch (error) {
        console.error('Failed to retire faculty:', error);
        showFacultyMessage(getFacultyWriteErrorMessage(error, 'Failed to update faculty'), 'error');
    }
}

function replaceFacultyRow(updatedFaculty) {
    const index = facultyMembers.findIndex(faculty => String(faculty.id) === String(updatedFaculty.id));
    if (index >= 0) {
        facultyMembers[index] = updatedFaculty;
    }
    filterFaculty();
}

function getFacultyCategoryLabel(category) {
    return {
        fullTime: 'Full-time',
        adjunct: 'Adjunct',
        former: 'Former'
    }[category] || category || '';
}

function getFacultyWriteErrorMessage(error, fallback) {
    if (error?.code === 'PGRST116' || error?.code === '42501') {
        return 'Not saved: sign in as an editor first.';
    }
    return `${fallback}: ${error?.message || 'Unknown error'}`;
}

function escapeFacultyHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
}

function escapeFacultyAttribute(value) {
    return escapeFacultyHtml(value)
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showFacultyMessage(message, type = '') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `ds-toast active ${type}`.trim();
    window.setTimeout(() => toast.classList.remove('active'), 3000);
}
