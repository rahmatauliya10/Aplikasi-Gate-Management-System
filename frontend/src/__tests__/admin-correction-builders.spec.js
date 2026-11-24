import { describe, it, expect } from 'vitest'
import { buildGbjCorrectionItems, buildGspCorrectionChecklist, buildGbbSamplingPayload, hasSamplingChanged } from '../utils/correctionPayload'
import { GBJ_VEHICLE_CHECKLIST, GBJ_CHECKLIST_SEVERITY } from '../utils/gbjQcFlow'

const record = () => ({ id: 'qc-current', decisionMode: 'NORMAL_PASS', result: 'PASS', hasDeviation: false, deviationReason: null, checklistItems: { retained: 'metadata', items: GBJ_VEHICLE_CHECKLIST.map((label, index) => ({ label, ok: true, severity: GBJ_CHECKLIST_SEVERITY[index], photo: null })) } })
const form = rec => ({ gbjChecklist: rec.checklistItems.items.map(item => item.ok), gbjPhotos: rec.checklistItems.items.map(item => item.photo), gbjDecisionMode: rec.decisionMode, gbjDeviationReason: rec.deviationReason ?? '' })

describe('Admin correction process builders', () => {
  it('does not normalize missing historical decisions during identity-only submission', () => {
    const rec = record(); rec.decisionMode = null; rec.hasDeviation = null
    expect(buildGbjCorrectionItems(rec, form(rec))).toEqual([])
  })
  it('preserves GBJ metadata and sends explicit current targets only for intentional changes', () => {
    const rec = record(); const edited = form(rec)
    edited.gbjChecklist[2] = false
    edited.gbjPhotos[2] = 'data:image/png;base64,aW1hZ2U='
    edited.gbjDecisionMode = 'APPROVED_WITH_DEVIATION'
    edited.gbjDeviationReason = 'Pengawasan tambahan dilakukan'
    const items = buildGbjCorrectionItems(rec, edited)
    expect(items.find(item => item.fieldName === 'checklistItems').newValue.retained).toBe('metadata')
    expect(items.find(item => item.fieldName === 'hasDeviation').newValue).toBe(true)
    expect(items.every(item => item.targetModule === 'QC_VEHICLE' && item.targetRecordId === rec.id)).toBe(true)
    expect(rec.checklistItems.items[2].ok).toBe(true)
  })
  it('rejects incomplete GBJ instead of creating missing items or false statuses', () => {
    const rec = record(); rec.checklistItems.items.pop()
    const edited = form(rec); edited.gbjChecklist[0] = false
    expect(() => buildGbjCorrectionItems(rec, edited)).toThrow()
  })
  it('compares legacy sampling without synthetic initialMoisture zero', () => {
    const original = [{ label: 'Sampling Visual', ok: true }]
    expect(hasSamplingChanged(original, { items: [...original] })).toBe(false)
  })
  it('preserves moisture when its input is cleared while editing another sampling item', () => {
    const source = { initialMoisture: 12, items: [{ label: 'Sampling Visual', ok: true }, { label: 'Estimasi Moisture', value: 12 }] }
    const next = buildGbbSamplingPayload({ qcvVisual: 'REJECT', qcvMoisture: '' }, source)
    expect(next.initialMoisture).toBe(12)
    expect(next.items[1].value).toBe(12)
    expect(next.items[0].ok).toBe(false)
  })
  it('preserves GSP item evidence/order and returns no patch for unchanged results', () => {
    const source = { version: 'v', disposition: { decidedById: 'original' }, items: [{ code: 'CLEAN_VEHICLE', result: 'OK', photoAttachmentId: 'official' }] }
    expect(buildGspCorrectionChecklist(source, [true])).toBeNull()
    const next = buildGspCorrectionChecklist(source, [false])
    expect(next.items[0]).toEqual({ ...source.items[0], result: 'NOT_OK' })
    expect(next.disposition).toEqual(source.disposition)
    expect(source.items[0].result).toBe('OK')
  })
})
