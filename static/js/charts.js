// Chart.js configuration and initialization

const chartColors = {
    primary: '#3b82f6',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    grid: '#334155',
    text: '#94a3b8'
};

const categoryColors = {
    network_error: '#ef4444',
    disk_full: '#f59e0b',
    timeout: '#8b5cf6',
    permission_denied: '#ec4899',
    snapshot_failed: '#f97316',
    archive_failed: '#fb923c',
    upload_failed: '#06b6d4',
    prune_remote_failed: '#a855f7',
    cleanup_failed: '#d946ef',
    unknown: '#64748b'
};

const categoryLabels = {
    network_error: 'Network Error',
    disk_full: 'Disk Full',
    timeout: 'Timeout',
    permission_denied: 'Permission Denied',
    snapshot_failed: 'Snapshot Failed',
    archive_failed: 'Archive Failed',
    upload_failed: 'Upload Failed',
    prune_remote_failed: 'Prune Failed',
    cleanup_failed: 'Cleanup Failed',
    unknown: 'Unknown'
};

const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            labels: { color: chartColors.text }
        }
    },
    scales: {
        x: {
            grid: { color: chartColors.grid },
            ticks: { color: chartColors.text }
        },
        y: {
            grid: { color: chartColors.grid },
            ticks: { color: chartColors.text }
        }
    }
};

async function loadCharts() {
    const response = await fetch('/api/metrics');
    const data = await response.json();

    // Duration chart
    new Chart(document.getElementById('durationChart'), {
        type: 'line',
        data: {
            labels: data.map(d => new Date(d.timestamp).toLocaleDateString()),
            datasets: [{
                label: 'Total Duration (min)',
                data: data.map(d => d.duration_total / 60),
                borderColor: chartColors.primary,
                backgroundColor: chartColors.primary + '20',
                tension: 0.3,
                fill: true
            }]
        },
        options: chartDefaults
    });

    // Size chart
    new Chart(document.getElementById('sizeChart'), {
        type: 'bar',
        data: {
            labels: data.map(d => new Date(d.timestamp).toLocaleDateString()),
            datasets: [{
                label: 'Backup Size (MB)',
                data: data.map(d => d.size_bytes / 1024 / 1024),
                backgroundColor: chartColors.success
            }]
        },
        options: chartDefaults
    });

    // Throughput chart
    new Chart(document.getElementById('throughputChart'), {
        type: 'line',
        data: {
            labels: data.map(d => new Date(d.timestamp).toLocaleDateString()),
            datasets: [{
                label: 'Throughput (MB/s)',
                data: data.map(d => d.throughput_mb_per_sec),
                borderColor: chartColors.warning,
                backgroundColor: chartColors.warning + '20',
                tension: 0.3,
                fill: true
            }]
        },
        options: chartDefaults
    });

    // Breakdown chart (last backup)
    if (data.length > 0) {
        const last = data[data.length - 1];
        new Chart(document.getElementById('breakdownChart'), {
            type: 'doughnut',
            data: {
                labels: ['Snapshot', 'Archive', 'Volumes', 'Upload'],
                datasets: [{
                    data: [
                        last.duration_snapshot,
                        last.duration_archive,
                        last.duration_volumes,
                        last.duration_upload
                    ],
                    backgroundColor: [
                        chartColors.primary,
                        chartColors.success,
                        chartColors.warning,
                        chartColors.danger
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: chartColors.text } }
                }
            }
        });
    }
}

async function loadFailures() {
    const container = document.getElementById('failureList');

    const response = await fetch('/api/failures');
    const failures = await response.json();

    if (failures.length === 0) {
        container.innerHTML = '<div class="empty-state">No recent failures</div>';
        return;
    }

    let html = '<table class="failure-table"><thead><tr>' +
        '<th>Timestamp</th><th>Backup ID</th><th>Category</th><th>Error Message</th>' +
        '</tr></thead><tbody>';

    for (const f of failures) {
        const cat = f.error_category || 'unknown';
        const color = categoryColors[cat] || categoryColors.unknown;
        const label = categoryLabels[cat] || cat;
        const date = new Date(f.timestamp).toLocaleString();
        const msg = f.error_message || '\u2014';

        html += '<tr class="failure-row">' +
            `<td>${date}</td>` +
            `<td>${f.backup_id}</td>` +
            `<td><span class="error-badge" style="background:${color}20;color:${color};border:1px solid ${color}40">${label}</span></td>` +
            `<td class="error-message-cell">${msg}</td>` +
            '</tr>';
    }

    html += '</tbody></table>';
    container.innerHTML = html;
}

async function loadFailureTrends() {
    const response = await fetch('/api/failure-trends');
    const trends = await response.json();

    if (trends.length === 0) return;

    // Group by week and category
    const weeks = [...new Set(trends.map(t => t.week))];
    const categories = [...new Set(trends.map(t => t.error_category))];

    const datasets = categories.map(cat => {
        const color = categoryColors[cat] || categoryColors.unknown;
        const label = categoryLabels[cat] || cat;
        return {
            label: label,
            data: weeks.map(w => {
                const match = trends.find(t => t.week === w && t.error_category === cat);
                return match ? match.count : 0;
            }),
            backgroundColor: color
        };
    });

    new Chart(document.getElementById('failureChart'), {
        type: 'bar',
        data: {
            labels: weeks.map(w => 'Week ' + w.split('-')[1]),
            datasets: datasets
        },
        options: {
            ...chartDefaults,
            scales: {
                ...chartDefaults.scales,
                x: { ...chartDefaults.scales.x, stacked: true },
                y: { ...chartDefaults.scales.y, stacked: true, beginAtZero: true }
            }
        }
    });
}

async function loadPruneStats() {
    const container = document.getElementById('pruneStats');
    if (!container) return;

    const response = await fetch('/api/prune-stats');
    const data = await response.json();

    const lp = data.last_prune;
    const totals = data.totals_30d;

    if (!lp) {
        container.innerHTML = '<div class="empty-state">No prune activity yet</div>';
        return;
    }

    const date = new Date(lp.timestamp).toLocaleString();
    const hasErrors = lp.errors > 0 || totals.errors > 0;

    let html = '<div class="prune-detail">';
    html += `<div class="prune-row"><span class="prune-label">Last prune</span><span>${date}</span></div>`;
    html += `<div class="prune-row"><span class="prune-label">Deleted</span><span>${lp.deleted} backup${lp.deleted !== 1 ? 's' : ''}</span></div>`;
    if (lp.skipped > 0) {
        html += `<div class="prune-row"><span class="prune-label">Skipped</span><span class="prune-warn">${lp.skipped}</span></div>`;
    }
    if (lp.errors > 0) {
        html += `<div class="prune-row"><span class="prune-label">Errors</span><span class="prune-error">${lp.errors}</span></div>`;
    }
    html += `<div class="prune-row"><span class="prune-label">Duration</span><span>${lp.duration}s</span></div>`;
    html += '</div>';

    // 30-day totals
    html += '<div class="prune-totals">';
    html += `<span class="prune-label">30-day totals:</span> `;
    html += `${totals.deleted} deleted`;
    if (totals.errors > 0) {
        html += ` <span class="prune-error">| ${totals.errors} errors</span>`;
    }
    html += '</div>';

    container.innerHTML = html;
}

// Load charts when page loads
loadCharts();
loadFailures();
loadFailureTrends();
loadPruneStats();
