/**
 * ============================================
 * GMS - Dashboard Service
 * ============================================
 * Handles: dashboard statistics
 * Connects to: /dashboard/* endpoints
 * ============================================
 */

import api from './api'

const dashboardService = {
  /**
   * Get overview statistics (total trucks, active, completed, avg TAT, bottlenecks, fraud)
   * @param {Object} [params] - Optional filter params: { startDate, endDate, preset }
   */
  getStats(params = {}) {
    const cleanParams = {}
    if (params.preset) cleanParams.preset = params.preset
    if (params.startDate) cleanParams.startDate = params.startDate
    if (params.endDate) cleanParams.endDate = params.endDate
    return api.get('/dashboard/stats', { params: cleanParams })
  }
}

export default dashboardService
