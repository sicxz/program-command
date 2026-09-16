/**
 * Faculty Management Page
 * Maintains year-specific appointments and all-time faculty records.
 */

let facultyMembers = [];
let filteredFaculty = [];
let academicYears = [];
let rosterAppointments = [];
let currentRosterYearId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await initializeFacultyPage();
});

async function initializeFacultyPage() {
    try {
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

    if (rosterAppointments.length === 0) {
        tbody.innerHTML = '';
        tableContainer.classList.add('ds-hidden');
        emptyState.classList.remove('ds-hidden');
        return;
    }

    tableContainer.classList.remove('ds-hidden');
    emptyState.classList.add('ds-hidden');
    const today = getLocalDateString();
    const hasEnded = appointment => Boolean(appointment.end_date && appointment.end_date <= today);
    const sortedAppointments = [...rosterAppointments].sort((a, b) => {
        const endedOrder = Number(hasEnded(a)) - Number(hasEnded(b));
        if (endedOrder !== 0) return endedOrder;
        const nameOrder = getAppointmentFaculty(a).name.localeCompare(getAppointmentFaculty(b).name);
        if (nameOrder !== 0) return nameOrder;
        return String(a.quarter || '').localeCompare(String(b.quarter || ''));
    });

    tbody.innerHTML = sortedAppointments.map(appointment => {
        const faculty = getAppointmentFaculty(appointment);
        const endedClass = hasEnded(appointment) ? ' class="roster-row-ended"' : '';
        const endDisabled = hasEnded(appointment) ? ' disabled' : '';
        return `
            <tr data-appointment-id="${escapeFacultyAttribute(appointment.id)}"${endedClass}>
                <td>${escapeFacultyHtml(faculty.name)}</td>
                <td><span class="faculty-category">${escapeFacultyHtml(getFacultyCategoryLabel(appointment.category))}</span></td>
                <td>${escapeFacultyHtml(appointment.rank || '')}</td>
                <td>${escapeFacultyHtml(getQuarterLabel(appointment.quarter))}</td>
                <td>${escapeFacultyHtml(appointment.fte ?? '')}</td>
                <td>${escapeFacultyHtml(appointment.teaching_target ?? '')}</td>
                <td>${escapeFacultyHtml(appointment.start_date || '')}</td>
                <td>${escapeFacultyHtml(appointment.end_date || '')}</td>
                <td><div class="faculty-actions">
                    <button class="ds-btn ds-btn-secondary ds-btn-sm" type="button" data-appointment-id="${escapeFacultyAttribute(appointment.id)}" onclick="openEditAppointmentModal(this.dataset.appointmentId)">Edit</button>
                    <button class="ds-btn ds-btn-secondary ds-btn-sm" type="button" data-appointment-id="${escapeFacultyAttribute(appointment.id)}" onclick="endRosterAppointment(this.dataset.appointmentId)"${endDisabled}>End</button>
                </div></td>
            </tr>
        `;
    }).join('');
}

// The program's calendar day (Cheney, WA), matching js/default-term.js, so an evening
// action does not record tomorrow's date and tests hold in any machine time zone.
function getLocalDateString(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
}

function getAppointmentFaculty(appointment) {
    const joinedFaculty = Array.isArray(appointment.faculty) ? appointment.faculty[0] : appointment.faculty;
    return joinedFaculty || facultyMembers.find(person => String(person.id) === String(appointment.faculty_id)) || {};
}

function getQuarterLabel(quarter) {
    if (!quarter) return 'Year';
    return quarter.charAt(0).toUpperCase() + quarter.slice(1);
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
            : `<button class="ds-btn ds-btn-secondary ds-btn-sm" type="button" data-faculty-id="${escapeFacultyAttribute(faculty.id)}" onclick="retireFaculty(this.dataset.facultyId)">Retire</button>`;

        return `
            <tr data-faculty-id="${escapeFacultyAttribute(faculty.id)}">
                <td>${escapeFacultyHtml(faculty.name)}</td>
                <td>${escapeFacultyHtml(faculty.email || '')}</td>
                <td><span class="faculty-category">${category}</span></td>
                <td>${escapeFacultyHtml(faculty.max_workload ?? '')}</td>
                <td><div class="faculty-actions">
                    <button class="ds-btn ds-btn-secondary ds-btn-sm" type="button" data-faculty-id="${escapeFacultyAttribute(faculty.id)}" onclick="openEditFacultyModal(this.dataset.facultyId)">Edit</button>
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
    document.getElementById('facultyCategory').value = 'fullTime';
    document.getElementById('facultyMaxWorkload').value = '45';
    document.getElementById('facultyModalTitle').textContent = 'Add faculty';
    updateFacultyQuarterVisibility();
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
    document.getElementById('facultyCategory').value = faculty.category || 'fullTime';
    document.getElementById('facultyMaxWorkload').value = faculty.max_workload ?? 45;
    document.getElementById('facultyModalTitle').textContent = 'Edit faculty';
    updateFacultyQuarterVisibility();
    document.getElementById('facultyModal').classList.add('active');
    document.getElementById('facultyName').focus();
}

function updateFacultyQuarterVisibility() {
    const isNewAdjunct = !document.getElementById('facultyId')?.value &&
        document.getElementById('facultyCategory')?.value === 'adjunct';
    setQuarterVisibility('facultyQuarterGroup', 'facultyQuarter', isNewAdjunct);
}

function closeFacultyModal() {
    document.getElementById('facultyModal').classList.remove('active');
}

function readFacultyForm() {
    return {
        name: document.getElementById('facultyName').value.trim(),
        email: document.getElementById('facultyEmail').value.trim(),
        category: document.getElementById('facultyCategory').value,
        max_workload: Number(document.getElementById('facultyMaxWorkload').value)
    };
}

async function handleFacultySubmit(event) {
    event.preventDefault();
    const id = document.getElementById('facultyId').value;
    const fields = readFacultyForm();

    try {
        if (id) {
            const updatedFaculty = await dbService.updateFaculty(id, fields);
            replaceFacultyRow(updatedFaculty || { id, ...fields });
            closeFacultyModal();
            showFacultyMessage('Faculty updated', 'success');
            return;
        }

        if (!currentRosterYearId) {
            showFacultyMessage('Select an academic year before adding faculty.', 'error');
            return;
        }
        if (fields.category === 'former') {
            showFacultyMessage('A new faculty member must be full time or adjunct.', 'error');
            return;
        }
        const quarter = fields.category === 'adjunct'
            ? document.getElementById('facultyQuarter').value
            : null;
        if (fields.category === 'adjunct' && !quarter) {
            showFacultyMessage('Select a quarter for an adjunct appointment.', 'error');
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
            quarter,
            category: fields.category
        });
        facultyMembers.push(addedFaculty);
        if (appointment) {
            rosterAppointments.push({ ...appointment, faculty: addedFaculty });
            renderRosterTable();
        }
        filterFaculty();
        closeFacultyModal();
        showFacultyMessage('Faculty added', 'success');
    } catch (error) {
        console.error('Failed to save faculty:', error);
        showFacultyMessage(`Failed to save faculty: ${error.message}`, 'error');
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
    const personId = document.getElementById('appointmentFacultyId').value;
    const person = facultyMembers.find(item => String(item.id) === String(personId));
    if (person) {
        document.getElementById('appointmentCategory').value = person.category === 'adjunct' ? 'adjunct' : 'fullTime';
    }
    updateAppointmentQuarterVisibility();
}

function openEditAppointmentModal(id) {
    const appointment = rosterAppointments.find(item => String(item.id) === String(id));
    if (!appointment) return;

    document.getElementById('appointmentForm').reset();
    document.getElementById('appointmentId').value = appointment.id;
    document.getElementById('appointmentFacultyId').value = appointment.faculty_id || '';
    document.getElementById('appointmentFacultyId').required = false;
    document.getElementById('appointmentPersonGroup').classList.add('ds-hidden');
    document.getElementById('appointmentCategory').value = appointment.category || 'fullTime';
    document.getElementById('appointmentRank').value = appointment.rank || '';
    document.getElementById('appointmentQuarter').value = appointment.quarter || '';
    document.getElementById('appointmentFte').value = appointment.fte ?? '';
    document.getElementById('appointmentTeachingTarget').value = appointment.teaching_target ?? '';
    document.getElementById('appointmentStartDate').value = appointment.start_date || '';
    document.getElementById('appointmentEndDate').value = appointment.end_date || '';
    document.getElementById('appointmentNotes').value = appointment.notes || '';
    document.getElementById('appointmentModalTitle').textContent = `Edit ${getAppointmentFaculty(appointment).name || 'appointment'}`;
    updateAppointmentQuarterVisibility();
    document.getElementById('appointmentModal').classList.add('active');
    document.getElementById('appointmentCategory').focus();
}

function updateAppointmentQuarterVisibility() {
    const isAdjunct = document.getElementById('appointmentCategory')?.value === 'adjunct';
    setQuarterVisibility('appointmentQuarterGroup', 'appointmentQuarter', isAdjunct);
}

function setQuarterVisibility(groupId, selectId, visible) {
    const group = document.getElementById(groupId);
    const select = document.getElementById(selectId);
    if (!group || !select) return;
    group.hidden = !visible;
    group.classList.toggle('ds-hidden', !visible);
    select.required = visible;
    if (!visible) select.value = '';
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
    const category = document.getElementById('appointmentCategory').value;
    return {
        ...(id ? { id } : {}),
        faculty_id: id ? existing?.faculty_id : document.getElementById('appointmentFacultyId').value,
        academic_year_id: currentRosterYearId,
        category,
        rank: document.getElementById('appointmentRank').value.trim() || null,
        quarter: category === 'adjunct' ? document.getElementById('appointmentQuarter').value : null,
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
    if (fields.category === 'adjunct' && !fields.quarter) {
        showFacultyMessage('Select a quarter for an adjunct appointment.', 'error');
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
        showFacultyMessage(`Failed to save appointment: ${error.message}`, 'error');
    }
}

async function endRosterAppointment(id) {
    const index = rosterAppointments.findIndex(item => String(item.id) === String(id));
    if (index < 0) return;
    const appointment = rosterAppointments[index];
    const faculty = getAppointmentFaculty(appointment);
    if (!window.confirm(`End ${faculty.name || 'this appointment'}? The appointment will remain in the roster history.`)) return;

    const today = getLocalDateString();
    try {
        const ended = await dbService.endAppointment(id, today);
        rosterAppointments[index] = {
            ...appointment,
            ...(ended || {}),
            end_date: ended?.end_date || today,
            faculty: ended?.faculty || appointment.faculty
        };
        renderRosterTable();
        showFacultyMessage('Appointment ended', 'success');
    } catch (error) {
        console.error('Failed to end appointment:', error);
        showFacultyMessage(`Failed to end appointment: ${error.message}`, 'error');
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
        showFacultyMessage(`Failed to retire faculty: ${error.message}`, 'error');
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
        fullTime: 'Full time',
        adjunct: 'Adjunct',
        former: 'Former'
    }[category] || category || '';
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
