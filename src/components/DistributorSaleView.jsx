import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FaTrash } from 'react-icons/fa';
import { FiRefreshCw } from 'react-icons/fi';

// Distributor Sell Department: party DBF files the distributor imported into
// its clients' accounts. The distributor does not type entries; it can only
// view and delete what it imported. A delete removes the rows from the
// client's entries too and refunds the client.

const fmt = (n) => Number(n || 0).toLocaleString('en-PK');
const REFRESH_MS = 30000;

const isDrawClosed = (draw) => {
    if (!draw) return false;
    if (draw.isExpired) return true;
    const t = new Date(draw.draw_date).getTime();
    return Number.isFinite(t) && t <= Date.now();
};

const DistributorSaleView = ({ selectedDraw, token, clients = [], parties = [], onSummary }) => {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [clientId, setClientId] = useState('all');
    const [partyId, setPartyId] = useState('all');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(() => new Set());
    const [confirm, setConfirm] = useState(null); // { title, rows, run }
    const [busy, setBusy] = useState(false);
    const seq = useRef(0);

    const drawId = selectedDraw?._id;
    const closed = isDrawClosed(selectedDraw);

    const load = useCallback(async ({ quiet = false } = {}) => {
        if (!drawId) { setDocs([]); return; }
        const mine = ++seq.current;
        if (!quiet) setLoading(true);
        try {
            const res = await axios.get('/api/v1/data/get-combined-voucher-data', {
                params: { drawId, category: 'general' },
                headers: { Authorization: `Bearer ${token}` },
            });
            if (mine !== seq.current) return;
            const imported = (Array.isArray(res.data?.data) ? res.data.data : []).filter((d) => d.sourceFormat);
            setDocs(imported);
        } catch (err) {
            if (mine === seq.current && !quiet) toast.error(err?.response?.data?.error || 'Could not load imported entries.');
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }, [drawId, token]);

    useEffect(() => { setDocs([]); setSelected(new Set()); load(); }, [load]);

    useEffect(() => {
        if (!drawId) return undefined;
        const t = setInterval(() => { if (document.visibilityState === 'visible') load({ quiet: true }); }, REFRESH_MS);
        return () => clearInterval(t);
    }, [drawId, load]);

    const clientName = useMemo(() => {
        const m = new Map();
        clients.forEach((c) => m.set(String(c._id), `${c.username}${c.dealerId ? ` (${c.dealerId})` : ''}`));
        return m;
    }, [clients]);
    const partyName = useMemo(() => {
        const m = new Map();
        parties.forEach((p) => m.set(String(p._id), `${p.username}${p.partyCode ? ` (${p.partyCode})` : ''}`));
        return m;
    }, [parties]);

    // One group per imported file (record), newest first, filtered.
    const groups = useMemo(() => {
        const q = search.trim();
        return [...docs]
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .map((doc) => {
                const user = doc.userId && typeof doc.userId === 'object' ? doc.userId : null;
                const uid = String(user?._id || doc.userId || '');
                const pid = doc.partyId ? String(doc.partyId) : '';
                const rows = (doc.data || [])
                    .filter((it) => !q || String(it.uniqueId).includes(q))
                    .map((it) => ({ id: String(it._id), no: it.uniqueId, f: Number(it.firstPrice) || 0, s: Number(it.secondPrice) || 0 }));
                return {
                    id: String(doc._id),
                    clientId: uid,
                    client: clientName.get(uid) || (user ? user.username : 'Client'),
                    partyId: pid,
                    party: pid ? partyName.get(pid) || 'Party' : 'No party',
                    format: doc.sourceFormat,
                    time: doc.createdAt,
                    rows,
                    fullCount: (doc.data || []).length,
                };
            })
            .filter((g) => g.rows.length > 0 && (clientId === 'all' || g.clientId === clientId) && (partyId === 'all' || g.partyId === partyId));
    }, [docs, search, clientId, partyId, clientName, partyName]);

    const visibleIds = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.id)), [groups]);
    const totals = useMemo(() => {
        const all = groups.flatMap((g) => g.rows);
        const first = all.reduce((t, r) => t + r.f, 0);
        const second = all.reduce((t, r) => t + r.s, 0);
        return { recordCount: all.length, firstTotal: first, secondTotal: second, grandTotal: first + second };
    }, [groups]);

    useEffect(() => { onSummary?.(totals); }, [totals, onSummary]);
    useEffect(() => () => onSummary?.(null), [onSummary]);

    // Drop selections that are no longer on screen.
    useEffect(() => {
        setSelected((prev) => {
            const keep = new Set([...prev].filter((id) => visibleIds.includes(id)));
            return keep.size === prev.size ? prev : keep;
        });
    }, [visibleIds]);

    const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    const toggle = (id) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const askDeleteFile = (g) => {
        if (closed) return toast.error('Draw is closed. Entries cannot be deleted.');
        const amount = g.rows.reduce((t, r) => t + r.f + r.s, 0);
        const whole = g.rows.length === g.fullCount;
        setConfirm({
            title: whole ? 'Delete this imported file?' : `Delete ${g.rows.length} shown entries?`,
            rows: [['Client', g.client], ['Party', g.party], ['Entries', g.rows.length], ['Amount', fmt(amount)]],
            run: async () => {
                const res = whole
                    ? await axios.delete(`/api/v1/data/delete-data/${g.id}`, { headers: { Authorization: `Bearer ${token}` } })
                    : await axios.delete('/api/v1/data/delete-individual-entries', { headers: { Authorization: `Bearer ${token}` }, data: { entryIds: g.rows.map((r) => r.id) } });
                return res.data?.refundAmount ?? amount;
            },
        });
    };

    const askDeleteSelected = () => {
        if (closed) return toast.error('Draw is closed. Entries cannot be deleted.');
        const ids = visibleIds.filter((id) => selected.has(id));
        if (!ids.length) return;
        const rows = groups.flatMap((g) => g.rows.filter((r) => selected.has(r.id)));
        const amount = rows.reduce((t, r) => t + r.f + r.s, 0);
        const clientsHit = new Set(groups.filter((g) => g.rows.some((r) => selected.has(r.id))).map((g) => g.client));
        setConfirm({
            title: `Delete ${ids.length} selected entries?`,
            rows: [['Client', [...clientsHit].join(', ')], ['Entries', ids.length], ['Amount', fmt(amount)]],
            run: async () => {
                const res = await axios.delete('/api/v1/data/delete-individual-entries', {
                    headers: { Authorization: `Bearer ${token}` },
                    data: { entryIds: ids },
                });
                return res.data?.refundAmount ?? amount;
            },
        });
    };

    const runConfirm = async () => {
        if (!confirm) return;
        setBusy(true);
        try {
            const refunded = await confirm.run();
            toast.success(`Deleted. ${fmt(refunded)} returned to the client's balance.`);
            setSelected(new Set());
            setConfirm(null);
            await load({ quiet: true });
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Could not delete. Try again.');
            setConfirm(null);
            await load({ quiet: true });
        } finally {
            setBusy(false);
        }
    };

    const selectedCount = visibleIds.filter((id) => selected.has(id)).length;
    const cell = 'px-3 py-2.5 align-middle';

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-gray-800 border border-gray-700 rounded-lg text-white overflow-hidden">
            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3 px-3 py-2 border-b border-gray-700">
                <div className="flex flex-col gap-1 min-w-[180px] flex-1 sm:flex-none">
                    <label htmlFor="dsv-client" className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Client</label>
                    <select id="dsv-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5">
                        <option value="all">All clients</option>
                        {clients.map((c) => <option key={c._id} value={String(c._id)}>{c.username}{c.dealerId ? ` (${c.dealerId})` : ''}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1 min-w-[180px] flex-1 sm:flex-none">
                    <label htmlFor="dsv-party" className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Party DBF</label>
                    <select id="dsv-party" value={partyId} onChange={(e) => setPartyId(e.target.value)} className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5">
                        <option value="all">All parties</option>
                        {parties.map((p) => <option key={p._id} value={String(p._id)}>{p.username}{p.partyCode ? ` (${p.partyCode})` : ''}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1 w-32">
                    <label htmlFor="dsv-search" className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Number</label>
                    <input
                        id="dsv-search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value.replace(/[^0-9+]/g, ''))}
                        placeholder="e.g. 12"
                        className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 placeholder-gray-500"
                    />
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {selectedCount > 0 && (
                        <button
                            type="button"
                            onClick={askDeleteSelected}
                            disabled={closed}
                            className="inline-flex items-center gap-1.5 rounded bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                            <FaTrash aria-hidden="true" /> Delete selected ({selectedCount})
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => load()}
                        disabled={!drawId || loading}
                        className="inline-flex items-center gap-1.5 rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm font-semibold hover:bg-gray-600 disabled:opacity-50"
                    >
                        <FiRefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
                    </button>
                </div>
            </div>

            {!drawId ? (
                <div className="flex-1 grid place-items-center p-6 text-center text-sm text-gray-400">
                    <div><strong className="block text-base text-gray-100 mb-1">Select a draw</strong>Party DBF files you imported for your clients will show here.</div>
                </div>
            ) : loading && docs.length === 0 ? (
                <div className="flex flex-col gap-2 p-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-6 animate-pulse rounded bg-gray-700" />)}</div>
            ) : groups.length === 0 ? (
                <div className="flex-1 grid place-items-center p-6 text-center text-sm text-gray-400">
                    <div>
                        <strong className="block text-base text-gray-100 mb-1">No imported entries</strong>
                        {docs.length ? 'Nothing matches these filters.' : 'Use Import DBF to add a party file to a client.'}
                    </div>
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-auto">
                    <table className="min-w-[560px] w-full table-fixed text-[17px] text-left">
                        <colgroup>
                            <col className="w-11" />
                            <col />
                            <col className="w-24" />
                            <col className="w-24" />
                            <col className="w-[86px]" />
                        </colgroup>
                        <thead>
                            <tr className="bg-gray-800 border-b border-gray-700">
                                <th className="sticky top-0 z-[1] bg-gray-800 px-3 py-2">
                                    <input
                                        type="checkbox"
                                        aria-label="Select all shown entries"
                                        checked={allChecked}
                                        onChange={(e) => setSelected(e.target.checked ? new Set(visibleIds) : new Set())}
                                        className="w-4 h-4"
                                    />
                                </th>
                                <th className="sticky top-0 z-[1] bg-gray-800 px-3 py-2">Bundle</th>
                                <th className="sticky top-0 z-[1] bg-gray-800 px-3 py-2">1st</th>
                                <th className="sticky top-0 z-[1] bg-gray-800 px-3 py-2">2nd</th>
                                <th className="sticky top-0 z-[1] bg-gray-800 px-3 py-2">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map((g) => (
                                <React.Fragment key={g.id}>
                                    <tr className="bg-gray-900/60 border-b border-gray-700">
                                        <td colSpan={5} className="px-3 py-1.5 text-xs text-gray-300">
                                            <span className="font-semibold text-gray-100">{g.client}</span>
                                            <span className="mx-1.5 text-gray-500">·</span>
                                            <span className="rounded bg-amber-400/15 px-1.5 py-0.5 font-semibold text-amber-300">DBF · {g.party}</span>
                                            <span className="mx-1.5 text-gray-500">·</span>
                                            {g.format}
                                            {g.time && <><span className="mx-1.5 text-gray-500">·</span>{new Date(g.time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</>}
                                        </td>
                                    </tr>
                                    {g.rows.map((r, i) => (
                                        <tr key={r.id} className="border-b border-gray-700 hover:bg-gray-700/30">
                                            <td className={cell}>
                                                <input type="checkbox" aria-label={`Select ${r.no}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="w-4 h-4" />
                                            </td>
                                            <td className={`${cell} font-semibold tabular-nums`}>{r.no}</td>
                                            <td className={`${cell} tabular-nums`}>{r.f}</td>
                                            <td className={`${cell} tabular-nums`}>{r.s}</td>
                                            <td className={cell}>
                                                {i === 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => askDeleteFile(g)}
                                                        disabled={closed}
                                                        title={g.rows.length === g.fullCount ? 'Delete this imported file' : 'Delete the shown entries of this file'}
                                                        className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-rose-200/90 text-rose-700 hover:bg-rose-200 disabled:opacity-60"
                                                    >
                                                        <FaTrash />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {confirm && (
                <div
                    className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
                    onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setConfirm(null); }}
                    onKeyDown={(e) => { if (e.key === 'Escape' && !busy) setConfirm(null); }}
                >
                    <div role="dialog" aria-modal="true" aria-labelledby="dsv-confirm" className="flex w-full max-w-md flex-col gap-3.5 rounded-xl border border-gray-700 bg-gray-800 p-5">
                        <h3 id="dsv-confirm" className="text-lg font-bold">{confirm.title}</h3>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                            {confirm.rows.map(([k, v]) => (
                                <React.Fragment key={k}>
                                    <dt className="text-gray-400">{k}</dt>
                                    <dd className="text-right font-semibold tabular-nums break-words">{v}</dd>
                                </React.Fragment>
                            ))}
                        </dl>
                        <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-[12.5px] text-amber-300">
                            These entries are removed from the client's account too, and the amount goes back to the client's balance.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="rounded-lg border border-gray-600 px-4 py-2 font-semibold hover:bg-gray-700 disabled:opacity-50">Cancel</button>
                            <button type="button" autoFocus disabled={busy} onClick={runConfirm} className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white hover:bg-rose-700 disabled:opacity-70">
                                {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />Deleting…</> : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DistributorSaleView;
