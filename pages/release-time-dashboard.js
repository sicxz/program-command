/**
 * Release Time Dashboard
 * Interactive management of faculty release time allocations
 */

(function() {
    'use strict';

    // State
    let currentYear = '';
    let categoryChartInstance = null;
    let quarterChartInstance = null;
    let facultyList = [];
    let activeDepartmentProfile = null;
    let workloadData = null;
    let availableQuarters = ['Fall', 'Winter', 'Spring'];

    // Initialize on load
    document.addEventListener('DOMContentLoaded', init);

    function getCurrentAcademicYear() {
        const now = new Date();
        const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
        return `${startYear}-${String(startYear + 1).slice(-2)}`;
    }

    function getDepartmentIdentity() {
        const identity = activeDepartmentProfile && activeDepartmentProfile.identity
            ? activeDepartmentProfile.identity
            : {};
        return {
            name: String(identity.name || 'Design').trim() || 'Design',
            code: String(identity.code || 'DESN').trim().toUpperCase() || 'DESN',
            displayName: String(identity.displayName || identity.name || 'EWU Design').trim() || 'EWU Design'
        };
    }

    function getStorageNamespace() {
        const scheduler = activeDepartmentProfile && activeDepartmentProfile.scheduler
            ? activeDepartmentProfile.scheduler
            : {};
        return String(scheduler.storageKeyPrefix || activeDepartmentProfile?.id || 'designSchedulerData').trim() || 'designSchedulerData';
    }

    function getAcademicYearOptions() {
        const options = typeof WorkloadIntegration !== 'undefined' && typeof WorkloadIntegration.getAcademicYearOptions === 'function'
            ? WorkloadIntegration.getAcademicYearOptions(workloadData || {})
            : [];
        const years = new Set(options);
        ReleaseTimeManager.getAvailableYears().forEach((year) => years.add(year));
        years.add(currentYear || getCurrentAcademicYear());
        return Array.from(years)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
    }

    function getProfileQuarters() {
        const quarterKeys = Array.isArray(activeDepartmentProfile?.academic?.quarters)
            ? activeDepartmentProfile.academic.quarters
            : ['fall', 'winter', 'spring'];
        return quarterKeys.map((quarter) => {
            const normalized = String(quarter || '').trim().toLowerCase();
            if (!normalized) return null;
            return normalized.charAt(0).toUpperCase() + normalized.slice(1);
        }).filter(Boolean);
    }

    function normalizeFacultyName(name) {
        const aliases = {
            'sam mills': 'Simeon Mills'
        };
        const trimmed = String(name || '').trim();
        if (!trimmed) return '';
        return aliases[trimmed.toLowerCase()] || trimmed;
    }

    function shouldIncludeFacultyName(name) {
        const normalized = normalizeFacultyName(name);
        if (!normalized) return false;
        const lowered = normalized.toLowerCase();
        return lowered !== 'tbd' && lowered !== 'adjunct' && lowered !== 'staff';
    }

    async function initializeDepartmentProfileContext() {
        const manager = window.DepartmentProfileManager;
        if (!manager || typeof manager.initialize !== 'function') {
            currentYear = getCurrentAcademicYear();
            availableQuarters = ['Fall', 'Winter', 'Spring'];
            applyDepartmentProfileCopy();
            return;
        }

        try {
            const snapshot = await manager.initialize();
            activeDepartmentProfile = snapshot && snapshot.profile ? snapshot.profile : null;
        } catch (error) {
            console.warn('Could not initialize department profile:', error);
            activeDepartmentProfile = null;
        }

        currentYear = String(activeDepartmentProfile?.academic?.defaultSchedulerYear || getCurrentAcademicYear()).trim() || getCurrentAcademicYear();
        availableQuarters = getProfileQuarters();
        applyDepartmentProfileCopy();
    }

    async function loadWorkloadData() {
        try {
            const response = await fetch('../workload-data.json', { cache: 'no-store' });
            if (!response.ok) return null;
            workloadData = await response.json();
            return workloadData;
        } catch (error) {
            console.warn('Could not load workload data for release-time roster:', error);
            workloadData = null;
            return null;
        }
    }

    function applyDepartmentProfileCopy() {
        const identity = getDepartmentIdentity();
        const titleEl = document.getElementById('releaseTimeTitle');
        const subtitleEl = document.getElementById('releaseTimeSubtitle');

        document.title = `Release Time - ${identity.displayName}`;
        if (titleEl) {
            titleEl.textContent = `📋 ${identity.shortName || identity.name || 'Department'} Release Time`;
        }
        if (subtitleEl) {
            subtitleEl.textContent = `${identity.displayName} release-time planning and allocation tracking.`;
        }
    }

    function populateYearDropdown() {
        const select = document.getElementById('academicYearFilter');
        const years = getAcademicYearOptions();
        select.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join('');

        if (!years.includes(currentYear)) {
            currentYear = years[years.length - 1] || getCurrentAcademicYear();
        }
        select.value = currentYear;
    }

    async function init() {
        await initializeDepartmentProfileContext();
        // Initialize managers
        ReleaseTimeManager.init({ storageNamespace: getStorageNamespace() });
        BackupManager.init({
            getState: () => ReleaseTimeManager.exportData(),
            restoreState: (data) => {
                ReleaseTimeManager.importData(data, true);
                render();
            },
            autoSave: true,
            storageNamespace: getStorageNamespace()
        });
        await loadWorkloadData();

        // Load faculty list
        loadFacultyList();
        populateYearDropdown();

        // Populate form dropdowns
        populateCategoryDropdown();
        populateQuarterCheckboxes();

        // Set up event listeners
        setupEventListeners();

        // Subscribe to changes
        ReleaseTimeManager.subscribe((action, data) => {
            render();
            showUndoBar('Release time ' + action);
        });

        BackupManager.subscribe((event, data) => {
            updateUndoRedoButtons();
        });

        // Initial render
        render();
    }

    function loadFacultyList() {
        const names = new Map();
        const addName = (name) => {
            const normalized = normalizeFacultyName(name);
            if (!shouldIncludeFacultyName(normalized)) return;
            const key = normalized.toLowerCase();
            if (!names.has(key)) {
                names.set(key, normalized);
            }
        };

        if (typeof WorkloadIntegration !== 'undefined' && typeof WorkloadIntegration.buildIntegratedWorkloadYearData === 'function') {
            const integrated = WorkloadIntegration.buildIntegratedWorkloadYearData(workloadData || {}, currentYear);
            Object.keys(integrated?.all || {}).forEach(addName);
        }

        ReleaseTimeManager.getAllFacultyWithReleaseTime(currentYear).forEach((faculty) => addName(faculty.name));
        facultyList = Array.from(names.values()).sort((a, b) => a.localeCompare(b));

        const select = document.getElementById('facultySelect');
        select.innerHTML = '<option value="">Select faculty...</option>';
        facultyList.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
    }

    function populateCategoryDropdown() {
        const categories = ReleaseTimeManager.getCategories();
        const select = document.getElementById('categorySelect');
        const filterSelect = document.getElementById('categoryFilter');
        select.innerHTML = '';
        filterSelect.innerHTML = '<option value="all">All Types</option>';

        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.label;
            select.appendChild(option);

            const filterOption = document.createElement('option');
            filterOption.value = cat.id;
            filterOption.textContent = cat.label;
            filterSelect.appendChild(filterOption);
        });
    }

    function populateQuarterCheckboxes() {
        const container = document.getElementById('quarterCheckboxes');
        const quarters = availableQuarters;
        container.innerHTML = '';

        quarters.forEach(q => {
            const label = document.createElement('label');
            label.className = 'quarter-checkbox';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = q;
            checkbox.name = 'quarters';
            checkbox.checked = true;

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(q));
            container.appendChild(label);
        });
    }

    function setupEventListeners() {
        document.getElementById('academicYearFilter').addEventListener('change', (e) => {
            currentYear = e.target.value;
            render();
        });

        document.getElementById('categoryFilter').addEventListener('change', (e) => {
            render();
        });

        document.getElementById('addNewBtn').addEventListener('click', () => {
            openAddModal();
        });

        document.getElementById('undoBtn').addEventListener('click', handleUndo);
        document.getElementById('redoBtn').addEventListener('click', handleRedo);
    }

    function render() {
        renderSummary();
        renderCategoryLegend();
        renderCharts();
        renderFacultyGrid();
        updateUndoRedoButtons();
    }

    function renderSummary() {
        const summary = ReleaseTimeManager.getDepartmentSummary(currentYear);
        const faculty = ReleaseTimeManager.getAllFacultyWithReleaseTime(currentYear);

        document.getElementById('totalCredits').textContent = summary.totalCredits;
        document.getElementById('facultyCount').textContent = summary.totalFaculty;

        const avg = summary.totalFaculty > 0 ? (summary.totalCredits / summary.totalFaculty).toFixed(1) : 0;
        document.getElementById('avgCredits').textContent = avg;

        let allocationCount = 0;
        faculty.forEach(f => allocationCount += f.allocations.length);
        document.getElementById('allocationCount').textContent = allocationCount;
    }

    function renderCategoryLegend() {
        const container = document.getElementById('categoryLegend');
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        const categories = ReleaseTimeManager.getCategories();
        categories.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'legend-item';

            const dot = document.createElement('span');
            dot.className = 'category-dot';
            dot.style.backgroundColor = cat.color;

            item.appendChild(dot);
            item.appendChild(document.createTextNode(cat.label));
            container.appendChild(item);
        });
    }

    function renderCharts() {
        renderCategoryChart();
        renderQuarterChart();
    }

    function renderCategoryChart() {
        const ctx = document.getElementById('categoryChart').getContext('2d');
        const summary = ReleaseTimeManager.getDepartmentSummary(currentYear);
        const categories = ReleaseTimeManager.getCategories();

        // Use annual credits for the chart
        const data = categories.map(cat => summary.byCategory[cat.id]?.annualCredits || 0);
        const colors = categories.map(cat => cat.color);
        const labels = categories.map(cat => cat.label);

        if (categoryChartInstance) {
            categoryChartInstance.destroy();
        }

        categoryChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { padding: 15 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.label + ': ' + context.raw + ' credits (annual)';
                            }
                        }
                    }
                }
            }
        });
    }

    function renderQuarterChart() {
        const ctx = document.getElementById('quarterChart').getContext('2d');
        const summary = ReleaseTimeManager.getDepartmentSummary(currentYear);

        const quarters = availableQuarters;
        const data = quarters.map(q => Math.round(summary.byQuarter[q] || 0));
        const palette = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];

        if (quarterChartInstance) {
            quarterChartInstance.destroy();
        }

        quarterChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: quarters,
                datasets: [{
                    label: 'Credits',
                    data: data,
                    backgroundColor: quarters.map((_, index) => palette[index % palette.length]),
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Credits' }
                    }
                }
            }
        });
    }

    function renderFacultyGrid() {
        const container = document.getElementById('facultyGrid');
        const emptyState = document.getElementById('emptyState');
        const filterCategory = document.getElementById('categoryFilter').value;

        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        let faculty = ReleaseTimeManager.getAllFacultyWithReleaseTime(currentYear);

        // Apply category filter
        if (filterCategory !== 'all') {
            faculty = faculty.filter(f =>
                f.allocations.some(a => a.category === filterCategory)
            );
        }

        if (faculty.length === 0) {
            container.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        container.style.display = 'grid';
        emptyState.style.display = 'none';

        faculty.sort((a, b) => b.totalCredits - a.totalCredits);

        faculty.forEach(f => {
            const card = createFacultyCard(f);
            container.appendChild(card);
        });
    }

    function createFacultyCard(faculty) {
        const categories = ReleaseTimeManager.getCategories();

        const card = document.createElement('div');
        card.className = 'faculty-card';

        // Header
        const header = document.createElement('div');
        header.className = 'faculty-card-header';

        const name = document.createElement('div');
        name.className = 'faculty-name';
        name.textContent = faculty.name;

        const total = document.createElement('div');
        total.className = 'release-total';
        total.textContent = faculty.totalCredits + ' credits';

        header.appendChild(name);
        header.appendChild(total);

        // Allocation list
        const list = document.createElement('div');
        list.className = 'allocation-list';

        faculty.allocations.forEach(alloc => {
            const category = categories.find(c => c.id === alloc.category);
            const item = document.createElement('div');
            item.className = 'allocation-item';

            const catDiv = document.createElement('div');
            catDiv.className = 'allocation-category';

            const dot = document.createElement('span');
            dot.className = 'category-dot';
            dot.style.backgroundColor = category ? category.color : '#6b7280';

            const label = document.createElement('span');
            label.textContent = category ? category.label : alloc.category;

            catDiv.appendChild(dot);
            catDiv.appendChild(label);

            // Calculate annual credits (credits × number of quarters)
            const numQuarters = (alloc.quarters || []).length || 1;
            const annualCredits = alloc.credits * numQuarters;

            const credits = document.createElement('div');
            credits.className = 'allocation-credits';
            credits.textContent = alloc.credits + ' cr/qtr (' + annualCredits + ' annual)';

            const actions = document.createElement('div');
            actions.className = 'allocation-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-icon btn-edit';
            editBtn.textContent = '✏️';
            editBtn.title = 'Edit';
            editBtn.onclick = () => openEditModal(faculty.name, alloc);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-icon btn-delete';
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = 'Delete';
            deleteBtn.onclick = () => handleDelete(faculty.name, alloc.id);

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            item.appendChild(catDiv);
            item.appendChild(credits);
            item.appendChild(actions);
            list.appendChild(item);
        });

        // Add button
        const addBtn = document.createElement('button');
        addBtn.className = 'btn-add';
        addBtn.textContent = '+ Add Release Time';
        addBtn.onclick = () => openAddModal(faculty.name);

        card.appendChild(header);
        card.appendChild(list);
        card.appendChild(addBtn);

        return card;
    }

    // Modal functions
    window.openAddModal = function(preselectedFaculty = '') {
        document.getElementById('modalTitle').textContent = 'Add Release Time';
        document.getElementById('submitBtn').textContent = 'Add Allocation';
        document.getElementById('releaseTimeForm').reset();
        document.getElementById('editAllocationId').value = '';
        document.getElementById('editFacultyName').value = '';

        if (preselectedFaculty) {
            document.getElementById('facultySelect').value = preselectedFaculty;
        }

        // Reset quarter checkboxes
        document.querySelectorAll('#quarterCheckboxes input').forEach(cb => {
            cb.checked = true;
        });

        document.getElementById('modalOverlay').classList.add('active');
    };

    window.openEditModal = function(facultyName, allocation) {
        document.getElementById('modalTitle').textContent = 'Edit Release Time';
        document.getElementById('submitBtn').textContent = 'Save Changes';

        document.getElementById('editAllocationId').value = allocation.id;
        document.getElementById('editFacultyName').value = facultyName;
        document.getElementById('facultySelect').value = facultyName;
        document.getElementById('facultySelect').disabled = true;
        document.getElementById('categorySelect').value = allocation.category;
        document.getElementById('creditsInput').value = allocation.credits;
        document.getElementById('descriptionInput').value = allocation.description || '';

        // Set quarter checkboxes
        document.querySelectorAll('#quarterCheckboxes input').forEach(cb => {
            cb.checked = allocation.quarters.includes(cb.value);
        });

        document.getElementById('modalOverlay').classList.add('active');
    };

    window.closeModal = function() {
        document.getElementById('modalOverlay').classList.remove('active');
        document.getElementById('facultySelect').disabled = false;
    };

    window.handleFormSubmit = function(e) {
        e.preventDefault();

        const allocationId = document.getElementById('editAllocationId').value;
        const editFacultyName = document.getElementById('editFacultyName').value;
        const facultyName = document.getElementById('facultySelect').value;
        const category = document.getElementById('categorySelect').value;
        const credits = parseInt(document.getElementById('creditsInput').value);
        const description = document.getElementById('descriptionInput').value;

        const quarters = [];
        document.querySelectorAll('#quarterCheckboxes input:checked').forEach(cb => {
            quarters.push(cb.value);
        });

        if (quarters.length === 0) {
            alert('Please select at least one quarter.');
            return;
        }

        // Record for undo
        const beforeState = ReleaseTimeManager.exportData();

        if (allocationId) {
            // Update existing
            const result = ReleaseTimeManager.updateAllocation(editFacultyName, currentYear, allocationId, {
                category,
                credits,
                quarters,
                description
            });

            if (!result.success) {
                alert('Error: ' + result.errors.join(', '));
                return;
            }
        } else {
            // Add new
            const result = ReleaseTimeManager.addAllocation(facultyName, currentYear, {
                category,
                credits,
                quarters,
                description
            });

            if (!result.success) {
                alert('Error: ' + result.errors.join(', '));
                return;
            }
        }

        BackupManager.recordChange(
            allocationId ? 'Update release time' : 'Add release time',
            beforeState
        );

        closeModal();
    };

    window.handleDelete = function(facultyName, allocationId) {
        if (!confirm('Are you sure you want to delete this allocation?')) {
            return;
        }

        const beforeState = ReleaseTimeManager.exportData();
        const result = ReleaseTimeManager.removeAllocation(facultyName, currentYear, allocationId);

        if (result.success) {
            BackupManager.recordChange('Delete release time', beforeState);
        }
    };

    // Undo/Redo
    window.handleUndo = function() {
        const entry = BackupManager.undo();
        if (entry) {
            showUndoBar('Undid: ' + entry.action);
        }
    };

    window.handleRedo = function() {
        const entry = BackupManager.redo();
        if (entry) {
            showUndoBar('Redid: ' + entry.action);
        }
    };

    function updateUndoRedoButtons() {
        document.getElementById('undoBtn').disabled = !BackupManager.canUndo();
        document.getElementById('redoBtn').disabled = !BackupManager.canRedo();
    }

    window.showUndoBar = function(message) {
        const bar = document.getElementById('undoBar');
        document.getElementById('undoMessage').textContent = message;
        bar.classList.add('visible');

        setTimeout(() => {
            bar.classList.remove('visible');
        }, 5000);
    };

    window.hideUndoBar = function() {
        document.getElementById('undoBar').classList.remove('visible');
    };

})();
