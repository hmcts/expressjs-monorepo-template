// SonarQube Comment Parser
// Extracts quality metrics from SonarQube bot comments in GitHub PRs

class SonarQubeParser {
    constructor() {
        this.botNames = [
            'sonarcloud[bot]',
            'sonar-cloud[bot]',
            'sonarqube[bot]',
            'sonar'
        ];
    }

    /**
     * Check if a comment is from SonarQube bot
     */
    isSonarQubeComment(comment) {
        if (!comment || !comment.user) return false;

        const username = comment.user.login.toLowerCase();
        const body = comment.body.toLowerCase();

        // Check username
        const isBotUser = this.botNames.some(bot =>
            username.includes(bot.replace('[bot]', ''))
        );

        // Check content patterns
        const hasQualityGate = body.includes('quality gate');
        const hasSonarKeywords = body.includes('sonar') ||
                                body.includes('bugs') && body.includes('vulnerabilities');

        return isBotUser || (hasQualityGate && hasSonarKeywords);
    }

    /**
     * Parse SonarQube metrics from comment text
     */
    parseMetrics(comment) {
        if (!this.isSonarQubeComment(comment)) {
            return null;
        }

        const body = comment.body;
        const metrics = {
            // Metadata
            comment_id: comment.id,
            comment_url: comment.html_url,
            comment_author: comment.user.login,
            analysis_date: comment.created_at,

            // Initialize all metrics
            quality_gate_status: null,
            conditions_passed: 0,
            conditions_failed: 0,

            bugs_total: 0,
            bugs_critical: 0,
            bugs_major: 0,
            bugs_minor: 0,

            vulnerabilities_total: 0,
            vulnerabilities_critical: 0,
            vulnerabilities_major: 0,
            vulnerabilities_minor: 0,

            security_hotspots: 0,
            code_smells: 0,
            technical_debt_minutes: 0,

            line_coverage_percent: null,
            branch_coverage_percent: null,
            coverage_on_new_code_percent: null,

            maintainability_rating: null,
            reliability_rating: null,
            security_rating: null,

            duplicated_lines_percent: null,
            sonar_project_key: null
        };

        // Extract metrics using various parsing strategies
        this.extractQualityGateStatus(body, metrics);
        this.extractTableMetrics(body, metrics);
        this.extractInlineMetrics(body, metrics);
        this.extractProjectInfo(body, metrics);
        this.extractRatings(body, metrics);

        return metrics;
    }

    /**
     * Extract Quality Gate status
     */
    extractQualityGateStatus(body, metrics) {
        const lowerBody = body.toLowerCase();

        if (lowerBody.includes('quality gate passed') ||
            lowerBody.includes('✅') && lowerBody.includes('quality gate')) {
            metrics.quality_gate_status = 'PASSED';
        } else if (lowerBody.includes('quality gate failed') ||
                   lowerBody.includes('❌') && lowerBody.includes('quality gate')) {
            metrics.quality_gate_status = 'FAILED';
        } else if (lowerBody.includes('quality gate')) {
            // Try to extract from more complex patterns
            const statusMatch = body.match(/Quality Gate[:\s]+(PASSED|FAILED|ERROR)/i);
            if (statusMatch) {
                metrics.quality_gate_status = statusMatch[1].toUpperCase();
            }
        }

        // Extract conditions
        const conditionsMatch = body.match(/(\d+)\s*\/\s*(\d+)\s*conditions?\s*(passed|met)/i);
        if (conditionsMatch) {
            metrics.conditions_passed = parseInt(conditionsMatch[1]);
            const total = parseInt(conditionsMatch[2]);
            metrics.conditions_failed = total - metrics.conditions_passed;
        }
    }

    /**
     * Extract metrics from markdown table format
     */
    extractTableMetrics(body, metrics) {
        // Look for markdown table with metrics
        const tableRegex = /\|\s*(.+?)\s*\|\s*(.+?)\s*\|/g;
        let match;

        while ((match = tableRegex.exec(body)) !== null) {
            const [, metric, value] = match;
            const metricName = metric.toLowerCase().trim();
            const metricValue = value.trim();

            this.parseMetricValue(metricName, metricValue, metrics);
        }
    }

    /**
     * Extract metrics from inline format (e.g., "Bugs: 5")
     */
    extractInlineMetrics(body, metrics) {
        const patterns = [
            { regex: /bugs?:?\s*(\d+)/i, field: 'bugs_total' },
            { regex: /vulnerabilit(?:y|ies):?\s*(\d+)/i, field: 'vulnerabilities_total' },
            { regex: /security hotspots?:?\s*(\d+)/i, field: 'security_hotspots' },
            { regex: /code smells?:?\s*(\d+)/i, field: 'code_smells' },
            { regex: /coverage:?\s*([\d.]+)%/i, field: 'line_coverage_percent' },
            { regex: /duplicat(?:ion|ed):?\s*([\d.]+)%/i, field: 'duplicated_lines_percent' },
        ];

        patterns.forEach(pattern => {
            const match = body.match(pattern.regex);
            if (match) {
                const value = pattern.field.includes('percent') ?
                    parseFloat(match[1]) : parseInt(match[1]);
                metrics[pattern.field] = value;
            }
        });
    }

    /**
     * Parse individual metric value based on metric name
     */
    parseMetricValue(metricName, metricValue, metrics) {
        // Remove common formatting
        const cleanValue = metricValue.replace(/[,\s%]/g, '');
        const numericValue = parseFloat(cleanValue) || 0;

        // Map metric names to fields
        const metricMapping = {
            'bugs': 'bugs_total',
            'bug': 'bugs_total',
            'vulnerabilities': 'vulnerabilities_total',
            'vulnerability': 'vulnerabilities_total',
            'security hotspots': 'security_hotspots',
            'security hotspot': 'security_hotspots',
            'hotspots': 'security_hotspots',
            'code smells': 'code_smells',
            'code smell': 'code_smells',
            'smells': 'code_smells',
            'coverage': 'line_coverage_percent',
            'line coverage': 'line_coverage_percent',
            'branch coverage': 'branch_coverage_percent',
            'duplication': 'duplicated_lines_percent',
            'duplicated lines': 'duplicated_lines_percent',
            'technical debt': 'technical_debt_minutes'
        };

        const field = metricMapping[metricName];
        if (field) {
            if (field.includes('percent')) {
                metrics[field] = numericValue;
            } else if (field === 'technical_debt_minutes') {
                // Parse time formats like "2h 30min" or "150min"
                metrics[field] = this.parseTimeToMinutes(metricValue);
            } else {
                metrics[field] = Math.floor(numericValue);
            }
        }
    }

    /**
     * Extract project information
     */
    extractProjectInfo(body, metrics) {
        // Extract project key from URLs
        const urlMatch = body.match(/sonarcloud\.io\/dashboard\?id=([^&\s)]+)/i) ||
                        body.match(/sonarqube.*\/dashboard\?id=([^&\s)]+)/i);

        if (urlMatch) {
            metrics.sonar_project_key = decodeURIComponent(urlMatch[1]);
        }
    }

    /**
     * Extract quality ratings (A-E scale)
     */
    extractRatings(body, metrics) {
        const ratingPatterns = [
            { regex: /maintainability:?\s*([A-E])/i, field: 'maintainability_rating' },
            { regex: /reliability:?\s*([A-E])/i, field: 'reliability_rating' },
            { regex: /security:?\s*([A-E])/i, field: 'security_rating' }
        ];

        ratingPatterns.forEach(pattern => {
            const match = body.match(pattern.regex);
            if (match) {
                // Convert A-E to 1-5 scale
                const ratingMap = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5 };
                metrics[pattern.field] = ratingMap[match[1].toUpperCase()] || null;
            }
        });
    }

    /**
     * Parse time strings to minutes
     */
    parseTimeToMinutes(timeString) {
        let totalMinutes = 0;

        // Match hours
        const hoursMatch = timeString.match(/(\d+)h/i);
        if (hoursMatch) {
            totalMinutes += parseInt(hoursMatch[1]) * 60;
        }

        // Match minutes
        const minutesMatch = timeString.match(/(\d+)m(?:in)?/i);
        if (minutesMatch) {
            totalMinutes += parseInt(minutesMatch[1]);
        }

        // If no h/m format, try to parse as pure number
        if (totalMinutes === 0) {
            const numMatch = timeString.match(/(\d+)/);
            if (numMatch) {
                totalMinutes = parseInt(numMatch[1]);
            }
        }

        return totalMinutes;
    }

    /**
     * Validate parsed metrics
     */
    validateMetrics(metrics) {
        const issues = [];

        // Check required fields
        if (!metrics.quality_gate_status) {
            issues.push('Missing quality gate status');
        }

        // Validate ranges
        if (metrics.line_coverage_percent &&
            (metrics.line_coverage_percent < 0 || metrics.line_coverage_percent > 100)) {
            issues.push('Invalid coverage percentage');
        }

        // Validate ratings
        const ratings = ['maintainability_rating', 'reliability_rating', 'security_rating'];
        ratings.forEach(rating => {
            if (metrics[rating] && (metrics[rating] < 1 || metrics[rating] > 5)) {
                issues.push(`Invalid ${rating}: must be 1-5`);
            }
        });

        return {
            isValid: issues.length === 0,
            issues: issues,
            metrics: metrics
        };
    }
}

module.exports = { SonarQubeParser };