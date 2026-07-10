/**
 * ============================================
 * GMS - Gate Service
 * ============================================
 * Handles: gate check-in, check-out, gate status
 * Connects to: /gate/* endpoints
 * ============================================
 */

import api from './api'

const gateService = {
  /**
   * Process gate check-in
   * @param {Object} data - { truckId, licensePlate, driverName, doNumber, cargo, origin }
   */
  checkIn(data) {
    return api.post('/gate/check-in', data)
  },

  /**
   * Process gate check-out
   * @param {Number|String} truckId
   * @param {Object} data - { notes, sealNumber }
   */
  checkOut(truckId, data) {
    return api.post(`/gate/check-out/${truckId}`, data)
  },

  /**
   * Get gate activity log
   * @param {Object} params - { date, type: 'in'|'out', page, limit }
   */
  getActivity(params) {
    return api.get('/gate/activity', { params })
  },

  /**
   * Get current gate status (trucks in/out today)
   */
  getStatus() {
    return api.get('/gate/status')
  },

  /**
   * Get gate queue
   */
  getQueue() {
    return api.get('/gate/queue')
  }
}

export default gateService
