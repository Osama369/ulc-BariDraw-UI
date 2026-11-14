import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { FiMail, FiSave, FiDownload, FiFileText, FiRefreshCw } from 'react-icons/fi';
import { isDrawVisibleForHistory, formatDrawOptionLabel } from '../utils/drawVisibility';
import { useDrawsAutoSync } from '../hooks/useDrawsAutoSync';

// Purchase Department: split the dealer's combined sale for one draw into
// demand (kept, up to the limits) and overlimit (sent to a party by email).
// Flow: 1) Analyze  2) Save Demand  3) Create Email (only after demand is saved).

const PRIZE_TYPES = ['Hinsa', 'Akra', 'Tandola', 'Pangora', 'All'];
const DBF_MODES = ['Mohsin', 'RLC'];

const uidKey = (uid) => String(uid ?? '').trim();
const fmt = (n) => Number(n || 0).toLocaleString('en-PK');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const matchesPrizeType = (number, type) => {
    if (type === 'All') return true;
    const n = String(number || '');
    const plus = n.split('+').length - 1;
    if (type === 'Hinsa') return /^\d{1}$/.test(n) || (n.includes('+') && n.length === 2) || (plus === 2 && n.length === 3) || (plus === 3 && n.length === 4);
    if (type === 'Akra') return /^\d{2}$/.test(n) || (n.includes('+') && n.length === 3) || (plus === 2 && n.length === 4);
    if (type === 'Tandola') return /^\d{3}$/.test(n) || (n.length === 4 && n.includes('+'));
    if (type === 'Pangora') return /^\d{4}$/.test(n);
    return false;
};

const isDrawClosed = (draw) => {
    if (!draw) return false;
    if (draw.isExpired) return true;
    const t = new Date(draw.draw_date).getTime();
    return Number.isFinite(t) && t <= Date.now();
};

const sumOf = (rows, keys) => rows.reduce((t, r) => t + keys.reduce((x, k) => x + (Number(r[k]) || 0), 0), 0);

// GET that treats "404 no data" as an empty list.
const getList = async (url, params, token) => {
    const res = await axios.get(url, {
        params,
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
    });
    return res.status === 404 ? [] : res.data;
};

const saveBlob = (data, filename, type) => {
    const url = window.URL.createObjectURL(new Blob([data], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
};

const filenameFrom = (headers, fallback) => {
    const disposition = headers?.['content-disposition'] || '';
    const match = disposition.match(/filename\*?=([^;]+)/);
    return match ? match[1].replace(/UTF-8''/, '').replace(/"/g, '').trim() : fallback;
};

const Segmented = ({ label, options, value, onChange, disabled }) => (
    <div className="flex flex-col gap-1.5 min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
        <div role="group" aria-label={label} className="flex flex-wrap gap-0.5 rounded-lg border border-gray-600 bg-gray-700 p-[3px]">
            {options.map((opt) => (
                <button
                    key={opt}
                    type="button"
                    disabled={disabled}
                    aria-pressed={value === opt}
                    onClick={() => onChange(opt)}
                    className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-sm transition-colors ${value === opt ? 'bg-blue-600 font-semibold text-white' : 'text-gray-300 hover:bg-gray-600'}`}
                >
                    {opt}
                </button>
            ))}
        </div>
    </div>
);

const Spinner = () => <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />;

const Stat = ({ label, value, note, tone }) => {
    const tones = { demand: 'text-emerald-400', over: 'text-red-400', muted: 'text-gray-400', base: 'text-gray-100' };
    return (
        <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
            <b className={`text-2xl font-semibold tabular-nums ${tones[tone] || tones.base}`}>{fmt(value)}</b>
            <small className="text-xs text-gray-400">{note}</small>
        </div>
    );
};

const Step = ({ n, title, state, children }) => {
    const dot = state === 'done'
        ? 'bg-emerald-400 text-emerald-950 border-emerald-400'
        : state === 'now' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-700 text-gray-400 border-gray-600';
    return (
        <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5 pt-3">
            <span className={`grid h-[26px] w-[26px] place-items-center rounded-full border text-xs font-bold ${dot}`}>{state === 'done' ? '✓' : n}</span>
            <div className="min-w-0">
                <h3 className="mb-0.5 mt-[3px] text-sm font-semibold text-gray-100">{title}</h3>
                {children}
            </div>
        </div>
    );
};

const Hisab = () => {
    const userData = useSelector((state) => state.user);
    const token = userData?.token || localStorage.getItem('token');

    const { draws } = useDrawsAutoSync({
        tokenCandidates: [token, localStorage.getItem('token'), localStorage.getItem('adminToken')],
        filterFn: isDrawVisibleForHistory,
        pollMs: 30000,
    });

    const [selectedDraw, setSelectedDraw] = useState(null);
    const [parties, setParties] = useState([]);
    const [selectedParty, setSelectedParty] = useState(null);
    const [prizeType, setPrizeType] = useState('Akra');
    const [dbfMode, setDbfMode] = useState('Mohsin');
    const [limit1, setLimit1] = useState('');
    const [limit2, setLimit2] = useState('');
    const [limitError, setLimitError] = useState(false);

    const [result, setResult] = useState(null); // { rows, l1, l2 }
    const [stale, setStale] = useState(false);
    const [demandSaved, setDemandSaved] = useState(false);
    const [filter, setFilter] = useState('all');
    const [analyzing, setAnalyzing] = useState(false);
    const [archives, setArchives] = useState([]);
    const [modal, setModal] = useState(null); // 'save' | 'email'
    const [working, setWorking] = useState(false);
    const analyzeSeq = useRef(0);

    // Keep the selected draw object in sync with the polled draw list.
    useEffect(() => {
        if (!selectedDraw?._id) return;
        const latest = draws.find((d) => String(d._id) === String(selectedDraw._id));
        if (!latest) {
            setSelectedDraw(null);
            toast('Selected draw is no longer available. Please pick a draw.');
            return;
        }
        if (latest !== selectedDraw) setSelectedDraw(latest);
    }, [draws, selectedDraw]);

    useEffect(() => {
        (async () => {
            try {
                const res = await axios.get('/api/v1/users/distributor-parties', { headers: { Authorization: `Bearer ${token}` } });
                const list = Array.isArray(res.data) ? res.data : (res.data?.parties || res.data?.users || []);
                setParties(list);
                if (list.length === 1) setSelectedParty(list[0]);
            } catch (err) {
                console.error('Failed to fetch parties', err);
                setParties([]);
            }
        })();
    }, [token]);

    const loadArchives = useCallback(async () => {
        if (!selectedDraw?._id || !selectedParty?._id) { setArchives([]); return; }
        try {
            const params = { drawId: selectedDraw._id, partyId: selectedParty._id };
            if (prizeType !== 'All') params.prizeType = prizeType;
            const data = await getList('/api/v1/archives', params, token);
            setArchives(Array.isArray(data?.archives) ? data.archives : []);
        } catch (err) {
            console.error('Failed to load emails', err);
            setArchives([]);
        }
    }, [selectedDraw?._id, selectedParty?._id, prizeType, token]);

    useEffect(() => { loadArchives(); }, [loadArchives]);

    // A different draw, party or prize type means a different analysis.
    useEffect(() => {
        analyzeSeq.current += 1;
        setResult(null);
        setStale(false);
        setDemandSaved(false);
        setFilter('all');
    }, [selectedDraw?._id, selectedParty?._id, prizeType]);

    const drawClosed = isDrawClosed(selectedDraw);

    const runAnalyze = async () => {
        if (!selectedDraw) return toast.error('Pick a draw first.');
        if (!selectedParty) return toast.error('Pick a party first.');
        if (String(limit1).trim() === '' || String(limit2).trim() === '') {
            setLimitError(true);
            return;
        }
        setLimitError(false);
        const l1 = Math.max(0, Number(limit1) || 0);
        const l2 = Math.max(0, Number(limit2) || 0);
        const seq = ++analyzeSeq.current;
        setAnalyzing(true);
        try {
            const overParams = { drawId: selectedDraw._id, userId: selectedParty._id, category: 'overlimit' };
            if (prizeType !== 'All') overParams.prizeType = prizeType;
            const [combined, overRes] = await Promise.all([
                getList('/api/v1/data/get-combined-voucher-data', { category: 'general', drawId: selectedDraw._id }, token),
                getList('/api/v1/data/get-client-data', overParams, token),
                loadArchives(),
            ]);
            if (seq !== analyzeSeq.current) return;

            // Combined sale per number.
            const sale = new Map();
            for (const doc of combined?.data || []) {
                for (const item of doc.data || []) {
                    const key = uidKey(item.uniqueId);
                    if (!key || !matchesPrizeType(key, prizeType)) continue;
                    const prev = sale.get(key) || { f: 0, s: 0 };
                    prev.f += Number(item.firstPrice) || 0;
                    prev.s += Number(item.secondPrice) || 0;
                    sale.set(key, prev);
                }
            }

            // Everything already emailed (archived rows) per number.
            const sent = new Map();
            for (const doc of overRes?.data || []) {
                for (const item of doc.data || []) {
                    if (!item?.archived) continue;
                    const key = uidKey(item.uniqueId);
                    if (!matchesPrizeType(key, prizeType)) continue;
                    const prev = sent.get(key) || { f: 0, s: 0 };
                    prev.f += Number(item.firstPrice) || 0;
                    prev.s += Number(item.secondPrice) || 0;
                    sent.set(key, prev);
                }
            }

            const rows = [];
            for (const [no, { f, s }] of sale.entries()) {
                const df = Math.min(f, l1);
                const ds = Math.min(s, l2);
                const sentRow = sent.get(no) || { f: 0, s: 0 };
                rows.push({
                    no, f, s, df, ds,
                    of: Math.max(0, f - df - sentRow.f),
                    os: Math.max(0, s - ds - sentRow.s),
                    sf: Math.min(sentRow.f, Math.max(0, f - df)),
                    ss: Math.min(sentRow.s, Math.max(0, s - ds)),
                });
            }
            rows.sort((a, b) => (b.of + b.os) - (a.of + a.os) || (b.f + b.s) - (a.f + a.s) || a.no.localeCompare(b.no, undefined, { numeric: true }));

            // Real amount already emailed for these numbers (not trimmed to today's limits).
            const sentTotal = Array.from(sent.values()).reduce((t, v) => t + v.f + v.s, 0);
            setResult({ rows, l1, l2, sentTotal });
            setStale(false);
            setDemandSaved(false);
            if (rows.length === 0) toast('No sale found for this draw and prize type.');
        } catch (err) {
            console.error('Analyze failed', err);
            toast.error(err?.response?.data?.error || 'Could not analyze. Check the connection and try again.');
        } finally {
            if (seq === analyzeSeq.current) setAnalyzing(false);
        }
    };

    const onLimitChange = (setter) => (e) => {
        setter(e.target.value);
        setLimitError(false);
        if (result) setStale(true);
    };

    const rows = result?.rows || [];
    const totals = useMemo(() => ({
        sale: sumOf(rows, ['f', 's']),
        demand: sumOf(rows, ['df', 'ds']),
        over: sumOf(rows, ['of', 'os']),
        sent: result?.sentTotal || 0,
        sentInBar: sumOf(rows, ['sf', 'ss']),
    }), [rows, result?.sentTotal]);
    const overRows = rows.filter((r) => r.of + r.os > 0);
    const visibleRows = filter === 'over' ? overRows : filter === 'within' ? rows.filter((r) => r.of + r.os === 0) : rows;

    const ready = !!result && !stale && !analyzing;
    const isAll = prizeType === 'All';
    const canSave = ready && !isAll && !drawClosed && !demandSaved && rows.length > 0;
    const canEmail = ready && !isAll && !drawClosed && demandSaved && overRows.length > 0;

    let emailNote = '';
    if (ready && !isAll && !drawClosed) {
        if (!demandSaved) emailNote = 'Save demand first, so these numbers are not emailed twice.';
        else if (overRows.length === 0) emailNote = 'No new overlimit. Nothing to email.';
    }

    const saveDemand = async () => {
        setWorking(true);
        try {
            const zeroLimits = result.l1 === 0 && result.l2 === 0;
            const payload = {
                drawId: selectedDraw._id,
                partyId: selectedParty._id,
                prizeType,
                replace: true,
                forceProtected: false,
                records: rows
                    .filter((r) => zeroLimits || r.df > 0 || r.ds > 0)
                    .map((r) => ({ uniqueId: r.no, firstPrice: r.df, secondPrice: r.ds })),
                overlimit: overRows.map((r) => ({ uniqueId: r.no, firstPrice: r.of, secondPrice: r.os })),
                combined: rows.map((r) => ({ uniqueId: r.no, firstPrice: r.f, secondPrice: r.s })),
            };
            await axios.post('/api/v1/data/save-demand', payload, { headers: { Authorization: `Bearer ${token}` } });
            setDemandSaved(true);
            setModal(null);
            toast.success(`Demand saved for ${selectedParty.username} · ${prizeType}`);
        } catch (err) {
            console.error('Save demand failed', err);
            toast.error(err?.response?.data?.error || 'Could not save demand. Try again.');
        } finally {
            setWorking(false);
        }
    };

    const downloadZip = async (archive) => {
        try {
            const res = await axios.get(`/api/v1/archives/${archive._id}/download`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob',
            });
            saveBlob(res.data, filenameFrom(res.headers, archive.fileName || `${archive._id}.zip`), 'application/zip');
        } catch (err) {
            let message = 'Could not download the ZIP.';
            try { message = JSON.parse(await err?.response?.data?.text())?.error || message; } catch { /* not JSON */ }
            toast.error(message);
        }
    };

    const downloadInvoice = async (invoiceId, invoiceNo) => {
        if (!invoiceId) return toast.error('No invoice for this email.');
        try {
            const res = await axios.get(`/api/v1/invoices/${invoiceId}/download`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob',
            });
            saveBlob(res.data, filenameFrom(res.headers, `invoice_${invoiceNo || invoiceId}.pdf`), 'application/pdf');
        } catch (err) {
            console.error('Invoice download failed', err);
            toast.error('Could not download the invoice PDF.');
        }
    };

    const createEmail = async () => {
        setWorking(true);
        try {
            const payload = {
                drawId: selectedDraw._id,
                partyId: selectedParty._id,
                prizeType,
                mode: dbfMode,
                records: overRows.map((r) => ({ uniqueId: r.no, firstPrice: r.of, secondPrice: r.os })),
            };
            const res = await axios.post('/api/v1/archives', payload, { headers: { Authorization: `Bearer ${token}` } });
            setModal(null);
            const archive = res.data?.archive;
            const invoiceNo = res.data?.invoice?.invoiceNo;
            toast.success(`Email created${invoiceNo ? ` · Invoice #${invoiceNo}` : ''}`);
            if (archive?._id) await downloadZip(archive);
            await runAnalyze();
            setDemandSaved(true);
        } catch (err) {
            console.error('Create email failed', err);
            toast.error(err?.response?.data?.error || 'Could not create the email. Try again.');
        } finally {
            setWorking(false);
        }
    };

    const step1 = ready ? 'done' : 'now';
    const step2 = demandSaved ? 'done' : (ready && !isAll ? 'now' : '');
    const step3 = canEmail ? 'now' : '';
    const share = (v) => `${totals.sale ? (v / totals.sale) * 100 : 0}%`;

    const thBase = 'sticky z-[1] bg-gray-700 px-3 text-right text-[11px] font-semibold tracking-wide text-gray-300 whitespace-nowrap';
    const td = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';
    const sep = 'border-l border-gray-700';

    return (
        <div className="min-h-full bg-gray-900 p-4 text-gray-100 md:p-6">
            <div className="mx-auto flex max-w-7xl flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold">Purchase Department</h1>
                        <p className="text-sm text-gray-400">
                            {selectedDraw ? formatDrawOptionLabel(selectedDraw, { includeStatus: false }) : 'Pick a draw and party to start.'}
                        </p>
                    </div>
                    {selectedDraw && (
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${drawClosed ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {drawClosed ? 'Draw closed' : 'Draw open'}
                        </span>
                    )}
                </div>

                {/* Settings */}
                <section className="grid gap-3.5 rounded-xl border border-gray-700 bg-gray-800 p-4" aria-label="Analysis settings">
                    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <label htmlFor="pd-draw" className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Draw</label>
                            <select
                                id="pd-draw"
                                value={selectedDraw?._id || ''}
                                onChange={(e) => setSelectedDraw(draws.find((d) => String(d._id) === e.target.value) || null)}
                                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Select draw</option>
                                {draws.map((d) => <option key={d._id} value={d._id}>{formatDrawOptionLabel(d)}</option>)}
                            </select>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <label htmlFor="pd-party" className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Party</label>
                            <select
                                id="pd-party"
                                value={selectedParty?._id || ''}
                                onChange={(e) => setSelectedParty(parties.find((p) => String(p._id) === e.target.value) || null)}
                                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Select party</option>
                                {parties.map((p) => <option key={p._id} value={p._id}>{p.username}{p.partyCode ? ` (${p.partyCode})` : ''}</option>)}
                            </select>
                        </div>
                        <Segmented label="Prize type" options={PRIZE_TYPES} value={prizeType} onChange={setPrizeType} disabled={analyzing || working} />
                        <Segmented label="DBF format" options={DBF_MODES} value={dbfMode} onChange={setDbfMode} disabled={working} />
                    </div>

                    <form
                        className="grid grid-cols-2 items-end gap-3 md:grid-cols-[1fr_1fr_auto]"
                        onSubmit={(e) => { e.preventDefault(); runAnalyze(); }}
                    >
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <label htmlFor="pd-l1" className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">First prize limit</label>
                            <input
                                id="pd-l1" type="number" min="0" inputMode="numeric" placeholder="e.g. 100"
                                value={limit1} onChange={onLimitChange(setLimit1)}
                                className={`w-full rounded-lg border bg-gray-700 px-3 py-2 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${limitError && String(limit1).trim() === '' ? 'border-amber-400' : 'border-gray-600'}`}
                            />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <label htmlFor="pd-l2" className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Second prize limit</label>
                            <input
                                id="pd-l2" type="number" min="0" inputMode="numeric" placeholder="e.g. 50"
                                value={limit2} onChange={onLimitChange(setLimit2)}
                                className={`w-full rounded-lg border bg-gray-700 px-3 py-2 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${limitError && String(limit2).trim() === '' ? 'border-amber-400' : 'border-gray-600'}`}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={analyzing || working}
                            className="col-span-2 inline-flex min-w-[140px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-1"
                        >
                            {analyzing ? <><Spinner />Analyzing…</> : 'Analyze'}
                        </button>
                    </form>

                    <p className={`text-[13px] ${limitError || stale ? 'text-amber-400' : 'text-gray-400'}`}>
                        {limitError
                            ? 'Enter both limits first. Type 0 if nothing should stay in demand.'
                            : stale
                                ? 'Limits changed. Press Analyze to update the numbers.'
                                : 'Enter both limits, then press Analyze (or Enter). 0 means nothing stays in demand.'}
                    </p>
                </section>

                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className={`flex min-w-0 flex-col gap-4 ${stale ? 'opacity-60' : ''}`}>
                        {result && (
                            <>
                                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                                    <Stat label="Total sale" value={totals.sale} note={plural(rows.length, 'number')} />
                                    <Stat label="Demand (within limit)" value={totals.demand} note="kept with you" tone="demand" />
                                    <Stat label="Overlimit (new)" value={totals.over} note={overRows.length ? `${plural(overRows.length, 'number')} to party` : 'nothing new to send'} tone="over" />
                                    <Stat label="Already emailed" value={totals.sent} note={archives.length ? `${plural(archives.length, 'email')} before` : 'no emails yet'} tone="muted" />
                                </div>
                                <div className="flex h-2 overflow-hidden rounded-full bg-gray-700" aria-hidden="true">
                                    <span className="h-full bg-emerald-400 transition-all" style={{ width: share(totals.demand) }} />
                                    <span className="h-full bg-red-400 transition-all" style={{ width: share(totals.over) }} />
                                    <span className="h-full bg-gray-500 transition-all" style={{ width: share(totals.sentInBar) }} />
                                </div>
                            </>
                        )}

                        <section className="min-w-0 rounded-xl border border-gray-700 bg-gray-800" aria-label="Numbers">
                            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-gray-700 px-4 py-3">
                                <h2 className="text-base font-semibold">Numbers</h2>
                                {result && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {[['all', 'All', rows.length], ['over', 'Overlimit', overRows.length], ['within', 'Within limit', rows.length - overRows.length]].map(([key, label, count]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                aria-pressed={filter === key}
                                                onClick={() => setFilter(key)}
                                                className={`rounded-full border px-3 py-1 text-[13px] ${filter === key ? 'border-gray-500 bg-gray-700 text-gray-100' : 'border-gray-700 text-gray-400 hover:text-gray-200'}`}
                                            >
                                                {label} {count}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {analyzing && !result ? (
                                <div className="flex flex-col gap-2.5 p-4">
                                    {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-[18px] animate-pulse rounded-md bg-gray-700" />)}
                                </div>
                            ) : !result ? (
                                <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-gray-400">
                                    <strong className="text-[15px] text-gray-100">No analysis yet</strong>
                                    <span>Enter the first and second prize limits and press Analyze.</span>
                                    <span>Each number will show its sale, the part kept as demand, and the overlimit for the party.</span>
                                </div>
                            ) : visibleRows.length === 0 ? (
                                <div className="px-5 py-12 text-center text-sm text-gray-400">
                                    <strong className="block text-[15px] text-gray-100">Nothing here</strong>
                                    {rows.length ? 'No numbers match this filter.' : 'No sale for this draw and prize type.'}
                                </div>
                            ) : (
                                <div className="max-h-[60vh] overflow-auto">
                                    <table className="w-full border-collapse text-sm">
                                        <thead>
                                            <tr>
                                                <th className={`${thBase} top-0 pt-1.5 text-left`} />
                                                <th colSpan={2} className={`${thBase} ${sep} top-0 pt-1.5 text-center uppercase`}>Sale</th>
                                                <th colSpan={2} className={`${thBase} ${sep} top-0 pt-1.5 text-center uppercase text-emerald-400`}>Demand</th>
                                                <th colSpan={2} className={`${thBase} ${sep} top-0 pt-1.5 text-center uppercase text-red-400`}>Overlimit</th>
                                            </tr>
                                            <tr>
                                                <th className={`${thBase} top-[26px] pb-2 text-left`}>Number</th>
                                                <th className={`${thBase} ${sep} top-[26px] pb-2`}>First</th>
                                                <th className={`${thBase} top-[26px] pb-2`}>Second</th>
                                                <th className={`${thBase} ${sep} top-[26px] pb-2`}>First</th>
                                                <th className={`${thBase} top-[26px] pb-2`}>Second</th>
                                                <th className={`${thBase} ${sep} top-[26px] pb-2`}>First</th>
                                                <th className={`${thBase} top-[26px] pb-2`}>Second</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleRows.map((r) => {
                                                const isOver = r.of + r.os > 0;
                                                const val = (v, cls) => <td className={`${td} ${v ? cls : 'text-gray-500'}`}>{fmt(v)}</td>;
                                                return (
                                                    <tr key={r.no} className="border-t border-gray-700 hover:bg-white/[0.03]">
                                                        <td className="whitespace-nowrap px-3 py-2 text-left text-[15px] font-bold tracking-wide">
                                                            {r.no}
                                                            {isOver && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 align-[2px] text-[10px] font-bold uppercase tracking-wider text-red-400">over</span>}
                                                        </td>
                                                        <td className={`${td} ${sep}`}>{fmt(r.f)}</td>
                                                        <td className={td}>{fmt(r.s)}</td>
                                                        <td className={`${td} ${sep} ${r.df ? 'text-emerald-400' : 'text-gray-500'}`}>{fmt(r.df)}</td>
                                                        {val(r.ds, 'text-emerald-400')}
                                                        <td className={`${td} ${sep} ${r.of ? 'font-semibold text-red-400' : 'text-gray-500'}`}>{fmt(r.of)}</td>
                                                        {val(r.os, 'font-semibold text-red-400')}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="font-bold">
                                                <td className="sticky bottom-0 border-t border-gray-600 bg-gray-700 px-3 py-2 text-left">Total</td>
                                                {[['f', ''], ['s', ''], ['df', 'text-emerald-400'], ['ds', 'text-emerald-400'], ['of', 'text-red-400'], ['os', 'text-red-400']].map(([k, cls], i) => (
                                                    <td key={k} className={`sticky bottom-0 border-t border-gray-600 bg-gray-700 ${td} ${i % 2 === 0 ? sep : ''} ${cls}`}>{fmt(sumOf(visibleRows, [k]))}</td>
                                                ))}
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </section>
                    </div>

                    <aside className="flex min-w-0 flex-col gap-4">
                        <section className="rounded-xl border border-gray-700 bg-gray-800" aria-label="Steps">
                            <div className="flex items-center justify-between gap-2 border-b border-gray-700 px-4 py-3">
                                <h2 className="text-base font-semibold">Steps</h2>
                                <span className="text-xs text-gray-400">{selectedParty?.username || 'No party'} · {prizeType}</span>
                            </div>
                            <div className="px-4 pb-4 pt-1">
                                <Step n={1} title="Analyze" state={step1}>
                                    <p className="mb-2 text-[12.5px] text-gray-400">
                                        {ready ? `Done with limits ${fmt(result.l1)} / ${fmt(result.l2)}.` : stale ? 'Limits changed. Press Analyze again.' : 'Enter limits and press Analyze.'}
                                    </p>
                                </Step>
                                <Step n={2} title="Save demand" state={step2}>
                                    <p className="mb-2 text-[12.5px] text-gray-400">
                                        {isAll ? '"All" is for viewing only. Pick one prize type to save.' : 'Keeps the within-limit amount with you.'}
                                    </p>
                                    <button
                                        type="button"
                                        disabled={!canSave || working}
                                        onClick={() => setModal('save')}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
                                    >
                                        <FiSave aria-hidden="true" />
                                        {demandSaved ? 'Demand saved' : `Save Demand${ready ? ` · ${fmt(totals.demand)}` : ''}`}
                                    </button>
                                </Step>
                                <Step n={3} title="Create email" state={step3}>
                                    <p className="mb-2 text-[12.5px] text-gray-400">Makes the DBF file and invoice for the party, then downloads it.</p>
                                    <button
                                        type="button"
                                        disabled={!canEmail || working}
                                        onClick={() => setModal('email')}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-45"
                                    >
                                        <FiMail aria-hidden="true" />
                                        {`Create Email${ready ? ` · ${fmt(totals.over)}` : ''}`}
                                    </button>
                                    {drawClosed && <p className="mt-1.5 text-xs text-red-400">Draw is closed. Demand and emails can no longer change.</p>}
                                    {emailNote && <p className="mt-1.5 text-xs text-amber-400">{emailNote}</p>}
                                </Step>
                            </div>
                        </section>

                        <section className="rounded-xl border border-gray-700 bg-gray-800" aria-label="Emails sent">
                            <div className="flex items-center justify-between gap-2 border-b border-gray-700 px-4 py-3">
                                <h2 className="text-base font-semibold">Emails sent</h2>
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                    {archives.length}
                                    <button type="button" onClick={loadArchives} title="Refresh" className="rounded p-1 hover:bg-gray-700"><FiRefreshCw aria-hidden="true" /><span className="sr-only">Refresh</span></button>
                                </div>
                            </div>
                            {archives.length === 0 ? (
                                <p className="px-4 py-3.5 text-[12.5px] text-gray-400">
                                    {selectedDraw && selectedParty ? 'No email created for this draw, party and prize type yet.' : 'Pick a draw and party to see their emails.'}
                                </p>
                            ) : (
                                <ul className="max-h-[420px] overflow-y-auto">
                                    {archives.map((a) => {
                                        const total = (a.overlimitRecords || []).reduce((t, r) => t + (Number(r.fPrize) || 0) + (Number(r.sPrize) || 0), 0);
                                        return (
                                            <li key={a._id} className="grid gap-1.5 border-t border-gray-700 px-4 py-3 first:border-t-0">
                                                <div className="flex justify-between gap-2 text-[13.5px] font-semibold">
                                                    <span>{a.invoiceNo ? `Invoice #${a.invoiceNo}` : 'Email'}{isAll ? ` · ${a.prizeType}` : ''}</span>
                                                    <span className="tabular-nums">{fmt(total)}</span>
                                                </div>
                                                <div className="break-all text-xs text-gray-400">
                                                    {a.fileName} · {plural(a.recordCount ?? (a.overlimitRecords || []).length, 'number')} · {new Date(a.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                <div className="flex gap-1.5">
                                                    <button type="button" onClick={() => downloadZip(a)} className="inline-flex items-center gap-1 rounded-md border border-gray-600 bg-gray-700 px-2.5 py-1 text-xs font-semibold hover:bg-gray-600"><FiDownload aria-hidden="true" />ZIP</button>
                                                    <button type="button" onClick={() => downloadInvoice(a.invoiceId, a.invoiceNo)} disabled={!a.invoiceId} className="inline-flex items-center gap-1 rounded-md border border-gray-600 bg-gray-700 px-2.5 py-1 text-xs font-semibold hover:bg-gray-600 disabled:opacity-45"><FiFileText aria-hidden="true" />Invoice PDF</button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>
                    </aside>
                </div>
            </div>

            {modal && result && (
                <div
                    className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
                    onMouseDown={(e) => { if (e.target === e.currentTarget && !working) setModal(null); }}
                    onKeyDown={(e) => { if (e.key === 'Escape' && !working) setModal(null); }}
                >
                    <div role="dialog" aria-modal="true" aria-labelledby="pd-modal-title" className="flex w-full max-w-md flex-col gap-3.5 rounded-xl border border-gray-700 bg-gray-800 p-5">
                        <h3 id="pd-modal-title" className="text-lg font-bold">{modal === 'save' ? 'Save demand?' : 'Create email?'}</h3>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                            {(modal === 'save'
                                ? [['Party', `${selectedParty.username}${selectedParty.partyCode ? ` (${selectedParty.partyCode})` : ''}`], ['Prize type', prizeType], ['Limits', `${fmt(result.l1)} / ${fmt(result.l2)}`], ['Demand total', fmt(totals.demand)]]
                                : [['Party', `${selectedParty.username}${selectedParty.partyCode ? ` (${selectedParty.partyCode})` : ''}`], ['Prize type', prizeType], ['Numbers', overRows.length], ['Overlimit total', fmt(totals.over)], ['DBF format', dbfMode]]
                            ).map(([k, v]) => (
                                <React.Fragment key={k}>
                                    <dt className="text-gray-400">{k}</dt>
                                    <dd className="text-right font-semibold tabular-nums">{v}</dd>
                                </React.Fragment>
                            ))}
                        </dl>
                        <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-[12.5px] text-amber-300">
                            {modal === 'save'
                                ? 'This replaces the saved demand for this party and prize type. Emailed numbers stay as they are.'
                                : 'These overlimit amounts will be locked and will not appear in the next email.'}
                        </p>
                        <div className="flex justify-end gap-2">
                            <button type="button" disabled={working} onClick={() => setModal(null)} className="rounded-lg border border-gray-600 px-4 py-2 font-semibold hover:bg-gray-700 disabled:opacity-50">Cancel</button>
                            <button
                                type="button"
                                autoFocus
                                disabled={working}
                                onClick={modal === 'save' ? saveDemand : createEmail}
                                className={`inline-flex min-w-[150px] items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-70 ${modal === 'save' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
                            >
                                {working ? <><Spinner />Working…</> : modal === 'save' ? 'Save demand' : 'Create and download'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Hisab;
