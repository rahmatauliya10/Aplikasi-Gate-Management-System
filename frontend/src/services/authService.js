/**
 * ============================================
 * GMS - Auth Service
 * ============================================
 * Handles: login, logout, register, token refresh
 * Connects to: /auth/* endpoints
 * ============================================
 */

import api from './api'

const authService = {
  /**
   * Login user
   * @param {Object} credentials - { username, password }
   * @returns {Promise} - { access_token, user }
   */
  login(credentials) {
    return api.post('/auth/login', credentials)
  },

  /**
   * Logout user (server-side token invalidation)
   */
  logout() {
    return api.post('/auth/logout')
  },

  /**
   * Register new user (admin only)
   * @param {Object} userData - { name, username, password, role }
   */
  register(userData) {
    return api.post('/auth/register', userData)
  },

  /**
   * Refresh access token
   */
  refreshToken() {
    return api.post('/auth/refresh')
  },

  /**
   * Get current authenticated user info
   */
  me() {
    return api.get('/auth/me')
  }
}

export default authService
