import api from './api'

const reportService = {
  /**
   * Get the role-scoped operation history using server-side filters,
   * pagination, and summary aggregation.
   */
  getHistory(params, config = {}) {
    return api.get('/reports/operation-history', { params, ...config })
  },

  /**
   * Export the same filtered operation-history dataset without page limits.
   */
  exportReport(params, config = {}) {
    return api.get('/reports/operation-history/export', {
      params,
      responseType: 'blob',
      ...config,
    })
  },

  /** Backward-compatible terminal report endpoint. */
  getLegacyHistory(params) {
    return api.get('/reports/history', { params })
  },
}

export default reportService
