#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { execSync } = require('child_process');
const { SonarQubeParser } = require('./sonarqube_parser.js');

class ToolAnalytics {
    constructor() {
        this.dbPath = path.join(__dirname, 'tool_analytics.db');
        this.logPath = path.join(__dirname, 'tool_analytics.log');
        this.initialized = false;
        // Get user identifier from git config
        this.userId = this.getUserId();
        // Initialize SonarQube parser
        this.sonarParser = new SonarQubeParser();
    }

    getUserId() {
        try {
            // Try git email first (most reliable)
            const gitEmail = execSync('git config user.email', this.getExecOptions()).trim();
            if (gitEmail) return gitEmail;

            // Fallback to git name
            const gitName = execSync('git config user.name', this.getExecOptions()).trim();
            if (gitName) return gitName;
        } catch (e) {
            // Git not available or not configured
        }

        // Final fallback to environment variables
        return process.env.USER || process.env.USERNAME || 'unknown';
    }

    getExecOptions(cwd = null, timeout = 10000) {
        return {
            cwd: cwd || process.cwd(),
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: timeout
        };
    }

    getDbConnection() {
        return new sqlite3.Database(this.dbPath);
    }

    logError(method, error, context = '') {
        const contextStr = context ? ` (${context})` : '';
        this.log(`Error in ${method}${contextStr}: ${error.message}`);
    }

    async initialize() {
        if (!this.initialized) {
            await this.initDatabase();
            this.initialized = true;
        }
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp}: ${message}\n`;

        try {
            fs.appendFileSync(this.logPath, logEntry);
        } catch (error) {
            console.error('Failed to write to log:', error);
        }
    }

    initDatabase() {
        return new Promise((resolve, reject) => {
            const db = this.getDbConnection();

            db.serialize(() => {
                // Sessions table - one per conversation
                db.run(`
                    CREATE TABLE IF NOT EXISTS sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT UNIQUE NOT NULL,
                        user_id TEXT NOT NULL,
                        started_at INTEGER NOT NULL,
                        last_activity_at INTEGER NOT NULL,
                        total_turns INTEGER DEFAULT 0,
                        total_tools_used INTEGER DEFAULT 0,
                        total_interruptions INTEGER DEFAULT 0
                    )
                `);
                db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at)`);

                // Turns table - conversation turns with interruption tracking
                db.run(`
                    CREATE TABLE IF NOT EXISTS turns (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        turn_number INTEGER NOT NULL,
                        started_at INTEGER NOT NULL,
                        ended_at INTEGER,
                        was_interrupted BOOLEAN DEFAULT 0,
                        interrupted_at INTEGER,
                        tools_used INTEGER DEFAULT 0,
                        start_git_head TEXT,
                        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
                        UNIQUE(session_id, turn_number)
                    )
                `);
                db.run(`CREATE INDEX IF NOT EXISTS idx_turns_session_id ON turns(session_id)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_turns_user_id ON turns(user_id)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_turns_started_at ON turns(started_at)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_turns_interrupted ON turns(was_interrupted)`);

                // Tool executions - complete lifecycle of a tool use
                db.run(`
                    CREATE TABLE IF NOT EXISTS tool_executions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        turn_id INTEGER,
                        tool_name TEXT NOT NULL,
                        started_at INTEGER NOT NULL,
                        completed_at INTEGER,
                        processing_time_ms INTEGER,
                        success BOOLEAN,
                        error_message TEXT,
                        tool_input_size INTEGER,
                        tool_output_size INTEGER,
                        sequence_number INTEGER,
                        previous_tool TEXT,
                        cwd TEXT,
                        raw_input TEXT,
                        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
                        FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE CASCADE
                    )
                `);
                db.run(`CREATE INDEX IF NOT EXISTS idx_executions_session_id ON tool_executions(session_id)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_executions_user_id ON tool_executions(user_id)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_executions_turn_id ON tool_executions(turn_id)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_executions_tool_name ON tool_executions(tool_name)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_executions_started_at ON tool_executions(started_at)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_executions_success ON tool_executions(success)`);


                // Tool stats - aggregated metrics
                db.run(`
                    CREATE TABLE IF NOT EXISTS tool_stats (
                        tool_name TEXT PRIMARY KEY,
                        total_uses INTEGER DEFAULT 0,
                        successful_uses INTEGER DEFAULT 0,
                        failed_uses INTEGER DEFAULT 0,
                        total_processing_time_ms INTEGER DEFAULT 0,
                        avg_processing_time_ms REAL DEFAULT 0,
                        success_rate REAL DEFAULT 0,
                        most_common_error TEXT,
                        last_used_at INTEGER,
                        last_updated_at INTEGER NOT NULL
                    )
                `);

                // Session intents - classify what users are trying to accomplish
                db.run(`
                    CREATE TABLE IF NOT EXISTS session_intents (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        turn_number INTEGER,
                        intent_type TEXT NOT NULL,
                        confidence REAL DEFAULT 0.0,
                        user_prompt TEXT,
                        signals TEXT,
                        detected_at INTEGER NOT NULL,
                        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
                    )
                `);

                // Git commits - track commits made during Claude sessions
                db.run(`
                    CREATE TABLE IF NOT EXISTS git_commits (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        turn_id INTEGER,
                        commit_sha TEXT NOT NULL,
                        branch_name TEXT,
                        commit_message TEXT,
                        author_name TEXT,
                        author_email TEXT,
                        committed_at INTEGER NOT NULL,
                        repo_path TEXT,
                        remote_url TEXT,
                        pr_number INTEGER,
                        files_changed INTEGER,
                        insertions INTEGER,
                        deletions INTEGER,
                        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
                        FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE CASCADE
                    )
                `);

                // Token usage - track actual token consumption and costs from transcripts
                db.run(`
                    CREATE TABLE IF NOT EXISTS token_usage (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        turn_id INTEGER,
                        message_id TEXT,
                        input_tokens INTEGER DEFAULT 0,
                        output_tokens INTEGER DEFAULT 0,
                        cache_creation_input_tokens INTEGER DEFAULT 0,
                        cache_read_input_tokens INTEGER DEFAULT 0,
                        ephemeral_5m_input_tokens INTEGER DEFAULT 0,
                        ephemeral_1h_input_tokens INTEGER DEFAULT 0,
                        total_tokens INTEGER DEFAULT 0,
                        input_cost_usd REAL DEFAULT 0.0,
                        output_cost_usd REAL DEFAULT 0.0,
                        cache_write_cost_usd REAL DEFAULT 0.0,
                        cache_read_cost_usd REAL DEFAULT 0.0,
                        total_cost_usd REAL DEFAULT 0.0,
                        model_name TEXT,
                        recorded_at INTEGER NOT NULL,
                        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
                        FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE CASCADE
                    )
                `);

                // Pull requests - track PR operations via gh CLI
                db.run(`
                    CREATE TABLE IF NOT EXISTS pull_requests (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        turn_id INTEGER,
                        pr_number INTEGER NOT NULL,
                        pr_title TEXT,
                        pr_url TEXT,
                        pr_state TEXT,
                        is_draft INTEGER DEFAULT 0,
                        base_branch TEXT,
                        head_branch TEXT,
                        mergeable TEXT,
                        merged INTEGER DEFAULT 0,
                        merged_at INTEGER,
                        files_changed INTEGER DEFAULT 0,
                        additions INTEGER DEFAULT 0,
                        deletions INTEGER DEFAULT 0,
                        commits_count INTEGER DEFAULT 0,
                        created_at INTEGER NOT NULL,
                        fetched_at INTEGER NOT NULL,
                        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
                        FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE CASCADE
                    )
                `);

                // PR checks - track CI/CD check runs for PRs
                db.run(`
                    CREATE TABLE IF NOT EXISTS pr_checks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        pr_id INTEGER NOT NULL,
                        pr_number INTEGER NOT NULL,
                        check_name TEXT NOT NULL,
                        check_status TEXT,
                        check_conclusion TEXT,
                        started_at TEXT,
                        completed_at TEXT,
                        duration_seconds INTEGER,
                        details_url TEXT,
                        fetched_at INTEGER NOT NULL,
                        FOREIGN KEY (pr_id) REFERENCES pull_requests(id) ON DELETE CASCADE
                    )
                `);

                // Commit checks - track CI/CD results for individual commits
                db.run(`
                    CREATE TABLE IF NOT EXISTS commit_checks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        commit_sha TEXT NOT NULL,
                        session_id TEXT,
                        is_claude_commit INTEGER DEFAULT 0,
                        check_suite_id TEXT,
                        check_name TEXT NOT NULL,
                        check_status TEXT,
                        check_conclusion TEXT,
                        started_at TEXT,
                        completed_at TEXT,
                        duration_seconds INTEGER,
                        details_url TEXT,
                        fetched_at INTEGER NOT NULL,
                        FOREIGN KEY (commit_sha) REFERENCES git_commits(commit_sha) ON DELETE CASCADE
                    )
                `, (err) => {
                    db.run(`CREATE INDEX IF NOT EXISTS idx_stats_last_used ON tool_stats(last_used_at)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_intents_session_id ON session_intents(session_id)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_intents_user_id ON session_intents(user_id)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_intents_type ON session_intents(intent_type)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_commits_session_id ON git_commits(session_id)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_commits_sha ON git_commits(commit_sha)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_commits_branch ON git_commits(branch_name)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_commits_pr ON git_commits(pr_number)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_token_usage_session_id ON token_usage(session_id)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_token_usage_user_id ON token_usage(user_id)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_token_usage_turn_id ON token_usage(turn_id)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_prs_session_id ON pull_requests(session_id)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_prs_pr_number ON pull_requests(pr_number)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_pr_checks_pr_id ON pr_checks(pr_id)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_pr_checks_pr_number ON pr_checks(pr_number)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_commit_checks_sha ON commit_checks(commit_sha)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_commit_checks_claude ON commit_checks(is_claude_commit)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_commit_checks_conclusion ON commit_checks(check_conclusion)`);

                    // SonarQube metrics table
                    db.run(`
                        CREATE TABLE IF NOT EXISTS sonarqube_metrics (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            pr_number INTEGER NOT NULL,
                            commit_sha TEXT,
                            session_id TEXT,

                            -- Quality Gate
                            quality_gate_status TEXT,
                            conditions_passed INTEGER DEFAULT 0,
                            conditions_failed INTEGER DEFAULT 0,

                            -- Bugs
                            bugs_total INTEGER DEFAULT 0,
                            bugs_critical INTEGER DEFAULT 0,
                            bugs_major INTEGER DEFAULT 0,
                            bugs_minor INTEGER DEFAULT 0,

                            -- Vulnerabilities
                            vulnerabilities_total INTEGER DEFAULT 0,
                            vulnerabilities_critical INTEGER DEFAULT 0,
                            vulnerabilities_major INTEGER DEFAULT 0,
                            vulnerabilities_minor INTEGER DEFAULT 0,

                            -- Security & Quality
                            security_hotspots INTEGER DEFAULT 0,
                            code_smells INTEGER DEFAULT 0,
                            technical_debt_minutes INTEGER DEFAULT 0,

                            -- Coverage
                            line_coverage_percent REAL,
                            branch_coverage_percent REAL,
                            coverage_on_new_code_percent REAL,

                            -- Ratings (A=1, B=2, C=3, D=4, E=5)
                            maintainability_rating INTEGER,
                            reliability_rating INTEGER,
                            security_rating INTEGER,

                            -- Duplication
                            duplicated_lines_percent REAL,

                            -- Metadata
                            sonar_project_key TEXT,
                            analysis_date TEXT,
                            comment_id TEXT,
                            comment_url TEXT,
                            fetched_at INTEGER NOT NULL,

                            -- GitHub Checks support (NEW)
                            source TEXT DEFAULT 'comment', -- 'comment' or 'check_run'
                            check_name TEXT,
                            check_status TEXT,
                            check_conclusion TEXT,
                            check_suite_id TEXT,
                            details_url TEXT,
                            raw_output TEXT,

                            FOREIGN KEY (pr_number) REFERENCES pull_requests(pr_number),
                            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
                        )
                    `);

                    // SonarQube indexes
                    db.run(`CREATE INDEX IF NOT EXISTS idx_sonar_pr ON sonarqube_metrics(pr_number)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_sonar_commit ON sonarqube_metrics(commit_sha)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_sonar_session ON sonarqube_metrics(session_id)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_sonar_quality_gate ON sonarqube_metrics(quality_gate_status)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_sonar_analysis_date ON sonarqube_metrics(analysis_date)`);

                    // GitHub Checks schema migration (NEW)
                    db.run(`ALTER TABLE sonarqube_metrics ADD COLUMN source TEXT DEFAULT 'comment'`, () => {
                        // Ignore errors if column already exists
                    });
                    db.run(`ALTER TABLE sonarqube_metrics ADD COLUMN check_name TEXT`, () => {});
                    db.run(`ALTER TABLE sonarqube_metrics ADD COLUMN check_status TEXT`, () => {});
                    db.run(`ALTER TABLE sonarqube_metrics ADD COLUMN check_conclusion TEXT`, () => {});
                    db.run(`ALTER TABLE sonarqube_metrics ADD COLUMN check_suite_id TEXT`, () => {});
                    db.run(`ALTER TABLE sonarqube_metrics ADD COLUMN details_url TEXT`, () => {});
                    db.run(`ALTER TABLE sonarqube_metrics ADD COLUMN raw_output TEXT`, () => {});

                    // GitHub Checks indexes (NEW)
                    db.run(`CREATE INDEX IF NOT EXISTS idx_sonar_source ON sonarqube_metrics(source)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_sonar_check_name ON sonarqube_metrics(check_name)`);
                    db.run(`CREATE INDEX IF NOT EXISTS idx_sonar_check_conclusion ON sonarqube_metrics(check_conclusion)`, () => {
                        db.close();
                        if (err) {
                            this.log(`Database initialization error: ${err.message}`);
                            reject(err);
                        } else {
                            this.log('Database initialized successfully with improved schema');
                            resolve();
                        }
                    });
                });
            });
        });
    }

    async processHookEvent(eventData) {
        try {
            // Extract key information from the hook event
            const {
                session_id,
                hook_event_name,
                tool_name,
                tool_input,
                tool_output,
                success,
                error,
                cwd
            } = eventData;

            // Handle response tracking events
            if (hook_event_name === 'UserPromptSubmit') {
                await this.handleUserPromptSubmit(eventData);
                return;
            } else if (hook_event_name === 'Stop') {
                await this.handleStop(eventData);
                return;
            }

            if (!tool_name) {
                this.log('No tool_name found in event data, skipping');
                return;
            }

            if (hook_event_name === 'PreToolUse') {
                await this.handlePreToolUse(eventData);
            } else if (hook_event_name === 'PostToolUse') {
                await this.handlePostToolUse(eventData);
            }

            // Update tool chains and metrics
            await this.updateToolChains(session_id, tool_name);

        } catch (error) {
            this.log(`Error processing hook event: ${error.message}`);
        }
    }

    async handlePreToolUse(eventData) {
        const {
            session_id,
            tool_name,
            tool_input,
            cwd
        } = eventData;

        const toolInputSize = JSON.stringify(tool_input || {}).length;
        const now = Date.now(); // Store in milliseconds
        const sequenceInfo = await this.getSequenceInfo(session_id);

        return new Promise((resolve) => {
            const db = this.getDbConnection();

            // Ensure session exists
            db.run(`
                INSERT OR IGNORE INTO sessions (session_id, user_id, started_at, last_activity_at)
                VALUES (?, ?, ?, ?)
            `, [session_id, this.userId, now, now]);

            // Update session activity
            db.run(`
                UPDATE sessions
                SET last_activity_at = ?,
                    total_tools_used = total_tools_used + 1
                WHERE session_id = ?
            `, [now, session_id]);

            // Get current turn_id
            db.get(`
                SELECT id FROM turns
                WHERE session_id = ? AND ended_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
            `, [session_id], (err, turn) => {
                const turnId = turn ? turn.id : null;

                // Insert tool execution record
                db.run(`
                    INSERT INTO tool_executions (
                        session_id, user_id, turn_id, tool_name, started_at,
                        tool_input_size, sequence_number, previous_tool,
                        cwd, raw_input
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    session_id,
                    this.userId,
                    turnId,
                    tool_name,
                    now,
                    toolInputSize,
                    sequenceInfo.sequenceNumber,
                    sequenceInfo.previousTool,
                    cwd,
                    JSON.stringify(tool_input)
                ], function(err) {
                    if (err) {
                        this.log(`Error inserting tool execution: ${err.message}`);
                    } else {
                        this.log(`Tool started: ${tool_name} (ID: ${this.lastID})`);
                    }
                    db.close();
                    resolve();
                }.bind(this));
            });
        });
    }

    async handlePostToolUse(eventData) {
        const {
            session_id,
            tool_name,
            tool_output,
            tool_input,
            success = true,
            error,
            processing_time_ms,
            cwd
        } = eventData;

        const now = Date.now(); // Store in milliseconds
        const toolOutputSize = JSON.stringify(tool_output || {}).length;

        // Check if this is a gh pr command in Bash
        if (tool_name === 'Bash' && tool_input && tool_input.command) {
            await this.handleGitHubPRCommand(session_id, tool_input.command, tool_output, cwd);
        }

        // Check if this is a git command - analyze and store detailed git data
        if (tool_name === 'Bash' && tool_input && tool_input.command) {
            // Run git handling in background to not block hook
            setImmediate(async () => {
                try {
                    await this.handleGitCommand(session_id, tool_input.command, tool_output, cwd, success);
                } catch (error) {
                    this.log(`Error in background git handling: ${error.message}`);
                }
            });
        }

        // Check if this is a git commit command - trigger immediate scan
        if (tool_name === 'Bash' && tool_input && tool_input.command && success) {
            const command = tool_input.command.toLowerCase();
            if (command.includes('git commit') || /git\s+commit/.test(command)) {
                this.log(`🚀 Git commit detected - triggering immediate repository scan: ${tool_input.command.substring(0, 100)}...`);
                await this.scheduleRepositoryScan(cwd);
            }
        }

        // Check for git push and gh pr create commands - trigger IMMEDIATE scan without cooldown
        if (tool_name === 'Bash' && tool_input && tool_input.command && success) {
            const command = tool_input.command.toLowerCase();
            if (command.includes('git push') || /git\s+push/.test(command) ||
                command.includes('gh pr create') || /gh\s+pr\s+create/.test(command)) {
                this.log(`🚀 IMMEDIATE SCAN: ${command.includes('git push') ? 'Git push' : 'PR creation'} detected - forcing immediate repository scan: ${tool_input.command.substring(0, 100)}...`);

                // Use forceRepositoryScan instead of scheduleRepositoryScan to skip cooldown
                setTimeout(async () => {
                    await this.forceRepositoryScan(cwd);
                }, 2000); // 2 second delay to ensure push/PR creation is complete
            }
        }

        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);

            // First, get the start time to calculate processing time if not provided
            db.get(`
                SELECT id, started_at FROM tool_executions
                WHERE session_id = ?
                    AND tool_name = ?
                    AND completed_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
            `, [session_id, tool_name], (err, execution) => {
                if (err || !execution) {
                    this.log(`No matching execution found for ${tool_name}`);
                    db.close();
                    resolve();
                    return;
                }

                // Calculate processing time in milliseconds
                let actualProcessingTime = processing_time_ms;
                if (!actualProcessingTime || actualProcessingTime === 0) {
                    actualProcessingTime = now - execution.started_at;
                }

                this.log(`Tool ${tool_name} processing time: ${actualProcessingTime}ms (provided: ${processing_time_ms}, calculated: ${now - execution.started_at})`);

                // Update the execution record
                db.run(`
                    UPDATE tool_executions
                    SET completed_at = ?,
                        processing_time_ms = ?,
                        success = ?,
                        error_message = ?,
                        tool_output_size = ?
                    WHERE id = ?
                `, [
                    now,
                    actualProcessingTime,
                    success ? 1 : 0,
                    error || null,
                    toolOutputSize,
                    execution.id
                ], function(err) {
                    if (err) {
                        this.log(`Error updating tool execution: ${err.message}`);
                        db.close();
                        resolve();
                    } else {
                        this.log(`Tool completed: ${tool_name}, success: ${success}`);

                        // Update tool stats
                        this.updateToolStats(tool_name, success, actualProcessingTime).then(() => {
                            db.close();
                            resolve();
                        });
                    }
                }.bind(this));
            });
        });
    }

    async getSequenceInfo(sessionId) {
        return new Promise((resolve) => {
            const db = this.getDbConnection();

            db.get(`
                SELECT tool_name, MAX(sequence_number) as max_seq
                FROM tool_executions
                WHERE session_id = ?
                ORDER BY started_at DESC
                LIMIT 1
            `, [sessionId], (err, row) => {
                db.close();

                if (err || !row) {
                    resolve({ sequenceNumber: 1, previousTool: null });
                } else {
                    resolve({
                        sequenceNumber: (row.max_seq || 0) + 1,
                        previousTool: row.tool_name
                    });
                }
            });
        });
    }

    async updateToolStats(toolName, success, processingTimeMs) {
        return new Promise((resolve) => {
            const db = this.getDbConnection();
            const now = Date.now(); // Store in milliseconds

            // Update or insert tool stats
            db.run(`
                INSERT INTO tool_stats (
                    tool_name, total_uses, successful_uses, failed_uses,
                    total_processing_time_ms, avg_processing_time_ms,
                    success_rate, last_used_at, last_updated_at
                ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(tool_name) DO UPDATE SET
                    total_uses = total_uses + 1,
                    successful_uses = successful_uses + ?,
                    failed_uses = failed_uses + ?,
                    total_processing_time_ms = total_processing_time_ms + ?,
                    avg_processing_time_ms = (total_processing_time_ms + ?) / (total_uses + 1),
                    success_rate = CAST(successful_uses + ? AS REAL) / (total_uses + 1),
                    last_used_at = ?,
                    last_updated_at = ?
            `, [
                toolName,
                success ? 1 : 0,
                success ? 0 : 1,
                processingTimeMs,
                processingTimeMs,
                success ? 1.0 : 0.0,
                now,
                now,
                success ? 1 : 0,
                success ? 0 : 1,
                processingTimeMs,
                processingTimeMs,
                success ? 1 : 0,
                now,
                now
            ], (err) => {
                if (err) {
                    this.log(`Error updating tool stats: ${err.message}`);
                }
                db.close();
                resolve();
            });
        });
    }

    async updateToolChains(sessionId, currentTool) {
        // Skip for now - can be re-implemented later if needed
        return Promise.resolve();
    }

    categorizeChain(sequence) {
        // Categorize tool usage patterns
        if (sequence.includes('Read->Edit')) return 'file_modification';
        if (sequence.includes('Grep->Read')) return 'search_and_read';
        if (sequence.includes('Bash->Read')) return 'execute_and_verify';
        if (sequence.includes('Write->Bash')) return 'create_and_test';
        return 'other';
    }

    async generateMetrics() {
        // Generate comprehensive development metrics report
        // Includes session-based cost analysis, PR productivity, and human vs Claude comparison
        try {
            await this.generateComprehensiveMetricsReport();
        } catch (error) {
            this.log(`Error in generateMetrics: ${error.message}`);
        }
        return Promise.resolve();
    }

    detectIntent(userPrompt, sessionContext = {}) {
        if (!userPrompt) return { intent: 'unknown', confidence: 0.0, signals: [] };

        const prompt = userPrompt.toLowerCase();
        const signals = [];
        let intent = 'unknown';
        let confidence = 0.0;

        // Bug Fix detection
        const bugKeywords = ['fix', 'bug', 'error', 'issue', 'broken', 'not working', 'crash', 'failing'];
        const bugScore = bugKeywords.filter(kw => prompt.includes(kw)).length;
        if (bugScore > 0) {
            signals.push(`bug_keywords:${bugScore}`);
            if (bugScore >= 2 || prompt.includes('fix bug') || prompt.includes('fix error')) {
                intent = 'bug_fix';
                confidence = Math.min(0.7 + (bugScore * 0.1), 1.0);
            }
        }

        // Refactor detection
        const refactorKeywords = ['refactor', 'cleanup', 'reorganize', 'restructure', 'improve code', 'optimize', 'simplify'];
        const refactorScore = refactorKeywords.filter(kw => prompt.includes(kw)).length;
        if (refactorScore > 0) {
            signals.push(`refactor_keywords:${refactorScore}`);
            if (refactorScore >= 1 && confidence < 0.6) {
                intent = 'refactor';
                confidence = Math.min(0.6 + (refactorScore * 0.15), 1.0);
            }
        }

        // New Feature detection
        const featureKeywords = ['add', 'implement', 'create', 'new feature', 'build', 'develop', 'make'];
        const featureScore = featureKeywords.filter(kw => prompt.includes(kw)).length;
        if (featureScore > 0) {
            signals.push(`feature_keywords:${featureScore}`);
            if (featureScore >= 2 && confidence < 0.7) {
                intent = 'new_feature';
                confidence = Math.min(0.65 + (featureScore * 0.1), 1.0);
            }
        }

        // Documentation detection
        const docKeywords = ['document', 'readme', 'comment', 'explain', 'add comments', 'write docs'];
        const docScore = docKeywords.filter(kw => prompt.includes(kw)).length;
        if (docScore > 0 || prompt.includes('.md') || prompt.includes('documentation')) {
            signals.push(`doc_keywords:${docScore}`);
            if (docScore >= 1 && confidence < 0.8) {
                intent = 'documentation';
                confidence = Math.min(0.7 + (docScore * 0.1), 1.0);
            }
        }

        // Testing detection
        const testKeywords = ['test', 'spec', 'unit test', 'integration test', 'coverage', 'jest', 'pytest'];
        const testScore = testKeywords.filter(kw => prompt.includes(kw)).length;
        if (testScore > 0) {
            signals.push(`test_keywords:${testScore}`);
            if (testScore >= 1 && confidence < 0.8) {
                intent = 'testing';
                confidence = Math.min(0.75 + (testScore * 0.1), 1.0);
            }
        }

        // Debugging detection
        const debugKeywords = ['debug', 'investigate', 'why', 'trace', 'find out', 'what\'s wrong', 'analyze'];
        const debugScore = debugKeywords.filter(kw => prompt.includes(kw)).length;
        if (debugScore > 0) {
            signals.push(`debug_keywords:${debugScore}`);
            if (debugScore >= 1 && confidence < 0.7) {
                intent = 'debugging';
                confidence = Math.min(0.6 + (debugScore * 0.15), 1.0);
            }
        }

        // Exploration detection
        const exploreKeywords = ['show me', 'what does', 'how does', 'explain', 'understand', 'look at', 'find'];
        const exploreScore = exploreKeywords.filter(kw => prompt.includes(kw)).length;
        if (exploreScore > 0) {
            signals.push(`explore_keywords:${exploreScore}`);
            if (exploreScore >= 2 && confidence < 0.6) {
                intent = 'exploration';
                confidence = Math.min(0.5 + (exploreScore * 0.1), 1.0);
            }
        }

        // Configuration detection
        const configKeywords = ['setup', 'configure', 'install', 'dependency', 'package', 'config', 'environment'];
        const configScore = configKeywords.filter(kw => prompt.includes(kw)).length;
        if (configScore > 0 || prompt.includes('package.json') || prompt.includes('.env')) {
            signals.push(`config_keywords:${configScore}`);
            if (configScore >= 1 && confidence < 0.7) {
                intent = 'configuration';
                confidence = Math.min(0.65 + (configScore * 0.1), 1.0);
            }
        }

        // If still unknown but we have some signals, mark as 'other' with low confidence
        if (intent === 'unknown' && signals.length > 0) {
            intent = 'other';
            confidence = 0.3;
        }

        return {
            intent,
            confidence: Math.round(confidence * 100) / 100,
            signals: signals.join(', ')
        };
    }

    async saveIntent(sessionId, turnNumber, userPrompt, detectedIntent) {
        const now = Date.now();

        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);

            db.run(`
                INSERT INTO session_intents (
                    session_id, user_id, turn_number, intent_type,
                    confidence, user_prompt, signals, detected_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                sessionId,
                this.userId,
                turnNumber,
                detectedIntent.intent,
                detectedIntent.confidence,
                userPrompt,
                detectedIntent.signals,
                now
            ], (err) => {
                if (err) {
                    this.log(`Error saving intent: ${err.message}`);
                } else {
                    this.log(`Intent detected: ${detectedIntent.intent} (${detectedIntent.confidence})`);
                }
                db.close();
                resolve();
            });
        });
    }


    async handleUserPromptSubmit(eventData) {
        const { session_id, prompt, cwd } = eventData;
        const now = Date.now(); // Store in milliseconds

        // Capture current git HEAD before turn starts
        const startHeadSha = await this.getCurrentHeadSha(cwd || process.cwd());

        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);

            // Ensure session exists
            db.run(`
                INSERT OR IGNORE INTO sessions (session_id, user_id, started_at, last_activity_at)
                VALUES (?, ?, ?, ?)
            `, [session_id, this.userId, now, now]);

            // Check if previous turn is still open (not ended) - that means it was interrupted
            db.get(`
                SELECT id, turn_number FROM turns
                WHERE session_id = ? AND ended_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
            `, [session_id], (err, openTurn) => {
                if (openTurn) {
                    // Mark the open turn as interrupted
                    db.run(`
                        UPDATE turns
                        SET was_interrupted = 1,
                            interrupted_at = ?,
                            ended_at = ?
                        WHERE id = ?
                    `, [now, now, openTurn.id], (err) => {
                        if (err) {
                            this.log(`Error marking interruption: ${err.message}`);
                        } else {
                            this.log(`Turn ${openTurn.turn_number} interrupted`);

                            // Update session interruption count
                            db.run(`
                                UPDATE sessions
                                SET total_interruptions = total_interruptions + 1
                                WHERE session_id = ?
                            `, [session_id]);
                        }
                    });
                }

                // Get next turn number
                db.get(`
                    SELECT MAX(turn_number) as max_turn FROM turns
                    WHERE session_id = ?
                `, [session_id], (err, row) => {
                    const nextTurn = row && row.max_turn ? row.max_turn + 1 : 1;

                    // Create new turn
                    db.run(`
                        INSERT INTO turns (session_id, user_id, turn_number, started_at, start_git_head)
                        VALUES (?, ?, ?, ?, ?)
                    `, [session_id, this.userId, nextTurn, now, startHeadSha], function(err) {
                        if (err) {
                            this.log(`Error creating turn: ${err.message}`);
                            db.close();
                            resolve();
                        } else {
                            this.log(`Turn ${nextTurn} started`);

                            // Update session
                            db.run(`
                                UPDATE sessions
                                SET total_turns = total_turns + 1,
                                    last_activity_at = ?
                                WHERE session_id = ?
                            `, [now, session_id]);

                            // Detect and save intent if prompt is available
                            if (prompt && prompt.trim()) {
                                const detectedIntent = this.detectIntent(prompt);

                                db.run(`
                                    INSERT INTO session_intents (
                                        session_id, user_id, turn_number, intent_type,
                                        confidence, user_prompt, signals, detected_at
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                `, [
                                    session_id,
                                    this.userId,
                                    nextTurn,
                                    detectedIntent.intent,
                                    detectedIntent.confidence,
                                    prompt,
                                    detectedIntent.signals,
                                    now
                                ], (intentErr) => {
                                    if (intentErr) {
                                        this.log(`Error saving intent: ${intentErr.message}`);
                                    } else {
                                        this.log(`Intent detected: ${detectedIntent.intent} (confidence: ${detectedIntent.confidence})`);
                                    }
                                    db.close();
                                    resolve();
                                });
                            } else {
                                db.close();
                                resolve();
                            }
                        }
                    }.bind(this));
                });
            });
        });
    }

    async handleStop(eventData) {
        const { session_id, cwd, transcript_path } = eventData;
        const now = Date.now(); // Store in milliseconds

        return new Promise(async (resolve) => {
            const db = new sqlite3.Database(this.dbPath);

            // Get the current turn's start git HEAD
            db.get(`
                SELECT id, start_git_head FROM turns
                WHERE session_id = ? AND ended_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
            `, [session_id], async (err, turn) => {
                if (turn && turn.start_git_head) {
                    // Get all commits made during this turn
                    const commits = await this.extractGitCommitsInRange(
                        cwd || process.cwd(),
                        turn.start_git_head
                    );

                    // Save all commits
                    for (const gitInfo of commits) {
                        await this.saveGitCommit(session_id, gitInfo, turn.id);
                    }
                }

                // Parse transcript for token usage
                if (transcript_path && turn) {
                    const tokenRecords = await this.parseTranscriptTokens(transcript_path, session_id);

                    // Save token usage records
                    for (const tokenRecord of tokenRecords) {
                        await this.saveTokenUsage(session_id, turn.id, tokenRecord);
                    }
                }

                // Detect and fetch PR data from GitHub for commits with PR numbers
                if (turn) {
                    await this.detectAndFetchPRData(session_id, turn.id, cwd || process.cwd());
                }

                // Enhanced: Background scan for ALL recent PRs (including manually created ones)
                await this.backgroundScanAllRecentPRs(session_id, cwd || process.cwd());

                // Close the current turn
                db.run(`
                    UPDATE turns
                    SET ended_at = ?
                    WHERE session_id = ? AND ended_at IS NULL
                `, [now, session_id], function(err) {
                    if (err) {
                        this.log(`Error closing turn: ${err.message}`);
                    } else if (this.changes > 0) {
                        this.log('Turn completed normally');
                    }

                    // Update session activity
                    db.run(`
                        UPDATE sessions
                        SET last_activity_at = ?
                        WHERE session_id = ?
                    `, [now, session_id]);

                    db.close();
                    resolve();
                }.bind(this));
            });
        });
    }

    async getCurrentHeadSha(repoPath) {
        try {
            return execSync('git rev-parse HEAD', this.getExecOptions(repoPath)).trim();
        } catch (error) {
            this.logError('getCurrentHeadSha', error, `repoPath: ${repoPath}`);
            return null;
        }
    }

    async extractGitCommitsInRange(repoPath, startSha) {
        try {
            const execOptions = this.getExecOptions(repoPath);

            // Get current HEAD
            const currentHead = execSync('git rev-parse HEAD', execOptions).trim();

            // If no change, return empty
            if (startSha === currentHead) {
                return [];
            }

            // Get all commit SHAs between startSha and HEAD (exclusive of startSha)
            const commitShas = execSync(`git rev-list ${startSha}..HEAD`, execOptions)
                .trim()
                .split('\n')
                .filter(sha => sha.length > 0);

            // Get details for each commit
            const commits = [];
            for (const commitSha of commitShas) {
                // Check if already tracked
                const alreadyTracked = await this.isCommitTracked(commitSha);
                if (alreadyTracked) {
                    continue;
                }

                const branchName = execSync('git rev-parse --abbrev-ref HEAD', execOptions).trim();
                const commitMessage = execSync(`git log -1 --format=%B ${commitSha}`, execOptions).trim();
                const authorName = execSync(`git log -1 --format=%an ${commitSha}`, execOptions).trim();
                const authorEmail = execSync(`git log -1 --format=%ae ${commitSha}`, execOptions).trim();
                const committedAt = parseInt(execSync(`git log -1 --format=%ct ${commitSha}`, execOptions).trim()) * 1000;

                // Get remote URL
                let remoteUrl = null;
                try {
                    remoteUrl = execSync('git config --get remote.origin.url', execOptions).trim();
                } catch (e) {
                    // No remote configured
                }

                // Get stats for this commit
                let filesChanged = 0, insertions = 0, deletions = 0;
                try {
                    const stats = execSync(`git show --stat --format="" ${commitSha}`, execOptions);
                    const matches = stats.match(/(\d+) files? changed(?:, (\d+) insertions?)?(?:, (\d+) deletions?)?/);
                    if (matches) {
                        filesChanged = parseInt(matches[1]) || 0;
                        insertions = parseInt(matches[2]) || 0;
                        deletions = parseInt(matches[3]) || 0;
                    }
                } catch (e) {
                    // Stats not available
                }

                // Check if PR number is in commit message
                let prNumber = null;
                const prMatch = commitMessage.match(/#(\d+)/);
                if (prMatch) {
                    prNumber = parseInt(prMatch[1]);
                }

                commits.push({
                    commitSha,
                    branchName,
                    commitMessage,
                    authorName,
                    authorEmail,
                    committedAt,
                    repoPath,
                    remoteUrl,
                    prNumber,
                    filesChanged,
                    insertions,
                    deletions
                });
            }

            return commits;

        } catch (error) {
            // Not a git repo or git command failed
            this.log(`Error extracting git commits: ${error.message}`);
            return [];
        }
    }

    async isCommitTracked(commitSha) {
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);
            db.get('SELECT id FROM git_commits WHERE commit_sha = ?', [commitSha], (err, row) => {
                db.close();
                resolve(!!row);
            });
        });
    }

    async saveGitCommit(sessionId, gitInfo, turnId = null) {
        return new Promise(async (resolve) => {
            const db = new sqlite3.Database(this.dbPath);

            db.run(`
                INSERT INTO git_commits (
                    session_id, user_id, turn_id, commit_sha, branch_name,
                    commit_message, author_name, author_email, committed_at,
                    repo_path, remote_url, pr_number, files_changed,
                    insertions, deletions
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                sessionId,
                this.userId,
                turnId,
                gitInfo.commitSha,
                gitInfo.branchName,
                gitInfo.commitMessage,
                gitInfo.authorName,
                gitInfo.authorEmail,
                gitInfo.committedAt,
                gitInfo.repoPath,
                gitInfo.remoteUrl,
                gitInfo.prNumber,
                gitInfo.filesChanged,
                gitInfo.insertions,
                gitInfo.deletions
            ], async (err) => {
                if (err) {
                    this.log(`Error saving git commit: ${err.message}`);
                    db.close();
                    resolve();
                } else {
                    this.log(`Git commit tracked: ${gitInfo.commitSha.substring(0, 7)} on ${gitInfo.branchName}`);
                    db.close();

                    // Immediately fetch PR and CI/CD data for this branch
                    await this.fetchPRDataForBranch(sessionId, turnId, gitInfo.branchName, gitInfo.repoPath);

                    resolve();
                }
            });
        });
    }

    async fetchPRDataForBranch(sessionId, turnId, branchName, repoPath) {
        /**
         * Fetch PR and CI/CD data immediately after a commit
         */
        try {
            // Skip main/master branches
            if (branchName === 'main' || branchName === 'master') {
                return;
            }

            this.log(`Auto-fetching PR data for branch: ${branchName}`);

            // Find PR for this branch
            const prNumber = await this.findPRForBranch(branchName, repoPath);

            if (prNumber) {
                // Fetch PR data from GitHub
                const prData = await this.fetchPRDataFromGitHub(prNumber, repoPath);
                if (prData) {
                    // Save PR data
                    const prId = await this.savePRData(sessionId, turnId, prData, repoPath);

                    if (prId) {
                        // Fetch and save PR-level check runs
                        const checks = await this.fetchPRChecksFromGitHub(prNumber, repoPath);
                        await this.savePRChecks(prId, prNumber, checks);

                        // Fetch and save SonarQube metrics
                        const sonarMetrics = await this.fetchSonarQubeMetrics(prNumber, repoPath);
                        await this.saveSonarQubeMetrics(sessionId, sonarMetrics);

                        // Update git_commits to link them to this PR
                        await this.linkCommitsToPR(sessionId, branchName, prNumber);

                        // Fetch commit-level checks for commits on this branch
                        await this.fetchCommitLevelChecks(sessionId, branchName, repoPath);
                    }
                }
            }
        } catch (error) {
            this.log(`Error auto-fetching PR data: ${error.message}`);
        }
    }

    async scheduleRepositoryScan(cwd) {
        /**
         * Schedule a repository-wide scan to capture ALL activity (human + Claude)
         */
        try {
            const now = Date.now();
            const lastScanKey = `last_repo_scan_${this.getRepoIdentifier(cwd)}`;
            const lastScan = this.getLastScanTime(lastScanKey);

            // Only scan once per 6 hours to avoid duplicate work
            if (now - lastScan < 6 * 60 * 60 * 1000) {
                this.log(`📊 Repository scan skipped - last scan ${Math.round((now - lastScan) / (60 * 1000))} minutes ago`);
                return;
            }

            this.log(`🔍 Starting repository-wide scan for complete metrics...`);
            await this.scanRepositoryForAllActivity(cwd);
            this.setLastScanTime(lastScanKey, now);
            this.log(`✅ Repository scan completed`);

        } catch (error) {
            this.log(`Error in repository scan: ${error.message}`);
        }
    }

    async forceRepositoryScan(cwd) {
        /**
         * Force immediate repository scan without cooldown (for PR creation events)
         */
        try {
            this.log(`🚀 FORCE SCAN: Immediate repository scan triggered for PR/push events`);
            await this.scanRepositoryForAllActivity(cwd);

            const now = Date.now();
            const lastScanKey = `last_repo_scan_${this.getRepoIdentifier(cwd)}`;
            this.setLastScanTime(lastScanKey, now);
            this.log(`✅ Force scan completed - PRs should now be immediately tracked`);

        } catch (error) {
            this.log(`Error in force repository scan: ${error.message}`);
        }
    }

    async scanRepositoryForAllActivity(cwd) {
        /**
         * Fetch ALL repository activity from GitHub API and match with Claude data
         */
        try {
            const execOptions = this.getExecOptions(cwd, 30000);

            // 1. Fetch all recent commits (last 100)
            this.log(`📥 Fetching all commits from GitHub API...`);
            const commitsJson = execSync('gh api repos/:owner/:repo/commits?per_page=100', execOptions);
            const allCommits = JSON.parse(commitsJson);

            // 2. Fetch all PRs (open + recently closed)
            this.log(`📥 Fetching all PRs from GitHub API...`);
            const prsJson = execSync('gh api repos/:owner/:repo/pulls?state=all&per_page=50', execOptions);
            const allPRs = JSON.parse(prsJson);

            // 3. Process commits and identify human vs Claude
            let humanCommits = 0, claudeCommits = 0;
            for (const commit of allCommits) {
                const sha = commit.sha;
                const existing = await this.getCommitBySHA(sha);

                if (!existing) {
                    // This is a human commit (not tracked by Claude)
                    await this.storeHumanCommit(commit, cwd);
                    humanCommits++;
                } else if (existing.session_id) {
                    claudeCommits++;
                }
            }

            // 4. Process PRs and identify human vs Claude
            let humanPRs = 0, claudePRs = 0;
            for (const pr of allPRs) {
                const existing = await this.getPRByNumber(pr.number);

                if (!existing) {
                    // This is a human-created PR
                    await this.storeHumanPR(pr, cwd);
                    humanPRs++;
                } else {
                    claudePRs++;
                }
            }

            this.log(`📊 Scan complete: Found ${humanCommits} human commits, ${claudeCommits} Claude commits`);
            this.log(`📊 Scan complete: Found ${humanPRs} human PRs, ${claudePRs} Claude PRs`);

        } catch (error) {
            this.log(`Error scanning repository: ${error.message}`);
        }
    }

    getRepoIdentifier(cwd) {
        return cwd ? cwd.split('/').pop() : 'unknown';
    }

    getLastScanTime(key) {
        try {
            const fs = require('fs');
            const cachePath = `/tmp/claude_scan_${key}.json`;
            if (fs.existsSync(cachePath)) {
                return JSON.parse(fs.readFileSync(cachePath, 'utf8')).lastScan || 0;
            }
        } catch (error) {
            // Ignore cache errors
        }
        return 0;
    }

    setLastScanTime(key, time) {
        try {
            const fs = require('fs');
            const cachePath = `/tmp/claude_scan_${key}.json`;
            fs.writeFileSync(cachePath, JSON.stringify({ lastScan: time }));
        } catch (error) {
            // Ignore cache errors
        }
    }

    async getCommitBySHA(sha) {
        /**
         * Check if commit already exists in database
         */
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);
            db.get('SELECT * FROM git_commits WHERE commit_sha = ?', [sha], (err, row) => {
                db.close();
                resolve(row || null);
            });
        });
    }

    async getPRByNumber(prNumber) {
        /**
         * Check if PR already exists in database
         */
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);
            db.get('SELECT * FROM pull_requests WHERE pr_number = ? LIMIT 1', [prNumber], (err, row) => {
                db.close();
                resolve(row || null);
            });
        });
    }

    async storeHumanCommit(githubCommit, cwd) {
        /**
         * Store a commit from GitHub API that wasn't tracked by Claude (human commit)
         */
        try {
            const execOptions = this.getExecOptions(cwd);

            // Get additional commit details
            let branchName = 'unknown';
            let remoteUrl = null;
            try {
                // Try to get branch info (may not work for old commits)
                branchName = execSync('git rev-parse --abbrev-ref HEAD', execOptions).trim();
                remoteUrl = execSync('git config --get remote.origin.url', execOptions).trim();
            } catch (e) {
                // Use defaults if git commands fail
            }

            const now = Date.now();
            const committedAt = new Date(githubCommit.commit.author.date).getTime();

            return new Promise((resolve) => {
                const db = new sqlite3.Database(this.dbPath);
                db.run(`
                    INSERT INTO git_commits (
                        commit_sha, session_id, user_id, turn_id, branch_name,
                        commit_message, author_name, author_email, committed_at,
                        remote_url, insertions, deletions, files_changed,
                        data_source, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    githubCommit.sha,
                    null, // No session_id = human commit
                    this.userId,
                    null,
                    branchName,
                    githubCommit.commit.message,
                    githubCommit.commit.author.name,
                    githubCommit.commit.author.email,
                    committedAt,
                    remoteUrl,
                    0, // GitHub API doesn't provide line counts in basic call
                    0,
                    0,
                    'github_api',
                    now
                ], function(err) {
                    if (err && !err.message.includes('UNIQUE constraint failed')) {
                        console.log(`Error storing human commit: ${err.message}`);
                    }
                    db.close();
                    resolve();
                });
            });
        } catch (error) {
            this.log(`Error storing human commit ${githubCommit.sha}: ${error.message}`);
        }
    }

    async storeHumanPR(githubPR, cwd) {
        /**
         * Store a PR from GitHub API that wasn't tracked by Claude (human PR)
         */
        try {
            const now = Date.now();
            const createdAt = new Date(githubPR.created_at).getTime();
            const mergedAt = githubPR.merged_at ? new Date(githubPR.merged_at).getTime() : null;

            return new Promise((resolve) => {
                const db = new sqlite3.Database(this.dbPath);
                db.run(`
                    INSERT OR REPLACE INTO pull_requests (
                        session_id, user_id, turn_id, pr_number, pr_title, pr_url,
                        pr_state, is_draft, base_branch, head_branch, mergeable,
                        merged, merged_at, files_changed, additions, deletions,
                        commits_count, data_source, created_at, fetched_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    null, // No session_id = human PR
                    this.userId,
                    null,
                    githubPR.number,
                    githubPR.title,
                    githubPR.html_url,
                    githubPR.state.toUpperCase(),
                    githubPR.draft ? 1 : 0,
                    githubPR.base.ref,
                    githubPR.head.ref,
                    githubPR.mergeable || 'UNKNOWN',
                    githubPR.merged ? 1 : 0,
                    mergedAt,
                    githubPR.changed_files || 0,
                    githubPR.additions || 0,
                    githubPR.deletions || 0,
                    githubPR.commits || 0,
                    'github_api',
                    createdAt,
                    now
                ], function(err) {
                    if (err && !err.message.includes('UNIQUE constraint failed')) {
                        console.log(`Error storing human PR: ${err.message}`);
                    }
                    db.close();
                    resolve();
                });
            });
        } catch (error) {
            this.log(`Error storing human PR #${githubPR.number}: ${error.message}`);
        }
    }

    calculateTokenCost(usage, modelName) {
        // Claude 3.5 Sonnet v2 pricing (per million tokens)
        const PRICING = {
            'claude-sonnet-4-5-20250929': {
                input: 3.00,
                output: 15.00,
                cache_write: 3.75,
                cache_read: 0.30
            }
        };

        const pricing = PRICING[modelName] || PRICING['claude-sonnet-4-5-20250929'];

        const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
        const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;
        const cacheWriteCost = (usage.cache_creation_input_tokens / 1_000_000) * pricing.cache_write;
        const cacheReadCost = (usage.cache_read_input_tokens / 1_000_000) * pricing.cache_read;

        return {
            input_cost_usd: inputCost,
            output_cost_usd: outputCost,
            cache_write_cost_usd: cacheWriteCost,
            cache_read_cost_usd: cacheReadCost,
            total_cost_usd: inputCost + outputCost + cacheWriteCost + cacheReadCost
        };
    }

    async parseTranscriptTokens(transcriptPath, sessionId) {
        try {
            const fs = require('fs');
            const readline = require('readline');

            if (!fs.existsSync(transcriptPath)) {
                this.log(`Transcript file not found: ${transcriptPath}`);
                return [];
            }

            const tokenRecords = [];
            const fileStream = fs.createReadStream(transcriptPath);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            for await (const line of rl) {
                try {
                    const entry = JSON.parse(line);

                    // Look for assistant messages with usage data
                    if (entry.type === 'assistant' && entry.message && entry.message.usage) {
                        const usage = entry.message.usage;
                        const modelName = entry.message.model;

                        const costs = this.calculateTokenCost(usage, modelName);

                        const totalTokens =
                            (usage.input_tokens || 0) +
                            (usage.output_tokens || 0) +
                            (usage.cache_creation_input_tokens || 0) +
                            (usage.cache_read_input_tokens || 0);

                        tokenRecords.push({
                            message_id: entry.message.id,
                            input_tokens: usage.input_tokens || 0,
                            output_tokens: usage.output_tokens || 0,
                            cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
                            cache_read_input_tokens: usage.cache_read_input_tokens || 0,
                            ephemeral_5m_input_tokens: usage.cache_creation?.ephemeral_5m_input_tokens || 0,
                            ephemeral_1h_input_tokens: usage.cache_creation?.ephemeral_1h_input_tokens || 0,
                            total_tokens: totalTokens,
                            model_name: modelName,
                            timestamp: new Date(entry.timestamp).getTime(),
                            ...costs
                        });
                    }
                } catch (parseErr) {
                    // Skip invalid JSON lines
                }
            }

            return tokenRecords;

        } catch (error) {
            this.log(`Error parsing transcript: ${error.message}`);
            return [];
        }
    }

    async saveTokenUsage(sessionId, turnId, tokenRecord) {
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);
            const now = Date.now();

            // Check if this message_id already exists to avoid duplicates
            db.get(`
                SELECT id FROM token_usage WHERE message_id = ?
            `, [tokenRecord.message_id], (err, existing) => {
                if (existing) {
                    this.log(`Token usage already tracked for message: ${tokenRecord.message_id}`);
                    db.close();
                    resolve();
                    return;
                }

                db.run(`
                    INSERT INTO token_usage (
                        session_id, user_id, turn_id, message_id,
                        input_tokens, output_tokens, cache_creation_input_tokens,
                        cache_read_input_tokens, ephemeral_5m_input_tokens,
                        ephemeral_1h_input_tokens, total_tokens,
                        input_cost_usd, output_cost_usd, cache_write_cost_usd,
                        cache_read_cost_usd, total_cost_usd, model_name, recorded_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    sessionId,
                    this.userId,
                    turnId,
                    tokenRecord.message_id,
                    tokenRecord.input_tokens,
                    tokenRecord.output_tokens,
                    tokenRecord.cache_creation_input_tokens,
                    tokenRecord.cache_read_input_tokens,
                    tokenRecord.ephemeral_5m_input_tokens,
                    tokenRecord.ephemeral_1h_input_tokens,
                    tokenRecord.total_tokens,
                    tokenRecord.input_cost_usd,
                    tokenRecord.output_cost_usd,
                    tokenRecord.cache_write_cost_usd,
                    tokenRecord.cache_read_cost_usd,
                    tokenRecord.total_cost_usd,
                    tokenRecord.model_name,
                    now
                ], (err) => {
                    if (err) {
                        this.log(`Error saving token usage: ${err.message}`);
                    } else {
                        this.log(`Token usage tracked: ${tokenRecord.total_tokens} tokens, $${tokenRecord.total_cost_usd.toFixed(6)}`);
                    }
                    db.close();
                    resolve();
                });
            });
        });
    }

    async fetchPRDataFromGitHub(prNumber, repoPath = null) {
        /**
         * Fetch PR data from GitHub using gh CLI
         */
        try {
            const execOptions = this.getExecOptions(repoPath);

            const fields = 'number,title,url,state,isDraft,mergeable,mergedAt,baseRefName,headRefName,additions,deletions,changedFiles,commits';
            const result = execSync(`gh pr view ${prNumber} --json ${fields}`, execOptions);

            const prData = JSON.parse(result);
            this.log(`Fetched PR #${prNumber} from GitHub: ${prData.title}`);

            return prData;
        } catch (error) {
            this.logError('fetchPRDataFromGitHub', error, `PR #${prNumber}`);
            return null;
        }
    }

    async fetchPRChecksFromGitHub(prNumber, repoPath = null) {
        /**
         * Fetch CI/CD check runs for a PR using gh CLI
         */
        try {
            const execOptions = this.getExecOptions(repoPath);

            // gh pr checks outputs plain text, not JSON
            const result = execSync(`gh pr checks ${prNumber}`, execOptions);

            // Parse the text output
            const checks = [];
            const lines = result.trim().split('\n');

            for (const line of lines) {
                if (!line.trim()) continue;

                // Format: "check_name    status    duration    url"
                // Example: "build	pass	12s	https://github.com/.../actions/runs/123"
                const parts = line.split('\t').map(p => p.trim());

                if (parts.length >= 3) {
                    const check = {
                        name: parts[0],
                        status: parts[1] === 'pass' ? 'completed' : 'in_progress',
                        conclusion: parts[1] === 'pass' ? 'success' : (parts[1] === 'fail' ? 'failure' : parts[1]),
                        startedAt: null, // Not available in basic output
                        completedAt: null, // Not available in basic output
                        detailsUrl: parts[3] || null,
                        duration_text: parts[2] || null
                    };

                    // Parse duration if available (e.g., "12s" -> 12 seconds)
                    if (check.duration_text && check.duration_text.match(/\d+s/)) {
                        check.duration_seconds = parseInt(check.duration_text.replace('s', ''));
                    }

                    checks.push(check);
                }
            }

            this.log(`Fetched ${checks.length} check runs for PR #${prNumber}`);
            return checks;
        } catch (error) {
            this.log(`Failed to fetch checks for PR #${prNumber}: ${error.message}`);
            return [];
        }
    }

    async fetchCommitChecksFromGitHub(commitSha, repoPath = null) {
        /**
         * Fetch CI/CD check runs for a specific commit using gh API
         */
        try {
            const { execSync } = require('child_process');
            const execOptions = {
                cwd: repoPath || process.cwd(),
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                timeout: 10000
            };

            // Use gh api to get check runs for a specific commit
            const result = execSync(`gh api repos/{owner}/{repo}/commits/${commitSha}/check-runs --jq '.check_runs[] | {name: .name, status: .status, conclusion: .conclusion, started_at: .started_at, completed_at: .completed_at, details_url: .details_url, check_suite_id: .check_suite.id}'`, execOptions);

            if (!result.trim()) {
                return [];
            }

            // Parse line-delimited JSON
            const checks = result.trim().split('\n').map(line => JSON.parse(line));
            this.log(`Fetched ${checks.length} check runs for commit ${commitSha.substring(0, 7)}`);

            return checks;
        } catch (error) {
            this.logError('fetchCommitChecksFromGitHub', error, `commit ${commitSha}`);
            return [];
        }
    }

    async fetchPRComments(prNumber, repoPath = null) {
        /**
         * Fetch PR comments from GitHub using gh CLI
         */
        try {
            const { execSync } = require('child_process');
            const execOptions = {
                cwd: repoPath || process.cwd(),
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                timeout: 10000
            };

            const fields = 'id,body,author,createdAt,updatedAt,url';
            const result = execSync(`gh api repos/{owner}/{repo}/issues/${prNumber}/comments --jq '.[] | {id: .id, body: .body, user: {login: .user.login}, created_at: .created_at, updated_at: .updated_at, html_url: .html_url}'`, execOptions);

            if (!result.trim()) {
                return [];
            }

            // Parse line-delimited JSON
            const comments = result.trim().split('\n').map(line => JSON.parse(line));
            this.log(`Fetched ${comments.length} comments for PR #${prNumber}`);

            return comments;
        } catch (error) {
            this.log(`Failed to fetch comments for PR #${prNumber}: ${error.message}`);
            return [];
        }
    }

    async fetchSonarQubeMetrics(prNumber, repoPath = null) {
        /**
         * Fetch and parse SonarQube metrics from PR comments AND GitHub Checks
         */
        try {
            const sonarMetrics = [];

            // 1. Check PR comments (existing functionality)
            const comments = await this.fetchPRComments(prNumber, repoPath);
            for (const comment of comments) {
                if (this.sonarParser.isSonarQubeComment(comment)) {
                    const metrics = this.sonarParser.parseMetrics(comment);
                    if (metrics) {
                        metrics.pr_number = prNumber;
                        metrics.source = 'comment';
                        sonarMetrics.push(metrics);
                    }
                }
            }

            // 2. Check GitHub Check Runs for SonarQube (NEW)
            const checks = await this.fetchPRChecksFromGitHub(prNumber, repoPath);
            for (const check of checks) {
                if (this.isSonarQubeCheck(check)) {
                    const metrics = await this.parseSonarQubeFromCheck(check, prNumber, repoPath);
                    if (metrics) {
                        metrics.pr_number = prNumber;
                        metrics.source = 'check_run';
                        sonarMetrics.push(metrics);
                    }
                }
            }

            this.log(`Found ${sonarMetrics.length} SonarQube metrics for PR #${prNumber} (${sonarMetrics.filter(m => m.source === 'comment').length} from comments, ${sonarMetrics.filter(m => m.source === 'check_run').length} from checks)`);
            return sonarMetrics;
        } catch (error) {
            this.log(`Failed to fetch SonarQube metrics for PR #${prNumber}: ${error.message}`);
            return [];
        }
    }

    isSonarQubeCheck(check) {
        /**
         * Determine if a GitHub check run is from SonarQube
         */
        if (!check || !check.name) return false;

        const sonarNames = [
            'sonarqube',
            'sonar',
            'sonarcloud',
            'quality gate',
            'code quality',
            'static analysis'
        ];

        const checkName = check.name.toLowerCase();
        return sonarNames.some(name => checkName.includes(name));
    }

    async parseSonarQubeFromCheck(check, prNumber, repoPath) {
        /**
         * Parse SonarQube metrics from GitHub Check Run data
         */
        try {
            if (!check) return null;

            // Basic metrics from check run
            const metrics = {
                quality_gate_status: check.conclusion === 'success' ? 'PASSED' : 'FAILED',
                check_name: check.name,
                check_status: check.status,
                check_conclusion: check.conclusion,
                started_at: check.started_at,
                completed_at: check.completed_at,
                details_url: check.details_url,
                check_suite_id: check.check_suite_id
            };

            // Try to fetch detailed check run info if available
            if (check.details_url) {
                try {
                    // Attempt to get more detailed metrics from check run details
                    const execOptions = this.getExecOptions(repoPath);
                    const detailedCheck = execSync(`gh api ${check.details_url.replace('https://api.github.com', '')} --jq '{output: .output, pull_requests: .pull_requests}'`, execOptions);

                    if (detailedCheck.trim()) {
                        const details = JSON.parse(detailedCheck.trim());

                        // Parse output for SonarQube metrics
                        if (details.output && details.output.summary) {
                            // Look for quality gate info in summary
                            const summary = details.output.summary.toLowerCase();
                            if (summary.includes('quality gate')) {
                                if (summary.includes('passed') || summary.includes('success')) {
                                    metrics.quality_gate_status = 'PASSED';
                                } else if (summary.includes('failed') || summary.includes('error')) {
                                    metrics.quality_gate_status = 'FAILED';
                                }
                            }

                            // Extract metrics from text if available
                            const text = details.output.text || details.output.summary || '';
                            metrics.raw_output = text.substring(0, 2000); // Store first 2000 chars
                        }
                    }
                } catch (detailError) {
                    // Detailed parsing failed, use basic info
                    this.log(`Could not fetch detailed check info: ${detailError.message}`);
                }
            }

            return metrics;
        } catch (error) {
            this.logError('parseSonarQubeFromCheck', error, `check: ${check?.name}`);
            return null;
        }
    }

    async savePRData(sessionId, turnId, prData, repoPath) {
        /**
         * Save PR data to database
         */
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);
            const now = Date.now();

            // Parse mergedAt timestamp if exists
            let mergedAtMs = null;
            if (prData.mergedAt) {
                mergedAtMs = new Date(prData.mergedAt).getTime();
            }

            db.run(`
                INSERT OR REPLACE INTO pull_requests (
                    session_id, user_id, turn_id, pr_number, pr_title, pr_url,
                    pr_state, is_draft, base_branch, head_branch, mergeable,
                    merged, merged_at, files_changed, additions, deletions,
                    commits_count, created_at, fetched_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                sessionId,
                this.userId,
                turnId,
                prData.number,
                prData.title,
                prData.url,
                prData.state,
                prData.isDraft ? 1 : 0,
                prData.baseRefName,
                prData.headRefName,
                prData.mergeable,
                prData.merged ? 1 : 0,
                mergedAtMs,
                prData.changedFiles || 0,
                prData.additions || 0,
                prData.deletions || 0,
                prData.commits ? prData.commits.totalCount || 0 : 0,
                now,
                now
            ], function(err) {
                if (err) {
                    console.log(`Error saving PR data: ${err.message}`);
                    db.close();
                    resolve(null);
                } else {
                    const prId = this.lastID; // 'this' refers to the SQLite statement
                    console.log(`Saved PR #${prData.number} to database (ID: ${prId})`);
                    db.close();
                    resolve(prId);
                }
            });
        });
    }

    async savePRChecks(prId, prNumber, checks) {
        /**
         * Save PR check runs to database
         */
        if (!checks || checks.length === 0) {
            return;
        }

        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);
            const now = Date.now();

            let completed = 0;
            for (const check of checks) {
                // Calculate duration if both timestamps exist
                let durationSeconds = null;
                if (check.startedAt && check.completedAt) {
                    try {
                        const started = new Date(check.startedAt);
                        const complete = new Date(check.completedAt);
                        durationSeconds = Math.floor((completed - started) / 1000);
                    } catch (e) {
                        // Ignore parse errors
                    }
                }

                db.run(`
                    INSERT INTO pr_checks (
                        pr_id, pr_number, check_name, check_status, check_conclusion,
                        started_at, completed_at, duration_seconds, details_url, fetched_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    prId,
                    prNumber,
                    check.name,
                    check.status,
                    check.conclusion,
                    check.startedAt,
                    check.completedAt,
                    durationSeconds,
                    check.detailsUrl,
                    now
                ], (err) => {
                    if (err) {
                        this.log(`Error saving check '${check.name}': ${err.message}`);
                    }
                    completed++;
                    if (completed === checks.length) {
                        this.log(`Saved ${checks.length} check runs for PR #${prNumber}`);
                        db.close();
                        resolve();
                    }
                });
            }
        });
    }

    async saveSonarQubeMetrics(sessionId, metrics) {
        /**
         * Save SonarQube metrics to database
         */
        if (!metrics || metrics.length === 0) {
            return;
        }

        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);
            const now = Date.now();

            let completed = 0;
            for (const metric of metrics) {
                db.run(`
                    INSERT INTO sonarqube_metrics (
                        pr_number, session_id, quality_gate_status, conditions_passed, conditions_failed,
                        bugs_total, bugs_critical, bugs_major, bugs_minor,
                        vulnerabilities_total, vulnerabilities_critical, vulnerabilities_major, vulnerabilities_minor,
                        security_hotspots, code_smells, technical_debt_minutes,
                        line_coverage_percent, branch_coverage_percent, coverage_on_new_code_percent,
                        maintainability_rating, reliability_rating, security_rating,
                        duplicated_lines_percent, sonar_project_key, analysis_date,
                        comment_url, fetched_at, source, check_name, check_status,
                        check_conclusion, check_suite_id, details_url, raw_output
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    metric.pr_number,
                    sessionId,
                    metric.quality_gate_status,
                    metric.conditions_passed,
                    metric.conditions_failed,
                    metric.bugs_total,
                    metric.bugs_critical,
                    metric.bugs_major,
                    metric.bugs_minor,
                    metric.vulnerabilities_total,
                    metric.vulnerabilities_critical,
                    metric.vulnerabilities_major,
                    metric.vulnerabilities_minor,
                    metric.security_hotspots,
                    metric.code_smells,
                    metric.technical_debt_minutes,
                    metric.line_coverage_percent,
                    metric.branch_coverage_percent,
                    metric.coverage_on_new_code_percent,
                    metric.maintainability_rating,
                    metric.reliability_rating,
                    metric.security_rating,
                    metric.duplicated_lines_percent,
                    metric.sonar_project_key,
                    metric.analysis_date,
                    metric.comment_url,
                    now,
                    metric.source || 'comment',
                    metric.check_name,
                    metric.check_status,
                    metric.check_conclusion,
                    metric.check_suite_id,
                    metric.details_url,
                    metric.raw_output
                ], (err) => {
                    if (err) {
                        this.log(`Error saving SonarQube metrics for PR #${metric.pr_number}: ${err.message}`);
                    }
                    completed++;
                    if (completed === metrics.length) {
                        this.log(`Saved ${metrics.length} SonarQube metrics`);
                        db.close();
                        resolve();
                    }
                });
            }
        });
    }

    async saveCommitChecks(commitSha, sessionId, checks) {
        /**
         * Save commit-level check runs to database
         */
        if (!checks || checks.length === 0) {
            return;
        }

        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);
            const now = Date.now();

            // Check if this commit was made by Claude
            db.get(`
                SELECT session_id FROM git_commits WHERE commit_sha = ?
            `, [commitSha], (err, row) => {
                const isClaudeCommit = row && row.session_id ? 1 : 0;

                let completed = 0;
                for (const check of checks) {
                    // Calculate duration
                    let durationSeconds = null;
                    if (check.started_at && check.completed_at) {
                        try {
                            const started = new Date(check.started_at);
                            const complete = new Date(check.completed_at);
                            durationSeconds = Math.floor((complete - started) / 1000);
                        } catch (e) {
                            // Ignore
                        }
                    }

                    db.run(`
                        INSERT INTO commit_checks (
                            commit_sha, session_id, is_claude_commit, check_suite_id,
                            check_name, check_status, check_conclusion,
                            started_at, completed_at, duration_seconds, details_url, fetched_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        commitSha,
                        sessionId,
                        isClaudeCommit,
                        check.check_suite_id ? String(check.check_suite_id) : null,
                        check.name,
                        check.status,
                        check.conclusion,
                        check.started_at,
                        check.completed_at,
                        durationSeconds,
                        check.details_url,
                        now
                    ], (err) => {
                        if (err) {
                            this.log(`Error saving commit check '${check.name}': ${err.message}`);
                        }
                        completed++;
                        if (completed === checks.length) {
                            this.log(`Saved ${checks.length} check runs for commit ${commitSha.substring(0, 7)} (Claude: ${isClaudeCommit})`);
                            db.close();
                            resolve();
                        }
                    });
                }
            });
        });
    }

    async handleGitHubPRCommand(sessionId, command, output, cwd) {
        /**
         * Detect and handle GitHub PR commands (gh pr create, gh pr view, etc.)
         */
        if (!command || !command.includes('gh pr')) {
            return;
        }

        this.log(`🔍 Processing GitHub PR command: ${command.substring(0, 100)}`);

        try {
            let prNumber = null;

            // Extract PR number from different command types
            if (command.match(/gh pr (view|checks|merge|close|reopen|review)/)) {
                // Commands like "gh pr view 123" or "gh pr checks 123" - number is in command
                const match = command.match(/gh pr \w+ (\d+)/) || command.match(/gh pr \w+$/);
                if (match && match[1]) {
                    prNumber = parseInt(match[1]);
                } else if (command.includes('gh pr checks') && !match) {
                    // Handle "gh pr checks" without number - get current branch's PR
                    try {
                        const { execSync } = require('child_process');
                        const branchName = execSync('git rev-parse --abbrev-ref HEAD', {
                            cwd: cwd || process.cwd(),
                            encoding: 'utf8',
                            stdio: ['pipe', 'pipe', 'ignore']
                        }).trim();

                        const foundPR = await this.findPRForBranch(branchName, cwd);
                        if (foundPR) {
                            prNumber = foundPR;
                        }
                    } catch (error) {
                        this.log(`Could not determine current branch for gh pr checks: ${error.message}`);
                    }
                }
            } else if (command.includes('gh pr create')) {
                // For "gh pr create", extract PR number from output
                let outputString = '';
                if (output) {
                    if (typeof output === 'string') {
                        outputString = output;
                    } else if (output.stdout) {
                        outputString = output.stdout;
                    } else if (typeof output === 'object') {
                        outputString = JSON.stringify(output);
                    }
                }

                if (outputString) {
                    // Output typically contains URL like https://github.com/owner/repo/pull/123
                    const urlMatch = outputString.match(/https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/(\d+)/);
                    if (urlMatch) {
                        prNumber = parseInt(urlMatch[1]);
                        this.log(`🎉 New PR created: #${prNumber} - will fetch data immediately`);
                    }
                }
            } else if (command.includes('gh pr list')) {
                // Skip list commands - too many PRs
                return;
            }

            if (!prNumber) {
                this.log(`❌ Could not extract PR number from gh command: ${command.substring(0, 100)}`);
                this.log(`❌ Output type: ${typeof output}, Output: ${JSON.stringify(output).substring(0, 200)}`);
                return;
            }

            this.log(`Detected GitHub PR command for PR #${prNumber}`);

            // Get current turn
            const db = new sqlite3.Database(this.dbPath);
            db.get(`
                SELECT id FROM turns
                WHERE session_id = ? AND ended_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
            `, [sessionId], async (err, turn) => {
                db.close();

                const turnId = turn ? turn.id : null;

                // Fetch PR data from GitHub
                const prData = await this.fetchPRDataFromGitHub(prNumber, cwd);
                if (prData) {
                    // Save PR data
                    const prId = await this.savePRData(sessionId, turnId, prData, cwd);

                    if (prId) {
                        // Fetch and save check runs
                        this.log(`🔍 Fetching CI/CD checks for PR #${prNumber}...`);
                        const checks = await this.fetchPRChecksFromGitHub(prNumber, cwd);
                        this.log(`🔍 Got ${checks ? checks.length : 0} checks, saving with prId=${prId}...`);
                        await this.savePRChecks(prId, prNumber, checks);
                        this.log(`✅ Saved ${checks ? checks.length : 0} CI/CD checks`);

                        // Fetch and save SonarQube metrics
                        const sonarMetrics = await this.fetchSonarQubeMetrics(prNumber, cwd);
                        await this.saveSonarQubeMetrics(sessionId, sonarMetrics);

                        // Link existing commits to this PR by matching SHAs
                        await this.linkCommitsToPR(sessionId, prData.headRefName, prNumber);

                        // Also link commits by SHA from PR data
                        if (prData.commits && prData.commits.length > 0) {
                            await this.linkCommitsBySHA(prData.commits, prNumber);
                        }

                        this.log(`✅ PR #${prNumber} data collection complete`);
                    }
                }
            });

        } catch (error) {
            this.log(`Error handling GitHub PR command: ${error.message}`);
        }
    }

    async findPRForBranch(branchName, repoPath) {
        /**
         * Find PR associated with a branch using gh CLI
         */
        try {
            const { execSync } = require('child_process');
            const execOptions = {
                cwd: repoPath || process.cwd(),
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                timeout: 10000
            };

            // List PRs for this branch head
            const result = execSync(`gh pr list --head ${branchName} --json number,title,url,state`, execOptions);
            const prs = JSON.parse(result);

            if (prs && prs.length > 0) {
                // Return the first PR (usually there's only one per branch)
                this.log(`Found PR #${prs[0].number} for branch ${branchName}`);
                return prs[0].number;
            }

            return null;
        } catch (error) {
            this.log(`No PR found for branch ${branchName}: ${error.message}`);
            return null;
        }
    }

    async backgroundScanAllRecentPRs(sessionId, repoPath) {
        /**
         * Enhanced: Scan ALL recent PRs in the repo (not just session-related ones)
         * and check if they contain Claude-generated commits
         */
        try {
            this.log('🔍 Starting background scan for recent PRs...');

            const execOptions = this.getExecOptions(repoPath);

            // Get all PRs from last 30 days (both open and recently closed)
            const result = execSync(`gh pr list --limit 50 --state all --json number,title,headRefName,createdAt,closedAt,mergedAt --jq '.[] | select(.createdAt > (now - 30*24*3600) or (.closedAt // .mergedAt // empty) > (now - 7*24*3600))'`, execOptions);

            if (!result.trim()) {
                this.log('📋 No recent PRs found in background scan');
                return;
            }

            const recentPRs = result.trim().split('\n').map(line => JSON.parse(line));
            this.log(`📊 Found ${recentPRs.length} recent PRs to analyze`);

            for (const pr of recentPRs) {
                await this.analyzeAndProcessPR(pr.number, pr, sessionId, repoPath);
            }

            this.log(`✅ Background PR scan complete: analyzed ${recentPRs.length} PRs`);

        } catch (error) {
            this.log(`⚠️  Background PR scan failed: ${error.message}`);
        }
    }

    async analyzeAndProcessPR(prNumber, prData, currentSessionId, repoPath) {
        /**
         * Analyze a specific PR to see if it contains Claude-generated commits
         * and process SonarQube metrics if so
         */
        try {
            const db = this.getDbConnection();

            return new Promise(async (resolve) => {
                // Get all commits in this PR
                const prCommits = await this.getPRCommits(prNumber, repoPath);
                if (!prCommits || prCommits.length === 0) {
                    db.close();
                    resolve();
                    return;
                }

                // Check if any commits in this PR are from Claude sessions
                const commitShas = prCommits.map(c => c.sha);
                const placeholders = commitShas.map(() => '?').join(',');

                db.all(`
                    SELECT DISTINCT session_id, commit_sha
                    FROM git_commits
                    WHERE commit_sha IN (${placeholders})
                    AND session_id IS NOT NULL
                `, commitShas, async (err, claudeCommits) => {
                    if (err) {
                        this.logError('analyzeAndProcessPR', err, `PR #${prNumber}`);
                        db.close();
                        resolve();
                        return;
                    }

                    if (!claudeCommits || claudeCommits.length === 0) {
                        // No Claude commits in this PR - skip
                        db.close();
                        resolve();
                        return;
                    }

                    this.log(`🎯 Found PR #${prNumber} with ${claudeCommits.length} Claude commits from ${new Set(claudeCommits.map(c => c.session_id)).size} sessions`);

                    // Check if we've already processed SonarQube metrics for this PR
                    db.get(`
                        SELECT COUNT(*) as count
                        FROM sonarqube_metrics
                        WHERE pr_number = ?
                    `, [prNumber], async (err, existing) => {
                        const alreadyProcessed = existing && existing.count > 0;

                        if (alreadyProcessed) {
                            this.log(`📋 PR #${prNumber} already has SonarQube metrics - skipping`);
                        } else {
                            // Fetch and save SonarQube metrics for this Claude-related PR
                            this.log(`📊 Fetching SonarQube metrics for PR #${prNumber} (contains Claude code)`);

                            const sonarMetrics = await this.fetchSonarQubeMetrics(prNumber, repoPath);
                            if (sonarMetrics && sonarMetrics.length > 0) {
                                // Use the primary Claude session ID for attribution
                                const primarySessionId = claudeCommits[0].session_id;
                                await this.saveSonarQubeMetrics(primarySessionId, sonarMetrics);
                                this.log(`✅ Saved ${sonarMetrics.length} SonarQube metrics for PR #${prNumber} (attributed to session ${primarySessionId})`);
                            } else {
                                this.log(`📋 No SonarQube metrics found for PR #${prNumber}`);
                            }
                        }

                        // Also save/update PR data if not already tracked
                        await this.savePRDataIfNeeded(prNumber, prData, claudeCommits[0].session_id, repoPath);

                        db.close();
                        resolve();
                    });
                });
            });

        } catch (error) {
            this.logError('analyzeAndProcessPR', error, `PR #${prNumber}`);
        }
    }

    async getPRCommits(prNumber, repoPath) {
        /**
         * Get all commits in a specific PR
         */
        try {
            const execOptions = this.getExecOptions(repoPath);
            const result = execSync(`gh pr view ${prNumber} --json commits --jq '.commits[] | {sha: .oid, message: .messageHeadline}'`, execOptions);

            if (!result.trim()) {
                return [];
            }

            return result.trim().split('\n').map(line => JSON.parse(line));
        } catch (error) {
            this.log(`Failed to get commits for PR #${prNumber}: ${error.message}`);
            return [];
        }
    }

    async savePRDataIfNeeded(prNumber, prData, sessionId, repoPath) {
        /**
         * Save PR data if we haven't seen it before
         */
        try {
            const db = this.getDbConnection();

            return new Promise((resolve) => {
                db.get(`SELECT id FROM pull_requests WHERE pr_number = ?`, [prNumber], (err, existing) => {
                    if (existing) {
                        // PR already tracked
                        db.close();
                        resolve();
                        return;
                    }

                    // Save new PR data
                    const now = Date.now();
                    db.run(`
                        INSERT INTO pull_requests (
                            pr_number, session_id, title, head_ref_name, base_ref_name,
                            state, created_at, merged_at, closed_at, repo_url, pr_url
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        prNumber,
                        sessionId,
                        prData.title || 'Background discovered PR',
                        prData.headRefName || 'unknown',
                        'main', // Default base branch
                        prData.state || 'unknown',
                        prData.createdAt ? new Date(prData.createdAt).getTime() : now,
                        prData.mergedAt ? new Date(prData.mergedAt).getTime() : null,
                        prData.closedAt ? new Date(prData.closedAt).getTime() : null,
                        null, // We'll derive this from repo context
                        `https://github.com/owner/repo/pull/${prNumber}` // Generic URL
                    ], (err) => {
                        if (!err) {
                            this.log(`📝 Saved background-discovered PR #${prNumber} data`);
                        }
                        db.close();
                        resolve();
                    });
                });
            });
        } catch (error) {
            this.logError('savePRDataIfNeeded', error, `PR #${prNumber}`);
        }
    }

    async detectAndFetchPRData(sessionId, turnId, repoPath) {
        /**
         * Auto-detect PRs by checking current branch and recent commits
         */
        try {
            const db = new sqlite3.Database(this.dbPath);

            // Get branches from recent commits in this session
            db.all(`
                SELECT DISTINCT branch_name
                FROM git_commits
                WHERE session_id = ?
                ORDER BY committed_at DESC
                LIMIT 3
            `, [sessionId], async (err, rows) => {
                db.close();

                if (err || !rows || rows.length === 0) {
                    this.log('No branches found in recent commits');
                    return;
                }

                // Check each branch for associated PRs
                for (const row of rows) {
                    const branchName = row.branch_name;

                    // Skip main/master branches
                    if (branchName === 'main' || branchName === 'master') {
                        continue;
                    }

                    this.log(`Checking for PR on branch: ${branchName}`);

                    // Find PR for this branch
                    const prNumber = await this.findPRForBranch(branchName, repoPath);

                    if (prNumber) {
                        // Fetch PR data from GitHub
                        const prData = await this.fetchPRDataFromGitHub(prNumber, repoPath);
                        if (prData) {
                            // Save PR data
                            const prId = await this.savePRData(sessionId, turnId, prData, repoPath);

                            if (prId) {
                                // Fetch and save PR-level check runs
                                const checks = await this.fetchPRChecksFromGitHub(prNumber, repoPath);
                                await this.savePRChecks(prId, prNumber, checks);

                                // Fetch and save SonarQube metrics
                                const sonarMetrics = await this.fetchSonarQubeMetrics(prNumber, repoPath);
                                await this.saveSonarQubeMetrics(sessionId, sonarMetrics);

                                // Update git_commits to link them to this PR
                                await this.linkCommitsToPR(sessionId, branchName, prNumber);

                                // Fetch commit-level checks for each commit on this branch
                                await this.fetchCommitLevelChecks(sessionId, branchName, repoPath);
                            }
                        }
                    }
                }
            });

        } catch (error) {
            this.log(`Error detecting PR data: ${error.message}`);
        }
    }

    async linkCommitsToPR(sessionId, branchName, prNumber) {
        /**
         * Update git_commits to associate them with a PR number
         */
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);

            db.run(`
                UPDATE git_commits
                SET pr_number = ?
                WHERE session_id = ? AND branch_name = ? AND pr_number IS NULL
            `, [prNumber, sessionId, branchName], function(err) {
                if (err) {
                    this.log(`Error linking commits to PR: ${err.message}`);
                } else if (this.changes > 0) {
                    this.log(`Linked ${this.changes} commits to PR #${prNumber}`);
                }
                db.close();
                resolve();
            }.bind(this));
        });
    }

    async linkCommitsBySHA(prCommits, prNumber) {
        /**
         * Link commits to PR by matching SHA from PR data
         */
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);
            let linkedCount = 0;

            const processCommit = (commit) => {
                return new Promise((resolveCommit) => {
                    const sha = commit.oid || commit.sha;
                    if (!sha) {
                        resolveCommit();
                        return;
                    }

                    db.run(`
                        UPDATE git_commits
                        SET pr_number = ?
                        WHERE commit_sha = ? AND pr_number IS NULL
                    `, [prNumber, sha], function(err) {
                        if (err) {
                            this.log(`Error linking commit ${sha} to PR: ${err.message}`);
                        } else if (this.changes > 0) {
                            linkedCount++;
                        }
                        resolveCommit();
                    }.bind(this));
                });
            };

            Promise.all(prCommits.map(processCommit))
                .then(() => {
                    if (linkedCount > 0) {
                        this.log(`🔗 Linked ${linkedCount} commits to PR #${prNumber} by SHA`);
                    }
                    db.close();
                    resolve();
                })
                .catch((error) => {
                    this.log(`Error linking commits by SHA: ${error.message}`);
                    db.close();
                    resolve();
                });
        });
    }

    async autoDetectAndLinkPR(sessionId, cwd) {
        /**
         * Automatically detect if current branch has a PR and link recent commits
         */
        try {
            const { execSync } = require('child_process');
            const execOptions = {
                cwd: cwd || process.cwd(),
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                timeout: 10000
            };

            // Get current branch
            const branchName = execSync('git rev-parse --abbrev-ref HEAD', execOptions).trim();

            // Skip if on main/master
            if (branchName === 'main' || branchName === 'master') {
                return;
            }

            this.log(`🔍 Auto-detecting PR for branch: ${branchName}`);

            // Find PR for this branch
            const prNumber = await this.findPRForBranch(branchName, cwd);
            if (prNumber) {
                this.log(`🎯 Found PR #${prNumber} for branch ${branchName} - auto-linking commits`);

                // Link recent commits from this session to the PR
                await this.linkCommitsToPR(sessionId, branchName, prNumber);

                // Also fetch fresh PR data to get latest commits and link by SHA
                const prData = await this.fetchPRDataFromGitHub(prNumber, cwd);
                if (prData && prData.commits) {
                    await this.linkCommitsBySHA(prData.commits, prNumber);
                }

                // Fetch CI/CD checks
                const checks = await this.fetchPRChecksFromGitHub(prNumber, cwd);
                if (checks && checks.length > 0) {
                    // We need a PR ID, get it from database
                    const db = new sqlite3.Database(this.dbPath);
                    db.get('SELECT id FROM pull_requests WHERE pr_number = ?', [prNumber], async (err, row) => {
                        if (row) {
                            await this.savePRChecks(row.id, prNumber, checks);
                        }
                        db.close();
                    });
                }

                // Fetch and save SonarQube metrics
                const sonarMetrics = await this.fetchSonarQubeMetrics(prNumber, cwd);
                await this.saveSonarQubeMetrics(sessionId, sonarMetrics);

                this.log(`✅ Auto-linked commits to PR #${prNumber}`);
            }
        } catch (error) {
            this.log(`Error in auto-detect PR: ${error.message}`);
        }
    }

    async fetchAllCommitsFromGitHub(branchName, repoPath) {
        /**
         * Fetch ALL commits from GitHub for a branch (including manual/human commits)
         */
        try {
            const { execSync } = require('child_process');
            const execOptions = {
                cwd: repoPath || process.cwd(),
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                timeout: 15000
            };

            // Use gh api to get commits for this branch
            const result = execSync(`gh api repos/{owner}/{repo}/commits?sha=${branchName}&per_page=50 --jq '.[] | {sha: .sha, message: .commit.message, author_name: .commit.author.name, author_email: .commit.author.email, date: .commit.author.date, stats: .stats}'`, execOptions);

            if (!result.trim()) {
                return [];
            }

            // Parse line-delimited JSON
            const commits = result.trim().split('\n').map(line => JSON.parse(line));
            this.log(`Fetched ${commits.length} commits from GitHub for branch ${branchName}`);

            return commits;
        } catch (error) {
            this.log(`Failed to fetch commits from GitHub: ${error.message}`);
            return [];
        }
    }

    async backfillCommitsFromGitHub(sessionId, branchName, repoPath) {
        /**
         * Backfill git_commits table with ALL commits from GitHub (manual + Claude)
         */
        const commits = await this.fetchAllCommitsFromGitHub(branchName, repoPath);

        if (commits.length === 0) {
            return;
        }

        const db = new sqlite3.Database(this.dbPath);

        for (const commit of commits) {
            // Check if commit already exists
            await new Promise((resolve) => {
                db.get(`
                    SELECT commit_sha, session_id FROM git_commits WHERE commit_sha = ?
                `, [commit.sha], (err, existing) => {
                    if (existing) {
                        // Already tracked (probably by Claude)
                        this.log(`Commit ${commit.sha.substring(0, 7)} already tracked`);
                        resolve();
                    } else {
                        // New commit - add it as a human commit (no session_id)
                        const committedAt = new Date(commit.date).getTime();

                        db.run(`
                            INSERT INTO git_commits (
                                session_id, user_id, turn_id, commit_sha, branch_name,
                                commit_message, author_name, author_email, committed_at,
                                repo_path, remote_url, pr_number, files_changed,
                                insertions, deletions
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            null, // No session_id = human commit
                            this.userId,
                            null,
                            commit.sha,
                            branchName,
                            commit.message,
                            commit.author_name,
                            commit.author_email,
                            committedAt,
                            repoPath,
                            null,
                            null,
                            commit.stats?.total || 0,
                            commit.stats?.additions || 0,
                            commit.stats?.deletions || 0
                        ], (err) => {
                            if (err) {
                                this.log(`Error backfilling commit ${commit.sha.substring(0, 7)}: ${err.message}`);
                            } else {
                                this.log(`Backfilled human commit: ${commit.sha.substring(0, 7)}`);
                            }
                            resolve();
                        });
                    }
                });
            });
        }

        db.close();
        this.log(`Backfill complete for branch ${branchName}`);
    }

    async scanAndBackfillCommits(sessionId, repoPath) {
        /**
         * Scan git for new commits and backfill from GitHub immediately
         */
        try {
            this.log('Scanning for new commits...');
            const { execSync } = require('child_process');
            const execOptions = {
                cwd: repoPath || process.cwd(),
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            };

            // Get current branch
            const branchName = execSync('git rev-parse --abbrev-ref HEAD', execOptions).trim();
            this.log(`Current branch: ${branchName}`);

            // Get current HEAD
            const currentHead = execSync('git rev-parse HEAD', execOptions).trim();

            // Get the most recent commit we've tracked for this session
            const db = new sqlite3.Database(this.dbPath);
            db.get(`
                SELECT MAX(committed_at) as last_commit_time
                FROM git_commits
                WHERE session_id = ?
            `, [sessionId], async (err, row) => {
                db.close();

                try {
                    // Get commits - just get recent ones from HEAD
                    // extractGitCommitsInRange expects a start SHA, not a --since flag
                    const commits = await this.extractGitCommitsInRange(repoPath, 'HEAD~10');

                    this.log(`Found ${commits.length} new commits to process`);

                    // Get current turn
                    const turnDb = new sqlite3.Database(this.dbPath);
                    turnDb.get(`
                        SELECT id FROM turns
                        WHERE session_id = ? AND ended_at IS NULL
                        ORDER BY started_at DESC LIMIT 1
                    `, [sessionId], async (err, turn) => {
                        turnDb.close();
                        const turnId = turn ? turn.id : null;

                        // Save commits
                        for (const gitInfo of commits) {
                            await this.saveGitCommit(sessionId, gitInfo, turnId);
                        }

                        // Backfill from GitHub and get CI/CD data
                        if (commits.length > 0) {
                            await this.fetchPRDataForBranch(sessionId, turnId, branchName, repoPath);
                        }
                    });

                } catch (error) {
                    this.log(`Error extracting commits: ${error.message}`);
                }
            });

        } catch (error) {
            this.log(`Error in scanAndBackfillCommits: ${error.message}`);
        }
    }

    async fetchCommitLevelChecks(sessionId, branchName, repoPath) {
        /**
         * Fetch CI/CD checks for all commits on a branch
         */
        // First, backfill any missing commits from GitHub
        await this.backfillCommitsFromGitHub(sessionId, branchName, repoPath);

        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);

            // Get all commits on this branch (now includes backfilled human commits)
            db.all(`
                SELECT commit_sha, session_id
                FROM git_commits
                WHERE branch_name = ?
                ORDER BY committed_at DESC
                LIMIT 50
            `, [branchName], async (err, commits) => {
                db.close();

                if (err || !commits || commits.length === 0) {
                    resolve();
                    return;
                }

                this.log(`Fetching commit-level checks for ${commits.length} commits on ${branchName}`);

                // Fetch checks for each commit
                for (const commit of commits) {
                    const checks = await this.fetchCommitChecksFromGitHub(commit.commit_sha, repoPath);
                    if (checks && checks.length > 0) {
                        await this.saveCommitChecks(commit.commit_sha, commit.session_id, checks);
                    }
                }

                resolve();
            });
        });
    }

    // ===== GIT COMMAND ANALYSIS FUNCTIONS (from git_commit_hook.py) =====

    isGitCommand(command) {
        const gitPattern = /\bgit\s+\w+/;
        return gitPattern.test(command);
    }

    async handleGitCommand(sessionId, command, output, cwd, success) {
        if (!this.isGitCommand(command)) {
            return;
        }

        try {
            const gitInfo = this.parseGitCommand(command);

            // Get current turn
            const turn = await new Promise((resolve) => {
                const db = new sqlite3.Database(this.dbPath);
                db.get(`
                    SELECT id FROM turns
                    WHERE session_id = ? AND ended_at IS NULL
                    ORDER BY started_at DESC
                    LIMIT 1
                `, [sessionId], (err, turn) => {
                    db.close();
                    resolve(turn);
                });
            });

            const turnId = turn ? turn.id : null;

            // Create git_commands table if not exists
            await this.createGitCommandsTable();

            // Store git command record
            const gitCommandId = await this.storeGitCommandRecord(sessionId, turnId, gitInfo, cwd);

            if (gitCommandId && success) {
                // Analyze code changes for relevant commands
                if (['commit', 'add', 'diff'].includes(gitInfo.subcommand)) {
                    await this.analyzeAndStoreCodeChanges(gitCommandId, sessionId, cwd, gitInfo.subcommand);
                }

                // Extract and store actual commit data for commit commands
                if (gitInfo.subcommand === 'commit') {
                    this.log(`🔍 Detected git commit, extracting commit data...`);
                    // Small delay to ensure commit is complete, then extract data
                    setTimeout(() => {
                        this.extractAndStoreCommitData(sessionId, turnId, cwd);
                    }, 200);

                    // Auto-detect PR for this branch and link commits
                    setTimeout(() => {
                        this.autoDetectAndLinkPR(sessionId, cwd);
                    }, 1000);

                    // Schedule repository-wide scan for complete metrics
                    setTimeout(() => {
                        this.scheduleRepositoryScan(cwd);
                    }, 5000);
                }
            }

        } catch (error) {
            this.log(`Error handling git command: ${error.message}`);
        }
    }

    parseGitCommand(command) {
        // Handle compound commands
        const isCompound = /[;&|]/.test(command);

        let gitPart = command;
        if (isCompound) {
            const parts = command.split(/[;&|]+/);
            // Find the part that contains 'git commit'
            gitPart = parts.find(part => part.includes('git commit')) ||
                     parts.find(part => part.includes('git')) ||
                     command;
        }

        // Clean and parse
        gitPart = gitPart.replace(/^.*?\bgit\b/, 'git').trim();
        const parts = gitPart.split(/\s+/);

        if (parts.length < 2) {
            return {
                executable: 'git',
                subcommand: 'other',
                arguments: [],
                flags: [],
                isCompound,
                fullCommand: command
            };
        }

        const executable = parts[0];
        const subcommand = parts[1];
        const remaining = parts.slice(2);

        const flags = remaining.filter(part => part.startsWith('-'));
        const args = remaining.filter(part => !part.startsWith('-'));

        this.log(`Parsed git command: ${subcommand} from "${command}"`);

        return {
            executable,
            subcommand,
            arguments: args,
            flags,
            isCompound,
            fullCommand: command
        };
    }

    async createGitCommandsTable() {
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);

            db.run(`
                CREATE TABLE IF NOT EXISTS git_command_details (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    session_id TEXT NOT NULL,
                    turn_id INTEGER,
                    cwd TEXT NOT NULL,
                    git_subcommand TEXT NOT NULL,
                    full_command TEXT NOT NULL,
                    git_executable TEXT NOT NULL DEFAULT 'git',
                    arguments TEXT,
                    flags TEXT,
                    is_compound_command BOOLEAN NOT NULL DEFAULT 0,
                    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
                    FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE CASCADE
                )
            `, () => {
                db.run(`
                    CREATE TABLE IF NOT EXISTS code_changes (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                        git_command_id INTEGER,
                        session_id TEXT NOT NULL,
                        files_changed INTEGER DEFAULT 0,
                        lines_added INTEGER DEFAULT 0,
                        lines_removed INTEGER DEFAULT 0,
                        net_lines INTEGER DEFAULT 0,
                        file_details TEXT,
                        error_message TEXT,
                        FOREIGN KEY (git_command_id) REFERENCES git_command_details(id),
                        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
                    )
                `, () => {
                    db.close();
                    resolve();
                });
            });
        });
    }

    async storeGitCommandRecord(sessionId, turnId, gitInfo, cwd) {
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);
            const now = Date.now();

            db.run(`
                INSERT INTO git_command_details (
                    session_id, turn_id, cwd, git_subcommand, full_command,
                    git_executable, arguments, flags, is_compound_command
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                sessionId,
                turnId,
                cwd,
                gitInfo.subcommand,
                gitInfo.fullCommand,
                gitInfo.executable,
                JSON.stringify(gitInfo.arguments),
                JSON.stringify(gitInfo.flags),
                gitInfo.isCompound ? 1 : 0
            ], function(err) {
                if (err) {
                    this.log(`Error storing git command: ${err.message}`);
                    db.close();
                    resolve(null);
                } else {
                    const gitCommandId = this.lastID;
                    this.log(`Git command stored: ${gitInfo.subcommand} (ID: ${gitCommandId})`);
                    db.close();
                    resolve(gitCommandId);
                }
            }.bind(this));
        });
    }

    async analyzeCodeChanges(cwd, gitSubcommand) {
        try {
            const { execSync } = require('child_process');
            const execOptions = {
                cwd: cwd,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                timeout: 10000
            };

            let cmd;
            if (gitSubcommand === 'commit') {
                cmd = 'git diff --numstat HEAD~1 HEAD';
            } else if (gitSubcommand === 'add') {
                cmd = 'git diff --numstat --cached';
            } else {
                cmd = 'git diff --numstat';
            }

            const result = execSync(cmd, execOptions);
            const lines = result.trim().split('\n').filter(line => line.trim());

            if (lines.length === 0) {
                return {
                    files_changed: 0,
                    lines_added: 0,
                    lines_removed: 0,
                    net_lines: 0,
                    file_details: JSON.stringify([])
                };
            }

            let files_changed = 0;
            let total_added = 0;
            let total_removed = 0;
            const file_details = [];

            for (const line of lines) {
                const parts = line.split('\t');
                if (parts.length >= 3) {
                    const added_str = parts[0];
                    const removed_str = parts[1];
                    const filename = parts[2];

                    let added = 0, removed = 0, is_binary = false;

                    if (added_str === '-' || removed_str === '-') {
                        is_binary = true;
                    } else {
                        try {
                            added = parseInt(added_str) || 0;
                            removed = parseInt(removed_str) || 0;
                        } catch (e) {
                            is_binary = true;
                        }
                    }

                    files_changed += 1;
                    total_added += added;
                    total_removed += removed;

                    file_details.push({
                        filename,
                        lines_added: added,
                        lines_removed: removed,
                        is_binary
                    });
                }
            }

            return {
                files_changed,
                lines_added: total_added,
                lines_removed: total_removed,
                net_lines: total_added - total_removed,
                file_details: JSON.stringify(file_details)
            };

        } catch (error) {
            this.log(`Error analyzing code changes: ${error.message}`);
            return null;
        }
    }

    async analyzeAndStoreCodeChanges(gitCommandId, sessionId, cwd, gitSubcommand) {
        const changes = await this.analyzeCodeChanges(cwd, gitSubcommand);

        if (!changes) {
            changes = {
                files_changed: 0,
                lines_added: 0,
                lines_removed: 0,
                net_lines: 0,
                file_details: JSON.stringify([]),
                error_message: 'Failed to analyze code changes'
            };
        }

        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);

            db.run(`
                INSERT INTO code_changes (
                    git_command_id, session_id, files_changed,
                    lines_added, lines_removed, net_lines,
                    file_details, error_message
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                gitCommandId,
                sessionId,
                changes.files_changed,
                changes.lines_added,
                changes.lines_removed,
                changes.net_lines,
                changes.file_details,
                changes.error_message || null
            ], function(err) {
                if (err) {
                    this.log(`Error storing code changes: ${err.message}`);
                } else {
                    this.log(`Code changes analyzed: ${changes.files_changed} files, +${changes.lines_added}/-${changes.lines_removed} lines`);
                }
                db.close();
                resolve();
            }.bind(this));
        });
    }

    extractAndStoreCommitData(sessionId, turnId, cwd) {
        /**
         * Extract actual commit data and populate git_commits table
         */
        try {
            const { execSync } = require('child_process');
            const execOptions = {
                cwd: cwd,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                timeout: 10000
            };

            // Get current HEAD commit SHA
            const commitSha = execSync('git rev-parse HEAD', execOptions).trim();
            this.log(`Extracting commit data for: ${commitSha.substring(0, 7)}`);

            // Get commit details
            const branchName = execSync('git rev-parse --abbrev-ref HEAD', execOptions).trim();
            const commitMessage = execSync(`git log -1 --format=%B ${commitSha}`, execOptions).trim();
            const authorName = execSync(`git log -1 --format=%an ${commitSha}`, execOptions).trim();
            const authorEmail = execSync(`git log -1 --format=%ae ${commitSha}`, execOptions).trim();
            const committedAt = parseInt(execSync(`git log -1 --format=%ct ${commitSha}`, execOptions).trim()) * 1000;

            // Get remote URL
            let remoteUrl = null;
            try {
                remoteUrl = execSync('git config --get remote.origin.url', execOptions).trim();
            } catch (e) {
                // No remote configured
            }

            // Get commit stats
            let filesChanged = 0, insertions = 0, deletions = 0;
            try {
                const stats = execSync(`git show --stat --format="" ${commitSha}`, execOptions);
                const matches = stats.match(/(\d+) files? changed(?:, (\d+) insertions?)?(?:, (\d+) deletions?)?/);
                if (matches) {
                    filesChanged = parseInt(matches[1]) || 0;
                    insertions = parseInt(matches[2]) || 0;
                    deletions = parseInt(matches[3]) || 0;
                }
                this.log(`Commit stats: ${filesChanged} files, +${insertions}/-${deletions} lines`);
            } catch (e) {
                this.log(`Could not get stats for commit ${commitSha}: ${e.message}`);
            }

            // Check for PR number in commit message
            let prNumber = null;
            const prMatch = commitMessage.match(/#(\d+)/);
            if (prMatch) {
                prNumber = parseInt(prMatch[1]);
            }

            // Store commit data
            const db = new sqlite3.Database(this.dbPath);
            db.run(`
                INSERT OR IGNORE INTO git_commits (
                    session_id, user_id, turn_id, commit_sha, branch_name,
                    commit_message, author_name, author_email, committed_at,
                    repo_path, remote_url, pr_number, files_changed,
                    insertions, deletions
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                sessionId,
                this.userId || 'unknown',
                turnId,
                commitSha,
                branchName,
                commitMessage,
                authorName,
                authorEmail,
                committedAt,
                cwd,
                remoteUrl,
                prNumber,
                filesChanged,
                insertions,
                deletions
            ], function(err) {
                if (err) {
                    this.log(`Error storing commit data: ${err.message}`);
                } else if (this.changes > 0) {
                    this.log(`✅ Commit tracked: ${commitSha.substring(0, 7)} - ${filesChanged} files, +${insertions}/-${deletions} lines`);
                } else {
                    this.log(`Commit ${commitSha.substring(0, 7)} already tracked`);
                }
                db.close();
            }.bind(this));

        } catch (error) {
            this.log(`Error extracting commit data: ${error.message}`);
        }
    }

    async backfillExistingCommits(sessionId, cwd) {
        /**
         * Backfill existing commits in the repository
         */
        try {
            const { execSync } = require('child_process');
            const execOptions = {
                cwd: cwd,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                timeout: 10000
            };

            // Get all commits from this session (approximate by recent commits)
            const commits = execSync('git log --oneline -10 --format=%H', execOptions).trim().split('\n');

            this.log(`Found ${commits.length} recent commits to backfill`);

            for (const commitSha of commits) {
                if (!commitSha.trim()) continue;

                // Check if already tracked
                const db = new sqlite3.Database(this.dbPath);
                const existing = await new Promise((resolve) => {
                    db.get('SELECT id FROM git_commits WHERE commit_sha = ?', [commitSha], (err, row) => {
                        db.close();
                        resolve(row);
                    });
                });

                if (existing) {
                    this.log(`Commit ${commitSha.substring(0, 7)} already tracked`);
                    continue;
                }

                // Get commit details
                const branchName = execSync('git rev-parse --abbrev-ref HEAD', execOptions).trim();
                const commitMessage = execSync(`git log -1 --format=%B ${commitSha}`, execOptions).trim();
                const authorName = execSync(`git log -1 --format=%an ${commitSha}`, execOptions).trim();
                const authorEmail = execSync(`git log -1 --format=%ae ${commitSha}`, execOptions).trim();
                const committedAt = parseInt(execSync(`git log -1 --format=%ct ${commitSha}`, execOptions).trim()) * 1000;

                // Get remote URL
                let remoteUrl = null;
                try {
                    remoteUrl = execSync('git config --get remote.origin.url', execOptions).trim();
                } catch (e) {
                    // No remote configured
                }

                // Get commit stats
                let filesChanged = 0, insertions = 0, deletions = 0;
                try {
                    const stats = execSync(`git show --stat --format="" ${commitSha}`, execOptions);
                    const matches = stats.match(/(\d+) files? changed(?:, (\d+) insertions?)?(?:, (\d+) deletions?)?/);
                    if (matches) {
                        filesChanged = parseInt(matches[1]) || 0;
                        insertions = parseInt(matches[2]) || 0;
                        deletions = parseInt(matches[3]) || 0;
                    }
                } catch (e) {
                    this.log(`Could not get stats for commit ${commitSha}: ${e.message}`);
                }

                // Store commit data
                const db2 = new sqlite3.Database(this.dbPath);
                await new Promise((resolve) => {
                    db2.run(`
                        INSERT INTO git_commits (
                            session_id, user_id, turn_id, commit_sha, branch_name,
                            commit_message, author_name, author_email, committed_at,
                            repo_path, remote_url, files_changed,
                            insertions, deletions
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        sessionId,
                        this.userId || 'unknown',
                        null, // No turn for backfilled commits
                        commitSha,
                        branchName,
                        commitMessage,
                        authorName,
                        authorEmail,
                        committedAt,
                        cwd,
                        remoteUrl,
                        filesChanged,
                        insertions,
                        deletions
                    ], function(err) {
                        if (err) {
                            this.log(`Error backfilling commit ${commitSha}: ${err.message}`);
                        } else {
                            this.log(`Backfilled commit: ${commitSha.substring(0, 7)} - ${filesChanged} files, +${insertions}/-${deletions} lines`);
                        }
                        db2.close();
                        resolve();
                    }.bind(this));
                });
            }

        } catch (error) {
            this.log(`Error backfilling commits: ${error.message}`);
        }
    }

    // ===== COMPREHENSIVE COST ANALYSIS FUNCTIONS =====

    async getComprehensivePRCosts() {
        /**
         * Calculate EXACT cost between PRs
         * Workflow: PR #1 created -> develop -> PR #2 created (cost goes to PR #2)
         */
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);

            db.all(`
                WITH pr_timeline AS (
                    -- Get chronological PR creation timeline per session
                    SELECT
                        pr.pr_number,
                        pr.pr_title,
                        pr.session_id,
                        pr.created_at,
                        datetime(pr.created_at/1000, 'unixepoch') as pr_created_readable,
                        -- Get previous PR in same session
                        LAG(pr.created_at) OVER (
                            PARTITION BY pr.session_id
                            ORDER BY pr.created_at
                        ) as prev_pr_created_at,
                        -- Get session start for first PR
                        CASE
                            WHEN LAG(pr.created_at) OVER (
                                PARTITION BY pr.session_id
                                ORDER BY pr.created_at
                            ) IS NULL
                            THEN (SELECT started_at FROM sessions s WHERE s.session_id = pr.session_id)
                            ELSE LAG(pr.created_at) OVER (
                                PARTITION BY pr.session_id
                                ORDER BY pr.created_at
                            )
                        END as development_start
                    FROM pull_requests pr
                    WHERE pr.session_id IS NOT NULL
                ),
                pr_development_costs AS (
                    -- Calculate cost from development_start to PR creation
                    SELECT
                        pt.pr_number,
                        pt.pr_title,
                        pt.development_start,
                        pt.created_at as pr_created_at,
                        datetime(pt.development_start/1000, 'unixepoch') as dev_start_readable,
                        pt.pr_created_readable,
                        COUNT(DISTINCT t.id) as development_turns,
                        ROUND(SUM(tu.total_cost_usd), 4) as exact_pr_cost_usd
                    FROM pr_timeline pt
                    JOIN turns t ON pt.session_id = t.session_id
                    JOIN token_usage tu ON t.id = tu.turn_id
                    -- Cost from previous PR creation (or session start) to this PR creation
                    WHERE t.started_at BETWEEN pt.development_start AND pt.created_at
                    GROUP BY pt.pr_number, pt.pr_title, pt.development_start,
                             pt.created_at, pt.pr_created_readable
                )
                SELECT
                    pr_number,
                    pr_title,
                    development_turns,
                    exact_pr_cost_usd,
                    dev_start_readable as development_started,
                    pr_created_readable as pr_created,
                    ROUND(exact_pr_cost_usd / NULLIF(development_turns, 0), 4) as cost_per_turn
                FROM pr_development_costs
                ORDER BY pr_number
            `, [], (err, rows) => {
                db.close();
                if (err) {
                    this.log(`Error getting PR-to-PR costs: ${err.message}`);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async getPRProductivityMetrics() {
        /**
         * Get comprehensive PR metrics including cost, productivity, and CI/CD success
         */
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);

            db.all(`
                WITH pr_costs AS (
                    -- Session-based comprehensive costs
                    SELECT DISTINCT
                        gc.pr_number,
                        gc.session_id,
                        ROUND(SUM(DISTINCT tu.total_cost_usd), 4) as session_cost
                    FROM git_commits gc
                    JOIN turns t ON gc.session_id = t.session_id
                    JOIN token_usage tu ON t.id = tu.turn_id
                    WHERE gc.pr_number IS NOT NULL
                    GROUP BY gc.pr_number, gc.session_id
                ),
                pr_aggregated_costs AS (
                    SELECT
                        pr_number,
                        ROUND(SUM(session_cost), 4) as total_cost_usd
                    FROM pr_costs
                    GROUP BY pr_number
                ),
                pr_commits AS (
                    -- Commit metrics per PR
                    SELECT
                        pr_number,
                        COUNT(*) as commit_count,
                        SUM(files_changed) as total_files_changed,
                        SUM(insertions) as total_insertions,
                        SUM(deletions) as total_deletions,
                        SUM(insertions + deletions) as total_lines_changed
                    FROM git_commits
                    WHERE pr_number IS NOT NULL
                    GROUP BY pr_number
                ),
                pr_checks AS (
                    -- CI/CD success rates per PR
                    SELECT
                        gc.pr_number,
                        COUNT(DISTINCT cc.id) as total_checks,
                        COUNT(DISTINCT CASE WHEN cc.check_conclusion = 'success' THEN cc.id END) as passed_checks,
                        ROUND(
                            CAST(COUNT(DISTINCT CASE WHEN cc.check_conclusion = 'success' THEN cc.id END) AS FLOAT) /
                            NULLIF(COUNT(DISTINCT cc.id), 0) * 100, 1
                        ) as ci_success_rate
                    FROM git_commits gc
                    LEFT JOIN commit_checks cc ON gc.commit_sha = cc.commit_sha
                    WHERE gc.pr_number IS NOT NULL
                    GROUP BY gc.pr_number
                )
                SELECT
                    pr.pr_number as pr_number,
                    pr.pr_title as title,
                    pr.pr_state as state,
                    COALESCE(pc.commit_count, 0) as commits,
                    COALESCE(pc.total_files_changed, 0) as files_changed,
                    COALESCE(pc.total_lines_changed, 0) as lines_changed,
                    COALESCE(pac.total_cost_usd, 0) as comprehensive_cost_usd,
                    COALESCE(checks.total_checks, 0) as ci_checks,
                    COALESCE(checks.passed_checks, 0) as ci_passed,
                    COALESCE(checks.ci_success_rate, 0) as ci_success_rate,
                    CASE
                        WHEN pc.total_lines_changed > 0
                        THEN ROUND(pac.total_cost_usd / pc.total_lines_changed, 6)
                        ELSE 0
                    END as cost_per_line_changed,
                    CASE
                        WHEN pc.commit_count > 0
                        THEN ROUND(pac.total_cost_usd / pc.commit_count, 4)
                        ELSE 0
                    END as cost_per_commit
                FROM pull_requests pr
                LEFT JOIN pr_aggregated_costs pac ON pr.pr_number = pac.pr_number
                LEFT JOIN pr_commits pc ON pr.pr_number = pc.pr_number
                LEFT JOIN pr_checks checks ON pr.pr_number = checks.pr_number
                WHERE pr.pr_number IS NOT NULL
                ORDER BY comprehensive_cost_usd DESC
            `, [], (err, rows) => {
                db.close();
                if (err) {
                    this.log(`Error getting PR productivity metrics: ${err.message}`);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async getHumanVsClaudeAnalysis() {
        /**
         * Analyze human vs Claude contributions with comprehensive metrics
         */
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);

            db.all(`
                WITH commit_classification AS (
                    SELECT
                        commit_sha,
                        CASE
                            WHEN session_id IS NOT NULL THEN 'Claude'
                            ELSE 'Human'
                        END as contributor_type,
                        files_changed,
                        insertions,
                        deletions,
                        insertions + deletions as total_lines_changed,
                        pr_number,
                        data_source
                    FROM git_commits
                ),
                contribution_summary AS (
                    SELECT
                        contributor_type,
                        COUNT(*) as total_commits,
                        SUM(files_changed) as total_files_changed,
                        SUM(insertions) as total_insertions,
                        SUM(deletions) as total_deletions,
                        SUM(total_lines_changed) as total_lines_changed,
                        COUNT(DISTINCT pr_number) as prs_contributed_to,
                        ROUND(AVG(total_lines_changed), 1) as avg_lines_per_commit,
                        ROUND(AVG(files_changed), 1) as avg_files_per_commit
                    FROM commit_classification
                    GROUP BY contributor_type
                ),
                claude_costs AS (
                    -- Only Claude commits have costs
                    SELECT
                        'Claude' as contributor_type,
                        ROUND(SUM(DISTINCT tu.total_cost_usd), 4) as total_development_cost
                    FROM git_commits gc
                    JOIN turns t ON gc.session_id = t.session_id
                    JOIN token_usage tu ON t.id = tu.turn_id
                    WHERE gc.session_id IS NOT NULL
                )
                SELECT
                    cs.*,
                    COALESCE(cc.total_development_cost, 0) as total_cost_usd,
                    CASE
                        WHEN cs.total_lines_changed > 0 AND cc.total_development_cost > 0
                        THEN ROUND(cc.total_development_cost / cs.total_lines_changed, 6)
                        ELSE 0
                    END as cost_per_line,
                    CASE
                        WHEN cs.total_commits > 0 AND cc.total_development_cost > 0
                        THEN ROUND(cc.total_development_cost / cs.total_commits, 4)
                        ELSE 0
                    END as cost_per_commit
                FROM contribution_summary cs
                LEFT JOIN claude_costs cc ON cs.contributor_type = cc.contributor_type
                ORDER BY cs.contributor_type
            `, [], (err, rows) => {
                db.close();
                if (err) {
                    this.log(`Error getting human vs Claude analysis: ${err.message}`);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async getCostBreakdownBySession() {
        /**
         * Show detailed cost breakdown by session for debugging and analysis
         */
        return new Promise((resolve) => {
            const db = new sqlite3.Database(this.dbPath);

            db.all(`
                WITH session_details AS (
                    SELECT
                        s.session_id,
                        s.started_at,
                        COUNT(DISTINCT t.id) as total_turns,
                        COUNT(DISTINCT gc.commit_sha) as commits_produced,
                        GROUP_CONCAT(DISTINCT CAST(gc.pr_number AS TEXT)) as pr_numbers,
                        ROUND(SUM(DISTINCT tu.total_cost_usd), 4) as session_cost
                    FROM sessions s
                    LEFT JOIN turns t ON s.session_id = t.session_id
                    LEFT JOIN git_commits gc ON s.session_id = gc.session_id
                    LEFT JOIN token_usage tu ON t.id = tu.turn_id
                    GROUP BY s.session_id, s.started_at
                )
                SELECT
                    session_id,
                    datetime(started_at/1000, 'unixepoch') as session_started,
                    total_turns,
                    commits_produced,
                    pr_numbers,
                    session_cost,
                    CASE
                        WHEN commits_produced > 0
                        THEN ROUND(session_cost / commits_produced, 4)
                        ELSE 0
                    END as cost_per_commit,
                    CASE
                        WHEN total_turns > 0
                        THEN ROUND(session_cost / total_turns, 4)
                        ELSE 0
                    END as cost_per_turn
                FROM session_details
                WHERE session_cost > 0
                ORDER BY started_at DESC
                LIMIT 20
            `, [], (err, rows) => {
                db.close();
                if (err) {
                    this.log(`Error getting cost breakdown: ${err.message}`);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async generateComprehensiveMetricsReport() {
        /**
         * Generate a comprehensive metrics report with all cost analysis
         */
        try {
            this.log('\n📊 === COMPREHENSIVE DEVELOPMENT METRICS REPORT ===\n');

            // 1. Comprehensive PR Costs
            const prCosts = await this.getComprehensivePRCosts();
            if (prCosts.length > 0) {
                this.log('🎯 COMPREHENSIVE COST PER PR (Full Development Sessions):');
                prCosts.forEach(pr => {
                    this.log(`  PR #${pr.pr_number}: ${pr.pr_title || 'Unknown'}`);
                    this.log(`    • Sessions: ${pr.sessions_count}, Turns: ${pr.total_turns}`);
                    this.log(`    • Total Cost: $${pr.comprehensive_pr_cost_usd}`);
                    this.log(`    • Avg Session Cost: $${pr.avg_session_cost_usd}\n`);
                });
            }

            // 2. PR Productivity Metrics
            const productivity = await this.getPRProductivityMetrics();
            if (productivity.length > 0) {
                this.log('📈 PR PRODUCTIVITY METRICS:');
                productivity.forEach(pr => {
                    this.log(`  PR #${pr.pr_number}: ${pr.title || 'Unknown'} [${pr.state}]`);
                    this.log(`    • Commits: ${pr.commits}, Files: ${pr.files_changed}, Lines: ${pr.lines_changed}`);
                    this.log(`    • Cost: $${pr.comprehensive_cost_usd} ($${pr.cost_per_commit}/commit, $${pr.cost_per_line_changed}/line)`);
                    this.log(`    • CI/CD: ${pr.ci_passed}/${pr.ci_checks} passed (${pr.ci_success_rate}%)\n`);
                });
            }

            // 3. Human vs Claude Analysis
            const comparison = await this.getHumanVsClaudeAnalysis();
            if (comparison.length > 0) {
                this.log('👥 HUMAN vs CLAUDE CONTRIBUTION ANALYSIS:');
                comparison.forEach(contrib => {
                    this.log(`  ${contrib.contributor_type.toUpperCase()} Contributions:`);
                    this.log(`    • Commits: ${contrib.total_commits} (avg ${contrib.avg_lines_per_commit} lines/commit)`);
                    this.log(`    • Files: ${contrib.total_files_changed} (avg ${contrib.avg_files_per_commit}/commit)`);
                    this.log(`    • Lines: +${contrib.total_insertions}/-${contrib.total_deletions} (${contrib.total_lines_changed} total)`);
                    this.log(`    • PRs: ${contrib.prs_contributed_to}`);
                    if (contrib.total_cost_usd > 0) {
                        this.log(`    • Cost: $${contrib.total_cost_usd} ($${contrib.cost_per_commit}/commit, $${contrib.cost_per_line}/line)`);
                    }
                    this.log('');
                });
            }

            // 4. Session Cost Breakdown
            const sessions = await this.getCostBreakdownBySession();
            if (sessions.length > 0) {
                this.log('💰 RECENT SESSION COST BREAKDOWN:');
                sessions.forEach(session => {
                    this.log(`  Session ${session.session_id.substring(0, 8)}... (${session.session_started})`);
                    this.log(`    • Turns: ${session.total_turns}, Commits: ${session.commits_produced}`);
                    this.log(`    • PRs: ${session.pr_numbers || 'None'}`);
                    this.log(`    • Cost: $${session.session_cost} ($${session.cost_per_turn}/turn, $${session.cost_per_commit}/commit)\n`);
                });
            }

            this.log('📊 === END OF COMPREHENSIVE METRICS REPORT ===\n');

        } catch (error) {
            this.log(`Error generating comprehensive metrics report: ${error.message}`);
        }
    }
}

// Main execution
async function main() {
    const analytics = new ToolAnalytics();

    try {
        // Read JSON data from stdin
        const inputData = process.stdin.read();

        if (!inputData) {
            analytics.log('No input data received from stdin');
            return;
        }

        const rawData = JSON.parse(inputData.toString());

        analytics.log(`Received hook event: ${rawData.hook_event_name}, tool: ${rawData.tool_name}`);

        // Process the hook event
        await analytics.processHookEvent(rawData);

        // Generate/update metrics periodically
        await analytics.generateMetrics();

    } catch (error) {
        analytics.log(`Error in main: ${error.message}`);
    }
}

// Handle stdin data
let inputBuffer = '';
process.stdin.on('data', (chunk) => {
    inputBuffer += chunk;
});

process.stdin.on('end', async () => {
    if (inputBuffer.trim()) {
        try {
            const rawData = JSON.parse(inputBuffer);
            const analytics = new ToolAnalytics();

            // Initialize database first
            await analytics.initialize();

            analytics.log(`Processing hook event: ${rawData.hook_event_name}, tool: ${rawData.tool_name}`);

            await analytics.processHookEvent(rawData);
            await analytics.generateMetrics();

        } catch (error) {
            const analytics = new ToolAnalytics();
            await analytics.initialize();
            analytics.log(`Error processing stdin: ${error.message}`);
        }
    }
});

// If run directly
if (require.main === module) {
    // Wait for stdin if no arguments
    if (process.argv.length <= 2) {
        // Will be handled by stdin events above
    } else {
        main();
    }
}