/**
 * Admin Log Query Builders
 *
 * Dynamic Knex query builders for system_error_logs, api_request_logs,
 * and server_health_logs. Used by the Super Admin routes.
 */

import { db } from '../../config/database.js';

// ══════════════════════════════════════════════════════════════
//  Common pagination
// ══════════════════════════════════════════════════════════════

interface PaginationParams {
  page?: number;
  limit?: number;
}

function paginate(query: any, params: PaginationParams) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 50));
  return query.limit(limit).offset((page - 1) * limit);
}

// ══════════════════════════════════════════════════════════════
//  Error Logs
// ══════════════════════════════════════════════════════════════

export interface ErrorLogFilters extends PaginationParams {
  severity?: string;       // single or comma-separated: 'ERROR,CRITICAL'
  workspace_id?: string;
  resolved?: boolean;
  source?: string;
  error_code?: string;
  from?: string;           // ISO date
  to?: string;             // ISO date
}

export async function queryErrorLogs(filters: ErrorLogFilters) {
  let query = db('system_error_logs').orderBy('created_at', 'desc');

  if (filters.severity) {
    const levels = filters.severity.split(',').map((s) => s.trim().toUpperCase());
    query = query.whereIn('severity', levels);
  }
  if (filters.workspace_id) {
    query = query.where('workspace_id', filters.workspace_id);
  }
  if (filters.resolved !== undefined) {
    query = query.where('resolved', filters.resolved);
  }
  if (filters.source) {
    query = query.where('source', filters.source);
  }
  if (filters.error_code) {
    query = query.where('error_code', filters.error_code);
  }
  if (filters.from) {
    query = query.where('created_at', '>=', filters.from);
  }
  if (filters.to) {
    query = query.where('created_at', '<=', filters.to);
  }

  // Get total count for pagination metadata
  const countQuery = query.clone().clearSelect().clearOrder().count('* as total').first();
  const [rows, countResult] = await Promise.all([
    paginate(query, filters),
    countQuery,
  ]);

  return {
    data: rows,
    total: Number(countResult?.total ?? 0),
    page: Math.max(1, filters.page ?? 1),
    limit: Math.min(100, Math.max(1, filters.limit ?? 50)),
  };
}

export async function getErrorLogById(errorId: string) {
  return db('system_error_logs').where('error_id', errorId).first();
}

export async function resolveErrorLog(errorId: string, resolvedBy: string) {
  return db('system_error_logs')
    .where('error_id', errorId)
    .update({
      resolved: true,
      resolved_by: resolvedBy,
      resolved_at: db.fn.now(),
    });
}

// ══════════════════════════════════════════════════════════════
//  API Request Logs
// ══════════════════════════════════════════════════════════════

export interface ApiLogFilters extends PaginationParams {
  platform?: string;
  workspace_id?: string;
  response_status?: string;  // exact: '200' or range: '4xx', '5xx'
  is_rate_limited?: boolean;
  from?: string;
  to?: string;
}

export async function queryApiLogs(filters: ApiLogFilters) {
  let query = db('api_request_logs').orderBy('created_at', 'desc');

  if (filters.platform) {
    query = query.where('platform', filters.platform.toUpperCase());
  }
  if (filters.workspace_id) {
    query = query.where('workspace_id', filters.workspace_id);
  }
  if (filters.response_status) {
    const status = filters.response_status;
    if (status.endsWith('xx')) {
      // Range: '4xx' -> 400-499
      const base = parseInt(status[0], 10) * 100;
      query = query.whereBetween('response_status', [base, base + 99]);
    } else {
      query = query.where('response_status', parseInt(status, 10));
    }
  }
  if (filters.is_rate_limited !== undefined) {
    query = query.where('is_rate_limited', filters.is_rate_limited);
  }
  if (filters.from) {
    query = query.where('created_at', '>=', filters.from);
  }
  if (filters.to) {
    query = query.where('created_at', '<=', filters.to);
  }

  const countQuery = query.clone().clearSelect().clearOrder().count('* as total').first();
  const [rows, countResult] = await Promise.all([
    paginate(query, filters),
    countQuery,
  ]);

  return {
    data: rows,
    total: Number(countResult?.total ?? 0),
    page: Math.max(1, filters.page ?? 1),
    limit: Math.min(100, Math.max(1, filters.limit ?? 50)),
  };
}

// ══════════════════════════════════════════════════════════════
//  Health / Queue Status
// ══════════════════════════════════════════════════════════════

export async function getHealthOverview() {
  // Latest metric per metric_name
  const latestMetrics = await db('server_health_logs')
    .distinctOn('metric_name')
    .orderBy([
      { column: 'metric_name' },
      { column: 'recorded_at', order: 'desc' },
    ])
    .select('metric_name', 'metric_value', 'unit', 'worker_id', 'recorded_at');

  // Platform API status
  const platformStatus = await db('platform_api_status').select('*');

  // Queue summary
  const queueStats = await db('message_queue')
    .select('status')
    .count('* as count')
    .groupBy('status');

  return {
    metrics: latestMetrics,
    platform_status: platformStatus,
    queue: queueStats,
  };
}

export async function getQueueDetails() {
  // Queue counts by status
  const statusCounts = await db('message_queue')
    .select('status')
    .count('* as count')
    .groupBy('status');

  // Messages stuck in processing (started > 5 min ago)
  const stuckCount = await db('message_queue')
    .where('status', 'processing')
    .where('processing_started_at', '<', db.raw("NOW() - INTERVAL '5 minutes'"))
    .count('* as total')
    .first();

  // Average send time from last hour
  const avgSendTime = await db('message_dispatches')
    .where('sent_at', '>=', db.raw("NOW() - INTERVAL '1 hour'"))
    .where('is_success', true)
    .avg('response_time_ms as avg_ms')
    .first();

  // Throughput: messages sent in last hour
  const throughput = await db('message_dispatches')
    .where('sent_at', '>=', db.raw("NOW() - INTERVAL '1 hour'"))
    .count('* as total')
    .first();

  return {
    status_counts: statusCounts,
    stuck_processing: Number(stuckCount?.total ?? 0),
    avg_send_time_ms: Math.round(Number(avgSendTime?.avg_ms ?? 0)),
    hourly_throughput: Number(throughput?.total ?? 0),
  };
}

export async function getWorkerDetails() {
  // Latest health metrics grouped by worker_id
  const workers = await db('server_health_logs')
    .where('worker_id', 'is not', null)
    .where('recorded_at', '>=', db.raw("NOW() - INTERVAL '5 minutes'"))
    .select('worker_id', 'metric_name', 'metric_value', 'unit', 'recorded_at')
    .orderBy('recorded_at', 'desc');

  // Group by worker_id
  const grouped: Record<string, Array<{ metric_name: string; metric_value: number; unit: string }>> = {};
  for (const row of workers) {
    if (!grouped[row.worker_id]) grouped[row.worker_id] = [];
    grouped[row.worker_id].push({
      metric_name: row.metric_name,
      metric_value: row.metric_value,
      unit: row.unit,
    });
  }

  return {
    workers: grouped,
    active_worker_count: Object.keys(grouped).length,
  };
}
