import { useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowRight, Check, Clipboard, FileHeart, HeartPulse, Leaf,
  LoaderCircle, RotateCcw, ShieldCheck, Sparkles, Stethoscope, Upload,
  AlertCircle, FileText, Download, BarChart3, TrendingUp, X, ChevronDown
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ReferenceLine
} from 'recharts'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const STATUS_COLORS = { HIGH: '#d97757', LOW: '#d6a34e', NORMAL: '#39866b', UNKNOWN: '#8c9a94' }

function SectionCard({ icon: Icon, eyebrow, title, children, className = '' }) {
  return <section className={`result-card ${className}`}>
    <div className="section-heading">
      <div className="section-icon"><Icon size={18} strokeWidth={1.8} /></div>
      <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
    </div>
    {children}
  </section>
}

function MetricCard({ label, value, note, tone, icon: Icon }) {
  return <div className={`metric-card ${tone || ''}`}>
    <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={16}/></span></div>
    <div className="metric-value">{value}</div><div className="metric-note">{note}</div>
  </div>
}

function App() {
  const [report, setReport] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [chartFilter, setChartFilter] = useState('ABNORMAL')
  const fileRef = useRef(null)
  const characterCount = useMemo(() => report.length.toLocaleString(), [report.length])

  const markers = result?.markers || []
  const chartMarkers = useMemo(() => {
    const selected = chartFilter === 'ALL' ? markers : markers.filter(m => m.status === 'HIGH' || m.status === 'LOW')
    return selected.filter(m => typeof m.value === 'number' && Number.isFinite(m.value)).slice(0, 30)
      .map(m => ({ ...m, shortName: m.name.length > 17 ? `${m.name.slice(0, 16)}…` : m.name }))
  }, [markers, chartFilter])

  async function uploadPdf(file) {
    if (!file) return
    setError('')
    setResult(null)
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file.')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch(`${API_URL}/api/extract-pdf`, { method: 'POST', body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || 'Could not extract text from the PDF.')
      setReport(data.text || '')
      if (!data.text?.trim()) throw new Error('No report text was found in this PDF.')
    } catch (err) {
      setError(err.message || 'PDF upload failed.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function analyzeReport(event) {
    event?.preventDefault()
    setError('')
    setResult(null)
    if (!report.trim()) { setError('Paste your report text or upload a PDF first.'); return }
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blood_report: report }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || 'Unable to analyze this report.')
      setResult(data)
    } catch (err) {
      setError(err.message || 'Could not connect to the analysis server.')
    } finally { setLoading(false) }
  }

  async function copySummary() {
    if (!result) return
    const text = `HEALTH SUMMARY\n${result.health_summary}\n\nSUGGESTED INDIAN DIET PLAN\n${result.diet_plan}\n\nEXTRACTED VALUES\n${result.extracted_values}`
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1800) }
    catch { setError('Clipboard access was blocked by your browser.') }
  }

  async function downloadPdf() {
    if (!result) return
    setDownloading(true); setError('')
    try {
      const response = await fetch(`${API_URL}/api/report/pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result)
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || 'Could not generate the PDF report.')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = 'blood-work-analysis.pdf'
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) { setError(err.message || 'PDF download failed.') }
    finally { setDownloading(false) }
  }

  function reset() {
    setReport(''); setResult(null); setError(''); setCopied(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="Bloodwork home">
        <span className="brand-mark"><HeartPulse size={22}/></span><span>bloodwork<span className="brand-dot">.</span></span>
      </a>
      <div className="topbar-right"><span className="privacy-pill"><ShieldCheck size={14}/> Private by design</span><span className="topbar-label">REPORT INSIGHTS</span></div>
    </header>

    <section className="hero">
      <div className="hero-copy">
        <div className="overline"><span className="overline-line"/> YOUR HEALTH, MADE CLEAR</div>
        <h1>Make sense of<br/><span>your bloodwork.</span></h1>
        <p className="hero-description">Turn complex lab results into a clear summary, interactive marker insights, and practical food guidance built around familiar Indian meals.</p>
        <div className="hero-trust"><div className="trust-icon"><Activity size={16}/></div><span>Understand your results, one marker at a time.</span></div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-cross cross-one">+</div><div className="art-cross cross-two">+</div><div className="art-glow"/>
        <div className="art-card art-card-back"><div className="mini-label">LAB REPORT</div><div className="mini-line long"/><div className="mini-line medium"/><div className="mini-line short"/></div>
        <div className="art-card art-card-front"><div className="art-card-top"><span className="art-pulse"><Activity size={15}/></span><span>HEALTH OVERVIEW</span><span className="live-dot"/></div><div className="art-number">24<span> markers</span></div><div className="art-bars">{Array.from({length:12},(_,i)=><i key={i}/>)}</div><div className="art-legend"><span><i className="legend-green"/> In range</span><span><i className="legend-orange"/> Review</span></div></div>
        <div className="floating-leaf"><Leaf size={23}/></div>
      </div>
    </section>

    <section className="workflow">
      <div className="step"><span className="step-number">01</span><div><strong>Upload or paste</strong><small>PDF report or plain text</small></div></div><div className="step-connector"/>
      <div className="step"><span className="step-number">02</span><div><strong>Analyze the markers</strong><small>Compare to stated ranges</small></div></div><div className="step-connector"/>
      <div className="step"><span className="step-number">03</span><div><strong>Explore your dashboard</strong><small>Summary, charts, and PDF export</small></div></div>
    </section>

    <section className="workspace">
      <div className="workspace-heading"><div><p className="eyebrow">YOUR REPORT</p><h2>Let's take a closer look.</h2></div><span className="secure-note"><ShieldCheck size={15}/> Your report is sent to your configured analysis backend.</span></div>
      <div className="content-grid">
        <form className="input-card" onSubmit={analyzeReport}>
          <div className="card-topline"><div className="card-title-icon"><FileHeart size={19}/></div><div><h3>Blood work report</h3><p>Upload a PDF or paste lab results</p></div><span className="required-tag">PDF / TEXT</span></div>
          <input ref={fileRef} className="hidden-file" type="file" accept="application/pdf,.pdf" onChange={e=>uploadPdf(e.target.files?.[0])}/>
          <button type="button" className="upload-zone" onClick={()=>fileRef.current?.click()} disabled={uploading || loading}>
            <span className="upload-icon">{uploading ? <LoaderCircle className="spin" size={20}/> : <Upload size={20}/>}</span>
            <span className="upload-copy"><strong>{uploading ? 'Extracting PDF text…' : 'Upload a PDF report'}</strong><small>Text-based PDFs up to 12 MB</small></span>
            <span className="browse-link">{uploading ? 'Please wait' : 'Browse files'}</span>
          </button>
          <div className="or-divider"><span/> OR PASTE TEXT <span/></div>
          <label className="sr-only" htmlFor="blood-report">Blood work report text</label>
          <textarea id="blood-report" value={report} onChange={e=>setReport(e.target.value)} placeholder={'Paste your blood report here…\n\nExample:\nHemoglobin: 13.5 g/dL (Reference: 12–16)\nFasting glucose: 105 mg/dL (Reference: 70–99)\nVitamin D: 18 ng/mL (Reference: 30–100)'} maxLength={50000} spellCheck="false"/>
          <div className="textarea-footer"><span><span className="status-dot"/> Ready for analysis</span><span>{characterCount} / 50,000</span></div>
          {error && <div className="error-message" role="alert"><AlertCircle size={17}/>{error}<button type="button" aria-label="Dismiss error" onClick={()=>setError('')}><X size={14}/></button></div>}
          <div className="form-actions"><button className="primary-button" type="submit" disabled={loading || uploading}>{loading ? <><LoaderCircle className="spin" size={18}/> Analyzing report…</> : <>Analyze report <ArrowRight size={17}/></>}</button><button className="reset-button" type="button" onClick={reset} disabled={loading || uploading || (!report && !result)}><RotateCcw size={15}/> Clear</button></div>
          <div className="input-footnote"><ShieldCheck size={14}/> Avoid including your name, address, or patient ID.</div>
        </form>

        <div className="results-column">
          {!result && !loading && <div className="empty-state"><div className="empty-illustration"><div className="empty-circle"><Stethoscope size={32} strokeWidth={1.4}/></div><span className="sparkle sparkle-a">✳</span><span className="sparkle sparkle-b">✦</span></div><p className="eyebrow">YOUR INSIGHTS WILL APPEAR HERE</p><h3>A clearer picture starts here.</h3><p>Submit your report to see a plain-language health summary, marker counts, charts, and Indian food suggestions.</p><div className="empty-features"><span><Check size={14}/> Marker extraction</span><span><Check size={14}/> Simple explanations</span><span><Check size={14}/> Indian diet ideas</span></div></div>}
          {loading && <div className="loading-state"><div className="loading-ring"><LoaderCircle className="spin" size={30}/></div><h3>Reading your report</h3><p>First extracting test values, then preparing your health summary and diet plan.</p><div className="loading-track"><span/></div><small>Usually takes a few moments</small></div>}
          {result && !loading && <>
            <div className="result-toolbar"><div><span className="result-ready"><Check size={13}/> ANALYSIS READY</span><h3>Your report, explained.</h3></div><div className="toolbar-actions"><button className="copy-button" onClick={copySummary}><Clipboard size={15}/>{copied?'Copied!':'Copy'}</button><button className="download-button" onClick={downloadPdf} disabled={downloading}>{downloading?<LoaderCircle className="spin" size={15}/>:<Download size={15}/>} {downloading?'Preparing…':'Download PDF'}</button></div></div>
            <div className="metrics-grid">
              <MetricCard label="Total markers" value={result.total_markers} note="Parsed from report" icon={Activity}/>
              <MetricCard label="In range" value={result.normal_count} note="Classified normal" tone="tone-green" icon={Check}/>
              <MetricCard label="High" value={result.high_count} note="Needs review" tone="tone-high" icon={TrendingUp}/>
              <MetricCard label="Low" value={result.low_count} note="Needs review" tone="tone-low" icon={BarChart3}/>
            </div>
            <SectionCard icon={BarChart3} eyebrow="01 / VISUAL ANALYSIS" title="Blood marker overview" className="chart-card">
              <div className="chart-controls"><span>{chartMarkers.length} numeric markers shown</span><div className="filter-pills"><button className={chartFilter==='ABNORMAL'?'active':''} onClick={()=>setChartFilter('ABNORMAL')}>Abnormal</button><button className={chartFilter==='ALL'?'active':''} onClick={()=>setChartFilter('ALL')}>All markers</button></div></div>
              {chartMarkers.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height={Math.max(210, chartMarkers.length*36)}><BarChart data={chartMarkers} layout="vertical" margin={{top:5,right:20,left:4,bottom:5}} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e8efeb"/>
                <XAxis type="number" tick={{fontSize:10,fill:'#82948b'}} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="shortName" width={112} tick={{fontSize:10,fill:'#60766c'}} axisLine={false} tickLine={false}/>
                <Tooltip cursor={{fill:'#f3f7f4'}} contentStyle={{border:'1px solid #dce8e0',borderRadius:10,fontSize:11}} formatter={(value,name,props)=>[`${props.payload.value_text}${props.payload.unit ? '' : ''}`,`${props.payload.status} · ${props.payload.reference || 'Reference range unavailable'}`]} labelFormatter={(label)=>label}/>
                <ReferenceLine x={0} stroke="#b8c9bf"/>
                <Bar dataKey="value" radius={[0,5,5,0]}>{chartMarkers.map((m,i)=><Cell key={`${m.name}-${i}`} fill={STATUS_COLORS[m.status] || STATUS_COLORS.UNKNOWN}/>)}</Bar>
              </BarChart></ResponsiveContainer><div className="chart-legend"><span><i style={{background:STATUS_COLORS.HIGH}}/> High</span><span><i style={{background:STATUS_COLORS.LOW}}/> Low</span><span><i style={{background:STATUS_COLORS.NORMAL}}/> Normal</span></div></div> : <div className="chart-empty"><BarChart3 size={22}/><p>No numeric markers available for this filter.</p><small>Check the extracted marker list below. Chart values are parsed from the model's Stage 1 text.</small></div>}
              <p className="chart-note">Values may use different units and scales. Compare each marker only with its own lab reference range; bar heights are not directly comparable across different tests.</p>
            </SectionCard>
            <SectionCard icon={HeartPulse} eyebrow="02 / OVERVIEW" title="Health summary" className="summary-card"><div className="result-copy">{result.health_summary}</div><div className="gentle-note"><Sparkles size={15}/><span>Use this as a starting point for a conversation with your healthcare professional.</span></div></SectionCard>
            <SectionCard icon={Leaf} eyebrow="03 / EVERYDAY NUTRITION" title="Suggested Indian diet plan" className="diet-card"><div className="result-copy diet-copy">{result.diet_plan}</div></SectionCard>
            <details className="extracted-details"><summary><span><Activity size={16}/> Extracted blood markers ({markers.length})</span><ChevronDown size={17}/></summary>
              {markers.length ? <div className="marker-table-wrap"><table className="marker-table"><thead><tr><th>Test</th><th>Value</th><th>Status</th><th>Reference</th></tr></thead><tbody>{markers.map((m,i)=><tr key={`${m.name}-${i}`}><td>{m.name}</td><td>{m.value_text || '—'}</td><td><span className={`status-chip status-${m.status.toLowerCase()}`}>{m.status}</span></td><td>{m.reference || 'Not provided'}</td></tr>)}</tbody></table></div> : <pre>{result.extracted_values}</pre>}
            </details>
          </>}
        </div>
      </div>
      <p className="medical-disclaimer"><ShieldCheck size={15}/> AI-generated information can be inaccurate. This tool is not a diagnosis and does not replace professional medical advice.</p>
    </section>
    <footer className="footer"><div className="footer-brand"><span className="footer-mark"><HeartPulse size={16}/></span> bloodwork.</div><p>Made to make lab results easier to understand.</p><div className="disclaimer"><ShieldCheck size={15}/><span>Not a diagnosis or a substitute for professional medical advice.</span></div></footer>
  </main>
}

export default App
