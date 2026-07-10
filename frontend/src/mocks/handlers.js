import { http, HttpResponse } from 'msw'
import { mockTransactions } from './data/transactions'
import { mockUsers } from './data/users'

const API_BASE = 'http://localhost:3010/api'

// Stateful in-memory DB — deep clone to survive HMR
let transactions = JSON.parse(JSON.stringify(mockTransactions))
let currentUser = null

// Helper: find transaction (supports both string and number IDs)
const findTx = (id) => {
  let idx = transactions.findIndex(t => String(t.id) === String(id))
  return idx
}

export const handlers = [
  // ══════════════════════════════════════════════
  //  AUTH
  // ══════════════════════════════════════════════
  http.post(`${API_BASE}/auth/login`, async ({ request }) => {
    const body = await request.json()
    // Login.vue sends { email, password }
    const email = body.email?.toLowerCase()
    const password = body.password

    const user = mockUsers.find(u => {
      const uEmail = u.email?.toLowerCase()
      const uUsername = u.username?.toLowerCase()
      return (uEmail === email || uUsername === email || (email && email.startsWith(uUsername + '@'))) && u.password === password
    })

    if (!user) {
      return HttpResponse.json(
        { success: false, message: 'Username atau password salah' },
        { status: 401 }
      )
    }

    currentUser = user

    // Response shape must match what authStore.login() expects:
    //   responseData.success === true
    //   responseData.data.accessToken
    //   responseData.data.user
    return HttpResponse.json({
      success: true,
      data: {
        accessToken: `mock-jwt-${user.id}-${Date.now()}`,
        refreshToken: `mock-refresh-${user.id}`,
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
          email: user.email,
          warehouseAccess: user.warehouseAccess
        }
      }
    })
  }),

  http.post(`${API_BASE}/auth/logout`, () => {
    currentUser = null
    return HttpResponse.json({ success: true })
  }),

  http.get(`${API_BASE}/auth/me`, () => {
    if (!currentUser) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    return HttpResponse.json({
      success: true,
      data: {
        user: {
          id: currentUser.id,
          name: currentUser.name,
          username: currentUser.username,
          role: currentUser.role,
          email: currentUser.email,
          warehouseAccess: currentUser.warehouseAccess
        }
      }
    })
  }),

  // ══════════════════════════════════════════════
  //  TRUCKS  (used by truckStore.fetchTrucks)
  // ══════════════════════════════════════════════
  http.get(`${API_BASE}/trucks`, () => {
    return HttpResponse.json({ success: true, data: transactions })
  }),

  // ══════════════════════════════════════════════
  //  GATE
  // ══════════════════════════════════════════════
  http.get(`${API_BASE}/gate/queue`, () => {
    return HttpResponse.json({ success: true, data: transactions })
  }),

  http.post(`${API_BASE}/gate/check-in`, async ({ request }) => {
    const data = await request.json()
    const newTruck = {
      id: `TRX-${data.processType || 'NEW'}-${Date.now()}`,
      plateNumber: data.plateNumber || data.licensePlate || 'UNKNOWN',
      driverName: data.driverName || '-',
      vendor: data.vendor || data.companyName || '-',
      cargoType: data.cargoType || '-',
      processType: data.processType || 'GBJ',
      status: 'REGISTERED',
      weighInWeight: 0,
      weighOutWeight: 0,
      timestamps: {
        gateInAt: new Date().toISOString()
      },
      ...data
    }
    transactions.unshift(newTruck)
    return HttpResponse.json({ success: true, data: newTruck })
  }),

  http.post(`${API_BASE}/gate/check-out/:id`, async ({ params }) => {
    const idx = findTx(params.id)
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 })

    transactions[idx].status = 'COMPLETED'
    transactions[idx].timestamps.gateOutAt = new Date().toISOString()
    transactions[idx].timestamps.completedAt = new Date().toISOString()
    return HttpResponse.json({ success: true, data: transactions[idx] })
  }),

  // ══════════════════════════════════════════════
  //  WEIGHBRIDGE
  // ══════════════════════════════════════════════
  http.get(`${API_BASE}/weighbridge/queue`, () => {
    return HttpResponse.json({ success: true, data: transactions })
  }),

  http.post(`${API_BASE}/weighbridge/in/:id`, async ({ params, request }) => {
    const idx = findTx(params.id)
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 })

    const body = await request.json()
    const truck = transactions[idx]
    truck.weighInWeight = body.weight || body.gross || 0
    truck.weights = truck.weights || { gross: 0, tare: 0, net: 0, rollWeight: 0 }
    truck.weights.gross = body.weight || body.gross || 0
    truck.timestamps.weighInAt = new Date().toISOString()

    // Next status depends on process type
    if (truck.processType === 'GBJ') {
      truck.status = 'QC_VEHICLE_PENDING'
    } else {
      // GBB and GSP go to warehouse
      truck.status = 'WEIGH_IN_DONE'
    }
    return HttpResponse.json({ success: true, data: truck })
  }),

  http.post(`${API_BASE}/weighbridge/out/:id`, async ({ params, request }) => {
    const idx = findTx(params.id)
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 })

    const body = await request.json()
    const truck = transactions[idx]
    truck.weighOutWeight = body.weight || body.tare || 0
    truck.weights = truck.weights || { gross: 0, tare: 0, net: 0, rollWeight: 0 }
    truck.weights.tare = body.weight || body.tare || 0
    truck.weights.net = Math.abs((truck.weights.gross || 0) - (truck.weights.tare || 0))
    truck.timestamps.weighOutAt = new Date().toISOString()
    truck.status = 'WEIGH_OUT_DONE'
    return HttpResponse.json({ success: true, data: truck })
  }),

  // ══════════════════════════════════════════════
  //  WAREHOUSE
  // ══════════════════════════════════════════════
  http.post(`${API_BASE}/warehouse/start/:id`, async ({ params, request }) => {
    const idx = findTx(params.id)
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 })

    const body = await request.json().catch(() => ({}))

    transactions[idx].status = 'WAREHOUSE_IN_PROGRESS'
    transactions[idx].timestamps.warehouseStartAt = new Date().toISOString()
    
    if (body.suratJalanNumber) {
        transactions[idx].suratJalanNumber = body.suratJalanNumber
    }
    if (body.poNumber) {
        transactions[idx].poNumber = body.poNumber
    }

    return HttpResponse.json({ success: true, data: transactions[idx] })
  }),

  http.post(`${API_BASE}/warehouse/complete/:id`, async ({ params, request }) => {
    const idx = findTx(params.id)
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 })

    const truck = transactions[idx]
    truck.timestamps.warehouseEndAt = new Date().toISOString()
    
    try {
      const body = await request.json().catch(() => ({}))
      if (body.actualWeight !== undefined) {
        truck.actualWeight = body.actualWeight
        truck.weights = truck.weights || { gross: 0, tare: 0, net: 0, rollWeight: 0 }
        truck.weights.rollWeight = body.actualWeight
      }
    } catch(e) {}

    // GBB and GSP need incoming check
    if (truck.processType === 'GBB' || truck.processType === 'GSP') {
      truck.status = 'INCOMING_CHECK_PENDING'
    } else {
      truck.status = 'WAREHOUSE_DONE'
    }
    return HttpResponse.json({ success: true, data: truck })
  }),

  http.post(`${API_BASE}/warehouse/incoming-check/:id`, async ({ params, request }) => {
    const idx = findTx(params.id)
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 })

    const body = await request.json()
    const truck = transactions[idx]
    truck.timestamps.incomingCheckStartAt = truck.timestamps.incomingCheckStartAt || new Date().toISOString()
    truck.timestamps.incomingCheckEndAt = new Date().toISOString()

    if (body.decision === 'rejected') {
      truck.status = 'INCOMING_CHECK_REJECTED'
    } else {
      truck.status = 'INCOMING_CHECK_PASSED'
    }
    return HttpResponse.json({ success: true, data: truck })
  }),

  http.post(`${API_BASE}/warehouse/complete-qc-analysis/:id`, async ({ params }) => {
    const idx = findTx(params.id)
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 })

    const truck = transactions[idx]
    truck.qcAnalysisCompleted = true
    truck.qcAnalysisCompletedAt = new Date().toISOString()
    
    return HttpResponse.json({ success: true, data: truck })
  }),

  // ══════════════════════════════════════════════
  //  QC
  // ══════════════════════════════════════════════
  http.get(`${API_BASE}/qc/queue`, () => {
    return HttpResponse.json({ success: true, data: transactions })
  }),

  http.post(`${API_BASE}/qc/start/:id`, async ({ params }) => {
    const idx = findTx(params.id)
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 })

    const truck = transactions[idx]
    truck.timestamps.qcVehicleStartAt = new Date().toISOString()
    
    if (truck.processType === 'GBJ' && truck.status === 'QC_VEHICLE_PENDING') {
      truck.status = 'QC_VEHICLE_IN_PROGRESS'
    } else if ((truck.processType === 'GBB' || truck.processType === 'GSP') && truck.status === 'INCOMING_CHECK_PENDING') {
      truck.status = 'INCOMING_CHECK_IN_PROGRESS'
    }
    
    return HttpResponse.json({ success: true, data: truck })
  }),

  http.post(`${API_BASE}/qc/result/:id`, async ({ params, request }) => {
    const idx = findTx(params.id)
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 })

    const body = await request.json()
    const truck = transactions[idx]
    truck.timestamps.qcVehicleEndAt = new Date().toISOString()

    if (truck.processType === 'GBB') {
      if (body.decision === 'passed') {
        truck.status = 'INCOMING_CHECK_PASSED'
      } else {
        truck.status = 'INCOMING_CHECK_REJECTED'
      }
    } else {
      if (body.decision === 'passed') {
        truck.status = 'QC_VEHICLE_PASSED'
      } else {
        truck.status = 'QC_VEHICLE_REJECTED'
      }
    }
    return HttpResponse.json({ success: true, data: truck })
  }),

  // ══════════════════════════════════════════════
  //  DASHBOARD
  // ══════════════════════════════════════════════
  http.get(`${API_BASE}/dashboard/summary`, () => {
    const completed = transactions.filter(t => t.status === 'COMPLETED').length
    const active = transactions.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length
    return HttpResponse.json({
      success: true,
      data: {
        totalTrucks: transactions.length,
        activeTrucks: active,
        completedTrucks: completed,
        gbbCount: transactions.filter(t => t.processType === 'GBB').length,
        gbjCount: transactions.filter(t => t.processType === 'GBJ').length,
        gspCount: transactions.filter(t => t.processType === 'GSP').length,
      }
    })
  }),

  http.get(`${API_BASE}/dashboard/lead-time`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        averageGBB: '62 min',
        averageGBJ: '48 min',
        averageGSP: '55 min',
        overall: '55 min'
      }
    })
  }),

  http.get(`${API_BASE}/dashboard/queue-overview`, () => {
    const gateQueue = transactions.filter(t => t.status === 'REGISTERED').length
    const wbQueue = transactions.filter(t => ['REGISTERED', 'WAREHOUSE_DONE', 'QC_VEHICLE_REJECTED', 'INCOMING_CHECK_PASSED', 'INCOMING_CHECK_REJECTED'].includes(t.status)).length
    const whQueue = transactions.filter(t => ['WEIGH_IN_DONE', 'WAREHOUSE_IN_PROGRESS', 'INCOMING_CHECK_PENDING', 'INCOMING_CHECK_IN_PROGRESS'].includes(t.status)).length
    const qcQueue = transactions.filter(t => t.status === 'QC_VEHICLE_PENDING').length
    return HttpResponse.json({
      success: true,
      data: { gate: gateQueue, weighbridge: wbQueue, warehouse: whQueue, qc: qcQueue }
    })
  }),

  // ══════════════════════════════════════════════
  //  CATCH-ALL for other dashboard/stats endpoints
  // ══════════════════════════════════════════════
  http.get(`${API_BASE}/dashboard/stats`, () => {
    return HttpResponse.json({ success: true, data: { totalTrucks: transactions.length } })
  }),
  http.get(`${API_BASE}/dashboard/today`, () => {
    return HttpResponse.json({ success: true, data: { count: transactions.length } })
  }),
  http.get(`${API_BASE}/dashboard/chart`, () => {
    return HttpResponse.json({ success: true, data: [] })
  }),
  http.get(`${API_BASE}/dashboard/activity`, () => {
    return HttpResponse.json({ success: true, data: [] })
  }),
]
