/**
 * Faculty Management Page
 * Lists and maintains faculty records without removing historical rows.
 */

let facultyMembers = [];
let filteredFaculty = [];

document.addEventListener('DOMContentLoaded', async () => {
    await initializeFacultyPage();
});

async function initializeFacultyPage() {
    try {
        facultyMembers = await dbService.getFaculty() || [];
        filteredFaculty = [...facultyMembers];
        renderFacultyTable();
    } catch (error) {
        console.error('Failed to load faculty:', error);
        showFacultyMessage('Failed to load faculty. Please refresh.', 'error');
    }
}

async function refreshFaculty() {
    await initializeFacultyPage();
    showFacultyMessage('Faculty refreshed', 'success');
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
    document.getElementById('facultyModal').classList.add('active');
    document.getElementById('facultyName').focus();
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

        facultyMembers.push(addedFaculty);
        filterFaculty();
        closeFacultyModal();
        showFacultyMessage('Faculty added', 'success');
    } catch (error) {
        console.error('Failed to save faculty:', error);
        showFacultyMessage(`Failed to save faculty: ${error.message}`, 'error');
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
