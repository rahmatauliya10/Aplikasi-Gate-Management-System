import api from './api'

const announcementService = {
  /**
   * Get all active announcements
   */
  getActiveAnnouncements() {
    return api.get(`/system-config/announcements/active?t=${Date.now()}`)
  },

  /**
   * Get all announcements (Admin only)
   */
  getAllAnnouncements() {
    return api.get(`/system-config/announcements?t=${Date.now()}`)
  },

  /**
   * Create new announcement (Admin only)
   * @param {Object} data 
   */
  createAnnouncement(data) {
    return api.post('/system-config/announcements', data)
  },

  /**
   * Update announcement (Admin only)
   * @param {String} id 
   * @param {Object} data 
   */
  updateAnnouncement(id, data) {
    return api.patch(`/system-config/announcements/${id}`, data)
  },

  /**
   * Delete announcement (Admin only)
   * @param {String} id 
   */
  deleteAnnouncement(id) {
    return api.delete(`/system-config/announcements/${id}`)
  }
}

export default announcementService
