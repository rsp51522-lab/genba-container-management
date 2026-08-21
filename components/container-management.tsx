'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Download,
  FileText,
  PackageCheck,
  Printer,
  RotateCcw,
  Search,
  Truck,
} from 'lucide-react'
import {
  containerAssets,
  initialAssignments,
  initialReports,
  longTermThresholds,
  type ContainerAssignment,
  type ContainerAssetType,
  type ContainerReport,
  type ContainerWorkType,
  type LongTermThreshold,
} from '@/lib/container-data'

type FormState = {
  workDate: string
  companyName: string
  siteName: string
  driverName: string
  workType: ContainerWorkType
  assetType: ContainerAssetType | '手積み'
  installAssetId: string
  collectAssetId: string
  sizeLabel: string
  quantity: string
  note: string
}

const storageKey = 'genba-container-management-v1'

function getTodayIso() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function formatDate(value: string) {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return `${year}/${Number(month)}/${Number(day)}`
}

function daysFrom(date: string, today = getTodayIso()) {
  const diff = parseDate(today).getTime() - parseDate(date).getTime()
  return Math.max(0, Math.floor(diff / 86_400_000))
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s/g, '')
}

function makeDefaultForm(): FormState {
  return {
    workDate: getTodayIso(),
    companyName: '○○建設',
    siteName: '同左',
    driverName: '',
    workType: '設置',
    assetType: 'コンテナ',
    installAssetId: 'container-408',
    collectAssetId: '',
    sizeLabel: '2.5m3',
    quantity: '1基',
    note: '',
  }
}

function getAssetLabel(assetId: string) {
  return containerAssets.find((asset) => asset.id === assetId)?.label ?? ''
}

function downloadCsv(reports: ContainerReport[]) {
  const headers = ['作業日', '会社名', '現場名', '運搬者', '作業内容', '設置番号', '回収番号', '種類', '数量', '備考']
  const rows = reports.map((report) => [
    formatDate(report.workDate),
    report.companyName,
    report.siteName,
    report.driverName,
    report.workType,
    report.installAssetLabel ?? '',
    report.collectAssetLabel ?? '',
    `${report.sizeLabel} ${report.assetType}`,
    report.quantity,
    report.note ?? '',
  ])
  const body = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `コンテナ作業日報_${getTodayIso()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function loadStoredData() {
  if (typeof window === 'undefined') {
    return { assignments: initialAssignments, reports: initialReports, thresholds: longTermThresholds }
  }

  const raw = window.localStorage.getItem(storageKey)
  if (!raw) return { assignments: initialAssignments, reports: initialReports, thresholds: longTermThresholds }

  try {
    const parsed = JSON.parse(raw) as {
      assignments?: ContainerAssignment[]
      reports?: ContainerReport[]
      thresholds?: LongTermThreshold[]
    }

    return {
      assignments: parsed.assignments?.length ? parsed.assignments : initialAssignments,
      reports: parsed.reports?.length ? parsed.reports : initialReports,
      thresholds: parsed.thresholds?.length ? parsed.thresholds : longTermThresholds,
    }
  } catch {
    return { assignments: initialAssignments, reports: initialReports, thresholds: longTermThresholds }
  }
}

export function ContainerManagement() {
  const [stored, setStored] = useState(loadStoredData)
  const [form, setForm] = useState<FormState>(makeDefaultForm)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [companyQuery, setCompanyQuery] = useState('○○建設')
  const [containerQuery, setContainerQuery] = useState('')

  const activeAssignments = useMemo(
    () => stored.assignments.filter((assignment) => !assignment.collectedOn),
    [stored.assignments],
  )

  const selectedCompanyAssignments = useMemo(() => {
    const query = normalizeText(companyQuery)
    if (!query) return activeAssignments

    return activeAssignments.filter((assignment) => normalizeText(assignment.companyName).includes(query))
  }, [activeAssignments, companyQuery])

  const selectedContainerAssignments = useMemo(() => {
    const query = normalizeText(containerQuery)
    if (!query) return []

    return activeAssignments.filter((assignment) => normalizeText(assignment.assetLabel).includes(query))
  }, [activeAssignments, containerQuery])

  const longTermAssignments = useMemo(
    () =>
      [...activeAssignments]
        .map((assignment) => ({ ...assignment, elapsedDays: daysFrom(assignment.installedOn) }))
        .sort((a, b) => b.elapsedDays - a.elapsedDays),
    [activeAssignments],
  )

  function persist(next: {
    assignments: ContainerAssignment[]
    reports: ContainerReport[]
    thresholds: LongTermThreshold[]
  }) {
    setStored(next)
    window.localStorage.setItem(storageKey, JSON.stringify(next))
  }

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => {
      const next = { ...current, ...patch }
      const installAsset = containerAssets.find((asset) => asset.id === next.installAssetId)
      if (patch.assetType && patch.assetType !== '手積み') {
        const firstAsset = containerAssets.find((asset) => asset.assetType === patch.assetType)
        next.installAssetId = firstAsset?.id ?? ''
        next.collectAssetId = ''
        next.sizeLabel = firstAsset?.sizeLabel ?? patch.assetType
      }
      if (patch.installAssetId && installAsset) {
        next.assetType = installAsset.assetType
        next.sizeLabel = installAsset.sizeLabel
      }
      if (patch.assetType === '手積み') {
        next.installAssetId = ''
        next.collectAssetId = ''
        next.sizeLabel = '手積み'
      }
      return next
    })
  }

  function validate() {
    const nextErrors: string[] = []
    const needsInstall = form.workType === '設置' || form.workType === '交換'
    const needsCollect = form.workType === '回収' || form.workType === '交換'

    if (!form.workDate) nextErrors.push('作業日を入力してください。')
    if (!form.companyName.trim()) nextErrors.push('お客様・会社名を入力してください。')
    if (form.workType !== '手積み' && !form.quantity.trim()) nextErrors.push('数量・単位を入力してください。')

    if (form.assetType === '手積み') return nextErrors

    if (needsInstall) {
      if (!form.installAssetId) {
        nextErrors.push('設置するコンテナまたはカゴを選択してください。')
      } else {
        const installAsset = containerAssets.find((asset) => asset.id === form.installAssetId)
        const active = activeAssignments.find((assignment) => assignment.assetId === form.installAssetId)
        if (installAsset?.assetType === 'コンテナ' && active) {
          nextErrors.push(`${active.assetLabel}は現在、${active.companyName} / ${active.siteName}に設置中です。`)
        }
      }
    }

    if (needsCollect) {
      if (!form.collectAssetId) {
        nextErrors.push('回収するコンテナまたはカゴを選択してください。')
      } else {
        const collectAsset = containerAssets.find((asset) => asset.id === form.collectAssetId)
        const active = activeAssignments.find((assignment) => {
          if (collectAsset?.assetType === 'カゴ') {
            return (
              assignment.assetId === form.collectAssetId &&
              normalizeText(assignment.companyName) === normalizeText(form.companyName)
            )
          }
          return assignment.assetId === form.collectAssetId
        })
        if (!active) {
          nextErrors.push(`${getAssetLabel(form.collectAssetId)}は現在設置中ではありません。存在しない番号、別会社のカゴ、または回収済みの可能性があります。`)
        } else if (normalizeText(active.companyName) !== normalizeText(form.companyName)) {
          nextErrors.push(`${active.assetLabel}は現在、別のお客様（${active.companyName} / ${active.siteName}）に設置中です。`)
        }
      }
    }

    if (form.workType === '交換' && form.installAssetId === form.collectAssetId) {
      nextErrors.push('交換では設置番号と回収番号を別にしてください。')
    }

    return nextErrors
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    const nextErrors = validate()
    setErrors(nextErrors)
    if (nextErrors.length) return

    const needsInstall = form.workType === '設置' || form.workType === '交換'
    const needsCollect = form.workType === '回収' || form.workType === '交換'
    const installAsset = containerAssets.find((asset) => asset.id === form.installAssetId)
    const collectAsset = containerAssets.find((asset) => asset.id === form.collectAssetId)
    const collectTarget = needsCollect
      ? activeAssignments.find((assignment) => {
          if (collectAsset?.assetType === 'カゴ') {
            return (
              assignment.assetId === form.collectAssetId &&
              normalizeText(assignment.companyName) === normalizeText(form.companyName)
            )
          }
          return assignment.assetId === form.collectAssetId
        })
      : null
    const report: ContainerReport = {
      id: `report-${Date.now()}`,
      workDate: form.workDate,
      companyName: form.companyName.trim(),
      siteName: form.siteName.trim() || '未入力',
      driverName: form.driverName.trim(),
      workType: form.workType,
      installAssetId: needsInstall ? form.installAssetId : undefined,
      installAssetLabel: needsInstall ? installAsset?.label : undefined,
      collectAssetId: needsCollect ? form.collectAssetId : undefined,
      collectAssetLabel: needsCollect ? collectAsset?.label : undefined,
      assetType: form.assetType,
      sizeLabel: form.sizeLabel.trim() || installAsset?.sizeLabel || collectAsset?.sizeLabel || form.assetType,
      quantity: form.quantity.trim() || '1式',
      note: form.note.trim(),
    }

    const assignments = stored.assignments.map((assignment) => {
      if (needsCollect && assignment.id === collectTarget?.id && !assignment.collectedOn) {
        return { ...assignment, collectedOn: form.workDate }
      }
      return assignment
    })

    if (needsInstall && installAsset) {
      assignments.unshift({
        id: `assign-${Date.now()}`,
        assetId: installAsset.id,
        assetLabel: installAsset.label,
        assetType: installAsset.assetType,
        sizeLabel: installAsset.sizeLabel,
        companyName: report.companyName,
        siteName: report.siteName,
        installedOn: form.workDate,
        quantity: report.quantity,
        note: report.note,
      })
    }

    persist({
      assignments,
      reports: [report, ...stored.reports],
      thresholds: stored.thresholds,
    })
    setCompanyQuery(report.companyName)
    setContainerQuery(report.installAssetLabel ?? report.collectAssetLabel ?? '')
    setMessage(`${report.companyName}の登録を反映しました。現在設置の一覧も更新済みです。`)
  }

  function resetDemoData() {
    const next = { assignments: initialAssignments, reports: initialReports, thresholds: longTermThresholds }
    persist(next)
    setErrors([])
    setMessage('見本データに戻しました。')
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-3">
        {stored.thresholds.map((threshold) => {
          const count = longTermAssignments.filter((assignment) => assignment.elapsedDays >= threshold.days).length
          return (
            <div key={threshold.id} className="panel rounded-none p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-rose-700">長期設置コンテナ</p>
                  <p className="mt-2 text-4xl font-black text-slate-950">{count}件</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-rose-700" />
              </div>
              <label className="mt-4 block text-sm font-bold text-slate-700">
                {threshold.label}
                <input
                  type="number"
                  min="1"
                  className="mt-2 w-full rounded-none border border-slate-200 px-4 py-3"
                  value={threshold.days}
                  onChange={(event) => {
                    const days = Number(event.target.value)
                    persist({
                      ...stored,
                      thresholds: stored.thresholds.map((item) =>
                        item.id === threshold.id ? { ...item, days: Number.isFinite(days) ? days : item.days } : item,
                      ),
                    })
                  }}
                />
              </label>
            </div>
          )
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form className="panel rounded-none p-5" onSubmit={handleSubmit}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">作業日報入力</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">紙の日報から必要項目だけ入力します。</p>
            </div>
            <Truck className="h-8 w-8 text-emerald-800" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-bold text-slate-700">
              作業日
              <input
                type="date"
                className="w-full rounded-none border border-slate-200 px-4 py-3"
                value={form.workDate}
                onChange={(event) => updateForm({ workDate: event.target.value })}
              />
            </label>
            <label className="space-y-2 text-sm font-bold text-slate-700">
              作業内容
              <select
                className="w-full rounded-none border border-slate-200 px-4 py-3"
                value={form.workType}
                onChange={(event) => {
                  const workType = event.target.value as ContainerWorkType
                  updateForm({ workType, assetType: workType === '手積み' ? '手積み' : 'コンテナ' })
                }}
              >
                <option value="交換">交換</option>
                <option value="設置">設置</option>
                <option value="回収">回収</option>
                <option value="手積み">手積み</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-bold text-slate-700">
              お客様・会社名
              <input
                className="w-full rounded-none border border-slate-200 px-4 py-3"
                value={form.companyName}
                onChange={(event) => updateForm({ companyName: event.target.value })}
              />
            </label>
            <label className="space-y-2 text-sm font-bold text-slate-700">
              現場名
              <input
                className="w-full rounded-none border border-slate-200 px-4 py-3"
                value={form.siteName}
                onChange={(event) => updateForm({ siteName: event.target.value })}
              />
            </label>
            <label className="space-y-2 text-sm font-bold text-slate-700">
              運搬者
              <input
                className="w-full rounded-none border border-slate-200 px-4 py-3"
                placeholder="例：高村さん"
                value={form.driverName}
                onChange={(event) => updateForm({ driverName: event.target.value })}
              />
            </label>
            <label className="space-y-2 text-sm font-bold text-slate-700">
              種類
              <select
                className="w-full rounded-none border border-slate-200 px-4 py-3"
                value={form.assetType}
                onChange={(event) => updateForm({ assetType: event.target.value as ContainerAssetType | '手積み' })}
                disabled={form.workType === '手積み'}
              >
                <option value="コンテナ">コンテナ</option>
                <option value="カゴ">カゴ</option>
                <option value="手積み">手積み</option>
              </select>
            </label>
            {form.workType === '設置' || form.workType === '交換' ? (
              <label className="space-y-2 text-sm font-bold text-slate-700">
                設置コンテナ
                <select
                  className="w-full rounded-none border border-slate-200 px-4 py-3"
                  value={form.installAssetId}
                  onChange={(event) => updateForm({ installAssetId: event.target.value })}
                >
                  <option value="">選択してください</option>
                  {containerAssets
                    .filter((asset) => asset.assetType === form.assetType)
                    .map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.label} / {asset.sizeLabel}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            {form.workType === '回収' || form.workType === '交換' ? (
              <label className="space-y-2 text-sm font-bold text-slate-700">
                回収コンテナ
                <select
                  className="w-full rounded-none border border-slate-200 px-4 py-3"
                  value={form.collectAssetId}
                  onChange={(event) => updateForm({ collectAssetId: event.target.value })}
                >
                  <option value="">選択してください</option>
                  {containerAssets
                    .filter((asset) => asset.assetType === form.assetType)
                    .map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.label} / {asset.sizeLabel}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <label className="space-y-2 text-sm font-bold text-slate-700">
              数量・単位
              <input
                className="w-full rounded-none border border-slate-200 px-4 py-3"
                placeholder="例：2.5m3、kg、本、1基"
                value={form.quantity}
                onChange={(event) => updateForm({ quantity: event.target.value })}
              />
            </label>
            <label className="space-y-2 text-sm font-bold text-slate-700 md:col-span-2">
              備考
              <textarea
                className="min-h-24 w-full rounded-none border border-slate-200 px-4 py-3"
                value={form.note}
                onChange={(event) => updateForm({ note: event.target.value })}
              />
            </label>
          </div>

          {errors.length ? (
            <div className="mt-5 border-l-8 border-rose-700 bg-rose-50 p-4 text-sm font-bold leading-6 text-rose-900">
              {errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}

          {message ? <p className="mt-5 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-800">{message}</p> : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <button type="submit" className="rounded-none bg-emerald-700 px-4 py-4 text-base font-black text-white">
              登録して管理表へ反映
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-none border border-slate-300 bg-white px-4 py-4 text-sm font-black text-slate-700"
              onClick={resetDemoData}
            >
              <RotateCcw className="h-5 w-5" />
              見本へ戻す
            </button>
          </div>
        </form>

        <div className="space-y-6">
          <section className="panel rounded-none p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">今どこに何があるか</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">会社名またはコンテナ番号で一発検索できます。</p>
              </div>
              <PackageCheck className="h-8 w-8 text-emerald-800" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2 text-sm font-bold text-slate-700">
                会社名で検索
                <div className="flex items-center border border-slate-200 bg-white px-3">
                  <Search className="h-5 w-5 text-slate-500" />
                  <input
                    className="w-full border-0 px-3 py-3 outline-none"
                    value={companyQuery}
                    onChange={(event) => setCompanyQuery(event.target.value)}
                    placeholder="例：○○建設"
                  />
                </div>
              </label>
              <label className="space-y-2 text-sm font-bold text-slate-700">
                番号で検索
                <div className="flex items-center border border-slate-200 bg-white px-3">
                  <Search className="h-5 w-5 text-slate-500" />
                  <input
                    className="w-full border-0 px-3 py-3 outline-none"
                    value={containerQuery}
                    onChange={(event) => setContainerQuery(event.target.value)}
                    placeholder="例：408番"
                  />
                </div>
              </label>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {(containerQuery ? selectedContainerAssignments : selectedCompanyAssignments).map((assignment) => (
                <article key={assignment.id} className="border-l-8 border-emerald-700 bg-emerald-50 p-5">
                  <p className="text-sm font-bold text-emerald-900">{assignment.companyName}</p>
                  <h3 className="mt-2 text-3xl font-black text-slate-950">{assignment.assetLabel}</h3>
                  <div className="mt-4 grid gap-2 text-sm font-bold text-slate-700">
                    <p>設置日：{formatDate(assignment.installedOn)}</p>
                    <p>経過日数：{daysFrom(assignment.installedOn)}日</p>
                    <p>種類：{assignment.sizeLabel} {assignment.assetType}</p>
                    <p>現場名：{assignment.siteName}</p>
                  </div>
                </article>
              ))}
              {(containerQuery ? selectedContainerAssignments : selectedCompanyAssignments).length === 0 ? (
                <p className="border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-600">
                  該当する現在設置データはありません。
                </p>
              ) : null}
            </div>
          </section>

          <section className="panel rounded-none p-5">
            <h2 className="text-xl font-black text-slate-900">設置期間が長い順</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="border border-slate-200 px-3 py-3">経過</th>
                    <th className="border border-slate-200 px-3 py-3">番号</th>
                    <th className="border border-slate-200 px-3 py-3">会社名</th>
                    <th className="border border-slate-200 px-3 py-3">現場名</th>
                    <th className="border border-slate-200 px-3 py-3">設置日</th>
                  </tr>
                </thead>
                <tbody>
                  {longTermAssignments.slice(0, 12).map((assignment) => (
                    <tr key={assignment.id}>
                      <td className="border border-slate-200 px-3 py-3 font-black text-rose-700">{assignment.elapsedDays}日</td>
                      <td className="border border-slate-200 px-3 py-3 font-bold">{assignment.assetLabel}</td>
                      <td className="border border-slate-200 px-3 py-3">{assignment.companyName}</td>
                      <td className="border border-slate-200 px-3 py-3">{assignment.siteName}</td>
                      <td className="border border-slate-200 px-3 py-3">{formatDate(assignment.installedOn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <section className="panel print-area rounded-none p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">帳票出力</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">作業日報・収集履歴として印刷、またはExcelで開けるCSVに出力します。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-none border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700"
              onClick={() => window.print()}
            >
              <Printer className="h-5 w-5" />
              印刷/PDF
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-none border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700"
              onClick={() => downloadCsv(stored.reports)}
            >
              <Download className="h-5 w-5" />
              Excel用CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse bg-white text-left text-sm">
            <caption className="caption-top py-3 text-2xl font-black text-slate-950">収集履歴</caption>
            <thead>
              <tr>
                {['収集年月日', '現場名（工事件名）及び住所', '運搬者', '設置', '回収', '品目、数量及び搬入先処理場', '備考'].map((header) => (
                  <th key={header} className="border-2 border-slate-700 px-3 py-3 text-center font-black">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stored.reports.map((report) => (
                <tr key={report.id}>
                  <td className="border-2 border-slate-700 px-3 py-3">{formatDate(report.workDate)}</td>
                  <td className="border-2 border-slate-700 px-3 py-3">
                    <span className="font-bold">{report.companyName}</span>
                    <br />
                    {report.siteName}
                  </td>
                  <td className="border-2 border-slate-700 px-3 py-3">{report.driverName}</td>
                  <td className="border-2 border-slate-700 px-3 py-3">{report.installAssetLabel ?? ''}</td>
                  <td className="border-2 border-slate-700 px-3 py-3">{report.collectAssetLabel ?? ''}</td>
                  <td className="border-2 border-slate-700 px-3 py-3">
                    {report.sizeLabel} {report.assetType} / {report.quantity}
                  </td>
                  <td className="border-2 border-slate-700 px-3 py-3">{report.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel rounded-none p-5">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-slate-700" />
          <h2 className="text-xl font-black text-slate-900">第一段階の範囲</h2>
        </div>
        <div className="mt-4 grid gap-3 text-sm font-bold leading-6 text-slate-700 md:grid-cols-4">
          <p className="bg-slate-50 p-4">コンテナ管理</p>
          <p className="bg-slate-50 p-4">転記自動化</p>
          <p className="bg-slate-50 p-4">長期設置アラート</p>
          <p className="bg-slate-50 p-4">帳票出力</p>
        </div>
      </section>
    </div>
  )
}
