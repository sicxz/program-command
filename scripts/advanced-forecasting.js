/**
 * EWU Design Advanced Enrollment Forecasting
 *
 * Implements seasonal adjustments and 3-scenario forecasting:
 * - Base Scenario (Linear Trend)
 * - Conservative Scenario (-5% variance)
 * - Aggressive Scenario (+5% variance)
 * 
 * Seasonal Weights:
 * - Fall: 1.15x
 * - Winter: 0.95x
 * - Spring: 1.05x
 * - Summer: 0.85x
 */

class AdvancedForecaster {
    constructor() {
        this.seasonalWeights = {
            'Fall': 1.15,
            'Winter': 0.95,
            'Spring': 1.05,
            'Summer': 0.85
        };
    }

    /**
     * Determines the season text for the next expected quarter
     */
    getNextQuarterSeason(lastQuarterString) {
        // e.g. "Fall 2025" or "Winter 2025"
        const seasons = ['Winter', 'Spring', 'Summer', 'Fall']; // Ordered by academic year flow loosely
        const parts = lastQuarterString.split(' ');
        const currentSeason = parts[0];

        // Proper chronological order
        const chrono = ['Winter', 'Spring', 'Summer', 'Fall'];
        let idx = chrono.indexOf(currentSeason);

        if (idx === -1) return 'Fall'; // default

        let nextIdx = (idx + 1) % chrono.length;
        return chrono[nextIdx];
    }

    /**
     * Generate predictive forecast for next quarter with 3 scenarios
     */
    generateForecast(quarters, headcounts) {
        if (!headcounts || headcounts.length < 4) {
            console.log('⚠️  Not enough data for advanced forecasting (need at least 4 quarters)\n');
            return null;
        }

        const n = headcounts.length;

        // Perform Linear Regression
        const x = Array.from({ length: n }, (_, i) => i);
        const y = headcounts;

        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Predict next quarter (Base Unadjusted)
        const nextX = n;
        const unadjustedPrediction = slope * nextX + intercept;

        // Apply Seasonal Adjustment
        const lastQuarterStr = quarters[quarters.length - 1];
        const nextSeason = this.getNextQuarterSeason(lastQuarterStr);
        const seasonalWeight = this.seasonalWeights[nextSeason] || 1.0;

        const basePredicted = Math.round(unadjustedPrediction * seasonalWeight);

        // Calculate confidence interval (95%)
        const residuals = y.map((yi, i) => yi - (slope * x[i] + intercept));
        const mse = residuals.reduce((sum, r) => sum + r * r, 0) / (n - 2);
        const stdError = Math.sqrt(mse);
        const marginOfError = 1.96 * stdError; // 95% confidence

        // Scenario Adjustments (5% variance)
        const conservativePredicted = Math.round(basePredicted * 0.95);
        const aggressivePredicted = Math.round(basePredicted * 1.05);

        const forecast = {
            predicted: basePredicted,
            scenarios: {
                conservative: conservativePredicted,
                base: basePredicted,
                aggressive: aggressivePredicted
            },
            lower95: Math.round(basePredicted - marginOfError),
            upper95: Math.round(basePredicted + marginOfError),
            trend: slope > 0 ? 'growing' : slope < 0 ? 'declining' : 'stable',
            growthRate: ((slope / (sumY / n)) * 100).toFixed(1) + '%',
            seasonalAdjustmentApplied: nextSeason,
            seasonalWeight: seasonalWeight
        };

        console.log(`\n🔮 Advanced Forecast (Next Quarter: ${nextSeason}):`);
        console.log(`   Base Prediction: ${forecast.predicted} students (Adjusted by ${seasonalWeight}x)`);
        console.log(`   Scenarios -> Conservative: ${forecast.scenarios.conservative} | Aggressive: ${forecast.scenarios.aggressive}`);
        console.log(`   Trend: ${forecast.trend} (${forecast.growthRate} per quarter)\n`);

        return forecast;
    }
}

export default AdvancedForecaster;
