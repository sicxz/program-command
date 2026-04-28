/**
 * Database Service Layer
 * Provides functions to interact with Supabase database
 * Falls back to local JSON files when Supabase is not configured
 */

const dbService = {
    departmentId: null,
    departmentIdentity: null,
    departmentIdByCode: {},
    initialized: false,

    /**
     * Initialize the database service
     * Gets or creates the department, ensures base data exists
     */
    async initialize() {
        const activeDepartment = typeof getActiveDepartmentIdentity === 'function'
            ? getActiveDepartmentIdentity()
            : {
                code: 'DESN',
                name: 'Design',
                displayName: 'EWU Design'
            };
        const departmentCode = String(activeDepartment.code || 'DESN').trim().toUpperCase() || 'DESN';
        const departmentName = String(activeDepartment.name || activeDepartment.displayName || 'Design').trim() || 'Design';

        if (this.initialized
            && this.departmentIdentity
            && this.departmentIdentity.code === departmentCode
            && this.departmentId
        ) {
            return this.departmentId;
        }

        if (this.departmentIdByCode[departmentCode]) {
            this.departmentId = this.departmentIdByCode[departmentCode];
            this.departmentIdentity = {
                code: departmentCode,
                name: departmentName,
                displayName: String(activeDepartment.displayName || departmentName).trim() || departmentName
            };
            this.initialized = true;
            return this.departmentId;
        }

        if (!isSupabaseConfigured()) {
            console.log('Database service: Using local JSON fallback mode');
            this.departmentIdentity = {
                code: departmentCode,
                name: departmentName,
                displayName: String(activeDepartment.displayName || departmentName).trim() || departmentName
            };
            this.initialized = true;
            return null;
        }

        try {
            // Get or create department
            const client = getSupabaseClient();
            const { data: dept, error: deptError } = await client
                .from('departments')
                .select('id')
                .eq('code', departmentCode)
                .single();

            if (deptError && deptError.code === 'PGRST116') {
                // Department doesn't exist, create it
                const { data: newDept, error: createError } = await client
                    .from('departments')
                    .insert({ name: departmentName, code: departmentCode })
                    .select('id')
                    .single();

                if (createError) throw createError;
                this.departmentId = newDept.id;
            } else if (deptError) {
                throw deptError;
            } else {
                this.departmentId = dept.id;
            }

            this.departmentIdByCode[departmentCode] = this.departmentId;
            this.departmentIdentity = {
                code: departmentCode,
                name: departmentName,
                displayName: String(activeDepartment.displayName || departmentName).trim() || departmentName
            };
            this.initialized = true;
            console.log('Database service initialized.', {
                departmentId: this.departmentId,
                code: departmentCode
            });
            return this.departmentId;
        } catch (error) {
            console.error('Failed to initialize database service:', error);
            throw error;
        }
    },

    // ============================================
    // COURSES
    // ============================================

    /**
     * Get all courses for the department
     */
    async getCourses() {
        if (!isSupabaseConfigured()) {
            return this._fetchLocalCourses();
        }

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('courses')
            .select('*')
            .eq('department_id', this.departmentId)
            .order('code');

        if (error) throw error;
        return data;
    },

    /**
     * Add a new course to the catalog
     */
    async addCourse(course) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot add course: Supabase not configured');
            return null;
        }

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('courses')
            .insert({
                department_id: this.departmentId,
                code: course.code,
                title: course.title,
                default_credits: course.defaultCredits || 5,
                typical_cap: course.typicalCap || 24,
                level: course.level,
                // Scheduling preferences
                quarters_offered: course.quartersOffered || ['Fall', 'Winter', 'Spring'],
                preferred_times: course.preferredTimes || ['morning', 'afternoon', 'evening'],
                preferred_days: course.preferredDays || ['MW', 'TR'],
                allowed_rooms: course.allowedRooms || null,
                allowed_campus: course.allowedCampus || null,
                // Constraint flags
                room_constraint_hard: course.roomConstraintHard || false,
                time_constraint_hard: course.timeConstraintHard || false,
                is_case_by_case: course.isCaseByCase || false
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Update an existing course
     */
    async updateCourse(id, course) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot update course: Supabase not configured');
            return null;
        }

        await this.initialize();
        const updateData = {
            code: course.code,
            title: course.title,
            default_credits: course.defaultCredits || 5,
            typical_cap: course.typicalCap || 24,
            level: course.level,
            updated_at: new Date().toISOString()
        };

        // Add scheduling preferences if provided
        if (course.quartersOffered !== undefined) updateData.quarters_offered = course.quartersOffered;
        if (course.preferredTimes !== undefined) updateData.preferred_times = course.preferredTimes;
        if (course.preferredDays !== undefined) updateData.preferred_days = course.preferredDays;
        if (course.allowedRooms !== undefined) updateData.allowed_rooms = course.allowedRooms;
        if (course.allowedCampus !== undefined) updateData.allowed_campus = course.allowedCampus;

        // Add constraint flags if provided
        if (course.roomConstraintHard !== undefined) updateData.room_constraint_hard = course.roomConstraintHard;
        if (course.timeConstraintHard !== undefined) updateData.time_constraint_hard = course.timeConstraintHard;
        if (course.isCaseByCase !== undefined) updateData.is_case_by_case = course.isCaseByCase;

        const { data, error } = await getSupabaseClient()
            .from('courses')
            .update(updateData)
            .eq('id', id)
            .eq('department_id', this.departmentId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Delete a course from the catalog
     */
    async deleteCourse(id) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot delete course: Supabase not configured');
            return false;
        }

        await this.initialize();
        const { error } = await getSupabaseClient()
            .from('courses')
            .delete()
            .eq('id', id)
            .eq('department_id', this.departmentId);

        if (error) throw error;
        return true;
    },

    // ============================================
    // FACULTY
    // ============================================

    /**
     * Get all faculty for the department
     */
    async getFaculty() {
        if (!isSupabaseConfigured()) {
            return this._fetchLocalFaculty();
        }

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('faculty')
            .select('*')
            .eq('department_id', this.departmentId)
            .order('name');

        if (error) throw error;
        return data;
    },

    /**
     * Get full-time faculty only
     */
    async getFullTimeFaculty() {
        if (!isSupabaseConfigured()) {
            return this._fetchLocalFaculty('fullTime');
        }

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('faculty')
            .select('*')
            .eq('department_id', this.departmentId)
            .eq('category', 'fullTime')
            .order('name');

        if (error) throw error;
        return data;
    },

    /**
     * Add a new faculty member
     */
    async addFaculty(faculty) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot add faculty: Supabase not configured');
            return null;
        }

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('faculty')
            .insert({
                department_id: this.departmentId,
                name: faculty.name,
                email: faculty.email,
                category: faculty.category || 'fullTime',
                max_workload: faculty.maxWorkload || 45
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // ============================================
    // ROOMS
    // ============================================

    /**
     * Get all rooms for the department
     */
    async getRooms() {
        if (!isSupabaseConfigured()) {
            return this._fetchLocalRooms();
        }

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('rooms')
            .select('*')
            .eq('department_id', this.departmentId)
            .order('room_code');

        if (error) throw error;
        return data;
    },

    // ============================================
    // ACADEMIC YEARS
    // ============================================

    /**
     * Get all academic years
     */
    async getAcademicYears() {
        if (!isSupabaseConfigured()) {
            return [
                { year: '2023-24', is_active: false },
                { year: '2024-25', is_active: false },
                { year: '2025-26', is_active: true }
            ];
        }

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('academic_years')
            .select('*')
            .eq('department_id', this.departmentId)
            .order('year', { ascending: false });

        if (error) throw error;
        return data;
    },

    /**
     * Get or create an academic year
     */
    async getOrCreateYear(yearString, options = {}) {
        if (!isSupabaseConfigured()) return null;

        await this.initialize();
        const currentUserId = await this._resolveCurrentAuthUserId();
        const normalizedYearString = this._normalizeNullableString(yearString);
        const schedulerContract = this._buildAcademicYearSchedulerContract(options);
        const client = getSupabaseClient();

        if (!normalizedYearString) {
            throw new Error('yearString is required');
        }

        // Try to get existing
        const { data: existing, error: existingError } = await client
            .from('academic_years')
            .select('*')
            .eq('department_id', this.departmentId)
            .eq('year', normalizedYearString)
            .maybeSingle();

        if (existingError) throw existingError;

        if (existing) {
            const updatePayload = {};

            if (!existing.scheduler_profile_version && schedulerContract.schedulerProfileVersion) {
                updatePayload.scheduler_profile_version = schedulerContract.schedulerProfileVersion;
            }
            if (!existing.scheduler_profile_snapshot && schedulerContract.schedulerProfileSnapshot) {
                updatePayload.scheduler_profile_snapshot = schedulerContract.schedulerProfileSnapshot;
            }

            if (Object.keys(updatePayload).length > 0) {
                updatePayload.updated_by = currentUserId;
                updatePayload.updated_at = new Date().toISOString();

                const { data: updated, error: updateError } = await client
                    .from('academic_years')
                    .update(updatePayload)
                    .eq('id', existing.id)
                    .select()
                    .single();

                if (updateError) {
                    if (this._isMissingAcademicYearSchedulerContractColumnError(updateError)) {
                        return existing;
                    }
                    throw updateError;
                }

                return updated;
            }

            return existing;
        }

        // Create new
        const insertPayload = {
            department_id: this.departmentId,
            year: normalizedYearString,
            is_active: false,
            updated_by: currentUserId
        };

        if (schedulerContract.schedulerProfileVersion) {
            insertPayload.scheduler_profile_version = schedulerContract.schedulerProfileVersion;
        }
        if (schedulerContract.schedulerProfileSnapshot) {
            insertPayload.scheduler_profile_snapshot = schedulerContract.schedulerProfileSnapshot;
        }

        let insertResult = await client
            .from('academic_years')
            .insert(insertPayload)
            .select()
            .single();

        if (insertResult.error && this._isMissingAcademicYearSchedulerContractColumnError(insertResult.error)) {
            delete insertPayload.scheduler_profile_version;
            delete insertPayload.scheduler_profile_snapshot;
            insertResult = await client
                .from('academic_years')
                .insert(insertPayload)
                .select()
                .single();
        }

        if (insertResult.error) throw insertResult.error;
        return insertResult.data;
    },

    // ============================================
    // SCHEDULED COURSES
    // ============================================

    /**
     * Get scheduled courses for a year and quarter
     */
    async getSchedule(yearId, quarter = null) {
        if (!isSupabaseConfigured()) {
            return [];
        }

        let query = getSupabaseClient()
            .from('scheduled_courses')
            .select(`
                *,
                course:courses(code, title, default_credits),
                faculty:faculty(name, category),
                room:rooms(room_code, campus)
            `)
            .eq('academic_year_id', yearId);

        if (quarter) {
            query = query.eq('quarter', quarter);
        }

        const { data, error } = await query.order('quarter').order('day_pattern').order('time_slot');

        if (error) throw error;
        return data;
    },

    /**
     * Save a scheduled course (insert or update)
     */
    async saveScheduledCourse(courseData) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot save: Supabase not configured');
            return null;
        }

        const currentUserId = await this._resolveCurrentAuthUserId();
        const schedulerContract = this._buildAcademicYearSchedulerContract(courseData || {});
        const placement = this._canonicalizeSchedulePlacement(
            courseData.dayPattern,
            courseData.timeSlot,
            schedulerContract.schedulerProfileSnapshot
        );
        const record = {
            academic_year_id: courseData.academicYearId,
            course_id: courseData.courseId,
            faculty_id: courseData.facultyId || null,
            room_id: courseData.roomId || null,
            quarter: courseData.quarter,
            day_pattern: placement.day_pattern,
            time_slot: placement.time_slot,
            section: courseData.section,
            projected_enrollment: courseData.projectedEnrollment || null,
            updated_at: new Date().toISOString()
        };

        if (courseData.id) {
            // Update existing
            const { data, error } = await getSupabaseClient()
                .from('scheduled_courses')
                .update(record)
                .eq('id', courseData.id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } else {
            // Insert new
            const { data, error } = await getSupabaseClient()
                .from('scheduled_courses')
                .insert(record)
                .select()
                .single();

            if (error) throw error;
            return data;
        }
    },

    /**
     * Delete a scheduled course
     */
    async deleteScheduledCourse(id) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot delete: Supabase not configured');
            return false;
        }

        const { error } = await getSupabaseClient()
            .from('scheduled_courses')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    },

    /**
     * Batch save multiple scheduled courses
     */
    async batchSaveSchedule(courses, yearId, options = {}) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot batch save: Supabase not configured');
            return [];
        }

        const currentUserId = await this._resolveCurrentAuthUserId();
        const schedulerContract = this._buildAcademicYearSchedulerContract(options);
        const records = courses.map((c) => {
            const placement = this._canonicalizeSchedulePlacement(
                c.dayPattern,
                c.timeSlot,
                schedulerContract.schedulerProfileSnapshot
            );

            return {
                academic_year_id: yearId,
                course_id: c.courseId,
                faculty_id: c.facultyId || null,
                room_id: c.roomId || null,
                quarter: c.quarter,
                day_pattern: placement.day_pattern,
                time_slot: placement.time_slot,
                section: c.section,
                projected_enrollment: c.projectedEnrollment || null,
                updated_by: currentUserId
            };
        });

        const { data, error } = await getSupabaseClient()
            .from('scheduled_courses')
            .upsert(records)
            .select();

        if (error) throw error;
        return data;
    },

    /**
     * Atomically sync all scheduled courses for a single academic year.
     * Uses the Supabase RPC transaction path defined in:
     * scripts/supabase-schedule-sync-rpc.sql
     */
    async syncScheduledCoursesForAcademicYear(academicYearId, records = [], options = {}) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot sync schedule: Supabase not configured');
            return null;
        }

        if (!academicYearId || typeof academicYearId !== 'string') {
            throw new Error('academicYearId is required');
        }

        if (!Array.isArray(records)) {
            throw new Error('records must be an array');
        }

        await this.initialize();
        const currentUserId = await this._resolveCurrentAuthUserId();
        const schedulerContract = this._buildAcademicYearSchedulerContract(options);

        const normalizedRecords = records.map((record, index) => {
            if (!record || typeof record !== 'object') {
                throw new Error(`records[${index}] must be an object`);
            }

            const quarter = String(record.quarter || '').trim();
            if (!quarter) {
                throw new Error(`records[${index}].quarter is required`);
            }

            const rawProjectedEnrollment = record.projected_enrollment ?? record.projectedEnrollment ?? null;
            const projectedEnrollment =
                rawProjectedEnrollment === null || rawProjectedEnrollment === undefined || rawProjectedEnrollment === ''
                    ? null
                    : Number.parseInt(rawProjectedEnrollment, 10);

            if (rawProjectedEnrollment !== null && rawProjectedEnrollment !== undefined && rawProjectedEnrollment !== '' && Number.isNaN(projectedEnrollment)) {
                throw new Error(`records[${index}].projected_enrollment must be an integer when provided`);
            }

            const placement = this._canonicalizeSchedulePlacement(
                record.day_pattern ?? record.dayPattern,
                record.time_slot ?? record.timeSlot,
                schedulerContract.schedulerProfileSnapshot
            );

            return {
                course_id: this._normalizeNullableString(record.course_id ?? record.courseId),
                faculty_id: this._normalizeNullableString(record.faculty_id ?? record.facultyId),
                room_id: this._normalizeNullableString(record.room_id ?? record.roomId),
                quarter,
                day_pattern: placement.day_pattern,
                time_slot: placement.time_slot,
                section: this._normalizeNullableString(record.section) || '001',
                projected_enrollment: projectedEnrollment,
                updated_by: this._normalizeNullableString(record.updated_by ?? record.updatedBy ?? currentUserId),
                updated_at: this._normalizeNullableString(record.updated_at ?? record.updatedAt)
            };
        });

        const { data, error } = await getSupabaseClient().rpc('sync_scheduled_courses_for_academic_year', {
            p_academic_year_id: academicYearId,
            p_records: normalizedRecords
        });

        if (error) throw error;

        const summary = Array.isArray(data) ? data[0] : data;
        return {
            updated_count: Number(summary?.updated_count || 0),
            inserted_count: Number(summary?.inserted_count || 0),
            deleted_count: Number(summary?.deleted_count || 0)
        };
    },

    // ============================================
    // FACULTY PREFERENCES
    // ============================================

    /**
     * Get preferences for a faculty member
     */
    async getFacultyPreferences(facultyId) {
        if (!isSupabaseConfigured()) {
            return null;
        }

        const { data, error } = await getSupabaseClient()
            .from('faculty_preferences')
            .select('*')
            .eq('faculty_id', facultyId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    /**
     * Save faculty preferences
     */
    async saveFacultyPreferences(facultyId, prefs) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot save preferences: Supabase not configured');
            return null;
        }

        const record = {
            faculty_id: facultyId,
            time_preferred: prefs.timePreferred || [],
            time_blocked: prefs.timeBlocked || [],
            day_preferred: prefs.dayPreferred || [],
            day_blocked: prefs.dayBlocked || [],
            campus_assignment: prefs.campusAssignment || 'any',
            qualified_courses: prefs.qualifiedCourses || [],
            notes: prefs.notes || '',
            updated_at: new Date().toISOString()
        };

        const { data, error } = await getSupabaseClient()
            .from('faculty_preferences')
            .upsert(record, { onConflict: 'faculty_id' })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // ============================================
    // SCHEDULING CONSTRAINTS
    // ============================================

    /**
     * Get all scheduling constraints
     */
    async getConstraints() {
        if (!isSupabaseConfigured()) {
            return this._fetchLocalConstraints();
        }

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('scheduling_constraints')
            .select('*')
            .eq('department_id', this.departmentId)
            .eq('enabled', true);

        if (error) throw error;
        return data;
    },

    /**
     * Save a scheduling constraint
     */
    async saveConstraint(constraint) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot save constraint: Supabase not configured');
            return null;
        }

        await this.initialize();
        const record = {
            department_id: this.departmentId,
            constraint_type: constraint.type,
            description: constraint.description,
            rule_details: constraint.ruleDetails,
            enabled: constraint.enabled !== false
        };

        if (constraint.id) {
            const { data, error } = await getSupabaseClient()
                .from('scheduling_constraints')
                .update(record)
                .eq('id', constraint.id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } else {
            const { data, error } = await getSupabaseClient()
                .from('scheduling_constraints')
                .insert(record)
                .select()
                .single();

            if (error) throw error;
            return data;
        }
    },

    // ============================================
    // RELEASE TIME
    // ============================================

    /**
     * Get release time allocations for a faculty member
     */
    async getReleaseTime(facultyId, yearId = null) {
        if (!isSupabaseConfigured()) {
            return [];
        }

        let query = supabase
            .from('release_time')
            .select('*')
            .eq('faculty_id', facultyId);

        if (yearId) {
            query = query.eq('academic_year_id', yearId);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data;
    },

    /**
     * Save release time allocation
     */
    async saveReleaseTime(allocation) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot save release time: Supabase not configured');
            return null;
        }

        const record = {
            faculty_id: allocation.facultyId,
            academic_year_id: allocation.academicYearId,
            category: allocation.category,
            credits: allocation.credits,
            quarters: allocation.quarters || ['Fall', 'Winter', 'Spring'],
            notes: allocation.notes || ''
        };

        if (allocation.id) {
            const { data, error } = await getSupabaseClient()
                .from('release_time')
                .update(record)
                .eq('id', allocation.id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } else {
            const { data, error } = await getSupabaseClient()
                .from('release_time')
                .insert(record)
                .select()
                .single();

            if (error) throw error;
            return data;
        }
    },

    // ============================================
    // LOCAL FALLBACK METHODS
    // ============================================

    async _fetchLocalCourses() {
        try {
            const response = await fetch('../data/course-catalog.json');
            const data = await response.json();
            return data.courses || [];
        } catch (e) {
            console.error('Failed to load local courses:', e);
            return [];
        }
    },

    async _fetchLocalFaculty(category = null) {
        try {
            const response = await fetch('../workload-data.json');
            const data = await response.json();
            const yearData = data.workloadByYear?.byYear?.['2025-26'];

            if (!yearData) return [];

            let faculty = [];
            if (!category || category === 'fullTime') {
                faculty = faculty.concat(
                    Object.keys(yearData.fullTime || {}).map(name => ({
                        name,
                        category: 'fullTime'
                    }))
                );
            }
            if (!category || category === 'adjunct') {
                faculty = faculty.concat(
                    Object.keys(yearData.adjunct || {}).map(name => ({
                        name,
                        category: 'adjunct'
                    }))
                );
            }

            return faculty.sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
            console.error('Failed to load local faculty:', e);
            return [];
        }
    },

    async _fetchLocalRooms() {
        try {
            const response = await fetch('../data/room-constraints.json');
            const data = await response.json();

            const rooms = [];
            for (const [campusId, campus] of Object.entries(data.campuses || {})) {
                for (const room of campus.rooms || []) {
                    rooms.push({
                        room_code: room.id,
                        name: room.name,
                        campus: campusId,
                        capacity: room.capacity,
                        room_type: room.type,
                        exclude_from_grid: room.excludeFromGrid || false
                    });
                }
            }
            return rooms;
        } catch (e) {
            console.error('Failed to load local rooms:', e);
            return [];
        }
    },

    async _fetchLocalConstraints() {
        try {
            const response = await fetch('../data/scheduling-rules.json');
            return await response.json();
        } catch (e) {
            console.error('Failed to load local constraints:', e);
            return {};
        }
    },

    // ============================================
    // UTILITY METHODS
    // ============================================

    /**
     * Look up IDs by code/name for easier data entry
     */
    async lookupCourseId(courseCode) {
        if (!isSupabaseConfigured()) return null;

        await this.initialize();
        const { data } = await getSupabaseClient()
            .from('courses')
            .select('id')
            .eq('department_id', this.departmentId)
            .eq('code', courseCode)
            .single();

        return data?.id;
    },

    async lookupFacultyId(facultyName) {
        if (!isSupabaseConfigured()) return null;

        await this.initialize();
        const { data } = await getSupabaseClient()
            .from('faculty')
            .select('id')
            .eq('department_id', this.departmentId)
            .eq('name', facultyName)
            .single();

        return data?.id;
    },

    async lookupRoomId(roomCode) {
        if (!isSupabaseConfigured()) return null;

        await this.initialize();
        const { data } = await getSupabaseClient()
            .from('rooms')
            .select('id')
            .eq('department_id', this.departmentId)
            .eq('room_code', roomCode)
            .single();

        return data?.id;
    },

    async getLatestScheduleSaveMetadata(academicYearId) {
        if (!isSupabaseConfigured()) return null;
        if (!academicYearId) return null;

        const { data, error } = await getSupabaseClient()
            .from('scheduled_courses')
            .select('updated_by, updated_at')
            .eq('academic_year_id', academicYearId)
            .not('updated_at', 'is', null)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        return data || null;
    },

    _normalizeNullableString(value) {
        if (value === null || value === undefined) return null;
        const normalized = String(value).trim();
        return normalized ? normalized : null;
    },

    _normalizeSchedulerLookupKey(value) {
        return String(value || '')
            .toUpperCase()
            .replace(/\s+/g, '')
            .replace(/[^A-Z0-9:-]/g, '');
    },

    _normalizeDayPatternId(value) {
        const normalized = this._normalizeNullableString(value);
        return normalized ? normalized.toUpperCase() : null;
    },

    _normalizeTimeSlotId(value) {
        return this._normalizeNullableString(value);
    },

    _normalizeMinuteValue(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    },

    _parseSchedulerRangeToMinutes(rangeValue) {
        const match = String(rangeValue || '').trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
        if (!match) {
            return { startMinutes: null, endMinutes: null };
        }

        const startHours = Number(match[1]);
        const startMinutes = Number(match[2]);
        const endHours = Number(match[3]);
        const endMinutes = Number(match[4]);
        if ([startHours, startMinutes, endHours, endMinutes].some((value) => !Number.isFinite(value))) {
            return { startMinutes: null, endMinutes: null };
        }

        return {
            startMinutes: (startHours * 60) + startMinutes,
            endMinutes: (endHours * 60) + endMinutes
        };
    },

    _normalizeSchedulerAliases(aliases, normalizer) {
        if (!Array.isArray(aliases)) return [];

        const values = aliases
            .map((alias) => normalizer.call(this, alias))
            .filter(Boolean);

        return [...new Set(values)];
    },

    _normalizeSchedulerDayPatternEntry(entry) {
        if (typeof entry === 'string') {
            const id = this._normalizeDayPatternId(entry);
            if (!id) return null;
            return { id, label: id, aliases: [id] };
        }

        if (!entry || typeof entry !== 'object') return null;

        const id = this._normalizeDayPatternId(entry.id ?? entry.key ?? entry.value);
        if (!id) return null;

        const label = this._normalizeNullableString(entry.label ?? entry.name) || id;
        const aliases = this._normalizeSchedulerAliases(entry.aliases, this._normalizeDayPatternId);

        return {
            id,
            label,
            aliases: [...new Set([id, ...aliases])]
        };
    },

    _normalizeSchedulerTimeSlotEntry(entry) {
        if (typeof entry === 'string') {
            const id = this._normalizeTimeSlotId(entry);
            if (!id) return null;
            const range = this._parseSchedulerRangeToMinutes(id);
            return {
                id,
                label: id,
                aliases: [id],
                startMinutes: range.startMinutes,
                endMinutes: range.endMinutes
            };
        }

        if (!entry || typeof entry !== 'object') return null;

        const id = this._normalizeTimeSlotId(entry.id ?? entry.value ?? entry.slot);
        if (!id) return null;

        const label = this._normalizeNullableString(entry.label ?? entry.name) || id;
        const aliases = this._normalizeSchedulerAliases(entry.aliases, this._normalizeTimeSlotId);
        const range = this._parseSchedulerRangeToMinutes(id);

        return {
            id,
            label,
            aliases: [...new Set([id, ...aliases])],
            startMinutes: this._normalizeMinuteValue(entry.startMinutes) ?? range.startMinutes,
            endMinutes: this._normalizeMinuteValue(entry.endMinutes) ?? range.endMinutes
        };
    },

    _normalizeSchedulerProfileSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return null;

        const dayPatterns = Array.isArray(snapshot.dayPatterns)
            ? snapshot.dayPatterns
                .map((entry) => this._normalizeSchedulerDayPatternEntry(entry))
                .filter(Boolean)
            : [];

        const timeSlots = Array.isArray(snapshot.timeSlots)
            ? snapshot.timeSlots
                .map((entry) => this._normalizeSchedulerTimeSlotEntry(entry))
                .filter(Boolean)
            : [];

        if (!dayPatterns.length && !timeSlots.length) {
            return null;
        }

        return { dayPatterns, timeSlots };
    },

    _buildAcademicYearSchedulerContract(options = {}) {
        if (!options || typeof options !== 'object') {
            return {
                schedulerProfileVersion: null,
                schedulerProfileSnapshot: null
            };
        }

        const profile = options.profile && typeof options.profile === 'object'
            ? options.profile
            : null;
        const profileId = this._normalizeNullableString(profile?.id);
        const profileVersion = Number(profile?.version);
        const derivedProfileVersion = profileId && Number.isFinite(profileVersion)
            ? `${profileId}@v${profileVersion}`
            : (profileId || (Number.isFinite(profileVersion) ? `v${profileVersion}` : null));

        return {
            schedulerProfileVersion: this._normalizeNullableString(
                options.schedulerProfileVersion
                ?? options.schedulerVersion
                ?? options.profileVersion
                ?? derivedProfileVersion
            ),
            schedulerProfileSnapshot: this._normalizeSchedulerProfileSnapshot(
                options.schedulerProfileSnapshot
                ?? options.schedulerSnapshot
                ?? options.scheduler
                ?? profile?.scheduler
                ?? null
            )
        };
    },

    _normalizeSpecialSchedulerPlacement(dayPattern, timeSlot) {
        const normalizedDay = this._normalizeDayPatternId(dayPattern);
        if (normalizedDay !== 'ONLINE' && normalizedDay !== 'ARRANGED') {
            return null;
        }

        const normalizedTime = this._normalizeTimeSlotId(timeSlot);
        return {
            day_pattern: normalizedDay,
            time_slot: normalizedDay === 'ONLINE'
                ? (normalizedTime ? normalizedTime.toLowerCase() : 'async')
                : (normalizedTime ? normalizedTime.toLowerCase() : 'arranged')
        };
    },

    _canonicalizeSchedulePlacement(dayPattern, timeSlot, schedulerSnapshot = null) {
        const specialPlacement = this._normalizeSpecialSchedulerPlacement(dayPattern, timeSlot);
        if (specialPlacement) {
            return specialPlacement;
        }

        const snapshot = this._normalizeSchedulerProfileSnapshot(schedulerSnapshot);
        const normalizedDay = this._normalizeDayPatternId(dayPattern);
        const normalizedTime = this._normalizeTimeSlotId(timeSlot);

        let canonicalDay = normalizedDay;
        if (normalizedDay && snapshot?.dayPatterns?.length) {
            const lookup = this._normalizeSchedulerLookupKey(normalizedDay);
            const match = snapshot.dayPatterns.find((pattern) => {
                const aliases = [pattern.id, ...(Array.isArray(pattern.aliases) ? pattern.aliases : [])];
                return aliases.some((alias) => this._normalizeSchedulerLookupKey(alias) === lookup);
            });
            if (match?.id) {
                canonicalDay = match.id;
            }
        }

        let canonicalTime = normalizedTime;
        if (normalizedTime && snapshot?.timeSlots?.length) {
            const lookup = this._normalizeSchedulerLookupKey(normalizedTime);
            const match = snapshot.timeSlots.find((slot) => {
                const aliases = [slot.id, ...(Array.isArray(slot.aliases) ? slot.aliases : [])];
                return aliases.some((alias) => this._normalizeSchedulerLookupKey(alias) === lookup);
            });
            if (match?.id) {
                canonicalTime = match.id;
            }
        }

        return {
            day_pattern: canonicalDay,
            time_slot: canonicalTime
        };
    },

    _isMissingAcademicYearSchedulerContractColumnError(error) {
        const code = String(error?.code || '').toUpperCase();
        const message = String(error?.message || '');
        return code === '42703'
            || code === 'PGRST204'
            || /scheduler_profile_(snapshot|version)/i.test(message);
    },

    async _resolveCurrentAuthUserId() {
        if (!isSupabaseConfigured()) return null;

        try {
            if (typeof window !== 'undefined' && window.AuthService && typeof window.AuthService.getUser === 'function') {
                const user = await window.AuthService.getUser();
                if (user?.id) {
                    return user.id;
                }
            }
        } catch (error) {
            // Fall through to direct Supabase lookup.
        }

        try {
            const client = getSupabaseClient();
            if (client?.auth && typeof client.auth.getUser === 'function') {
                const { data, error } = await client.auth.getUser();
                if (!error && data?.user?.id) {
                    return data.user.id;
                }
            }
        } catch (error) {
            return null;
        }

        return null;
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = dbService;
}
