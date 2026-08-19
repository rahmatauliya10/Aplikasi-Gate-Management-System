/**
 * PT Santos Jaya Abadi - Gate Management System (GMS)
 * Comprehensive PDF Audit Report & Transaction Dossier Generator
 */

const escapeHtml = (str) => {
  if (str === null || str === undefined || str === '') return '—'
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const formatWeight = (val) => {
  if (val === null || val === undefined || val === '' || isNaN(Number(val))) return '—'
  return Number(val).toLocaleString('id-ID') + ' kg'
}

const formatPercentage = (val) => {
  if (val === null || val === undefined || val === '' || isNaN(Number(val))) return '—'
  const num = Number(val)
  return (num >= 0 ? '+' : '') + num.toFixed(2) + '%'
}

const formatDateTime = (val) => {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const getPlateNumber = (truck) => {
  if (!truck) return '—'
  return truck.plateNumber || truck.vehicle?.plateNumber || truck.licensePlate || '—'
}

const getVendor = (truck) => {
  if (!truck) return '—'
  const val = truck.vendorName || truck.vendor || truck.vehicle?.companyName || truck.companyName || truck.cargo?.supplierOrCustomer || ''
  const plate = getPlateNumber(truck)
  if (!val || val === plate || val === truck.licensePlate) return '—'
  return val
}

const getProcessType = (truck) => {
  if (!truck) return '—'
  return (truck.processType || truck.destination?.warehouseCode || truck.warehouseCode || truck.destination || 'GBB').toUpperCase()
}

export const generatePrintHTML = (truckList) => {
  const list = Array.isArray(truckList) ? truckList : [truckList]
  
  let html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>PT Santos Jaya Abadi - GMS Truck Audit Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 12mm 14mm 12mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 0;
      color: #0f172a;
      background-color: #ffffff;
      font-size: 10px;
      line-height: 1.4;
    }
    .report-page {
      page-break-after: always;
      background: #ffffff;
      padding: 4px;
      margin-bottom: 24px;
      position: relative;
    }
    .report-page:last-child {
      page-break-after: avoid;
      margin-bottom: 0;
    }

    /* HEADER */
    .header-table {
      width: 100%;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .company-name {
      font-size: 17px;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: #0f172a;
      text-transform: uppercase;
      margin: 0;
      line-height: 1.1;
    }
    .company-sub {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #64748b;
      text-transform: uppercase;
      margin-top: 3px;
    }
    .doc-badge {
      text-align: right;
    }
    .doc-title {
      font-size: 13px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.01em;
      text-transform: uppercase;
      margin: 0;
    }
    .doc-meta {
      font-family: 'JetBrains Mono', monospace;
      font-size: 8.5px;
      font-weight: 600;
      color: #64748b;
      margin-top: 2px;
    }

    /* SECTION CONTAINERS */
    .section {
      margin-bottom: 12px;
      page-break-inside: avoid;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 8px;
    }
    .section-title {
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #334155;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .section-title::before {
      content: "";
      display: inline-block;
      width: 4px;
      height: 11px;
      background: #4A8BDF;
      border-radius: 2px;
    }

    /* BENTO GRIDS */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .card-box {
      border: 1px solid #e2e8f0;
      background-color: #f8fafc;
      border-radius: 6px;
      padding: 8px 10px;
    }

    /* DATA ROWS */
    .data-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 3px 0;
      border-bottom: 1px dashed #f1f5f9;
      font-size: 9.5px;
    }
    .data-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .data-label {
      color: #64748b;
      font-weight: 600;
    }
    .data-value {
      font-weight: 700;
      color: #0f172a;
      text-align: right;
    }
    .font-mono-val {
      font-family: 'JetBrains Mono', monospace;
    }

    /* METRIC CARDS */
    .metric-card {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      border-radius: 6px;
      padding: 7px 8px;
      text-align: center;
    }
    .metric-label {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
      margin-bottom: 2px;
    }
    .metric-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
    }
    .metric-sub {
      font-size: 7.5px;
      font-weight: 600;
      color: #94a3b8;
      margin-top: 1px;
    }

    /* TABLES */
    .table-custom {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
      margin-top: 4px;
    }
    .table-custom th, .table-custom td {
      border: 1px solid #e2e8f0;
      padding: 5px 7px;
      text-align: left;
    }
    .table-custom th {
      background-color: #f1f5f9;
      color: #475569;
      font-weight: 800;
      text-transform: uppercase;
      font-size: 8px;
      letter-spacing: 0.04em;
    }
    .table-custom tr:nth-child(even) td {
      background-color: #fcfcfd;
    }

    /* BADGES */
    .badge {
      display: inline-block;
      padding: 1.5px 6px;
      border-radius: 4px;
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .badge-safe { background-color: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
    .badge-warning { background-color: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
    .badge-critical { background-color: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
    .badge-info { background-color: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
    .badge-slate { background-color: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }

    /* TIMELINE */
    .timeline-strip {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
      margin-top: 6px;
      position: relative;
    }
    .timeline-item {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      border-radius: 5px;
      padding: 5px 4px;
      text-align: center;
      position: relative;
    }
    .timeline-item.active {
      border-color: #93c5fd;
      background: #eff6ff;
    }
    .timeline-node-title {
      font-size: 7.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .timeline-node-time {
      font-family: 'JetBrains Mono', monospace;
      font-size: 8.5px;
      font-weight: 700;
      color: #0f172a;
    }

    /* SIGNATURE BLOCK */
    .sig-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin-top: 14px;
      page-break-inside: avoid;
    }
    .sig-box {
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      background: #ffffff;
      padding: 6px 4px;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 68px;
    }
    .sig-title {
      font-size: 7.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #475569;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 2px;
    }
    .sig-space {
      height: 32px;
    }
    .sig-name {
      font-size: 7.5px;
      font-weight: 700;
      color: #0f172a;
      border-top: 1px dotted #94a3b8;
      padding-top: 2px;
      margin: 0 4px;
    }

    /* FOOTER */
    .footer {
      margin-top: 12px;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8px;
      color: #94a3b8;
      font-weight: 600;
    }

    @media print {
      body {
        padding: 0;
      }
      .report-page {
        margin: 0;
        padding: 0;
        border: none;
      }
    }
  </style>
</head>
<body>`

  list.forEach(t => {
    if (!t) return

    const pType = getProcessType(t)
    const plate = getPlateNumber(t)
    const vendor = getVendor(t)

    // Weights calculation
    const scaleInWeight = pType === 'GBJ' 
      ? (t.weights?.tare ?? t.tareWeight ?? t.weighInWeight) 
      : (t.weights?.gross ?? t.grossWeight ?? t.weighInWeight)
    const scaleOutWeight = pType === 'GBJ' 
      ? (t.weights?.gross ?? t.grossWeight ?? t.weighOutWeight) 
      : (t.weights?.tare ?? t.tareWeight ?? t.weighOutWeight)
    const netWeight = t.fraud?.net ?? (scaleInWeight && scaleOutWeight ? Math.abs(scaleInWeight - scaleOutWeight) : (t.netWeight || null))
    const whRealization = t.fraud?.roll ?? t.warehouseGrossWeight ?? t.actualWeight ?? null
    const deviationKg = t.fraud?.diff ?? (netWeight !== null && whRealization !== null ? Math.abs(netWeight - whRealization) : null)
    const deviationPct = t.fraud?.deviationPercent ?? (netWeight && whRealization ? ((whRealization - netWeight) / netWeight) * 100 : null)
    const deviationDirection = t.fraud?.direction || (whRealization !== null && netWeight !== null ? (whRealization > netWeight ? '+' : whRealization < netWeight ? '-' : '=') : '')
    const devDirLabel = deviationDirection === '+' ? 'Overage / Kelebihan' : deviationDirection === '-' ? 'Shortage / Susut' : (deviationKg === 0 ? 'Matched / Sesuai' : '—')

    // QC & Checks Extraction
    const qcDetails = t.qcDetails || {}
    const imChecks = Array.isArray(t.incomingMaterialChecks) ? t.incomingMaterialChecks : []
    const imCheck = imChecks.find(c => c.isCurrent !== false) || imChecks[0] || {}
    const qcvChecks = Array.isArray(t.qcVehicleChecks) ? t.qcVehicleChecks : []
    const qcvCheck = qcvChecks.find(c => c.isCurrent !== false) || qcvChecks[0] || {}

    // Sampling QC (GBB/GSP)
    const initMoisture = t.initialMoisture ?? imCheck.moisture ?? qcDetails.kadarAir ?? null
    const initVisual = t.initialVisual ?? imCheck.color ?? (qcDetails.warna || 'Normal')
    const initOdor = t.initialOdor ?? imCheck.odor ?? (qcDetails.bau || 'Normal')
    const initVerdict = t.initialSamplingStatus ?? imCheck.result ?? qcDetails.status ?? 'APPROVED'
    const initPic = (imCheck.checkedBy && imCheck.checkedBy.name) || qcDetails.pic || 'QC Sampler'
    const initNotes = t.samplingNotes || imCheck.notes || qcDetails.note || '—'

    // Lab QA (GBB/GSP)
    const labMoisture = qcDetails.kadarAir ?? imCheck.moisture ?? null
    const labFM = qcDetails.totalFM ?? imCheck.foreignMatter ?? null
    const labBroken = qcDetails.broken ?? null
    const labBean = qcDetails.bijiOK ?? (imCheck.goodBeanPercentage || (imCheck.result === 'PASS' ? 100 : null))
    const labAw = qcDetails.waterActivity ?? null
    const labVerdict = t.qcDecision || qcDetails.status || imCheck.result || 'APPROVED'
    const labPic = qcDetails.pic || (imCheck.checkedBy && imCheck.checkedBy.name) || 'QC Lab Analyst'
    const labNotes = t.qcNotes || qcDetails.note || imCheck.notes || imCheck.defectNotes || '—'

    // GBJ Vehicle Checklist Items
    const vCleanliness = qcvCheck.vehicleCleanliness || qcDetails.vehicleCleanliness || 'PASS'
    const vSeal = qcvCheck.sealCondition || qcDetails.sealCondition || 'PASS'
    const vOdor = qcvCheck.vehicleOdor || qcDetails.vehicleOdor || 'PASS'
    const vPest = qcvCheck.pestEvidence || qcDetails.pestEvidence || 'PASS'
    const vDoc = qcvCheck.documentCompleteness || qcDetails.documentCompleteness || 'PASS'
    const vCond = qcvCheck.vehicleCondition || qcDetails.vehicleCondition || 'PASS'
    const vVerdict = qcvCheck.result || qcDetails.status || 'APPROVED'
    const vPic = (qcvCheck.checkedBy && qcvCheck.checkedBy.name) || qcDetails.pic || 'QC Inspector'
    const vNotes = qcvCheck.notes || qcDetails.note || '—'

    // Durations & TAT
    const durations = t.durations || {}
    const waitingInMin = durations.waitingIn || 0
    const warehouseMin = durations.warehouse || 0
    const qcMin = durations.qc || 0
    const waitingOutMin = durations.waitingOut || 0
    const totalTatMin = durations.total || 0
    const isSlaCompliant = totalTatMin <= 90

    // Corrections
    const corrections = Array.isArray(t.corrections) ? t.corrections : (Array.isArray(t.operationLogCorrections) ? t.operationLogCorrections : [])

    // Cargo Manifest Items
    const cargoItems = Array.isArray(t.cargoItems) ? t.cargoItems : []

    // Timestamps
    const gateInTime = t.timestamps?.gateInAt || t.gateInAt || t.createdAt
    const weighInTime = t.timestamps?.weighInAt || t.weighInAt
    const whStartTime = t.timestamps?.warehouseStartAt || t.warehouseStartAt
    const whEndTime = t.timestamps?.warehouseEndAt || t.warehouseEndAt
    const qcStartTime = t.timestamps?.qcStartAt || t.qcStartAt
    const qcEndTime = t.timestamps?.qcEndAt || t.qcEndAt
    const weighOutTime = t.timestamps?.weighOutAt || t.weighOutAt
    const gateOutTime = t.timestamps?.gateOutAt || t.gateOutAt || t.completedAt

    html += `
    <div class="report-page">
      <!-- HEADER -->
      <table class="header-table" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <h1 class="company-name">PT Santos Jaya Abadi</h1>
            <div class="company-sub">Gate Management System &bull; Full Operational Audit Record</div>
          </td>
          <td class="doc-badge">
            <h2 class="doc-title">TRUCK AUDIT DOSSIER</h2>
            <div class="doc-meta">ID: ${escapeHtml(t.id)} &bull; ${escapeHtml(pType)} HUB</div>
          </td>
        </tr>
      </table>

      <!-- 1. VEHICLE, DRIVER & REGISTRATION -->
      <div class="section">
        <div class="section-header">
          <h3 class="section-title">1. Vehicle, Driver & Security Registration</h3>
          <span class="badge ${t.status === 'COMPLETED' ? 'badge-safe' : t.status === 'CANCELLED' || t.status?.includes('REJECT') ? 'badge-critical' : 'badge-info'}">
            Status: ${escapeHtml(t.status)}
          </span>
        </div>
        <div class="grid-2">
          <div class="card-box">
            <div class="data-row">
              <span class="data-label">Plate Number (Nopol)</span>
              <span class="data-value font-mono-val" style="font-size: 11px;">${escapeHtml(plate)}</span>
            </div>
            <div class="data-row">
              <span class="data-label">Driver Name (Supir)</span>
              <span class="data-value">${escapeHtml(t.driverName)}</span>
            </div>
            <div class="data-row">
              <span class="data-label">Driver Contact / Phone</span>
              <span class="data-value font-mono-val">${escapeHtml(t.driverPhone)}</span>
            </div>
            <div class="data-row">
              <span class="data-label">ID / KTP / SIM (Guest ID)</span>
              <span class="data-value font-mono-val">${escapeHtml(t.guestId || t.guestIdNumber)}</span>
            </div>
            <div class="data-row">
              <span class="data-label">Vehicle Type (Jenis Armada)</span>
              <span class="data-value">${escapeHtml(t.vehicleType)}</span>
            </div>
          </div>

          <div class="card-box">
            <div class="data-row">
              <span class="data-label">Vendor / Transporter</span>
              <span class="data-value">${escapeHtml(vendor)}</span>
            </div>
            <div class="data-row">
              <span class="data-label">Destination Hub (Tujuan)</span>
              <span class="data-value badge badge-slate">${escapeHtml(pType)} Warehouse</span>
            </div>
            <div class="data-row">
              <span class="data-label">Delivery Note (Surat Jalan)</span>
              <span class="data-value font-mono-val">${escapeHtml(t.suratJalanNumber || t.deliveryNoteNumber || t.doNumber)}</span>
            </div>
            <div class="data-row">
              <span class="data-label">PO / Contract Number</span>
              <span class="data-value font-mono-val">${escapeHtml(t.poNumber)}</span>
            </div>
            <div class="data-row">
              <span class="data-label">Permit Card / RFID</span>
              <span class="data-value font-mono-val">${escapeHtml(t.permitCardNumber || t.permitCard)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. CARGO MANIFEST (IF PRESENT) -->
      ${cargoItems.length > 0 ? `
      <div class="section">
        <div class="section-header">
          <h3 class="section-title">2. Cargo Manifest & Item Breakdown</h3>
          <span class="badge badge-slate">${cargoItems.length} Items</span>
        </div>
        <table class="table-custom">
          <thead>
            <tr>
              <th style="width: 30px;">No</th>
              <th>Material / Item Description</th>
              <th style="width: 100px; text-align: right;">Quantity</th>
              <th style="width: 120px; text-align: right;">Specification / Notes</th>
            </tr>
          </thead>
          <tbody>
            ${cargoItems.map((item, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td style="font-weight: 700;">${escapeHtml(item.name || item.description || item.itemName)}</td>
                <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 700;">${escapeHtml(item.quantity || item.qty)} ${escapeHtml(item.unit || 'Bags')}</td>
                <td style="text-align: right;">${escapeHtml(item.notes || item.spec || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <!-- 3. WEIGHBRIDGE & SCALE RECONCILIATION -->
      <div class="section">
        <div class="section-header">
          <h3 class="section-title">${cargoItems.length > 0 ? '3' : '2'}. Weighbridge & Warehouse Scale Reconciliation</h3>
          <span class="badge ${t.fraud?.status === 'CRITICAL' ? 'badge-critical' : t.fraud?.status === 'WARNING' ? 'badge-warning' : t.fraud?.status === 'PENDING' ? 'badge-slate' : 'badge-safe'}">
            Scale Audit: ${escapeHtml(t.fraud?.status || 'PENDING')}
          </span>
        </div>
        
        <div class="grid-4" style="margin-bottom: 8px;">
          <div class="metric-card">
            <div class="metric-label">Scale IN (${pType === 'GBJ' ? 'Tare' : 'Gross'})</div>
            <div class="metric-val">${formatWeight(scaleInWeight)}</div>
            <div class="metric-sub">${formatDateTime(weighInTime)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Scale OUT (${pType === 'GBJ' ? 'Gross' : 'Tare'})</div>
            <div class="metric-val">${formatWeight(scaleOutWeight)}</div>
            <div class="metric-sub">${formatDateTime(weighOutTime)}</div>
          </div>
          <div class="metric-card" style="background: #f0fdf4; border-color: #bbf7d0;">
            <div class="metric-label" style="color: #166534;">Net Weighbridge</div>
            <div class="metric-val" style="color: #14532d;">${formatWeight(netWeight)}</div>
            <div class="metric-sub" style="color: #15803d;">Timbangan Jembatan</div>
          </div>
          <div class="metric-card" style="background: #eff6ff; border-color: #bfdbfe;">
            <div class="metric-label" style="color: #1e40af;">Warehouse Realization</div>
            <div class="metric-val" style="color: #1e3a8a;">${formatWeight(whRealization)}</div>
            <div class="metric-sub" style="color: #2563eb;">Realisasi Gudang</div>
          </div>
        </div>

        <div class="card-box">
          <div class="data-row">
            <span class="data-label">Scale Variance (Selisih kg)</span>
            <span class="data-value font-mono-val" style="color: ${deviationKg && deviationKg > 50 ? '#b91c1c' : '#0f172a'};">
              ${deviationKg !== null ? formatWeight(deviationKg) : '—'}
            </span>
          </div>
          <div class="data-row">
            <span class="data-label">Percentage Variance (Deviasi %)</span>
            <span class="data-value font-mono-val" style="color: ${deviationPct && Math.abs(deviationPct) > 0.5 ? '#b91c1c' : '#0f172a'};">
              ${formatPercentage(deviationPct)} (${devDirLabel})
            </span>
          </div>
          <div class="data-row">
            <span class="data-label">Scale Audit & Integrity Verdict</span>
            <span class="data-value" style="font-weight: 800;">
              ${escapeHtml(t.fraud?.details || t.fraud?.notes || (deviationKg === 0 ? 'Toleransi Timbangan Sesuai (Zero Anomaly)' : devDirLabel))}
            </span>
          </div>
        </div>
      </div>

      <!-- 4. QUALITY ASSURANCE (QC) & INSPECTION VERDICT -->
      <div class="section">
        <div class="section-header">
          <h3 class="section-title">${cargoItems.length > 0 ? '4' : '3'}. Quality Assurance (QC) & Inspection Audit</h3>
          <span class="badge ${labVerdict === 'REJECT' || labVerdict === 'REJECTED' || vVerdict === 'REJECT' ? 'badge-critical' : labVerdict?.includes('Note') || labVerdict?.includes('CATATAN') ? 'badge-warning' : 'badge-safe'}">
            QC Decision: ${escapeHtml(pType === 'GBJ' ? vVerdict : labVerdict)}
          </span>
        </div>

        ${pType === 'GBJ' ? `
        <!-- GBJ Vehicle & Delivery Inspection Checklist -->
        <table class="table-custom">
          <thead>
            <tr>
              <th>Inspection Parameter</th>
              <th style="width: 80px; text-align: center;">Result</th>
              <th>Inspection Parameter</th>
              <th style="width: 80px; text-align: center;">Result</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Vehicle Cleanliness (Kebersihan Box)</td>
              <td style="text-align: center;"><span class="badge ${vCleanliness === 'PASS' ? 'badge-safe' : 'badge-critical'}">${escapeHtml(vCleanliness)}</span></td>
              <td>Door Seal Intact (Kondisi Segel Pintu)</td>
              <td style="text-align: center;"><span class="badge ${vSeal === 'PASS' ? 'badge-safe' : 'badge-critical'}">${escapeHtml(vSeal)}</span></td>
            </tr>
            <tr>
              <td>Odor & Hygiene Check (Aroma / Bebas Bau)</td>
              <td style="text-align: center;"><span class="badge ${vOdor === 'PASS' ? 'badge-safe' : 'badge-critical'}">${escapeHtml(vOdor)}</span></td>
              <td>Pest & Animal Control (Bebas Hama/Kutu)</td>
              <td style="text-align: center;"><span class="badge ${vPest === 'PASS' ? 'badge-safe' : 'badge-critical'}">${escapeHtml(vPest)}</span></td>
            </tr>
            <tr>
              <td>Document Completeness (CoA & Surat Jalan)</td>
              <td style="text-align: center;"><span class="badge ${vDoc === 'PASS' ? 'badge-safe' : 'badge-critical'}">${escapeHtml(vDoc)}</span></td>
              <td>Vehicle Floor Condition (Lantai Rata / Bebas Bocor)</td>
              <td style="text-align: center;"><span class="badge ${vCond === 'PASS' ? 'badge-safe' : 'badge-critical'}">${escapeHtml(vCond)}</span></td>
            </tr>
            <tr>
              <td colspan="4" style="background-color: #f8fafc; padding: 6px 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 8.5px;">
                  <span><strong>QC Inspector PIC:</strong> ${escapeHtml(vPic)}</span>
                  <span><strong>Inspection Notes:</strong> ${escapeHtml(vNotes)}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        ` : `
        <!-- GBB / GSP Raw Material QA Parameters -->
        <table class="table-custom">
          <thead>
            <tr>
              <th>Moisture (Kadar Air)</th>
              <th>Foreign Matter (FM)</th>
              <th>Bean Condition (Biji Baik)</th>
              <th>Defect / Broken</th>
              <th>Water Activity (Aw)</th>
              <th>QC Inspector / PIC</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="font-mono-val" style="font-weight: 700;">${escapeHtml(labMoisture !== null ? labMoisture + '%' : '—')}</td>
              <td class="font-mono-val" style="font-weight: 700;">${escapeHtml(labFM !== null ? labFM + '%' : '—')}</td>
              <td class="font-mono-val" style="font-weight: 700;">${escapeHtml(labBean !== null ? labBean + '%' : '—')}</td>
              <td class="font-mono-val" style="font-weight: 700;">${escapeHtml(labBroken !== null ? labBroken + '%' : '0%')}</td>
              <td class="font-mono-val" style="font-weight: 700;">${escapeHtml(labAw !== null ? labAw : '—')}</td>
              <td style="font-weight: 700;">${escapeHtml(labPic)}</td>
            </tr>
            <tr>
              <td colspan="6" style="background-color: #f8fafc; padding: 6px 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 8.5px;">
                  <span><strong>Initial Sampling:</strong> Kadar Air: ${escapeHtml(initMoisture ? initMoisture + '%' : '—')} &bull; Visual: ${escapeHtml(initVisual)} &bull; Odor: ${escapeHtml(initOdor)} (${escapeHtml(initVerdict)})</span>
                  <span><strong>QA Lab Concession / Notes:</strong> ${escapeHtml(labNotes)}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        `}
      </div>

      <!-- 5. OPERATIONS TIMELINE & TURN AROUND TIME (TAT) -->
      <div class="section">
        <div class="section-header">
          <h3 class="section-title">${cargoItems.length > 0 ? '5' : '4'}. Chronological Timeline & TAT SLA Analytics</h3>
          <span class="badge ${isSlaCompliant ? 'badge-safe' : 'badge-warning'}">
            Total TAT: ${totalTatMin} Min (${isSlaCompliant ? 'Within SLA' : 'SLA Exceeded'})
          </span>
        </div>

        <div class="timeline-strip">
          <div class="timeline-item ${gateInTime ? 'active' : ''}">
            <div class="timeline-node-title">1. Gate In</div>
            <div class="timeline-node-time">${formatDateTime(gateInTime).split(', ')[1] || '—'}</div>
          </div>
          <div class="timeline-item ${weighInTime ? 'active' : ''}">
            <div class="timeline-node-title">2. Weigh In</div>
            <div class="timeline-node-time">${formatDateTime(weighInTime).split(', ')[1] || '—'}</div>
          </div>
          <div class="timeline-item ${whStartTime || whEndTime ? 'active' : ''}">
            <div class="timeline-node-title">3. Warehouse</div>
            <div class="timeline-node-time">${formatDateTime(whEndTime || whStartTime).split(', ')[1] || '—'}</div>
          </div>
          <div class="timeline-item ${qcStartTime || qcEndTime ? 'active' : ''}">
            <div class="timeline-node-title">4. QC Lab</div>
            <div class="timeline-node-time">${formatDateTime(qcEndTime || qcStartTime).split(', ')[1] || '—'}</div>
          </div>
          <div class="timeline-item ${weighOutTime ? 'active' : ''}">
            <div class="timeline-node-title">5. Weigh Out</div>
            <div class="timeline-node-time">${formatDateTime(weighOutTime).split(', ')[1] || '—'}</div>
          </div>
          <div class="timeline-item ${gateOutTime ? 'active' : ''}">
            <div class="timeline-node-title">6. Gate Out</div>
            <div class="timeline-node-time">${formatDateTime(gateOutTime).split(', ')[1] || '—'}</div>
          </div>
        </div>

        <div class="grid-4" style="margin-top: 6px;">
          <div class="metric-card" style="padding: 4px 6px;">
            <div class="metric-label" style="font-size: 7.5px;">Waiting In Queue</div>
            <div class="metric-val" style="font-size: 10px;">${waitingInMin} min</div>
          </div>
          <div class="metric-card" style="padding: 4px 6px;">
            <div class="metric-label" style="font-size: 7.5px;">Warehouse Duration</div>
            <div class="metric-val" style="font-size: 10px;">${warehouseMin} min</div>
          </div>
          <div class="metric-card" style="padding: 4px 6px;">
            <div class="metric-label" style="font-size: 7.5px;">QC Testing Duration</div>
            <div class="metric-val" style="font-size: 10px;">${qcMin} min</div>
          </div>
          <div class="metric-card" style="padding: 4px 6px;">
            <div class="metric-label" style="font-size: 7.5px;">Waiting Out / Dispatch</div>
            <div class="metric-val" style="font-size: 10px;">${waitingOutMin} min</div>
          </div>
        </div>
      </div>

      <!-- 6. ADMINISTRATIVE CORRECTIONS AUDIT TRAIL (IF ANY) -->
      ${corrections.length > 0 ? `
      <div class="section">
        <div class="section-header">
          <h3 class="section-title">${cargoItems.length > 0 ? '6' : '5'}. Administrative Corrections & OCC Audit Log</h3>
          <span class="badge badge-warning">${corrections.length} Correction Records</span>
        </div>
        <table class="table-custom">
          <thead>
            <tr>
              <th style="width: 110px;">Timestamp</th>
              <th style="width: 110px;">Module / Field</th>
              <th>Original Value</th>
              <th>Corrected Value</th>
              <th style="width: 100px;">Admin PIC</th>
              <th>Reason / Remark</th>
            </tr>
          </thead>
          <tbody>
            ${corrections.map(c => `
              <tr>
                <td class="font-mono-val">${formatDateTime(c.createdAt)}</td>
                <td style="font-weight: 700;">${escapeHtml(c.module || 'TRANSACTION')} &bull; ${escapeHtml(c.fieldName || c.action)}</td>
                <td style="color: #991b1b; text-decoration: line-through;">${escapeHtml(c.oldValue || '—')}</td>
                <td style="color: #065f46; font-weight: 700;">${escapeHtml(c.newValue || '—')}</td>
                <td>${escapeHtml(c.user?.name || c.userId || 'System Admin')}</td>
                <td>${escapeHtml(c.reason || c.remark || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <!-- 7. FORMAL AUTHORIZATION & SIGN-OFF BLOCKS -->
      <div class="section" style="margin-top: 14px;">
        <div class="section-header">
          <h3 class="section-title">${cargoItems.length > 0 ? (corrections.length > 0 ? '7' : '6') : (corrections.length > 0 ? '6' : '5')}. Formal Authorization Sign-Off Blocks</h3>
          <span class="badge badge-slate">5 Verification Signatures</span>
        </div>
        <div class="sig-grid">
          <div class="sig-box">
            <span class="sig-title">1. Pos Security</span>
            <div class="sig-space"></div>
            <span class="sig-name">( Petugas Gate In/Out )</span>
          </div>
          <div class="sig-box">
            <span class="sig-title">2. Weighbridge Op.</span>
            <div class="sig-space"></div>
            <span class="sig-name">( Operator Timbangan )</span>
          </div>
          <div class="sig-box">
            <span class="sig-title">3. QC Inspection / Lab</span>
            <div class="sig-space"></div>
            <span class="sig-name">${labPic ? `( ${escapeHtml(labPic)} )` : '( Petugas QC )'}</span>
          </div>
          <div class="sig-box">
            <span class="sig-title">4. Warehouse Officer</span>
            <div class="sig-space"></div>
            <span class="sig-name">( Kepala Gudang )</span>
          </div>
          <div class="sig-box">
            <span class="sig-title">5. Driver / Transporter</span>
            <div class="sig-space"></div>
            <span class="sig-name">( ${escapeHtml(t.driverName || 'Pengemudi')} )</span>
          </div>
        </div>
      </div>

      <!-- FOOTER -->
      <div class="footer">
        <span>Printed on: ${new Date().toLocaleString('id-ID')} &bull; PT Santos Jaya Abadi GMS Intelligence System</span>
        <span>CONFIDENTIAL ENTERPRISE AUDIT RECORD &bull; ALL RIGHTS RESERVED</span>
      </div>
    </div>
    `
  })

  html += `
</body>
</html>`

  return html
}

export const printTruckReport = (truckListOrSingle) => {
  const list = Array.isArray(truckListOrSingle) ? truckListOrSingle : [truckListOrSingle]
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Popup terblokir oleh browser. Izinkan popup untuk mencetak laporan PDF.')
    return
  }
  
  printWindow.document.write(generatePrintHTML(list))
  printWindow.document.close()
  
  printWindow.onload = () => {
    printWindow.focus()
    printWindow.print()
    printWindow.close()
  }
}
