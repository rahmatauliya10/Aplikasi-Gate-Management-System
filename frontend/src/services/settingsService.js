/**
 * ============================================
 * GMS - Settings Service
 * ============================================
 * Handles: app settings, thresholds, system config
 * Connects to: /settings/* endpoints
 * ============================================
 */

import api from './api'

const settingsService = {
  /**
   * Get current app settings
   */
  getSettings() {
    return api.get('/settings')
  },

  /**
   * Update app settings
   * @param {Object} data - { targetDeviation, targetTat, ... }
   */
  updateSettings(data) {
    return api.put('/settings', data)
  },

  /**
   * Get user list (admin only)
   * @param {Object} params - { role, status, page, limit }
   */
  getUsers(params) {
    return api.get('/settings/users', { params })
  },

  /**
   * Update user role/status (admin only)
   * @param {Number|String} userId
   * @param {Object} data - { role, status }
   */
  updateUser(userId, data) {
    return api.put(`/settings/users/${userId}`, data)
  }
}

export default settingsService
