/**
 * ============================================
 * GMS - Dashboard Service
 * ============================================
 * Handles: dashboard statistics, summary data, charts
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
  },

  /**
   * Get today's activity summary
   */
  getTodaySummary() {
    return api.get('/dashboard/today')
  },

  /**
   * Get truck flow chart data
   * @param {Object} params - { period: 'daily'|'weekly'|'monthly' }
   */
  getChartData(params) {
    return api.get('/dashboard/chart', { params })
  },

  /**
   * Get recent activity log
   * @param {Number} limit - number of entries
   */
  getRecentActivity(limit = 10) {
    return api.get('/dashboard/activity', { params: { limit } })
  },

  /**
   * Get summary data
   */
  getSummary() {
    return api.get('/dashboard/summary')
  },

  /**
   * Get lead time statistics
   */
  getLeadTime() {
    return api.get('/dashboard/lead-time')
  },

  /**
   * Get queue overview
   */
  getQueueOverview() {
    return api.get('/dashboard/queue-overview')
  }
}

export default dashboardService
