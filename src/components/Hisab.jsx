import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import { FiMail } from 'react-icons/fi';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { isDrawVisibleForHistory, formatDrawOptionLabel } from '../utils/drawVisibility';
import { useDrawsAutoSync } from '../hooks/useDrawsAutoSync';

const Hisab = () => {
    const userData = useSelector((state) => state.user);
    const token = userData?.token || localStorage.getItem('token');
    
    // State variables for overlimit preview
    const [drawDate, setDrawDate] = useState(new Date().toISOString().split('T')[0]);
    const [drawTime, setDrawTime] = useState("11 AM");
    const { draws } = useDrawsAutoSync({
        tokenCandidates: [token, localStorage.getItem('token'), localStorage.getItem('adminToken')],
        filterFn: isDrawVisibleForHistory,
        pollMs: 5000,
    });
    const [selectedDraw, setSelectedDraw] = useState(null);
    const [parties, setParties] = useState([]);
    const [selectedParty, setSelectedParty] = useState(null);
    const [archiveInfo, setArchiveInfo] = useState(null);
    const [invoiceDoc, setInvoiceDoc] = useState(null);
    const [invoiceLoading, setInvoiceLoading] = useState(false);
    const [firstPrizeLimit, setFirstPrizeLimit] = useState(0);
    const [secondPrizeLimit, setSecondPrizeLimit] = useState(0);
    const [prizeType, setPrizeType] = useState("Hinsa");
    const [previewData, setPreviewData] = useState({
        demand: [],
        overlimit: [],
        originalEntries: []
    });
    const [overlimitSnapshots, setOverlimitSnapshots] = useState([]);
    const [selectedOverlimitSnapshotId, setSelectedOverlimitSnapshotId] = useState('latest');
    const [isLoading, setIsLoading] = useState(false); 
    const [showPreview, setShowPreview] = useState(false);
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailStatus, setEmailStatus] = useState('');
    const [saveDemandLoading, setSaveDemandLoading] = useState(false);
    const [dbfMode, setDbfMode] = useState('Mohsin'); // DBF mode: 'Mohsin' (default) or 'RLC'

    useEffect(() => {
        if (!selectedDraw?._id) return;
        const latest = draws.find((d) => String(d._id) === String(selectedDraw._id));
        if (!latest) {
            setSelectedDraw(null);
            toast('Selected draw changed. Please reselect draw.');
            return;
        }
        if (latest !== selectedDraw) {
            setSelectedDraw(latest);
        }
    }, [draws, selectedDraw]);

    // Helper: normalize UID keys (string and numeric form)
    const normalizeUid = (uid) => {
        const s = String(uid ?? '').trim();
        const digits = String(s).replace(/[^0-9]/g, '');
        const numStr = digits === '' ? s : String(Number(digits));
        return { s, numStr };
    };

    // Helper: aggregate entries by normalized numeric key to avoid duplicates like '0001' and '1'
    const aggregateByNormalized = (entries = []) => {
        const map = new Map();
        for (const e of entries) {
            const uid = e.uniqueId ?? e.no ?? '';
            const { s } = normalizeUid(uid);
            const key = s;
            const existing = map.get(key);
            if (existing) {
                existing.firstPrice = (Number(existing.firstPrice) || 0) + (Number(e.firstPrice) || 0);
                existing.secondPrice = (Number(existing.secondPrice) || 0) + (Number(e.secondPrice) || 0);
                // prefer display with leading zeros if E's uid has it
                if ((existing.uniqueId || '').length < (s || '').length) existing.uniqueId = s;
                // preserve locked/archived flags if any
                existing.archived = existing.archived || !!e.archived;
                existing.locked = existing.locked || !!e.locked;
                existing.archiveId = existing.archiveId || e.archiveId || null;
            } else {
                map.set(key, { uniqueId: s, firstPrice: Number(e.firstPrice) || 0, secondPrice: Number(e.secondPrice) || 0, archived: !!e.archived, locked: !!e.locked, archiveId: e.archiveId || null });
            }
        }
        return Array.from(map.values());
    };

    // Fetch parties for distributor (party accounts)
    useEffect(() => {
        const fetchParties = async () => {
            try {
                const res = await axios.get('/api/v1/users/distributor-parties', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setParties(res.data || res.data.parties || res.data.users || []);
            } catch (err) {
                console.error('Failed to fetch parties', err);
                setParties([]);
            }
        };
        fetchParties();
    }, [token]);

    // Check if an archive already exists for the selected draw/party/prizeType
    useEffect(() => {
        const checkArchive = async () => {
            if (!selectedDraw || !selectedParty) {
                setArchiveInfo(null);
                return;
            }
            try {
                const res = await axios.get('/api/v1/archives', {
                    params: { drawId: selectedDraw._id, partyId: selectedParty._id, prizeType },
                    headers: { Authorization: `Bearer ${token}` }
                });
                const list = res.data.archives || [];
                setArchiveInfo(list.length ? list[0] : null);
            } catch (err) {
                console.error('Failed to check archives', err);
                setArchiveInfo(null);
            }
        };
        checkArchive();
    }, [selectedDraw, selectedParty, prizeType, token]);

    // Auto-fetch invoice when an archive exists (so user doesn't need to click "Fetch Invoice")
    useEffect(() => {
        if (!archiveInfo || !archiveInfo._id) return;
        // If invoice already loaded or currently loading, skip
        if (invoiceDoc || invoiceLoading) return;
        // fetch invoice for the archive id
        fetchInvoiceByArchive(archiveInfo._id).catch(err => {
            console.debug('Auto-fetch invoice failed', err);
        });
    }, [archiveInfo]);

    // Auto-run preview when selections change (draw/party/prize/limits) so preview shows immediately
    useEffect(() => {
        // only run when we have a selected draw and party and not archived
        if (!selectedDraw || !selectedParty) return;
        // Allow auto-run even when an overlimit archive exists; only overlimit rows are archived

        // debounce to avoid multiple rapid calls when user changes selections
        const timer = setTimeout(() => {
            generatePreview().catch(err => {
                // swallow errors from auto-run; user can click Analyze to retry
                console.debug('Auto-generatePreview failed', err);
            });
        }, 280);

        return () => clearTimeout(timer);
    }, [selectedDraw, selectedParty, prizeType, firstPrizeLimit, secondPrizeLimit, archiveInfo]);

    // Fetch combined voucher data (similar to Center component)
    const fetchCombinedVoucherData = async (selectedDate, selectedTimeSlot, category = "general", drawId = null) => {
        try {
            const params = { category };
            if (drawId) params.drawId = drawId;
            else {
                params.date = selectedDate;
                params.timeSlot = selectedTimeSlot;
            }

            const response = await axios.get("/api/v1/data/get-combined-voucher-data", {
                params,
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            return response.data.data;
        } catch (error) {
            console.error("Error fetching combined voucher data:", error);
            toast.error("Failed to fetch combined voucher data");
            return [];
        }
    };

    // Filter entries by prize type (same logic as Center component)
    const filterEntriesByPrizeType = (entries, PrizeEntry) => {
        if (PrizeEntry === "All") return entries;
        return entries.filter(entry => {
            const number = entry.no || entry.number;
            if (PrizeEntry === "Hinsa") {
                return (
                    /^\d{1}$/.test(number) ||
                    (number.includes('+') && number.length === 2) ||
                    (number.split('+').length - 1 === 2 && number.length === 3) ||
                    (number.split('+').length - 1 === 3 && number.length === 4)
                );
            }
            if (PrizeEntry === "Akra") {
                return (
                    /^\d{2}$/.test(number) ||
                    (number.includes('+') && number.length === 3) ||
                    (number.split('+').length - 1 === 2 && number.length === 4)
                );
            }
            if (PrizeEntry === "Tandola") {
                return (
                    /^\d{3}$/.test(number) ||
                    (number.length === 4 && number.includes('+'))
                );
            }
            if (PrizeEntry === "Pangora") {
                return /^\d{4}$/.test(number);
            }
            return false;
        });
    };

    // Split entries by limit (same logic as Center component),
    // with special handling when only one side's limit is 0.
    const splitEntriesByLimit = (entries, firstLimit, secondLimit) => {
        const demand = [];
        const overlimit = [];

        const isFirstZero = Number(firstLimit) === 0;
        const isSecondZero = Number(secondLimit) === 0;

        entries.forEach(entry => {
            const fVal = Number(entry.f || 0) || 0;
            const sVal = Number(entry.s || 0) || 0;

            let demandFirst = 0;
            let demandSecond = 0;
            let overFirst = 0;
            let overSecond = 0;

            if (!isFirstZero && isSecondZero) {
                // First has limit, second is 0 -> demand only in first, second demand 0, second overlimit overall
                demandFirst = firstLimit > 0 ? Math.min(fVal, firstLimit) : fVal;
                demandSecond = 0;
                overFirst = Math.max(0, fVal - demandFirst);
                overSecond = sVal;
            } else if (isFirstZero && !isSecondZero) {
                // Second has limit, first is 0 -> demand only in second, first demand 0, first overlimit overall
                demandFirst = 0;
                demandSecond = secondLimit > 0 ? Math.min(sVal, secondLimit) : sVal;
                overFirst = fVal;
                overSecond = Math.max(0, sVal - demandSecond);
            } else {
                // Both limits 0 or both > 0 -> original behavior
                demandFirst = firstLimit > 0 ? Math.min(fVal, firstLimit) : fVal;
                demandSecond = secondLimit > 0 ? Math.min(sVal, secondLimit) : sVal;
                overFirst = Math.max(0, fVal - demandFirst);
                overSecond = Math.max(0, sVal - demandSecond);
            }

            if (demandFirst > 0 || demandSecond > 0) {
                demand.push({
                    uniqueId: entry.no,
                    firstPrice: demandFirst,
                    secondPrice: demandSecond
                });
            }
            if (overFirst > 0 || overSecond > 0) {
                overlimit.push({
                    uniqueId: entry.no,
                    firstPrice: overFirst,
                    secondPrice: overSecond
                });
            }
        });

        return { demand, overlimit };
    };

    // Generate preview data
    const generatePreview = async () => {
        setIsLoading(true);
        try {
            const fetchedEntries = await fetchCombinedVoucherData(drawDate, drawTime, "general", selectedDraw?._id || null);
            if (fetchedEntries.length === 0) {
                toast("No combined records found..");
                setIsLoading(false);
                return;
            }

            let processedEntries = [];
            if (Array.isArray(fetchedEntries) && fetchedEntries.length > 0) {
                let allVoucherRows = [];
                if (selectedDraw && selectedDraw._id) {
                    // When draw selected, backend should return records related to that drawId
                    allVoucherRows = fetchedEntries.flatMap(entry =>
                        entry.data.map(item => ({
                            objectId: item._id,
                            no: item.uniqueId,
                            f: item.firstPrice,
                            s: item.secondPrice,
                        }))
                    );
                } else {
                    allVoucherRows = fetchedEntries
                        .filter(entry => entry.timeSlot === drawTime)
                        .flatMap(entry =>
                            entry.data.map(item => ({
                                objectId: item._id,
                                no: item.uniqueId,
                                f: item.firstPrice,
                                s: item.secondPrice,
                            }))
                        );
                }

                const combinedEntries = {};
                allVoucherRows.forEach(({ no, f, s }) => {
                    const { s: sKey } = normalizeUid(no);
                    const key = sKey;
                    if (combinedEntries[key]) {
                        combinedEntries[key].f += f;
                        combinedEntries[key].s += s;
                        combinedEntries[key].count += 1;
                        // prefer a display `no` with leading zeros if one appears
                        if ((combinedEntries[key].no || '').length < (sKey || '').length) combinedEntries[key].no = sKey;
                    } else {
                        combinedEntries[key] = {
                            no: sKey,
                            f,
                            s,
                            count: 1
                        };
                    }
                });

                processedEntries = Object.values(combinedEntries);
            }

            const filteredEntries = filterEntriesByPrizeType(processedEntries, prizeType);

            // Special case: when both limits are 0, demand should be 0/0
            // for every entry but Overlimit Entries must show only NEW
            // overlimit amounts (excluding any archived overlimit rows).
            if (Number(firstPrizeLimit) === 0 && Number(secondPrizeLimit) === 0) {
                const zeroDemand = [];
                const fullOverlimitRaw = [];

                for (const entry of filteredEntries) {
                    const uid = entry.no || entry.uniqueId;
                    const f = Number(entry.f ?? entry.firstPrice ?? 0) || 0;
                    const s = Number(entry.s ?? entry.secondPrice ?? 0) || 0;
                    if (f > 0 || s > 0) {
                        zeroDemand.push({ uniqueId: uid, firstPrice: 0, secondPrice: 0 });
                        fullOverlimitRaw.push({ uniqueId: uid, firstPrice: f, secondPrice: s });
                    }
                }

                // Build archivedTotalsMap from existing overlimit docs so we
                // can subtract already-archived amounts and only display
                // new overlimit entries in the UI.
                let archivedTotalsMap = new Map();
                if (selectedParty && selectedDraw && selectedParty._id) {
                    try {
                        const overRes = await axios.get('/api/v1/data/get-client-data', {
                            params: { drawId: selectedDraw._id, userId: selectedParty._id, category: 'overlimit', prizeType },
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        const overDocs = overRes.data.data || [];
                        archivedTotalsMap = new Map();
                        for (const doc of overDocs) {
                            if (!doc || !Array.isArray(doc.data)) continue;
                            for (const item of doc.data) {
                                if (!item || !item.archived) continue; // only archived rows contribute
                                const { s } = normalizeUid(item.uniqueId || item.no || item.number);
                                const f = Number(item.firstPrice || item.fPrize || 0) || 0;
                                const sec = Number(item.secondPrice || item.sPrize || 0) || 0;
                                const prev = archivedTotalsMap.get(s) || { first: 0, second: 0 };
                                prev.first += f; prev.second += sec;
                                archivedTotalsMap.set(s, prev);
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to fetch server overlimit snapshot for 0/0 branch', e);
                        archivedTotalsMap = new Map();
                    }
                }

                const cleanedOverlimit = [];
                for (const ol of fullOverlimitRaw) {
                    const { s } = normalizeUid(ol.uniqueId);
                    const archived = archivedTotalsMap.get(s) || { first: 0, second: 0 };
                    const f = Math.max(0, (Number(ol.firstPrice) || 0) - (archived.first || 0));
                    const sec = Math.max(0, (Number(ol.secondPrice) || 0) - (archived.second || 0));
                    if (f > 0 || sec > 0) cleanedOverlimit.push({ uniqueId: ol.uniqueId, firstPrice: f, secondPrice: sec });
                }

                const normDemand = aggregateByNormalized(zeroDemand || []);
                const normOver = aggregateByNormalized(cleanedOverlimit || []);

                setPreviewData({
                    demand: normDemand,
                    // demandToSave mirrors what we show; backend will
                    // aggregate zeros and create/update the demand doc
                    // with 0/0 entries.
                    demandToSave: normDemand,
                    overlimit: normOver,
                    originalEntries: filteredEntries,
                });
                setShowPreview(true);
                toast.success("Preview generated successfully!");
                return;
            }

            // default values
            let demand = [];
            let overlimit = [];
            let demandToSave = [];

            const isFirstZero = Number(firstPrizeLimit) === 0;
            const isSecondZero = Number(secondPrizeLimit) === 0;

            // If a party+draw selected, fetch saved demand & overlimit and compute displayed values
            if (selectedParty && selectedDraw && selectedParty._id) {
                try {
                    const res = await axios.get('/api/v1/data/get-client-data', {
                        params: { drawId: selectedDraw._id, userId: selectedParty._id, category: 'demand', prizeType },
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const demandDocs = res.data.data || [];

                    // build cumulative saved-demand map
                    const cumulativeMap = new Map();
                    for (const doc of demandDocs) {
                        if (!doc || !Array.isArray(doc.data)) continue;
                        for (const item of doc.data) {
                                    const { s } = normalizeUid(item.uniqueId);
                            const f = Number(item.firstPrice || 0) || 0;
                            const sec = Number(item.secondPrice || 0) || 0;
                            const prev = cumulativeMap.get(s) || { first: 0, second: 0 };
                            prev.first += f; prev.second += sec;
                            cumulativeMap.set(s, prev);
                        }
                    }

                    // attempt to fetch server overlimit snapshot(s). We'll:
                    // 1) compute `archivedTotalsMap` by summing archived rows across all overlimit docs
                    // 2) pick the newest overlimit document and build `serverOverlimitMap` for merging
                    let serverOverlimitMap = null;
                    let archivedTotalsMap = null;
                    try {
                        const overRes = await axios.get('/api/v1/data/get-client-data', {
                            params: { drawId: selectedDraw._id, userId: selectedParty._id, category: 'overlimit', prizeType },
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        const overDocs = overRes.data.data || [];

                        // store available snapshots for UI selector
                        setOverlimitSnapshots(overDocs || []);

                        // Build archivedTotalsMap by summing archived rows across ALL overlimit docs
                        archivedTotalsMap = new Map();
                        for (const doc of overDocs) {
                            if (!doc || !Array.isArray(doc.data)) continue;
                            for (const item of doc.data) {
                                if (!item) continue;
                                if (!item.archived) continue; // only archived rows contribute
                                const { s } = normalizeUid(item.uniqueId || item.no || item.number);
                                const f = Number(item.firstPrice || item.fPrize || 0) || 0;
                                const sec = Number(item.secondPrice || item.sPrize || 0) || 0;
                                const prev = archivedTotalsMap.get(s) || { first: 0, second: 0 };
                                prev.first += f; prev.second += sec;
                                archivedTotalsMap.set(s, prev);
                            }
                        }

                        if (overDocs.length > 0) {
                            // pick the snapshot according to user's selection, otherwise newest
                            let latest = null;
                            if (selectedOverlimitSnapshotId && selectedOverlimitSnapshotId !== 'latest') {
                                latest = overDocs.find(d => String(d._id) === String(selectedOverlimitSnapshotId)) || null;
                            }
                            if (!latest) latest = overDocs.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))[0];

                            serverOverlimitMap = new Map();
                            if (latest && Array.isArray(latest.data)) {
                                for (const item of latest.data) {
                                    if (!item) continue;
                                    const { s } = normalizeUid(item.uniqueId || item.no || item.number);
                                    const f = Number(item.firstPrice || item.fPrize || 0) || 0;
                                    const sec = Number(item.secondPrice || item.sPrize || 0) || 0;
                                    const prev = serverOverlimitMap.get(s) || { firstPrice: 0, secondPrice: 0, archived: false, locked: false, archiveId: null };
                                    prev.firstPrice += f; prev.secondPrice += sec;
                                    prev.archived = prev.archived || !!item.archived;
                                    prev.locked = prev.locked || !!item.locked;
                                    prev.archiveId = prev.archiveId || item.archiveId || null;
                                    serverOverlimitMap.set(s, prev);
                                }
                            }
                        }
                    } catch (e) {
                        serverOverlimitMap = null;
                        archivedTotalsMap = null;
                        console.warn('Failed to fetch server overlimit snapshot', e);
                    }

                    // compute UI demand (saved + delta) and overlimit using current limits
                    // debugInfo removed
                    for (const entry of filteredEntries) {
                        const uid = entry.no;
                        const { s: key } = normalizeUid(uid);
                        const combinedF = Number(entry.f) || 0;
                        const combinedS = Number(entry.s) || 0;
                        const saved = cumulativeMap.get(key) || { first: 0, second: 0 };
                        // track analyzed values for debugging/logging
                        let analyzedF = combinedF;
                        let analyzedS = combinedS;

                        // If both limits are zero, prefer showing already-saved cumulative demand in the UI
                        // (do not compute analyzed from limits which would be 0)
                        let deltaF = 0;
                        let deltaS = 0;
                        let uiF = 0;
                        let uiS = 0;
                        if (isFirstZero && isSecondZero) {
                            // show saved cumulative demand as the displayed demand
                            uiF = Number(saved.first) || 0;
                            uiS = Number(saved.second) || 0;
                            // no deltas to save when limits are zero
                            deltaF = 0; deltaS = 0;
                        } else {
                            const localAnalyzedF = firstPrizeLimit > 0 ? Math.min(combinedF, firstPrizeLimit) : combinedF;
                            const localAnalyzedS = secondPrizeLimit > 0 ? Math.min(combinedS, secondPrizeLimit) : combinedS;

                            if (!isFirstZero && isSecondZero) {
                                // First column has limit, second is 0 (overall in overlimit)
                                analyzedF = localAnalyzedF;
                                analyzedS = combinedS; // second side uses full combined for debug
                                deltaF = Math.max(0, localAnalyzedF - (Number(saved.first) || 0));
                                deltaS = 0;
                                uiF = localAnalyzedF;
                                uiS = 0;
                            } else if (isFirstZero && !isSecondZero) {
                                // Second column has limit, first is 0 (overall in overlimit)
                                analyzedF = combinedF; // first side uses full combined for debug
                                analyzedS = localAnalyzedS;
                                deltaF = 0;
                                deltaS = Math.max(0, localAnalyzedS - (Number(saved.second) || 0));
                                uiF = 0;
                                uiS = localAnalyzedS;
                            } else {
                                // Both limits > 0 -> original behavior
                                analyzedF = localAnalyzedF;
                                analyzedS = localAnalyzedS;
                                deltaF = Math.max(0, localAnalyzedF - (Number(saved.first) || 0));
                                deltaS = Math.max(0, localAnalyzedS - (Number(saved.second) || 0));

                                // For display, show the current analyzed (capped) amounts so
                                // changing limits immediately reflects across all entries.
                                // We still only persist positive deltas (no decreases on save).
                                uiF = localAnalyzedF;
                                uiS = localAnalyzedS;
                            }
                        }

                        if (uiF > 0 || uiS > 0) demand.push({ uniqueId: uid, firstPrice: uiF, secondPrice: uiS });
                        if (deltaF > 0 || deltaS > 0) demandToSave.push({ uniqueId: uid, firstPrice: deltaF, secondPrice: deltaS });

                        // compute local overlimit only when user provided limits
                        if (!(isFirstZero && isSecondZero)) {
                            const over_local_F = Math.max(0, combinedF - uiF);
                            const over_local_S = Math.max(0, combinedS - uiS);
                            if (over_local_F > 0 || over_local_S > 0) {
                                overlimit.push({ uniqueId: uid, firstPrice: over_local_F, secondPrice: over_local_S });
                            }
                        }

                        // analyzedKeys tracking removed

                        console.debug('[generatePreview] uid', uid, { combinedF, combinedS, saved, analyzedF, analyzedS, deltaF, deltaS, uiF, uiS, serverOverlimit: serverOverlimitMap ? serverOverlimitMap.get(key) : null });
                    }

                    // Subtract archivedTotals (if any) from the locally computed overlimit so archived amounts are not re-shown
                    if (archivedTotalsMap && archivedTotalsMap.size > 0 && Array.isArray(overlimit) && overlimit.length > 0) {
                        const cleaned = [];
                        for (const ol of overlimit) {
                            const { s: key } = normalizeUid(ol.uniqueId);
                            const archived = archivedTotalsMap.get(key) || { first: 0, second: 0 };
                            const f = Math.max(0, (Number(ol.firstPrice) || 0) - (archived.first || 0));
                            const sec = Math.max(0, (Number(ol.secondPrice) || 0) - (archived.second || 0));
                            if (f > 0 || sec > 0) cleaned.push({ uniqueId: ol.uniqueId, firstPrice: f, secondPrice: sec });
                        }
                        overlimit = cleaned;
                    }

                    // If server overlimit snapshot exists, prefer using the server's snapshot rows only.
                    // The backend now writes insert-only snapshots containing only newly computed entries,
                    // so prefer the latest server snapshot for the Overlimit Entries panel. If none exists,
                    // fall back to locally computed overlimit.
                    if (serverOverlimitMap && serverOverlimitMap.size > 0) {
                        // Determine whether the latest server snapshot is locked/archived (all rows archived+locked)
                        const latestDocRows = [];
                        for (const [k, v] of serverOverlimitMap.entries()) {
                            latestDocRows.push({ uniqueId: k, firstPrice: v.firstPrice, secondPrice: v.secondPrice, archived: !!v.archived, locked: !!v.locked });
                        }

                        const allLocked = latestDocRows.length > 0 && latestDocRows.every(r => r.archived === true && r.locked === true);

                        if (allLocked) {
                            // snapshot is archived/locked -> do not show archived rows in Overlimit Entries
                            // fall back to locally computed overlimit only
                            // do nothing here (overlimit remains the local computed value)
                        } else {
                            // snapshot is active (not locked): merge server snapshot rows with locally computed overlimit
                            const mergedMap = new Map();
                            // Start with server snapshot rows (BUT skip archived/locked rows entirely)
                            for (const r of latestDocRows) {
                                if (r.archived === true || r.locked === true) continue;
                                if (!filterEntriesByPrizeType([{ no: r.uniqueId }], prizeType).length) continue;
                                const { s: kk } = normalizeUid(r.uniqueId);
                                mergedMap.set(kk, { uniqueId: r.uniqueId, firstPrice: Number(r.firstPrice) || 0, secondPrice: Number(r.secondPrice) || 0 });
                            }
                            // Merge locally computed overlimit into mergedMap, BUT do NOT increase values
                            // for UIDs that already exist in the server snapshot. This prevents double-counting
                            // and keeps server-saved values authoritative for UIDs already saved.
                            for (const ol of overlimit) {
                                const { s: kk } = normalizeUid(ol.uniqueId);
                                const existing = mergedMap.get(kk);
                                if (existing) {
                                    // skip adding to existing to avoid increasing already-saved amounts
                                    continue;
                                } else {
                                    mergedMap.set(kk, { uniqueId: ol.uniqueId, firstPrice: Number(ol.firstPrice) || 0, secondPrice: Number(ol.secondPrice) || 0 });
                                }
                            }

                            overlimit = Array.from(mergedMap.values());
                        }
                    }
                } catch (err) {
                    console.warn('Failed to fetch saved demand; falling back to local calculation', err);
                    const split = splitEntriesByLimit(filteredEntries, firstPrizeLimit, secondPrizeLimit);
                    demand = split.demand; overlimit = split.overlimit;
                    demandToSave = split.demand;
                }
            } else {
                const split = splitEntriesByLimit(filteredEntries, firstPrizeLimit, secondPrizeLimit);
                demand = split.demand; overlimit = split.overlimit;
                demandToSave = split.demand;
            }

            // aggregate overlimit rows by normalized UID to remove duplicates like '0001' and '1'
            overlimit = aggregateByNormalized(overlimit || []);

            setPreviewData({
                demand,
                demandToSave,
                overlimit,
                originalEntries: filteredEntries
            });
            setShowPreview(true);
            toast.success("Preview generated successfully!");
        } catch (error) {
            console.error("Error generating preview:", error);
            toast.error("Failed to generate preview");
        } finally {
            setIsLoading(false);
        }
    };

    // Calculate totals for a dataset
    const calculateTotals = (data) => {
        return data.reduce((acc, item) => {
            acc.first += item.firstPrice || 0;
            acc.second += item.secondPrice || 0;
            acc.total += (item.firstPrice || 0) + (item.secondPrice || 0);
            return acc;
        }, { first: 0, second: 0, total: 0 });
    };

    // Compute highest record by total (fPrize + sPrize). Returns { number, fPrize, sPrize }
    const computeHighestFromRecords = (records = []) => {
        if (!Array.isArray(records) || records.length === 0) return null;
        let best = null;
        for (const r of records) {
            const f = Number(r.fPrize ?? r.firstPrice ?? 0);
            const s = Number(r.sPrize ?? r.secondPrice ?? 0);
            const total = f + s;
            if (!best) {
                best = { number: r.number ?? r.uniqueId, fPrize: f, sPrize: s, total };
                continue;
            }
            const btotal = Number(best.fPrize || 0) + Number(best.sPrize || 0);
            if (total > btotal) {
                best = { number: r.number ?? r.uniqueId, fPrize: f, sPrize: s, total };
            } else if (total === btotal) {
                const rn = parseInt(String(r.number ?? r.uniqueId).replace(/[^0-9]/g, ''), 10);
                const bn = parseInt(String(best.number).replace(/[^0-9]/g, ''), 10);
                if (!isNaN(rn) && !isNaN(bn) && rn > bn) best = { number: r.number ?? r.uniqueId, fPrize: f, sPrize: s, total };
            }
        }
        return best;
    };

    // Create archive (ZIP with DBF) for overlimit records
    const createArchive = async () => {
        if (!selectedParty) return toast.error('Select a party first');
        if (!selectedDraw) return toast.error('Select a draw first');
        if (!previewData.overlimit || previewData.overlimit.length === 0) return toast.error('No overlimit records to archive');
        try {
            const payload = {
                drawId: selectedDraw._id,
                prizeType,
                partyId: selectedParty._id,
                records: previewData.overlimit.map(r => ({ uniqueId: r.uniqueId, firstPrice: r.firstPrice, secondPrice: r.secondPrice })),
                mode: dbfMode
            };
            const res = await axios.post('/api/v1/archives', payload, { headers: { Authorization: `Bearer ${token}` } });
            setArchiveInfo(res.data.archive);
            // if backend returned invoice, set it; otherwise attempt to fetch by archive id
            if (res.data.invoice) {
                setInvoiceDoc(res.data.invoice);
            } else if (res.data.archive && res.data.archive._id) {
                fetchInvoiceByArchive(res.data.archive._id).catch(() => {});
            }
            toast.success('Archive created');
        } catch (err) {
            console.error('createArchive error', err);
            toast.error(err?.response?.data?.error || 'Failed to create archive');
        }
    };

    const deleteArchive = async () => {
        if (!archiveInfo) return;
        if (!confirm('Delete archive and unlock records?')) return;
        try {
            await axios.delete(`/api/v1/archives/${archiveInfo._id}`, { headers: { Authorization: `Bearer ${token}` } });
            setArchiveInfo(null);
            toast.success('Archive deleted');
        } catch (err) {
            console.error('deleteArchive error', err);
            toast.error(err?.response?.data?.error || 'Failed to delete archive');
        }
    };

    // Download archive using axios to include Authorization header
    const downloadArchive = async (id = null) => {
        const archiveId = id || archiveInfo?._id;
        if (!archiveId) return toast.error('No archive selected');
        if (!token) return toast.error('No token provided. Please sign in to download.');
        try {
            const res = await axios.get(`/api/v1/archives/${archiveId}/download`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob',
            });

            const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/zip' });
            // try to determine filename from disposition header, otherwise fallback to archiveInfo
            let filename = `${archiveId}.zip`;
            const disposition = res.headers['content-disposition'] || res.headers['Content-Disposition'];
            if (disposition) {
                const match = disposition.match(/filename\*?=([^;]+)/);
                if (match) {
                    filename = match[1].replace(/UTF-8''/, '').replace(/"/g, '').trim();
                }
            } else if (archiveInfo && (archiveInfo.fileName || archiveInfo.file)) {
                filename = archiveInfo.fileName || archiveInfo.file;
            }

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Download started');
        } catch (err) {
            console.error('downloadArchive error', err);
            const message = err?.response?.data?.error || err?.response?.data || err.message || 'Failed to download archive';
            toast.error(message);
        }
    };

    // Fetch invoice associated with an archiveId
    const fetchInvoiceByArchive = async (archiveId) => {
        if (!archiveId) return;
        setInvoiceLoading(true);
        try {
            const res = await axios.get('/api/v1/invoices', {
                params: { archiveId },
                headers: { Authorization: `Bearer ${token}` }
            });
            // backend may return { invoices: [...] } or { invoice: {...} }
            let inv = null;
            if (res.data) {
                if (Array.isArray(res.data.invoices)) inv = res.data.invoices[0] || null;
                else if (res.data.invoice) inv = res.data.invoice;
                else if (res.data._id) inv = res.data;
            }
            setInvoiceDoc(inv);
            if (!inv) toast('No invoice found for this archive');
        } catch (err) {
            console.error('fetchInvoiceByArchive error', err);
            toast.error('Failed to fetch invoice');
        } finally {
            setInvoiceLoading(false);
        }
    };

    const downloadInvoicePdf = async (invoiceId = null) => {
        const id = invoiceId || invoiceDoc?._id;
        if (!id) return toast.error('No invoice selected');
        if (!token) return toast.error('No token provided. Please sign in to download.');
        try {
            const res = await axios.get(`/api/v1/invoices/${id}/download`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });
            const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/pdf' });
            let filename = `invoice_${id}.pdf`;
            const disposition = res.headers['content-disposition'] || res.headers['Content-Disposition'];
            if (disposition) {
                const match = disposition.match(/filename\*?=([^;]+)/);
                if (match) filename = match[1].replace(/UTF-8''/, '').replace(/\"/g, '').trim();
            } else if (invoiceDoc && invoiceDoc.invoiceNo) {
                filename = `invoice_${invoiceDoc.invoiceNo}.pdf`;
            }
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Invoice download started');
        } catch (err) {
            console.error('downloadInvoicePdf error', err);
            toast.error('Failed to download invoice PDF');
        }
    };

    const printInvoice = async (invoiceId = null) => {
        const id = invoiceId || invoiceDoc?._id;
        if (!id) return toast.error('No invoice selected');
        try {
            const res = await axios.get(`/api/v1/invoices/${id}/download`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });
            const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            // open in new tab for print
            const newWin = window.open(url, '_blank');
            if (!newWin) {
                // fallback: create iframe
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = url;
                document.body.appendChild(iframe);
                setTimeout(() => { iframe.contentWindow.print(); }, 800);
            } else {
                newWin.focus();
            }
        } catch (err) {
            console.error('printInvoice error', err);
            toast.error('Failed to open invoice for printing');
        }
    };

    // determine highest record for display (backend-provided or computed locally)
    const displayHighest = invoiceDoc?.highestRecord || computeHighestFromRecords(invoiceDoc?.records || previewData.overlimit);

    const isSelectedDrawClosed = () => {
        if (!selectedDraw) return false;
        if (selectedDraw.isExpired) return true;
        // fallback: closed if draw_date end-of-day already passed
        try {
            const dd = new Date(selectedDraw.draw_date);
            dd.setHours(23, 59, 59, 999);
            return dd.getTime() <= Date.now();
        } catch (e) {
            return false;
        }
    };

    return (
        <div className="p-6 bg-gray-900 min-h-screen ">
            <div className="max-w-7xl mx-auto max-h-[80vh] overflow-y-auto">
            
                {/* Controls Section */}
                <div className="bg-gray-800 rounded-lg shadow-md p-6 mb-6  ">
                    
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-white mb-1">Select Draw</label>
                                <select
                                    value={selectedDraw?._id || ""}
                                    onChange={(e) => {
                                        const id = e.target.value;
                                        const d = draws.find(x => String(x._id) === String(id)) || null;
                                        setSelectedDraw(d);
                                        if (d && d.draw_date) {
                                            setDrawDate(new Date(d.draw_date).toISOString().split('T')[0]);
                                        }
                                    }}
                                    className="bg-gray-700 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">-- Select draw --</option>
                                    {draws.map(d => (
                                        <option key={d._id} value={d._id}>
                                            {formatDrawOptionLabel(d)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-white mb-1">Prize Type</label>
                            <select
                                value={prizeType}
                                onChange={(e) => setPrizeType(e.target.value)}
                                className="bg-gray-700 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="Hinsa">Hinsa</option>
                                <option value="Akra">Akra</option>
                                <option value="Tandola">Tandola</option>
                                <option value="Pangora">Pangora</option>
                                <option value="All">All</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-white mb-1">Party</label>
                            <select
                                value={selectedParty?._id || ''}
                                onChange={(e) => {
                                    const id = e.target.value;
                                    const p = parties.find(x => String(x._id) === String(id)) || null;
                                    setSelectedParty(p);
                                    setArchiveInfo(null);
                                }}
                                className="bg-gray-700 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">-- Select party --</option>
                                {parties.map(p => (
                                    <option key={p._id} value={p._id}>{p.username} {p.partyCode ? `(${p.partyCode})` : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-white mb-1">Overlimit Snapshot</label>
                            <select
                                value={selectedOverlimitSnapshotId}
                                onChange={(e) => {
                                    setSelectedOverlimitSnapshotId(e.target.value || 'latest');
                                    // trigger regenerate preview with the new selection
                                    setTimeout(() => { generatePreview().catch(() => {}); }, 10);
                                }}
                                className="bg-gray-700 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="latest">Use newest server snapshot</option>
                                {overlimitSnapshots && overlimitSnapshots.length > 0 && overlimitSnapshots.map(snap => {
                                    const label = `${new Date(snap.updatedAt || snap.createdAt).toLocaleString()}${snap.data && snap.data.every(d => d && d.archived && d.locked) ? ' (archived)' : ''}`;
                                    return <option key={snap._id} value={snap._id}>{label}</option>;
                                })}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-white mb-1">DBF Mode</label>
                            <select
                                value={dbfMode}
                                onChange={(e) => setDbfMode(e.target.value)}
                                className="bg-gray-700 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="Mohsin">Mohsin</option>
                                <option value="RLC">RLC</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="flex flex-row items-end gap-4 mb-4 flex-wrap">
                        <div className="flex flex-col w-56">
                            <label className="block text-sm font-medium text-white mb-1">First Prize Limit</label>
                            <input
                                type="number"
                                value={firstPrizeLimit}
                                onChange={(e) => setFirstPrizeLimit(Number(e.target.value))}
                                className="bg-gray-700 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter first prize limit"
                                min="0"
                            />
                        </div>
                        <div className="flex flex-col w-56">
                            <label className="block text-sm font-medium text-white mb-1">Second Prize Limit</label>
                            <input
                                type="number"
                                value={secondPrizeLimit}
                                onChange={(e) => setSecondPrizeLimit(Number(e.target.value))}
                                className="bg-gray-700 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter second prize limit"
                                min="0"
                            />
                        </div>

                        <button
                            onClick={generatePreview}
                            disabled={isLoading}
                            className={`px-6 py-2 rounded-md font-medium ${
                                isLoading
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700'
                            } text-white transition-colors`}
                        >
                            {isLoading ? 'Analyzing...' : 'Analyze'}
                        </button>

                        <button
                            onClick={async () => {
                                if (isSelectedDrawClosed()) return toast.error('Draw is closed. Cannot save demand.');
                                if (!showPreview) return toast.error('Run analysis first');
                                if (!selectedParty) return toast.error('Select a party first');
                                if (!selectedDraw) return toast.error('Select a draw first');
                                const ok = confirm('Save demand records for this party and draw and REPLACE existing demand to match current analysis? Click OK to replace, Cancel to abort.');
                                if (!ok) return;
                                const forceProtected = window.confirm('Also update archived/locked overlimit rows? Click OK to update protected rows, Cancel to preserve them.');
                                setSaveDemandLoading(true);
                                try {
                                    const payload = {
                                        drawId: selectedDraw._id,
                                        partyId: selectedParty._id,
                                        records: (previewData.demand || []).map(r => ({ uniqueId: r.uniqueId, firstPrice: r.firstPrice, secondPrice: r.secondPrice })),
                                        overlimit: previewData.overlimit.map(r => ({ uniqueId: r.uniqueId, firstPrice: r.firstPrice, secondPrice: r.secondPrice })),
                                        combined: previewData.originalEntries.map(e => ({ uniqueId: e.no || e.uniqueId, firstPrice: e.f || e.firstPrice || 0, secondPrice: e.s || e.secondPrice || 0 })),
                                        prizeType,
                                        replace: true,
                                        forceProtected: !!forceProtected
                                    };
                                    const res = await axios.post('/api/v1/data/save-demand', payload, { headers: { Authorization: `Bearer ${token}` } });
                                    try { console.debug('[Hisab] save-demand response archivedTotals', res.data.archivedTotals); } catch (e) {}
                                    toast.success(res.data.message || 'Demand saved');
                                } catch (err) {
                                    console.error('saveDemand error', err);
                                    toast.error(err?.response?.data?.error || 'Failed to save demand');
                                } finally {
                                    setSaveDemandLoading(false);
                                }
                            }}
                            disabled={isLoading || saveDemandLoading || !showPreview}
                            className={`px-3 py-2 rounded-md font-medium ${saveDemandLoading ? 'bg-yellow-500' : (isSelectedDrawClosed() ? 'bg-gray-500' : 'bg-blue-600 hover:bg-blue-700')} text-white flex items-center gap-2 ${isSelectedDrawClosed() ? 'cursor-not-allowed' : ''}`}
                            title={isSelectedDrawClosed() ? 'Draw is closed. Save Demand not allowed.' : 'Save demand records'}
                        >
                            {saveDemandLoading ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-2a6 6 0 110-12v2a4 4 0 100 8v-2z"></path></svg>
                                    <span>Saving...</span>
                                </>
                            ) : (
                                <span>Save Demand</span>
                            )}
                        </button>

                        <button
                            onClick={async () => {
                                if (isSelectedDrawClosed()) return toast.error('Draw is closed. Cannot create email.');
                                if (!showPreview || !previewData.overlimit || previewData.overlimit.length === 0) return toast.error('Run analysis first');
                                if (!selectedParty) return toast.error('Select a party first');
                                if (!selectedDraw) return toast.error('Select a draw first');
                                const ok = window.confirm('Overlimit email will be Locked. OK to proceed?');
                                if (!ok) return;
                                setEmailLoading(true);
                                setEmailStatus('Generating email...');
                                try {
                                    await new Promise(r => setTimeout(r, 300));
                                    const payload = {
                                        drawId: selectedDraw._id,
                                        prizeType,
                                        partyId: selectedParty._id,
                                        records: previewData.overlimit.map(r => ({ uniqueId: r.uniqueId, firstPrice: r.firstPrice, secondPrice: r.secondPrice })),
                                        mode: dbfMode
                                    };
                                    const res = await axios.post('/api/v1/archives', payload, { headers: { Authorization: `Bearer ${token}` } });
                                    setEmailStatus('Indexing...');
                                    await new Promise(r => setTimeout(r, 500));
                                    setArchiveInfo(res.data.archive);
                                    if (res.data.invoice) setInvoiceDoc(res.data.invoice);
                                    setEmailStatus('Completed');
                                    // Archive created on server and download initiated to user's system
                                    toast.success('Archive created and download started');
                                } catch (err) {
                                        console.error('create+download error', err);
                                        // If server returned 409 (duplicate archive for same total), fetch existing archive info
                                        if (err?.response?.status === 409) {
                                            const invoiceNo = err?.response?.data?.invoiceNo;
                                            toast.error(err?.response?.data?.error || 'Archive already exists');
                                            try {
                                                const archivesRes = await axios.get('/api/v1/archives', {
                                                    params: { drawId: selectedDraw._id, partyId: selectedParty._id, prizeType },
                                                    headers: { Authorization: `Bearer ${token}` }
                                                });
                                                const list = archivesRes.data.archives || archivesRes.data || [];
                                                if (list && list.length > 0) {
                                                    setArchiveInfo(list[0]);
                                                }
                                                // attempt to fetch invoice by invoiceNo if provided
                                                if (invoiceNo) {
                                                    try {
                                                        const invRes = await axios.get('/api/v1/invoices', { params: { invoiceNo }, headers: { Authorization: `Bearer ${token}` } });
                                                        let inv = null;
                                                        if (invRes.data) {
                                                            if (Array.isArray(invRes.data.invoices)) inv = invRes.data.invoices[0] || null;
                                                            else if (invRes.data.invoice) inv = invRes.data.invoice;
                                                            else if (invRes.data._id) inv = invRes.data;
                                                        }
                                                        if (inv) setInvoiceDoc(inv);
                                                    } catch (ie) {
                                                        console.debug('Failed to fetch invoice by invoiceNo', ie.message || ie);
                                                    }
                                                }
                                            } catch (fetchErr) {
                                                console.debug('Failed to fetch existing archives after 409', fetchErr.message || fetchErr);
                                            }
                                        } else {
                                            toast.error(err?.response?.data?.error || 'Failed to create archive');
                                        }
                                } finally {
                                    setEmailLoading(false);
                                    setEmailStatus('');
                                }
                            }}
                            disabled={isLoading || emailLoading || !showPreview}
                            className={`px-3 py-2 rounded-md font-medium ${emailLoading ? 'bg-yellow-500' : (isSelectedDrawClosed() ? 'bg-gray-500' : 'bg-green-600 hover:bg-green-700')} text-white flex items-center gap-2 ${isSelectedDrawClosed() ? 'cursor-not-allowed' : ''}`}
                            title={isSelectedDrawClosed() ? 'Draw is closed. Create Email not allowed.' : 'Create archive and auto-download'}
                        >
                            {emailLoading ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-2a6 6 0 110-12v2a4 4 0 100 8v-2z"></path></svg>
                                    <span>{emailStatus || 'Generating...'}</span>
                                </>
                                ) : (
                                <>
                                    <FiMail className="h-5 w-5" aria-hidden="true" />
                                    <span className="hidden md:inline">Create Email</span>
                                </>
                            )}
                        </button>
                    </div>
                    {archiveInfo && (
                        <p className="text-sm text-yellow-300 mt-2">An overlimit archive exists for this selection — overlimit rows are archived/locked, but Analyze and Save Demand are still allowed (archived rows will be preserved).</p>
                    )}
                </div>

                {/* Preview Results and Invoice (three-column layout) */}
                {showPreview && (
                    <div className="space-y-6">
                        {/* Summary Cards (full width) */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-blue-100 border border-blue-300 rounded-lg p-4">
                                <h3 className="text-lg font-semibold text-blue-800 mb-2">Original Data</h3>
                                <p className="text-sm text-blue-600">
                                    Entries: {previewData.originalEntries.length}<br />
                                    Total: {calculateTotals(previewData.originalEntries.map(e => ({ firstPrice: e.f, secondPrice: e.s }))).total}
                                </p>
                            </div>

                            <div className="bg-green-100 border border-green-300 rounded-lg p-4">
                                <h3 className="text-lg font-semibold text-green-800 mb-2">Demand (Within Limit)</h3>
                                <p className="text-sm text-green-600">
                                    Entries: {previewData.demand.length}<br />
                                    Total: {calculateTotals(previewData.demand).total}
                                </p>
                            </div>

                            <div className="bg-red-100 border border-red-300 rounded-lg p-4">
                                <h3 className="text-lg font-semibold text-red-800 mb-2">Overlimit</h3>
                                <p className="text-sm text-red-600">
                                    Entries: {previewData.overlimit.length}<br />
                                    Total: {calculateTotals(previewData.overlimit).total}
                                </p>
                            </div>
                        </div>

                        {/* Three columns: Demand | Overlimit | Invoice */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Demand column */}
                            <div>
                                {previewData.demand.length > 0 ? (
                                    <div className="bg-white rounded-lg shadow-md p-6 h-full flex flex-col">
                                        <h3 className="text-xl font-semibold text-green-800 mb-4">Demand Entries (Within Limit)</h3>
                                        <div className="flex items-center justify-between mb-2">
                                            <div />
                                            <div className="flex items-center gap-2"></div>
                                        </div>
                                        <div className="overflow-y-auto max-h-[72vh] overflow-x-auto">
                                            <table className="min-w-full table-auto">
                                                <thead className="bg-green-50 sticky top-0 z-10">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left text-sm font-medium text-green-700">Number</th>
                                                        <th className="px-4 py-2 text-left text-sm font-medium text-green-700">First Price</th>
                                                        <th className="px-4 py-2 text-left text-sm font-medium text-green-700">Second Price</th>
                                                        <th className="px-4 py-2 text-left text-sm font-medium text-green-700">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                    {previewData.demand.map((item, index) => (
                                                        <tr key={index} className="hover:bg-gray-50">
                                                            <td className="px-4 py-2 text-sm text-gray-900">{item.uniqueId}</td>
                                                            <td className="px-4 py-2 text-sm text-gray-900">{item.firstPrice}</td>
                                                            <td className="px-4 py-2 text-sm text-gray-900">{item.secondPrice}</td>
                                                            <td className="px-4 py-2 text-sm text-gray-900">{item.firstPrice + item.secondPrice}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Totals for Demand (always visible below the scroll area) */}
                                        <div className="mt-3 bg-green-50 p-3 rounded text-sm text-green-800 font-semibold">
                                            <div className="flex justify-between">
                                                <span>Total</span>
                                                <div className="flex gap-6">
                                                    <span>F: {calculateTotals(previewData.demand).first}</span>
                                                    <span>S: {calculateTotals(previewData.demand).second}</span>
                                                    <span>Total: {calculateTotals(previewData.demand).total}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-4 text-center">No demand entries.</div>
                                )}
                            </div>

                            {/* Overlimit column */}
                            <div>
                                {previewData.overlimit.length > 0 ? (
                                    <div className="bg-white rounded-lg shadow-md p-6 h-full flex flex-col">
                                        <h3 className="text-xl font-semibold text-red-800 mb-4">Overlimit Entries</h3>
                                        <div className="overflow-y-auto max-h-[72vh] overflow-x-auto">
                                            <table className="min-w-full table-auto">
                                                <thead className="bg-red-50 sticky top-0 z-10">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left text-sm font-medium text-red-700">Number</th>
                                                        <th className="px-4 py-2 text-left text-sm font-medium text-red-700">First Price</th>
                                                        <th className="px-4 py-2 text-left text-sm font-medium text-red-700">Second Price</th>
                                                        <th className="px-4 py-2 text-left text-sm font-medium text-red-700">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                    {previewData.overlimit.map((item, index) => (
                                                        <tr key={index} className="hover:bg-gray-50">
                                                            <td className="px-4 py-2 text-sm text-gray-900">{item.uniqueId}</td>
                                                            <td className="px-4 py-2 text-sm text-gray-900">{item.firstPrice}</td>
                                                            <td className="px-4 py-2 text-sm text-gray-900">{item.secondPrice}</td>
                                                            <td className="px-4 py-2 text-sm text-gray-900">{item.firstPrice + item.secondPrice}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Totals for Overlimit (always visible below the scroll area) */}
                                        <div className="mt-3 bg-red-50 p-3 rounded text-sm text-red-800 font-semibold">
                                            <div className="flex justify-between">
                                                <span>Total</span>
                                                <div className="flex gap-6">
                                                    <span>F: {calculateTotals(previewData.overlimit).first}</span>
                                                    <span>S: {calculateTotals(previewData.overlimit).second}</span>
                                                    <span>Total: {calculateTotals(previewData.overlimit).total}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-4 text-center">No overlimit entries.</div>
                                )}
                            </div>

                            {/* Invoice column */}
                            <div>
                                <div className="bg-white rounded-lg shadow-md p-6 h-full flex flex-col">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Invoice Preview</h3>
                                    <div className="text-sm text-gray-700 mb-2">
                                        <div><strong>Draw Date:</strong> {selectedDraw?.draw_date ? new Date(selectedDraw.draw_date).toLocaleDateString() : drawDate}</div>
                                        <div><strong>Party:</strong> {selectedParty?.username || selectedParty?._id} {selectedParty?.partyCode ? `(${selectedParty.partyCode})` : ''}</div>
                                        <div><strong>Type:</strong> {prizeType}</div>
                                    </div>

                                    <div className="mb-3">
                                        <p className="text-sm text-gray-600">Archive: <span className="text-gray-900">{archiveInfo?.fileName || archiveInfo?._id}</span></p>
                                        {invoiceDoc ? (
                                            <p className="text-sm text-gray-600">Invoice No: <span className="text-gray-900">{invoiceDoc.invoiceNo}</span></p>
                                        ) : (
                                            <div className="mt-2">
                                                <button onClick={() => fetchInvoiceByArchive(archiveInfo?._id)} disabled={invoiceLoading} className={`px-3 py-2 rounded-md font-medium ${invoiceLoading ? 'bg-yellow-500' : 'bg-indigo-600 hover:bg-indigo-700'} text-white`}>{invoiceLoading ? 'Loading...' : 'Fetch Invoice'}</button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="max-h-[72vh] overflow-auto border border-gray-200">
                                        <table className="min-w-full table-auto">
                                            <thead>
                                                <tr className="bg-gray-100">
                                                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">Number</th>
                                                    <th className="px-3 py-2 text-right text-sm font-medium text-gray-700">F Prize</th>
                                                    <th className="px-3 py-2 text-right text-sm font-medium text-gray-700">S Prize</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(invoiceDoc?.records || previewData.overlimit || []).map((r, i) => (
                                                    <tr key={i} className="border-b border-gray-100">
                                                        <td className="px-3 py-2 text-sm text-gray-900">{r.number || r.uniqueId}</td>
                                                        <td className="px-3 py-2 text-sm text-right text-gray-900">{(r.fPrize || r.firstPrice || 0).toFixed ? (r.fPrize || r.firstPrice || 0).toFixed(2) : (r.fPrize || r.firstPrice || 0)}</td>
                                                        <td className="px-3 py-2 text-sm text-right text-gray-900">{(r.sPrize || r.secondPrice || 0).toFixed ? (r.sPrize || r.secondPrice || 0).toFixed(2) : (r.sPrize || r.secondPrice || 0)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-800">
                                        <div><strong>Total records:</strong> {invoiceDoc?.recordCount ?? previewData.overlimit.length}</div>
                                        <div><strong>Record type:</strong> {prizeType}</div>
                                        <div><strong>Total prize:</strong> {((invoiceDoc?.records || previewData.overlimit || []).reduce((s, x) => s + (Number(x.fPrize || x.firstPrice || 0) + Number(x.sPrize || x.secondPrice || 0)), 0)).toFixed(2)}</div>
                                        <div><strong>Highest:</strong> {displayHighest?.number || '-'} {displayHighest ? `(F:${(displayHighest.fPrize||0).toFixed(2)} S:${(displayHighest.sPrize||0).toFixed(2)})` : ''}</div>
                                    </div>

                                    <div className="mt-4 flex items-center gap-2">
                                        {invoiceDoc && <button onClick={() => downloadInvoicePdf()} className="px-3 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white">Download PDF</button>}
                                        {invoiceDoc && <button onClick={() => printInvoice()} className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white">Print</button>}
                                        <button onClick={() => fetchInvoiceByArchive(archiveInfo?._id)} className="px-3 py-2 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-900">Refresh</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
        </div>
        
    );

    
};

export default Hisab;
