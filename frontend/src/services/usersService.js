/**
 * ============================================
 * GMS - Users Service
 * ============================================
 * Handles: CRUD, reset password, toggle status
 * Connects to: /users/* endpoints (ADMIN only)
 * ============================================
 */

import api from './api'

const usersService = {
  /**
   * Get all users
   */
  getAll() {
    return api.get('/users')
  },

  /**
   * Get single user by ID
   */
  getById(id) {
    return api.get(`/users/${id}`)
  },

  /**
   * Create a new user
   * @param {Object} data - { email, username, password, name, role, warehouseAccess? }
   */
  create(data) {
    return api.post('/users', data)
  },

  /**
   * Update user
   * @param {string} id
   * @param {Object} data - partial { email, username, name, role, warehouseAccess? }
   */
  update(id, data) {
    return api.patch(`/users/${id}`, data)
  },

  /**
   * Delete user
   */
  remove(id) {
    return api.delete(`/users/${id}`)
  },

  /**
   * Reset user password (admin action)
   * @param {string} id
   * @param {string} password - new password
   */
  resetPassword(id) {
    return api.post(`/users/${id}/reset-password`)
  },

  /**
   * Toggle user active status
   * @param {string} id
   * @param {boolean} isActive
   */
  updateStatus(id, isActive) {
    return api.patch(`/users/${id}/status`, { isActive })
  }
}

export default usersService
