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
   * Get overview statistics (total trucks, active, completed, avg TAT)
   */
  getStats() {
    return api.get('/dashboard/stats')
  }
}

export default dashboardService
