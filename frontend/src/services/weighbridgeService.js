/**
 * ============================================
 * GMS - Weighbridge Service
 * ============================================
 * Handles: weighing in/out, weight records
 * Connects to: /weighbridge/* endpoints
 * ============================================
 */

import api from './api'

const weighbridgeService = {
  /**
   * Record weighbridge-in (gross weight)
   * @param {Number|String} truckId
   * @param {Object} data - { grossWeight, operator, notes }
   */
  weighIn(truckId, data) {
    return api.post(`/weighbridge/in/${truckId}`, data)
  },

  /**
   * Record weighbridge-out (tare weight)
   * @param {Number|String} truckId
   * @param {Object} data - { tareWeight, operator, notes }
   */
  weighOut(truckId, data) {
    return api.post(`/weighbridge/out/${truckId}`, data)
  },

  /**
   * Get weight record for a truck
   * @param {Number|String} truckId
   */
  getWeightRecord(truckId) {
    return api.get(`/weighbridge/record/${truckId}`)
  },

  /**
   * Get trucks waiting at weighbridge
   */
  getQueue() {
    return api.get('/weighbridge/queue')
  }
}

export default weighbridgeService
