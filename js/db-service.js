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
    initializationPromise: null,
    runtimeSourceStatus: {},

    resetRuntimeSourceStatus() {
        this.runtimeSourceStatus = {};
    },

    _setRuntimeSourceStatus(key, status = {}) {
        const count = Number.isFinite(status.count) ? status.count : null;
        this.runtimeSourceStatus[key] = {
            key,
            label: status.label || key,
            source: status.source || 'unknown',
            canonical: status.canonical === true,
            fallback: status.fallback !== undefined ? !!status.fallback : status.canonical !== true,
            detail: status.detail || null,
            count,
            message: status.message || null
        };

        return this.runtimeSourceStatus[key];
    },

    getRuntimeSourceStatus() {
        const supabaseConfigured = typeof isSupabaseConfigured === 'function'
            ? !!isSupabaseConfigured()
            : false;

        return {
            supabaseConfigured,
            department: this.departmentIdentity ? { ...this.departmentIdentity } : null,
            entries: JSON.parse(JSON.stringify(this.runtimeSourceStatus || {}))
        };
    },

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

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

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

        this.initializationPromise = (async () => {
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
                this.initialized = false;
                console.error('Failed to initialize database service:', error);
                throw error;
            } finally {
                this.initializationPromise = null;
            }
        })();

        return this.initializationPromise;
    },

    // ============================================
    // COURSES
    // ============================================

    /**
     * Get all courses for the department
     */
    async getCourses() {
        if (!isSupabaseConfigured()) {
            const data = await this._fetchLocalCourses();
            this._setRuntimeSourceStatus('courses', {
                label: 'Courses',
                source: 'local-file',
                canonical: false,
                fallback: true,
                detail: '../data/course-catalog.json',
                count: data.length,
                message: 'Courses are loading from the local course catalog fallback because Supabase is not configured.'
            });
            return data;
        }

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('courses')
            .select('*')
            .eq('department_id', this.departmentId)
            .order('code');

        if (error) {
            this._setRuntimeSourceStatus('courses', {
                label: 'Courses',
                source: 'database-error',
                canonical: false,
                fallback: false,
                detail: error.message || 'Unknown database error',
                message: 'Courses failed to load from Supabase.'
            });
            throw error;
        }

        this._setRuntimeSourceStatus('courses', {
            label: 'Courses',
            source: 'database',
            canonical: true,
            fallback: false,
            detail: 'courses',
            count: Array.isArray(data) ? data.length : 0,
            message: 'Courses loaded from the canonical Supabase courses table.'
        });
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
            const data = await this._fetchLocalFaculty();
            this._setRuntimeSourceStatus('faculty', {
                label: 'Faculty',
                source: 'local-file',
                canonical: false,
                fallback: true,
                detail: '../workload-data.json',
                count: data.length,
                message: 'Faculty are loading from local workload JSON because Supabase is not configured.'
            });
            return data;
        }

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('faculty')
            .select('*')
            .eq('department_id', this.departmentId)
            .order('name');

        if (error) {
            this._setRuntimeSourceStatus('faculty', {
                label: 'Faculty',
                source: 'database-error',
                canonical: false,
                fallback: false,
                detail: error.message || 'Unknown database error',
                message: 'Faculty failed to load from Supabase.'
            });
            throw error;
        }

        this._setRuntimeSourceStatus('faculty', {
            label: 'Faculty',
            source: 'database',
            canonical: true,
            fallback: false,
            detail: 'faculty',
            count: Array.isArray(data) ? data.length : 0,
            message: 'Faculty loaded from the canonical Supabase faculty table.'
        });
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
            const data = await this._fetchLocalRooms();
            this._setRuntimeSourceStatus('rooms', {
                label: 'Rooms',
                source: 'local-file',
                canonical: false,
                fallback: true,
                detail: '../data/room-constraints.json',
                count: data.length,
                message: 'Rooms are loading from the local room constraints fallback because Supabase is not configured.'
            });
            return data;
        }

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('rooms')
            .select('*')
            .eq('department_id', this.departmentId)
            .order('room_code');

        if (error) {
            this._setRuntimeSourceStatus('rooms', {
                label: 'Rooms',
                source: 'database-error',
                canonical: false,
                fallback: false,
                detail: error.message || 'Unknown database error',
                message: 'Rooms failed to load from Supabase.'
            });
            throw error;
        }

        this._setRuntimeSourceStatus('rooms', {
            label: 'Rooms',
            source: 'database',
            canonical: true,
            fallback: false,
            detail: 'rooms',
            count: Array.isArray(data) ? data.length : 0,
            message: 'Rooms loaded from the canonical Supabase rooms table.'
        });
        return data;
    },

    /**
     * Update a room record for the current department.
     */
    async updateRoom(id, room) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot update room: Supabase not configured');
            return null;
        }

        if (!id) {
            throw new Error('Room id is required');
        }

        await this.initialize();

        const updateData = {
            updated_at: new Date().toISOString()
        };

        if (room.roomCode !== undefined) updateData.room_code = room.roomCode;
        if (room.name !== undefined) updateData.name = room.name;
        if (room.campus !== undefined) updateData.campus = room.campus;
        if (room.capacity !== undefined) updateData.capacity = room.capacity;
        if (room.roomType !== undefined) updateData.room_type = room.roomType;
        if (room.excludeFromGrid !== undefined) updateData.exclude_from_grid = room.excludeFromGrid;

        delete updateData.updated_at;

        const { data, error } = await getSupabaseClient()
            .from('rooms')
            .update(updateData)
            .eq('id', id)
            .eq('department_id', this.departmentId)
            .select()
            .single();

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
            const data = [
                { year: '2023-24', is_active: false },
                { year: '2024-25', is_active: false },
                { year: '2025-26', is_active: true }
            ];
            this._setRuntimeSourceStatus('academicYears', {
                label: 'Academic years',
                source: 'hardcoded-default',
                canonical: false,
                fallback: true,
                detail: 'db-service local academic year defaults',
                count: data.length,
                message: 'Academic years are using hardcoded defaults because Supabase is not configured.'
            });
            return data;
        }

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('academic_years')
            .select('*')
            .eq('department_id', this.departmentId)
            .order('year', { ascending: false });

        if (error) {
            this._setRuntimeSourceStatus('academicYears', {
                label: 'Academic years',
                source: 'database-error',
                canonical: false,
                fallback: false,
                detail: error.message || 'Unknown database error',
                message: 'Academic years failed to load from Supabase.'
            });
            throw error;
        }

        this._setRuntimeSourceStatus('academicYears', {
            label: 'Academic years',
            source: 'database',
            canonical: true,
            fallback: false,
            detail: 'academic_years',
            count: Array.isArray(data) ? data.length : 0,
            message: 'Academic years loaded from the canonical Supabase academic_years table.'
        });
        return data;
    },

    /**
     * Get a specific academic year without creating it.
     */
    async getAcademicYear(yearString) {
        if (!isSupabaseConfigured()) return null;
        if (!yearString) return null;

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('academic_years')
            .select('*')
            .eq('department_id', this.departmentId)
            .eq('year', yearString)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    },

    /**
     * Get or create an academic year
     */
    async getOrCreateYear(yearString) {
        if (!isSupabaseConfigured()) return null;

        // Try to get existing
        const existing = await this.getAcademicYear(yearString);

        if (existing) return existing;

        // Create new
        const { data, error } = await getSupabaseClient()
            .from('academic_years')
            .insert({
                department_id: this.departmentId,
                year: yearString,
                is_active: false
            })
            .select()
            .single();

        if (error) throw error;
        return data;
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

        let query = supabase
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

        const record = {
            academic_year_id: courseData.academicYearId,
            course_id: courseData.courseId,
            faculty_id: courseData.facultyId || null,
            room_id: courseData.roomId || null,
            quarter: courseData.quarter,
            day_pattern: courseData.dayPattern,
            time_slot: courseData.timeSlot,
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
    async batchSaveSchedule(courses, yearId) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot batch save: Supabase not configured');
            return [];
        }

        const records = courses.map(c => ({
            academic_year_id: yearId,
            course_id: c.courseId,
            faculty_id: c.facultyId || null,
            room_id: c.roomId || null,
            quarter: c.quarter,
            day_pattern: c.dayPattern,
            time_slot: c.timeSlot,
            section: c.section,
            projected_enrollment: c.projectedEnrollment || null
        }));

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
    async syncScheduledCoursesForAcademicYear(academicYearId, records = []) {
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

            return {
                course_id: this._normalizeNullableString(record.course_id ?? record.courseId),
                faculty_id: this._normalizeNullableString(record.faculty_id ?? record.facultyId),
                room_id: this._normalizeNullableString(record.room_id ?? record.roomId),
                quarter,
                day_pattern: this._normalizeNullableString(record.day_pattern ?? record.dayPattern),
                time_slot: this._normalizeNullableString(record.time_slot ?? record.timeSlot),
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
     * Get all faculty preference rows for the current department.
     */
    async listFacultyPreferences(facultyIds = null) {
        if (!isSupabaseConfigured()) {
            this._setRuntimeSourceStatus('facultyPreferences', {
                label: 'Faculty preferences',
                source: 'hardcoded-default',
                canonical: false,
                fallback: true,
                detail: 'No configured database',
                count: 0,
                message: 'Faculty preferences are unavailable because Supabase is not configured.'
            });
            return [];
        }

        await this.initialize();

        let effectiveFacultyIds = facultyIds;
        if (!Array.isArray(effectiveFacultyIds)) {
            const { data: facultyRows, error: facultyError } = await getSupabaseClient()
                .from('faculty')
                .select('id')
                .eq('department_id', this.departmentId);

            if (facultyError) {
                this._setRuntimeSourceStatus('facultyPreferences', {
                    label: 'Faculty preferences',
                    source: 'database-error',
                    canonical: false,
                    fallback: false,
                    detail: facultyError.message || 'Unknown database error',
                    message: 'Faculty preferences failed to scope faculty rows from Supabase.'
                });
                throw facultyError;
            }

            effectiveFacultyIds = Array.isArray(facultyRows)
                ? facultyRows.map((row) => row.id).filter(Boolean)
                : [];
        }

        if (effectiveFacultyIds.length === 0) {
            this._setRuntimeSourceStatus('facultyPreferences', {
                label: 'Faculty preferences',
                source: 'database',
                canonical: true,
                fallback: false,
                detail: 'faculty_preferences',
                count: 0,
                message: 'Faculty preferences loaded from the canonical Supabase faculty_preferences table.'
            });
            return [];
        }

        const { data, error } = await getSupabaseClient()
            .from('faculty_preferences')
            .select('*')
            .in('faculty_id', effectiveFacultyIds);

        if (error) {
            this._setRuntimeSourceStatus('facultyPreferences', {
                label: 'Faculty preferences',
                source: 'database-error',
                canonical: false,
                fallback: false,
                detail: error.message || 'Unknown database error',
                message: 'Faculty preferences failed to load from Supabase.'
            });
            throw error;
        }

        this._setRuntimeSourceStatus('facultyPreferences', {
            label: 'Faculty preferences',
            source: 'database',
            canonical: true,
            fallback: false,
            detail: 'faculty_preferences',
            count: Array.isArray(data) ? data.length : 0,
            message: 'Faculty preferences loaded from the canonical Supabase faculty_preferences table.'
        });
        return data || [];
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

    /**
     * Delete the preference row for a faculty member.
     */
    async deleteFacultyPreferences(facultyId) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot delete preferences: Supabase not configured');
            return false;
        }

        if (!facultyId) {
            throw new Error('facultyId is required');
        }

        const { error } = await getSupabaseClient()
            .from('faculty_preferences')
            .delete()
            .eq('faculty_id', facultyId);

        if (error) throw error;
        return true;
    },

    // ============================================
    // SCHEDULING CONSTRAINTS
    // ============================================

    /**
     * Get all scheduling constraints
     */
    async getConstraints() {
        if (!isSupabaseConfigured()) {
            const data = await this._fetchLocalConstraints();
            const count = Array.isArray(data)
                ? data.length
                : Array.isArray(data?.rules)
                    ? data.rules.length
                    : Object.keys(data || {}).length;
            this._setRuntimeSourceStatus('constraints', {
                label: 'Constraints',
                source: 'local-file',
                canonical: false,
                fallback: true,
                detail: '../data/scheduling-rules.json',
                count,
                message: 'Constraints are loading from local scheduling rules because Supabase is not configured.'
            });
            return data;
        }

        await this.initialize();
        const { data, error } = await getSupabaseClient()
            .from('scheduling_constraints')
            .select('*')
            .eq('department_id', this.departmentId)
            .eq('enabled', true);

        if (error) {
            this._setRuntimeSourceStatus('constraints', {
                label: 'Constraints',
                source: 'database-error',
                canonical: false,
                fallback: false,
                detail: error.message || 'Unknown database error',
                message: 'Constraints failed to load from Supabase.'
            });
            throw error;
        }

        this._setRuntimeSourceStatus('constraints', {
            label: 'Constraints',
            source: 'database',
            canonical: true,
            fallback: false,
            detail: 'scheduling_constraints',
            count: Array.isArray(data) ? data.length : 0,
            message: 'Constraints loaded from the canonical Supabase scheduling_constraints table.'
        });
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

    /**
     * Delete a scheduling constraint.
     */
    async deleteConstraint(id) {
        if (!isSupabaseConfigured()) {
            console.warn('Cannot delete constraint: Supabase not configured');
            return false;
        }

        if (!id) {
            throw new Error('Constraint id is required');
        }

        await this.initialize();
        const { error } = await getSupabaseClient()
            .from('scheduling_constraints')
            .delete()
            .eq('id', id)
            .eq('department_id', this.departmentId);

        if (error) throw error;
        return true;
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
