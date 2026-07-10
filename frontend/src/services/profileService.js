/**
 * ============================================
 * GMS - Profile Service
 * ============================================
 * Handles: user profile CRUD, avatar, password change
 * Connects to: /profile/* endpoints
 * ============================================
 */

import api from './api'

const profileService = {
  /**
   * Get current user profile
   */
  getProfile() {
    return api.get('/profile')
  },

  /**
   * Update user profile
   * @param {Object} data - { name, email, phone, department }
   */
  updateProfile(data) {
    return api.put('/profile', data)
  },

  /**
   * Change password
   * @param {Object} data - { currentPassword, newPassword }
   */
  changePassword(data) {
    return api.put('/profile/password', data)
  },

  /**
   * Upload avatar image
   * @param {FormData} formData - contains avatar file
   */
  uploadAvatar(formData) {
    return api.post('/profile/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}

export default profileService
