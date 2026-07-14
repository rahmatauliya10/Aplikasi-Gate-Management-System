/**
 * ============================================
 * GMS - Report Service
 * ============================================
 * Handles: history reports, export data, analytics
 * Connects to: /reports/* endpoints
 * ============================================
 */

import api from './api'

const reportService = {
  /**
   * Get truck history with filters
   * @param {Object} params - { startDate, endDate, status, search, page, limit }
   */
  getHistory(params) {
    return api.get('/reports/history', { params })
  },

  /**
   * Export report as file (CSV/PDF)
   * @param {Object} params - { format: 'csv'|'pdf', startDate, endDate }
   */
  exportReport(params) {
    return api.get('/reports/export', {
      params,
      responseType: 'blob'
    })
  }
}

export default reportService
