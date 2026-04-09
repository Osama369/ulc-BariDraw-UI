import React, { useState, useEffect, useMemo, useRef, useDeferredValue, useCallback } from 'react';
import { data, useNavigate } from 'react-router-dom';
import axios from "axios";
import jsPDF from "jspdf";
import { useSelector, useDispatch } from "react-redux";
import { showLoading, hideLoading } from '../redux/features/alertSlice';
import { setUser } from '../redux/features/userSlice';
// imort the FaSignOutAlt
import { FaSignOutAlt } from 'react-icons/fa';
// import { setData } from '../redux/features/dataSlice';
import toast from 'react-hot-toast';

import Spinner from './Spinner'
import { useDrawsAutoSync } from '../hooks/useDrawsAutoSync';
import { isDrawVisibleForSell, isDrawVisibleForHistory, formatDrawOptionLabel } from '../utils/drawVisibility';
import "jspdf-autotable";
import {
  FaUser,
  FaClock,
  FaCalendarAlt,
  FaFileUpload,
  FaPrint,
  FaTrash,
  FaCheckSquare,
  FaBook,
  FaCalculator,
  FaInbox,
  FaDice,
  FaMagic,
  FaCity,
  FaEllipsisH, // 2digits
  FaBalanceScale,
  FaUserTie,
  FaBell,
  FaRing,
  FaCog,
  FaCheckCircle,
  FaArrowUp,
  FaEye,
  FaStar, FaMoon,

} from 'react-icons/fa';

const formatRemaining = (ms) => {
  if (ms == null) return "-";
  if (ms <= 0) return "Expired";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / (24 * 3600));
  const hours = Math.floor((total % (24 * 3600)) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${days}d : ${pad(hours)}h : ${pad(minutes)}m : ${pad(seconds)}s`;
};

const getEntryKey = (entry) => entry?.objectId || entry?._tempId || entry?.id;

const DrawCountdown = React.memo(function DrawCountdown({ selectedDraw }) {
  const [remainingMs, setRemainingMs] = useState(null);

  useEffect(() => {
    if (!selectedDraw) {
      setRemainingMs(null);
      return;
    }

    let initialMs = null;
    if (typeof selectedDraw.remainingMs === 'number') {
      initialMs = Math.max(selectedDraw.remainingMs, 0);
    } else if (selectedDraw.draw_date) {
      const drawDateObj = new Date(selectedDraw.draw_date);
      drawDateObj.setHours(23, 59, 59, 999);
      initialMs = Math.max(drawDateObj.getTime() - Date.now(), 0);
    }

    setRemainingMs(initialMs);
    if (initialMs == null) return;

    const t = setInterval(() => {
      setRemainingMs(prev => {
        if (prev == null) return null;
        const next = prev - 1000;
        return next >= 0 ? next : 0;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [selectedDraw]);

  if (!selectedDraw) return null;

  return (
    <p className="text-white flex items-center space-x-2 mt-1">
      <FaClock className="text-purple-400" />
      <span>
        <strong>Expires In:</strong> {formatRemaining(remainingMs)}
      </span>
    </p>
  );
});

const EntriesTable = React.memo(
  function EntriesTable({
    entries,
    selectedEntries,
    setSelectedEntries,
    onToggleSelectEntry,
    onDeleteRecord,
    onDeleteEntry,
  }) {
    const ROW_HEIGHT = 46;
    const OVERSCAN = 10;
    const scrollRef = useRef(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);

    const selectedSet = useMemo(() => new Set(selectedEntries), [selectedEntries]);

    const groups = useMemo(() => {
      // Preserve "newest first" based on incoming list ordering.
      const list = Array.isArray(entries) ? entries.slice().reverse() : [];
      const map = new Map();
      for (const row of list) {
        const groupKey = row?.parentId || row?._batchId || getEntryKey(row);
        if (!groupKey) continue;
        const existing = map.get(groupKey);
        if (existing) {
          existing.rows.push(row);
        } else {
          map.set(groupKey, { groupKey, parentId: row?.parentId || null, rows: [row] });
        }
      }
      return Array.from(map.values());
    }, [entries]);

    const allSelected =
      groups.length > 0 &&
      groups.every((g) => g.rows.every((entry) => selectedSet.has(getEntryKey(entry))));

    const flatRows = useMemo(() => {
      const rows = [];
      for (const g of groups) {
        for (let ri = 0; ri < g.rows.length; ri += 1) {
          const entry = g.rows[ri];
          rows.push({
            group: g,
            entry,
            isFirstRow: ri === 0,
            key: getEntryKey(entry),
          });
        }
      }
      return rows;
    }, [groups]);

    useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;

      const updateSize = () => setViewportHeight(el.clientHeight || 0);
      updateSize();

      let ro;
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(updateSize);
        ro.observe(el);
      } else {
        window.addEventListener('resize', updateSize);
      }

      return () => {
        if (ro) ro.disconnect();
        else window.removeEventListener('resize', updateSize);
      };
    }, []);

    const totalRows = flatRows.length;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(
      totalRows,
      Math.ceil((scrollTop + Math.max(viewportHeight, ROW_HEIGHT)) / ROW_HEIGHT) + OVERSCAN
    );
    const visibleRows = flatRows.slice(startIndex, endIndex);
    const topPadding = startIndex * ROW_HEIGHT;
    const bottomPadding = (totalRows - endIndex) * ROW_HEIGHT;

    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-x-auto">
        {/* Fixed header */}
        <table className="min-w-[620px] w-full table-fixed text-[17px] text-left">
          <colgroup>
            <col className="w-11" />
            <col />
            <col className="w-20" />
            <col className="w-20" />
            <col className="w-[86px]" />
          </colgroup>
          <thead>
            <tr className="bg-gray-800 border-b border-gray-700">
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const allIds = groups
                        .flatMap((g) => g.rows.map((entry) => getEntryKey(entry)))
                        .filter(Boolean);
                      setSelectedEntries(allIds);
                    } else {
                      setSelectedEntries([]);
                    }
                  }}
                />
              </th>
              <th className="px-3 py-2">Bundle</th>
              <th className="px-3 py-2">1st</th>
              <th className="px-3 py-2">2nd</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
        </table>

        {/* Scroll only the rows */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain app-scroll"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          {groups.length === 0 ? (
            <div className="h-full min-h-[160px] flex items-center justify-center text-sm text-gray-300">
              No entries yet.
            </div>
          ) : (
            <table className="min-w-[620px] w-full table-fixed text-[17px] text-left">
              <colgroup>
                <col className="w-11" />
                <col />
                <col className="w-20" />
                <col className="w-20" />
                <col className="w-[86px]" />
              </colgroup>
              <tbody>
                {topPadding > 0 && (
                  <tr>
                    <td colSpan={5} style={{ height: `${topPadding}px`, padding: 0, border: 'none' }} />
                  </tr>
                )}

                {visibleRows.map((item, idx) => {
                  const { group: g, entry, isFirstRow, key } = item;
                  const prevVisible = idx > 0 ? visibleRows[idx - 1] : null;
                  const showActionInViewport = isFirstRow || !prevVisible || prevVisible.group.groupKey !== g.groupKey;
                  const canDeleteRecord = !!g.parentId;
                  const canDeleteEntry = !!entry?.objectId;
                  const onDelete = () => {
                    if (canDeleteRecord) return onDeleteRecord(g.parentId);
                    if (canDeleteEntry) return onDeleteEntry(entry);
                  };

                  return (
                    <tr
                      key={key || `${g.groupKey}_${startIndex + idx}`}
                      className="border-b border-gray-700 hover:bg-gray-700/30"
                      style={{ height: `${ROW_HEIGHT}px` }}
                    >
                      <td className="px-3 py-2.5 align-middle">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(key)}
                          onChange={() => onToggleSelectEntry(key)}
                          className="w-4 h-4"
                          disabled={!key}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-semibold tabular-nums align-middle">{entry.no}</td>
                      <td className="px-3 py-2.5 tabular-nums align-middle">{entry.f}</td>
                      <td className="px-3 py-2.5 tabular-nums align-middle">{entry.s}</td>
                      <td className="px-3 py-2.5 align-middle">
                        {showActionInViewport ? (
                          <button
                            onClick={onDelete}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-rose-200/90 text-rose-700 hover:bg-rose-200 disabled:opacity-60"
                            disabled={!canDeleteRecord && !canDeleteEntry}
                            title={
                              canDeleteRecord
                                ? 'Delete record'
                                : canDeleteEntry
                                  ? 'Delete entry'
                                  : 'Not saved yet'
                            }
                          >
                            <FaTrash />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}

                {bottomPadding > 0 && (
                  <tr>
                    <td colSpan={5} style={{ height: `${bottomPadding}px`, padding: 0, border: 'none' }} />
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.entries === next.entries &&
    prev.selectedEntries === next.selectedEntries
);

// Hooks to manage states of the variables
// State for ledger selection, date, and draw time
//const [user, setUser] = useState(null);
// using the redux slice reducer
const Center = ({ onToggleSidebar, sidebarVisible, initialImportOpen = false }) => {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const userData = useSelector((state) => state.user);
  const token = userData?.token || localStorage.getItem("token");
  // console.log(token);
  const [autoMode, setAutoMode] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const noInputRef = useRef(null);
  const fInputRef = useRef(null);
  const sInputRef = useRef(null);
  const lastSaveRef = useRef(null);

  const lastIdRef = useRef(0); // keeps track of last used ID
  const getNextId = () => {
    lastIdRef.current += 1;
    return lastIdRef.current;
  };

  const handleFocus = () => {
      if (fInputRef.current) {
        fInputRef.current.select();
      }
    };

  const handleFocus2 = () => {
      if (sInputRef.current) {
        sInputRef.current.select();
      }
    };

  const handleNoKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!no) {
        // toast.warning("Please enter NO before moving to the next input.");
        return;
      }
      if (autoMode) {
        handleSingleEntrySubmit(); // Auto Mode: Save immediately

      } else {
        fInputRef.current?.focus(); // OFF Mode: Go to F
      }
    }
  };

  const handleFKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!f) {
        // toast.warning("Please enter F before moving to the next input.");
        return;
      }
      sInputRef.current?.focus(); // Go to S
    }
  };

  const handleSKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (autoMode) {
        handleSingleEntrySubmit(); // Auto Mode: Save immediately


      }
      else {
        handleSingleEntrySubmit(); // Save entry in OFF mode
        // setNo("");
        // setF("");
        // setS("");
        noInputRef.current?.focus(); // Move focus to NO


      }
    }
  };


  const toggleAutoMode = () => {
    setAutoMode((prev) => !prev);
    lastSaveRef.current = null; // Reset behavior tracking when toggling
  };




  const [ledger, setLedger] = useState("LEDGER");
  const [drawTime, setDrawTime] = useState("11 AM");  // time slot
  const [drawDate, setDrawDate] = useState(new Date().toISOString().split('T')[0]); // date
  const { draws } = useDrawsAutoSync({
    tokenCandidates: [token, localStorage.getItem('token'), localStorage.getItem('adminToken')],
    pollMs: 5000,
  });
  const [selectedDraw, setSelectedDraw] = useState(null);
  const [closingTime, setClosingTime] = useState("");
  const [closingTimeObj, setClosingTimeObj] = useState(null);
  const [formattedClosingTime, setFormattedClosingTime] = useState("");
  const [entries, setEntries] = useState([]);  // table entries
  // Authoritative voucher data used for optimistic updates and fast UI show
  const [voucherData, setVoucherData] = useState([]);
  const voucherDataRef = useRef(voucherData);
  const [no, setNo] = useState('');
  const [f, setF] = useState('');
  const [s, setS] = useState('');
  const [selectAll, setSelectAll] = useState(false);
  const [copiedEntries, setCopiedEntries] = useState([]);
  const [smsInput, setSmsInput] = useState("");
  const [parsedEntries, setParsedEntries] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showImportDBFModal, setShowImportDBFModal] = useState(false);
  const [importDrawId, setImportDrawId] = useState("");
  const [importPartyId, setImportPartyId] = useState("");
  const [importClientId, setImportClientId] = useState("");
  const [importFile, setImportFile] = useState(null);
  const [importParsedRows, setImportParsedRows] = useState([]);
  const [importDetectedMode, setImportDetectedMode] = useState("");
  const [importing, setImporting] = useState(false);
  const [parties, setParties] = useState([]);
  const [clients, setClients] = useState([]);

  const [selectedEntries, setSelectedEntries] = useState([]);
  const [file, setFile] = useState(null);
  // Winning numbers will be populated from admin settings via API;
  // start empty so we can hide the notification panel until set.
  const [winningNumbers, setWinningNumbers] = useState([]);
  const [firstPrizeLimit, setFirstPrizeLimit] = useState(0);
  const [secondPrizeLimit, setSecondPrizeLimit] = useState(0);
  const [prizeType, setPrizeType] = useState("Hinsa");
  const [enablePrizeFilter, setEnablePrizeFilter] = useState(false);
  const [isDemandOverlimit, setIsDemandOverlimit] = useState(false);
  const [combineSelected, setCombineSelected] = useState(false);
  const [selectedPrizeEntry, setSelectedPrizeEntry] = useState("Akra"); 

  useEffect(() => {
    if (initialImportOpen && userData?.user?.role === 'distributor') {
      setShowImportDBFModal(true);
    }
  }, [initialImportOpen, userData?.user?.role]);

  useEffect(() => {
    setCombineSelected(
      ledger === "COMBINED" ||
      ledger === "COMBINED DEMAND" ||
      ledger === "COMBINED OVER LIMIT"
    );
  }, [ledger]);

  // pasr sms function
  const parseSMS = (sms) => {
    if (!sms) return [];

    // Extract F and S values (e.g., f0 s50)
    const fMatch = sms.match(/f(\d+)/i);
    const sMatch = sms.match(/s(\d+)/i);

    const fValue = fMatch ? parseInt(fMatch[1]) : 0;
    const sValue = sMatch ? parseInt(sMatch[1]) : 0;

    // Remove f/s part from string to isolate numbers
    const numbersPart = sms.replace(/f\d+/i, "").replace(/s\d+/i, "");

    // Split by '.' and filter empty
    const numbers = numbersPart.split(".").filter(Boolean);

    // Create entries
    return numbers.map((no, index) => ({
      id: entries.length + index + 1,
      no: no,
      f: fValue,
      s: sValue,
      selected: false,
    }));
  };

  // Keep selected draw object fresh with latest polled draw state.
  useEffect(() => {
    if (!selectedDraw?._id) return;
    const latest = draws.find((d) => String(d._id) === String(selectedDraw._id));
    if (!latest) {
      setSelectedDraw(null);
      return;
    }
    if (latest !== selectedDraw) {
      setSelectedDraw(latest);
    }
  }, [draws, selectedDraw]);

  useEffect(() => {
    const fetchParties = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/v1/users/distributor-parties', { headers: { Authorization: token ? `Bearer ${token}` : undefined } });
        setParties(res.data || []);
      } catch (err) {
        setParties([]);
      }
    };

    const fetchClients = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/v1/users/distributor-users', { headers: { Authorization: token ? `Bearer ${token}` : undefined } });
        setClients(res.data || []);
      } catch (err) {
        setClients([]);
      }
    };

    fetchParties();
    fetchClients();
  }, []);

  const isDrawActive = (d) => {
    return isDrawVisibleForSell(d);
  };

  const historyVisibleDraws = useMemo(() => draws.filter(isDrawVisibleForHistory), [draws]);

  const isSelectedDrawClosed = () => {
    if (!selectedDraw) return false;
    if (selectedDraw.isExpired) return true;
    if (typeof selectedDraw.remainingMs === 'number') return selectedDraw.remainingMs <= 0;
    if (selectedDraw.draw_date) {
      const end = new Date(selectedDraw.draw_date);
      end.setHours(23, 59, 59, 999);
      return Date.now() >= end.getTime();
    }
    return false;
  };

  // When selected draw changes, refresh dependent data (voucher, winning numbers, demand/overlimit)
  useEffect(() => {
    if (selectedDraw) {
      // these functions are defined below in the component
      try {
        getAndSetVoucherData();
      } catch (err) {
        // ignore if function not yet defined at the time of render
      }
      try {
        getWinningNumbers();
      } catch (err) {}
      // try {
      //   getDemandOverlimit();
      // } catch (err) {}
    } else {
      // When draw is deselected, clear displayed entries so table is empty
      setEntries([]);
    }
  }, [selectedDraw]);

  // reset model popup 
  const closeSmsModal = () => {
    setShowModal(false);
    setSmsInput("");
    setParsedEntries([]);
  };


  // handle confirm function
  const handleConfirmPaste = () => {
    // Block if draw is closed (based on admin draw date/expiry)
    if (isPastClosingTime()) {
      toast("Draw is closed. Cannot add entries.");
      return;
    }

    if (parsedEntries.length === 0) {
      toast("No entries to add.");
      return;
    }

    addEntry(parsedEntries);
    setShowModal(false);
    setSmsInput("");
    setParsedEntries([]);
  };


  // Toggle single row
  const toggleSelectEntry = useCallback((entryId) => {
    if (!entryId) return;
    setSelectedEntries((prev) =>
      prev.includes(entryId)
        ? prev.filter((id) => id !== entryId)
        : [...prev, entryId]
    );
  }, []);

  // Toggle Select All
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedEntries([]);
    } else {
      const allIds = entries.map(getEntryKey).filter(Boolean);
      setSelectedEntries(allIds);
    }
    setSelectAll(!selectAll);
  };

  const handleCopySelected = () => {
    if (selectedEntries.length === 0) {
      toast("No entries selected to copy!");
      return;
    }

    // Find selected rows
    const entriesToCopy = entries.filter((entry) =>
      selectedEntries.includes(getEntryKey(entry))
    );

    setCopiedEntries(entriesToCopy);
    toast.success(`${entriesToCopy.length} entries copied!`);
  };

  const handlePasteCopied = () => {
    if (copiedEntries.length === 0) {
      toast("No copied data to paste!");
      return;
    }

    // Create new entries with new IDs (to avoid duplicates)
    const pastedData = copiedEntries.map((entry, index) => ({
      ...entry,
      id: entries.length + index + 1, // Generate new local ID
      objectId: undefined, // remove old objectId (so backend will treat it as new)
    }));

    // Send pasted data to backend using existing addEntry
    addEntry(pastedData);

    toast.success(`${pastedData.length} entries pasted successfully!`);
  };


  // State for storing permutations
  const [permutations, setPermutations] = useState([]);  // we will set permutation in the table entreis

  useEffect(() => {   // this is used in table 
    if (drawDate ) {
      getAndSetVoucherData();
      getWinningNumbers(drawDate);  // Fetch winning numbers based on draw date only
      // getDemandOverlimit(drawDate, drawTime);
    }
  }, [drawDate]);

  useEffect(() => {
    // Keep ref in sync for rollback snapshots inside async handlers
    voucherDataRef.current = voucherData;
  }, [voucherData]);

  // get the user data profile
  useEffect(() => {
    ; (
      async () => {

        try {
          const token = localStorage.getItem("token");
          // console.log(token);

          if (!token) {
            navigate("/login");

            return;
          }

          // Decode token to get user ID
          const decodedToken = JSON.parse(atob(token.split(".")[1]));
          const userId = decodedToken.id;
          // console.log(userId);

          const response = await axios.get(`/api/v1/users/${userId}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          dispatch(setUser(response.data));
          //setUser(response.data);
        } catch (error) {
          setError("Failed to load user data");
          console.error(error);
        } finally {
          setLoading(false);
        }
      }
    )();

  }, [dispatch, navigate]);


  const addEntry = async (customeEntries = null) => {
    const dataToAdd = customeEntries || entries;
    if (!dataToAdd || dataToAdd.length === 0) {
      toast("No record to save! ⚠️");
      return;
    }

    // Format payload for API
    const formattedData = dataToAdd.map(entry => ({
      uniqueId: entry.no,
      firstPrice: Number(entry.f) || 0,
      secondPrice: Number(entry.s) || 0,
    }));

    const payload = { data: formattedData };
    if (selectedDraw && selectedDraw._id) {
      payload.drawId = selectedDraw._id;
    } else {
      toast.error("Please select a draw before saving.");
      return;
    }

    // Snapshot for rollback
    const prev = voucherDataRef.current || entries || [];

    // Create temporary items to show immediately in UI (use _tempId to identify)
    const now = Date.now();
    const batchId = `batch_${now}`;
    const tempItems = formattedData.map((item, idx) => ({
      parentId: null,
      objectId: undefined,
      no: item.uniqueId,
      f: item.firstPrice,
      s: item.secondPrice,
      selected: false,
      _tempId: `temp_${now}_${idx}`,
      id: `temp_${now}_${idx}`,
      _batchId: batchId,
    }));

    // Optimistically update UI (do not clear input fields here — keep existing input flow)
    setVoucherData(prevArr => [ ...prevArr , ...tempItems]);
    setEntries(prevArr => [ ...prevArr, ...tempItems]);
    toast.success("Record queued for save ✅");

    try {
      // Send to server (do not block UI on final refresh)
      const response = await axios.post("/api/v1/data/add-data", payload, {
        headers: { Authorization: `Bearer ${token}` },
        // timeout: 10000,
      });

      // If server returns created data, reconcile quickly
      const created = response.data?.data || response.data?.created || null;
      if (Array.isArray(created) && created.length > 0) {
        // Flatten created entries into table rows if API returns parent docs
        const createdRows = created.flatMap((record) =>
          (record.data || []).map(item => ({
            parentId: record._id || null,
            objectId: item._id,
            no: item.uniqueId,
            f: item.firstPrice,
            s: item.secondPrice,
            selected: false,
          }))
        );

        // Replace temp items for matching uniqueIds, otherwise prepend created rows
        setVoucherData(prevArr => {
          const uniqueIds = new Set(createdRows.map(r => r.no));
          const remaining = prevArr.filter(p => !p._tempId || !uniqueIds.has(p.no));
          return [...createdRows, ...remaining];
        });
        setEntries(prev => {
          const uniqueIds = new Set(createdRows.map(r => r.no));
          const remaining = prev.filter(p => !p._tempId || !uniqueIds.has(p.no));
          return [...createdRows, ...remaining];
        });
      }

      // Run a background authoritative sync to reconcile any drift
      getAndSetVoucherData().catch(err => console.warn("Background sync failed:", err));
    } catch (error) {
      // Rollback optimistic UI on failure
      setVoucherData(prev);
      setEntries(prev);
      dispatch(hideLoading());
      console.error("Error adding entries:", error.response?.data?.error || error.message);
      toast.error(error.response?.data?.error || "Failed to add record ❌");
    }
  };


  

  const fetchVoucherData = async (selectedDate,  category = "general") => {
    try {
      const token = localStorage.getItem("token");

      if (!(selectedDraw && selectedDraw._id)) {
        toast.error("Please select a draw to fetch records.");
        return [];
      }
      const params = { category, drawId: selectedDraw._id };

      const response = await axios.get("/api/v1/data/get-data", {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log("getDatabydate", response);


      return response.data.data;
    } catch (error) {
      toast.error((error.response?.data?.error));
      return [];
    }
  };

  // Fetch winning numbers for the current draw date (timeSlot no longer used)
  const getWinningNumbers = async (date) => {

    try {
      const params = {};
      if (selectedDraw && selectedDraw.draw_date) params.date = new Date(selectedDraw.draw_date).toISOString().split('T')[0];
      else params.date = date;

      const response = await axios.get("/api/v1/data/get-winning-numbers", {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.data || response.data.winningNumbers) {
        const formattedNumbers = response.data.winningNumbers.map(item => ({
          number: item.number,
          type: item.type,
          color: item.type === 'first' ? [255, 0, 0] :
            item.type === 'second' ? [0, 0, 255] :
              [128, 0, 128] // Purple for third
        }));

        // Deduplicate by 6-digit number + type so that
        // entering the same winning number twice in admin
        // does not multiply the prize for one entry.
        const uniqueMap = new Map();
        formattedNumbers.forEach(w => {
          const key = `${w.number}-${w.type}`;
          if (!uniqueMap.has(key)) uniqueMap.set(key, w);
        });
        const uniqueWinningNumbers = Array.from(uniqueMap.values());

        setWinningNumbers(uniqueWinningNumbers);
        return uniqueWinningNumbers;
      } else {
        setWinningNumbers([]);
        return [];
      }
    } catch (error) {
      console.error("Error fetching winning numbers:", error);
      // toast.error("Failed to fetch winning numbers");
      setWinningNumbers([]);
      return [];
    }
  };

  

  const getAndSetVoucherData = async () => {  // use in to fetch data base on time/date
    if (!(selectedDraw && selectedDraw._id)) {
      // No draw selected — clear displayed entries and skip fetching.
      setVoucherData([]);
      setEntries([]);
      return;
    }

    const fetchedData = await fetchVoucherData(drawDate);

    if (Array.isArray(fetchedData) && fetchedData.length > 0) {
      // Only use records that match the selectedDraw (backend should already filter by drawId)
      const filteredRecords = fetchedData.filter((record) => {
        const recordDrawId = record.drawId?._id || record.drawId || record._doc?.drawId;
        return String(recordDrawId) === String(selectedDraw._id);
      });

      const combinedEntries = filteredRecords.flatMap((record) =>
        record.data.map((item, index) => ({
          parentId: record._id, // to keep track of the parent record
          objectId: item._id, // to keep track of the parent record
          // serial: index + 1, // creates a unique-enough ID without needing global index
          no: item.uniqueId,
          f: item.firstPrice,
          s: item.secondPrice,
          selected: false,
        }))
      );

      setVoucherData(combinedEntries);
      setEntries(combinedEntries);
      console.log("combined entires", combinedEntries);  // jo bhi entries hongi wo yengi

    } else {
      setVoucherData([]);
      setEntries([]);
    }
  };

  // delete handler the record based on id 

  const handleDeleteRecord = async (parentId) => {

    // Ask for confirmation before deleting
    const ok = window.confirm('Do you want to delete this record?');
    if (!ok) return;

    console.log("Deleting record with ID:", parentId);
    try {
      const token = localStorage.getItem('token');

      await axios.delete(`/api/v1/data/delete-data/${parentId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      toast.success('Record deleted successfully');
      await fetchVoucherData(); // Re-fetch updated data
      await getAndSetVoucherData();

    } catch (error) {
      console.error('Error deleting record:', error);
      toast.error('Failed to delete record');
    }

  };

  // Delete multiple selected entries
  const handleDeleteSelected = async () => {
    if (selectedEntries.length === 0) {
      toast("No entries selected!");
      return;
    }
    const idsToDelete = selectedEntries.filter(
      (id) => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id)
    );
    if (idsToDelete.length === 0) {
      toast("Selected rows are not saved yet.");
      return;
    }
    try {
      const token = localStorage.getItem("token");

      await axios.delete(`/api/v1/data/delete-individual-entries`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: { entryIds: idsToDelete },
      });

      toast.success("Selected records deleted successfully");

      // Optimistic UI update; also run a background sync for safety.
      setEntries((prev) => prev.filter((e) => !idsToDelete.includes(e.objectId)));
      setVoucherData((prev) => prev.filter((e) => !idsToDelete.includes(e.objectId)));
      setSelectedEntries((prev) => prev.filter((id) => !idsToDelete.includes(id)));
      setSelectAll(false);
      getAndSetVoucherData().catch(() => {});
    } catch (error) {
      console.error("Error deleting selected records:", error);
      toast.error("Failed to delete selected records");
    }
  };

  const handleDeleteEntry = async (entry) => {
    const entryId = entry?.objectId;
    if (!entryId) return;

    const ok = window.confirm("Do you want to delete this entry?");
    if (!ok) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`/api/v1/data/delete-individual-entries`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { entryIds: [entryId] },
      });
      setEntries((prev) => prev.filter((e) => e.objectId !== entryId));
      setVoucherData((prev) => prev.filter((e) => e.objectId !== entryId));
      setSelectedEntries((prev) => prev.filter((id) => id !== entryId));
      toast.success("Entry deleted");
      getAndSetVoucherData().catch(() => {});
    } catch (error) {
      console.error("Error deleting entry:", error);
      toast.error("Failed to delete entry");
    }
  };


  // // logout th user 
  // // utils/auth.js (or inside any component)

  // const handleLogout = (navigate) => {
  //   localStorage.removeItem("token");
  //   localStorage.removeItem("user"); // if you're storing user info
  //   // Optionally show a toast
  //   toast.success("Logged out successfully!");
  //   // Navigate to login
  //   navigate("/login");
  // };







  

  // Distributor summary values derived from current `entries`
  const distributorSummary = useMemo(() => {
    const firstTotal = entries.reduce((sum, e) => sum + (Number(e.f) || 0), 0);
    const secondTotal = entries.reduce((sum, e) => sum + (Number(e.s) || 0), 0);
    return {
      recordCount: entries.length,
      firstTotal,
      secondTotal,
      grandTotal: firstTotal + secondTotal,
    };
  }, [entries]);

  // Keep typing interactions responsive while very large tables update in background.
  const deferredEntries = useDeferredValue(entries);

  if (loading) {  // this is loading that is running in seprately 
    return <p className="text-center text-lg"><Spinner /></p>;
  }

  if (error) {
    return <p className="text-center text-red-600">{error}</p>;
  }

  const parseDbfFile = async (file) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const view = new DataView(buf);

    const recordCount = view.getUint32(4, true);
    const headerLength = view.getUint16(8, true);
    const recordLength = view.getUint16(10, true);

    if (!recordCount || !headerLength || !recordLength) {
      throw new Error('Invalid DBF header');
    }

    const decoder = new TextDecoder('ascii');
    const fields = [];
    let cursor = 32;
    while (cursor + 32 <= bytes.length && bytes[cursor] !== 0x0d) {
      const fieldBytes = bytes.slice(cursor, cursor + 32);
      const rawName = decoder.decode(fieldBytes.slice(0, 11));
      const name = rawName.replace(/\u0000/g, '').trim();
      const type = String.fromCharCode(fieldBytes[11] || 67);
      const length = fieldBytes[16] || 0;
      if (name && length > 0) {
        fields.push({ name, type, length });
      }
      cursor += 32;
    }

    if (!fields.length) {
      throw new Error('No field descriptors found in DBF');
    }

    let fieldOffset = 1; // first byte in record is delete flag
    const fieldsWithOffset = fields.map((fdesc) => {
      const out = { ...fdesc, offset: fieldOffset };
      fieldOffset += fdesc.length;
      return out;
    });

    const fieldMap = new Map();
    fieldsWithOffset.forEach((fdesc) => {
      fieldMap.set(String(fdesc.name).toUpperCase(), fdesc);
    });

    const hasRlc = fieldMap.has('ANO') && fieldMap.has('SUM_A1') && fieldMap.has('SUM_A2');
    const hasMohsin = fieldMap.has('PKT') && fieldMap.has('P_PRIZE1') && fieldMap.has('P_PRIZE2');

    let detectedMode = '';
    if (hasRlc) detectedMode = 'RLC';
    else if (hasMohsin) detectedMode = 'Mohsin';
    else {
      throw new Error('Unsupported DBF schema. Required fields not found.');
    }

    const readFieldRaw = (recordOffset, fieldName) => {
      const fdesc = fieldMap.get(String(fieldName).toUpperCase());
      if (!fdesc) return '';
      const start = recordOffset + fdesc.offset;
      const end = start + fdesc.length;
      if (end > bytes.length) return '';
      return decoder.decode(bytes.slice(start, end)).trim();
    };

    const parseNumeric = (raw) => {
      const normalized = String(raw || '').replace(/,/g, '').trim();
      if (!normalized) return 0;
      const num = Number.parseFloat(normalized);
      return Number.isFinite(num) ? num : 0;
    };

    const rows = [];
    for (let i = 0; i < recordCount; i += 1) {
      const offset = headerLength + i * recordLength;
      if (offset + recordLength > bytes.length) break;
      const deletedFlag = bytes[offset];
      if (deletedFlag === 0x2A) continue; // skip deleted

      if (detectedMode === 'RLC') {
        const no = readFieldRaw(offset, 'ANO');
        if (!no) continue;
        const fVal = parseNumeric(readFieldRaw(offset, 'SUM_A1'));
        const sVal = parseNumeric(readFieldRaw(offset, 'SUM_A2'));
        rows.push({ no, f: fVal, s: sVal });
      } else {
        const no = readFieldRaw(offset, 'PKT');
        if (!no) continue;
        const fVal = parseNumeric(readFieldRaw(offset, 'P_PRIZE1'));
        const sVal = parseNumeric(readFieldRaw(offset, 'P_PRIZE2'));
        rows.push({ no, f: fVal, s: sVal });
      }
    }

    return { rows, detectedMode };
  };

  const handleImportFileChange = async (event) => {
    const selectedFile = event.target.files && event.target.files[0];
    setImportFile(selectedFile || null);
    setImportDetectedMode('');
    if (!selectedFile) {
      setImportParsedRows([]);
      return;
    }
    try {
      const { rows, detectedMode } = await parseDbfFile(selectedFile);
      setImportParsedRows(rows);
      setImportDetectedMode(detectedMode);
      toast.success(`Detected ${detectedMode} DBF. Parsed ${rows.length} rows.`);
    } catch (err) {
      console.error('Failed to parse DBF', err);
      toast.error(err?.message || 'Failed to parse DBF file');
      setImportParsedRows([]);
      setImportDetectedMode('');
    }
  };

  const handleConfirmImportDbf = async () => {
    if (userData?.user?.role !== 'distributor') {
      toast.error('Import DBF is allowed for distributors only');
      return;
    }
    if (!importDrawId) return toast.error('Select draw');
    if (!importPartyId) return toast.error('Select party account');
    if (!importClientId) return toast.error('Select client');
    if (!importFile) return toast.error('Select DBF file');
    if (!importParsedRows.length) return toast.error('No rows parsed from DBF');

    const drawObj = draws.find(d => String(d._id) === String(importDrawId));
    if (drawObj) setSelectedDraw(drawObj);

    const formattedData = importParsedRows.map(r => ({
      uniqueId: r.no,
      firstPrice: Number(r.f) || 0,
      secondPrice: Number(r.s) || 0,
    }));

    const payload = {
      data: formattedData,
      drawId: importDrawId,
      partyId: importPartyId,
      userId: importClientId,
      category: 'general',
      sourceFormat: importDetectedMode,
    };

    setImporting(true);

    try {
      await axios.post('/api/v1/data/add-data', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('DBF imported successfully');
      setShowImportDBFModal(false);
      setImportFile(null);
      setImportParsedRows([]);
      setImportDetectedMode('');
      setImportDrawId('');
      setImportPartyId('');
      setImportClientId('');
      // Do not mutate distributor table; client will see entries in their view.
    } catch (err) {
      console.error('DBF import failed', err);
      toast.error(err?.response?.data?.error || 'Failed to import DBF');
    } finally {
      setImporting(false);
    }
  };



  // const handleFileChange = (event) => {
  //   if (event.target.files.length > 0) {

  //     setFile(event.target.files[0]);
  //   }
  // };


  // const handleUpload = () => {
  //   if (!file) {
  //     alert("Please select a file first.");  // toast use krna ha 
  //     return;
  //   }
  //   console.log("Uploading:", file.name);
  //   // Add your file upload logic here (e.g., send to a backend server)
  // };

  // Function to generate permutations
  const getPermutations = (str) => {
    let results = [];
    if (str.length === 1) return [str];

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const remainingChars = str.slice(0, i) + str.slice(i + 1);
      const remainingPermutations = getPermutations(remainingChars);

      for (const perm of remainingPermutations) {
        results.push(char + perm);
      }
    }
    return results;
  };


  // Function to get combinations of a certain length (for 4 figures Ring 24)
  const getCombinations = (str, length) => {
    if (length === 1) return str.split("");
    if (length === str.length) return [str];

    let combinations = [];
    for (let i = 0; i < str.length; i++) {
      let remaining = str.slice(0, i) + str.slice(i + 1);
      let subCombinations = getCombinations(remaining, length - 1);
      subCombinations.forEach(sub => combinations.push(str[i] + sub));
    }
    return combinations;
  };

  // Function to get all permutations of a string
  const getPermutation = (str) => {
    if (str.length === 1) return [str];

    return str.split("").flatMap((char, i) =>
      getPermutation(str.slice(0, i) + str.slice(i + 1)).map(perm => char + perm)
    );
  };



  // Function to generate ordered permutations for 4-digit inputs
  const generateOrderedPermutations = (num, length = 3) => {
    const str = num.toString();
    if (str.length !== 4) {
      console.log("Please enter a 4-digit number.");
      return [];
    }

    const combinations = getCombinations(str, length);
    const allPermutations = combinations.flatMap(getPermutation);
    return Array.from(new Set(allPermutations)).sort((a, b) => a[0].localeCompare(b[0]));
  };




  // genarte the 5 figure ring (60)
  const generate5DigitPermutations = (num, length = 3) => {
    let str = num.toString();
    if (str.length !== 5) {
      console.log("Please enter a 5-digit number.");
      return [];
    }

    let combinations = getCombinations(str, length);
    let allPermutations = combinations.flatMap(getPermutation);

    return Array.from(new Set(allPermutations)).sort((a, b) => a[0].localeCompare(b[0]));
  };

  // genarte the 5 digit ring (120)
  const generate6DigitPermutations = (num, length = 3) => {
    let str = num.toString();
    if (str.length !== 6) {
      console.log("Please enter a 6-digit number.");
      return [];
    }

    let combinations = getCombinations(str, length);
    let allPermutations = combinations.flatMap(getPermutation);

    return Array.from(new Set(allPermutations)).sort((a, b) => a[0].localeCompare(b[0]));
  };

  // genarte the 7 digit ring (210 for unique digits)
  const generate7DigitPermutations = (num, length = 3) => {
    const str = num.toString();
    if (str.length !== 7) {
      console.log("Please enter a 7-digit number.");
      return [];
    }

    const combinations = getCombinations(str, length);
    const allPermutations = combinations.flatMap(getPermutation);
    return Array.from(new Set(allPermutations)).sort((a, b) => a[0].localeCompare(b[0]));
  };

  const generate8DigitPermutations = (num, length = 3) => {
    const str = num.toString();
    if (str.length !== 8) {
      console.log("Please enter an 8-digit number.");
      return [];
    }

    const combinations = getCombinations(str, length);
    const allPermutations = combinations.flatMap(getPermutation);
    return Array.from(new Set(allPermutations)).sort((a, b) => a[0].localeCompare(b[0]));
  };

  // 12 tandolla 

  const generate3FigureRingWithX = (str) => {
    if (str.length !== 3) {
      console.log("Input must be a 3-digit string");
      return [];
    }

    const result = [];

    // Step 1: Regular permutations of the 3-digit number
    const perms = Array.from(new Set(getPermutations(str))); // e.g., 001, 010, 100
    result.push(...perms);

    // Step 2: Insert 'x' at each position with padding
    for (let perm of perms) {
      result.push("+" + perm);                      // x001, x010, x100
      result.push(perm[0] + "+" + perm.slice(1));   // 0x01, 0x10, 1x00
      result.push(perm.slice(0, 2) + "+" + perm[2]); // 00x1, 01x0, 10x0
    }

    return Array.from(new Set(result)); // Remove any duplicates
  };


  // this is palti tandola 3 jaga

  const generate3FigureMinimalPermutations = (str) => {
    if (str.length !== 3) {
      console.log("Input must be a 3-digit string");
      return [];
    }

    // Generate permutations
    const perms = Array.from(new Set(getPermutations(str)));

    // For input like "001", this will produce:
    // ["001", "010", "100"] — unique minimal 3 variations

    return perms;
  };


  const generate4FigurePacket = (num) => {
    let str = num.toString();
    if (str.length !== 4) {
      console.log("Please enter exactly a 4-digit number.");
      return [];
    }

    const getPermutations = (str) => {
      if (str.length === 1) return [str];

      let results = [];
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const remaining = str.slice(0, i) + str.slice(i + 1);
        const permsOfRemaining = getPermutations(remaining);
        permsOfRemaining.forEach(perm => results.push(char + perm));
      }
      return results;
    };

    const allPermutations = getPermutations(str);

    // Remove duplicates and sort
    return Array.from(new Set(allPermutations)).sort();
  };


  const handleSingleEntrySubmit = () => {

    if (isPastClosingTime()) {
      toast("Draw is closed. Cannot add entries.");
      return;
    }
    if (!no || !f || !s) {
      toast("Please fill all fields.");
      return;
    }

    // Auto-detect AKR to Tandula pattern
    if (handleAKRtoTandula()) {
      return; // Already handled
    }

    // Auto-detect Tandula to Packet pattern
    // Keep this before AKR->Packet so +NNN / N+NN / NN+N
    // are handled here without AKR pattern validation noise.
    if (handleTandulaToPacket()) {
      return; // Already handled
    }


    // Auto-detect AKR to Packet pattern
    if (handleAKRtoPacket()) {
      return; // Already handled
    }

    const entry = {
      id: entries.length + 1,
      no,
      f,
      s,
      selected: false,
    };

    addEntry([entry]);
    setNo('');
    // Focus NO for next entry
    noInputRef.current?.focus();
  };









  const handle4FigurePacket = () => {
    if (isPastClosingTime()) {
      toast("Draw is closed. Cannot add entries.");
      return;
    }
    if (!no || no.length < 4 || !f || !s) {
      alert("Please enter at least a 4-digit number and F/S values.");
      return;
    }

    if (no.length !== 4) {
      alert("Please enter exactly a 4-digit number.");
      return;
    }

    const result = generate4FigurePacket(no);
    console.log(result); // Will show 24 permutations

    const updatedEntries = result.map((perm, index) => ({
      id: entries.length + index + 1,
      no: perm,
      f: f,
      s: s,
      selected: false,
    }));

    addEntry(updatedEntries);

    console.log(`✅ ${updatedEntries.length} entries added successfully!`);
  };







  const handlePaltiTandula = () => {
    if (isPastClosingTime()) {
      toast.error("Draw is closed. Cannot add entries.");
      return;
    }
    if (!no || no.length < 3 || no.length > 8 || !f || !s) {
      alert("Please enter a 3 to 8 digit number and F/S values.");
      return;
    }

    let result = [];

    if (no.length === 3) {
      result = Array.from(new Set(getPermutations(no))); // 6 permutations
    } else if (no.length === 4) {
      result = generateOrderedPermutations(no, 3); // 4-digit ring
    } else if (no.length === 5) {
      result = generate5DigitPermutations(no, 3); // 5-digit ring
    } else if (no.length === 6) {
      result = generate6DigitPermutations(no, 3); // 6-digit ring
    } else if (no.length === 7) {
      result = generate7DigitPermutations(no, 3); // 7-digit ring
    } else if (no.length === 8) {
      result = generate8DigitPermutations(no, 3); // 8-digit ring
    }

    const updatedEntries = result.map((perm, index) => ({
      id: entries.length + index + 1,
      no: perm,
      f: f,
      s: s,
      selected: false,
    }));

    addEntry(updatedEntries); // Or setEntries(...), depending on your app state
  };



  // 12 tandulla ring  3 figure ring
  const handle3FigureRingWithX = () => {
    if (isPastClosingTime()) {
      toast.error("Draw is closed. Cannot add entries.");
      return;
    }
    if (no && f && s) {
      if (no.length !== 3) {
        toast.error("Enter exactly a 3-digit number.");
        return;
      }

      const distinct = new Set(no.split("")).size;
      if (distinct !== 2) {
        toast.error("Use a 3-digit number with exactly two matching digits (e.g., 112 or 223).");
        return;
      }

      // Generate permutations with 'x' substitutions
      const generatedRingPermutations = generate3FigureRingWithX(no);

      // Create new entry objects
      const updatedEntries = generatedRingPermutations.map((perm, index) => ({
        id: entries.length + index + 1,
        no: perm,
        f: f,
        s: s,
        selected: false
      }));

      console.log("3-Figure Ring Entries:", updatedEntries);

      // Add entries using your existing handler
      addEntry(updatedEntries);
    }
  };

  const handleChakriRing = () => {
    if (isPastClosingTime()) {
      toast.error("Draw is closed. Cannot add entries.");
      return;
    }
    if (no.length !== 3 || !f || !s) {
      toast.error("Please enter exactly a 3-digit number and F/S values.");
      return;
    }
    if (no && f && s) {
      const generatedPermutations = getPermutations(no);
      const startId = entries.length + 1;
      let idCounter = 0;

      const updatedEntries = generatedPermutations.flatMap((perm) => {
        const variants = [
          perm, // Chakri Ring
          `+${perm}`, // Back Ring
          `${perm.slice(0, 1)}+${perm.slice(1)}`, // Cross Ring
          `${perm.slice(0, 2)}+${perm.slice(2)}` // Double Cross
        ];

        return variants.map((variant) => ({
          id: startId + idCounter++,
          no: variant,
          f,
          s,
          selected: false
        }));
      });

      addEntry(updatedEntries);
    }
  };

  // function to AKR 2 figure 

  const handleAKR2Figure = () => {
    if (isPastClosingTime()) {
      toast.error("Draw is closed. Cannot add entries.");
      return;
    }
    if (no.length !== 2 || !f || !s) {
      console.log("Please enter a 2-digit number and prices.");
      return;
    }

    const num = no.toString();
    const generatedPatterns = [
      num,       // "23"
      `+${num}+`,   // "+23+"
      `++${num}`, // "++23"
      `${num[0]}+${num[1]}`, // "2+3"
      `+${num[0]}+${num[1]}`, // "+2+3"
      `${num[0]}++${num[1]}`  // "2++3"
    ];

    const updatedEntries = generatedPatterns.map((pattern, index) => ({
      id: entries.length + index + 1,
      no: pattern,
      f: f,
      s: s,
      selected: false
    }));

    // setEntries((prevEntries) => [...prevEntries, ...updatedEntries]);  // Append new entries
    addEntry(updatedEntries)
  };


  // hanble AKR 2 figure 3 jaga
  const handleAKR2Figure3Jaga = () => {
    if (isPastClosingTime()) {
      toast.error("Draw is closed. Cannot add entries.");
      return;
    }
    if (no.length !== 2 || !f || !s) {
      console.log("Please enter a 2-digit number and prices.");
      return;
    }

    const num = no.toString();
    const generatedPatterns = [
      num,       // "23"
      `+${num}+`,   // "+23+"
      `++${num}`, // "++23"
      // `${num[0]}+${num[1]}`, // "2+3"
      // `+${num[0]}+${num[1]}`, // "+2+3"
      // `${num[0]}++${num[1]}`  // "2++3"
    ];

    const updatedEntries = generatedPatterns.map((pattern, index) => ({
      id: entries.length + index + 1,
      no: pattern,
      f: f,
      s: s,
      selected: false
    }));

    // setEntries((prevEntries) => [...prevEntries, ...updatedEntries]);  // Append new entries
    addEntry(updatedEntries)
  };




  const handlePaltiAKR = () => {
    if (isPastClosingTime()) {
      toast.error("Draw is closed. Cannot add entries.");
      return;
    }
    if (!f || !s) {
      alert("Please enter valid F/S values.");
      return;
    }

    if (no.length >= 3 && no.length <= 8) {
      const combinations = getCombinations(no, 2); // Get all 2-digit combinations
      const pairs = combinations.flatMap(getPermutation); // Get ordered pairs
      const uniquePairs = [...new Set(pairs)]; // Remove duplicates

      const formatted = uniquePairs.map((pair, index) => ({
        id: entries.length + index + 1,
        no: pair,
        f: f,
        s: s,
        selected: false,
      }));

      addEntry(formatted);
    } else {
      alert("Please enter a valid 3 to 8-digit number.");
    }
  };



  const handleRingPlusAKR = () => {
    if (isPastClosingTime()) {
      toast.error("Draw is closed. Cannot add entries.");
      return;
    }
    if (no.length === 3 && f && s) {
      const threeDigit = {
        id: entries.length + 1,
        no: no,
        f: f,
        s: s,
        selected: false,
      };

      const twoDigit = {
        id: entries.length + 2,
        no: no.slice(0, 2),
        f: f,
        s: s,
        selected: false,
      };

      addEntry([threeDigit, twoDigit]);
    } else {
      toast.error("Please enter exactly 3 digits and valid F/S values");
    }
  };



  const handleAKRtoTandula = () => {
    if (isPastClosingTime()) {
      toast.error("Draw is closed. Cannot add entries.");
      return false;
    }

    // Normalize input: remove spaces
    const rawNo = String(no || '').replace(/\s+/g, '');
    if (!rawNo) return false;

    // If user typed '++', this pattern belongs to AKR->Packet logic.
    // Do not raise an error here; let other handlers process it.
    if (/\+\+/.test(rawNo)) {
      return false;
    }

    // Allowed patterns for AKR -> Tandula (3 chars total)
    const allowed = [/^\+\d{2}$/, /^\d\+\d$/, /^\d{2}\+$/];
    if (rawNo.length !== 3 || !allowed.some((re) => re.test(rawNo))) {
      return false; // not a tandula pattern we handle here
    }

    // Require numeric F (we will divide by 10 for tandula price)
    const fNum = Number(String(f).replace(/,/g, ''));
    if (isNaN(fNum)) {
      toast.error('Invalid F price: must be a number');
      return false;
    }

    const plusIndex = rawNo.indexOf('+');
    const price = fNum / 10;
    const sNum = Number(String(s).replace(/,/g, ''));
    const priceS = !isNaN(sNum) ? sNum / 10 : s;
    const generated = [];

    for (let i = 0; i <= 9; i++) {
      const newNo = rawNo.slice(0, plusIndex) + i + rawNo.slice(plusIndex + 1);
      generated.push({
        id: entries.length + generated.length + 1,
        no: newNo,
        f: price,
        s: priceS,
        selected: false,
      });
    }

    addEntry(generated);
    setNo("");
    noInputRef.current?.focus();
    return true;
  };


  // ...existing code...

  const handleAKRtoPacket = () => {
    if (isPastClosingTime()) {
      toast.error("Draw is closed. Cannot add entries.");
      return false;
    }
    // Reject invalid ++N (single digit) pattern — require ++NN
    // Allow only specific patterns. If NO contains any '+' ensure it matches one of the allowed forms.
    if (no && no.includes('+')) {
      // Explicitly ignore patterns like '++N' (double plus + single digit) so they are treated as normal single entries
      if (/^\+\+\d$/.test(no)) {
        return false;
      }

      // Tandula->Packet patterns are handled in handleTandulaToPacket.
      // Skip AKR validation message for those to avoid false error toasts.
      if (/^\+\d{3}$/.test(no) || /^\d\+\d{2}$/.test(no) || /^\d{2}\+\d$/.test(no)) {
        return false;
      }

      const allowed = [/^\+\+\d{2}$/, /^\d\+\+\d$/, /^\+\d{2}\+$/, /^\+\d\+\d$/];
      const ok = allowed.some((re) => re.test(no));
      if (!ok) {
        toast.error("Invalid pattern: allowed patterns are ++NN, N++N, +NN+, +N+N");
        return false;
      }
    }
    // Support both ++NN and N++N patterns
    if (
      no.length === 4 &&
      !isNaN(Number(f)) &&
      !isNaN(Number(s))
    ) {
      const priceF = Number(f) / 100;
      const priceS = Number(s) / 100;
      const generated = [];
      if (no.startsWith('++') && /^\d{2}$/.test(no.slice(2))) {
        // ++NN pattern
        const base = no.slice(2);
        for (let i = 0; i <= 99; i++) {
          const prefix = i.toString().padStart(2, '0');
          const newNo = `${prefix}${base}`;
          generated.push({
            id: entries.length + generated.length + 1,
            no: newNo,
            f: priceF,
            s: priceS,
            selected: false,
          });
        }
        addEntry(generated);
        setNo("");
        // setF("");
        // setS("");
        noInputRef.current?.focus();
        return true;
      } else if (/^\d\+\+\d$/.test(no)) {
        // N++N pattern
        const first = no[0];
        const last = no[3];
        for (let i = 0; i <= 99; i++) {
          const infix = i.toString().padStart(2, '0');
          const newNo = `${first}${infix}${last}`;
          generated.push({
            id: entries.length + generated.length + 1,
            no: newNo,
            f: priceF,
            s: priceS,
            selected: false,
          });
        }
        addEntry(generated);
        setNo("");
        // setF("");
        // setS("");
        noInputRef.current?.focus();
        return true;
      } else if (/^\+\d{2}\+$/.test(no)) {
        // +NN+ pattern (e.g., +10+)
        const mid = no.slice(1, 3); // e.g., "10"
        for (let i = 0; i <= 99; i++) {
          const infix = i.toString().padStart(2, '0');
          const newNo = `${infix[0]}${mid}${infix[1]}`;
          generated.push({
            id: entries.length + generated.length + 1,
            no: newNo,
            f: priceF,
            s: priceS,
            selected: false,
          });
        }
        addEntry(generated);
        setNo("");
        // setF("");
        // setS("");
        noInputRef.current?.focus();
        return true;
      }

      else if (/^\+\d\+\d$/.test(no)) {
        // +N+N pattern (e.g., +1+0)
        const first = no[1];
        const last = no[3];
        for (let i = 0; i <= 99; i++) {
          const infix = i.toString().padStart(2, '0');
          const newNo = `${infix[0]}${first}${infix[1]}${last}`;
          generated.push({
            id: entries.length + generated.length + 1,
            no: newNo,
            f: priceF,
            s: priceS,
            selected: false,
          });
        }
        addEntry(generated);
        setNo(""); noInputRef.current?.focus();
        return true;
      }


    }
    return false;
  };


  // handleTandulaToPacket

  const handleTandulaToPacket = () => {
    if (isPastClosingTime()) {
      toast.error("Draw is closed. Cannot add entries.");
      return false;
    }

    if (!no || !f || !s) return false;
    const priceF = !isNaN(Number(f)) ? Number(f) / 10 : f;
    const priceS = !isNaN(Number(s)) ? Number(s) / 10 : s;
    const generated = [];
    // +NNN pattern
    if (/^\+\d{3}$/.test(no)) {
      const base = no.slice(1); // e.g., "123"
      for (let i = 0; i <= 9; i++) {
        const newNo = `${i}${base}`;
        generated.push({
          id: entries.length + generated.length + 1,
          no: newNo,
          f: priceF,
          s: priceS,
          selected: false,
        });
      }
      addEntry(generated);
      setNo(""); noInputRef.current?.focus();
      return true;
    }
    // N+NN pattern
    if (/^\d\+\d{2}$/.test(no)) {
      const first = no[0];
      const base = no.slice(2); // e.g., "23"
      for (let i = 0; i <= 9; i++) {
        const newNo = `${first}${i}${base}`;
        generated.push({
          id: entries.length + generated.length + 1,
          no: newNo,
          f: priceF,
          s: priceS,
          selected: false,
        });
      }
      addEntry(generated);
      setNo(""); noInputRef.current?.focus();
      return true;
    }
    // NN+N pattern
    if (/^\d{2}\+\d$/.test(no)) {
      const first = no.slice(0, 2);
      const last = no[3];
      for (let i = 0; i <= 9; i++) {
        const newNo = `${first}${i}${last}`;
        generated.push({
          id: entries.length + generated.length + 1,
          no: newNo,
          f: priceF,
          s: priceS,
          selected: false,
        });
      }
      addEntry(generated);
      setNo(""); noInputRef.current?.focus();
      return true;
    }
    return false;
  };


  const handlePacket = () => {
    // 
  }

  function splitEntriesByLimit(entries, firstLimit, secondLimit) {
    const demand = [];
    const overlimit = [];

    entries.forEach(entry => {
      const demandFirst = firstLimit > 0 ? Math.min(entry.f, firstLimit) : entry.f;
      const demandSecond = secondLimit > 0 ? Math.min(entry.s, secondLimit) : entry.s;
      // const overFirst = entry.f > firstLimit ? entry.f - firstLimit : 0;
      // const overSecond = entry.s > secondLimit ? entry.s - secondLimit : 0;

      if (demandFirst > 0 || demandSecond > 0) {
        demand.push({
          uniqueId: entry.no,
          firstPrice: demandFirst,
          secondPrice: demandSecond
        });
      }
      if ((firstLimit > 0 && entry.f > firstLimit) || (secondLimit > 0 && entry.s > secondLimit)) {
        overlimit.push({
          uniqueId: entry.no,
          firstPrice: entry.f > firstLimit ? entry.f - firstLimit : 0,
          secondPrice: entry.s > secondLimit ? entry.s - secondLimit : 0
        });
      }
    });

    return { demand, overlimit };
  }

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

  const checkOverlimitExistsForPrizeType = async () => {
    const token = localStorage.getItem("token");
    if (!(selectedDraw && selectedDraw._id)) {
      toast.error("Please select a draw to check overlimit.");
      return false;
    }
    const params = { drawId: selectedDraw._id, prizeType };
    const response = await axios.get("/api/v1/data/check-overlimit-exists", {
      params,
      headers: { Authorization: `Bearer ${token}` }
    });
    // Flatten all entries
    const allEntries = response.data.records.flatMap(record => record.data);

    // Filter by prizeType
    const filtered = allEntries.filter(item => {
      const number = item.uniqueId;
      if (prizeType === "Hinsa") {
        return (
          /^\d{1}$/.test(number) ||
          (number.includes('+') && number.length === 2) ||
          (number.split('+').length - 1 === 2 && number.length === 3) ||
          (number.split('+').length - 1 === 3 && number.length === 4)
        );
      }
      if (prizeType === "Akra") {
        return (
          /^\d{2}$/.test(number) ||
          (number.includes('+') && number.length <= 3) ||
          (number.split('+').length - 1 === 2 && number.length === 4)
        );
      }
      if (prizeType === "Tandola") {
        return (
          /^\d{3}$/.test(number) ||
          (number.length === 4 && number.includes('+'))
        );
      }
      if (prizeType === "Pangora") {
        return /^\d{4}$/.test(number);
      }
      return false;
    });

    if (filtered.length > 0) {
      toast.error("Overlimit data already exists for this prize type, date, and time.");
      return true;
    }
    return false;
  };

  const saveOverLimit = async () => {
    if (isSelectedDrawClosed()) {
      toast.error('Draw is closed. Cannot save demand.');
      return;
    }
    const exists = await checkOverlimitExistsForPrizeType();
    console.log("Check exists:", exists);
    if (exists) {
      toast.error("Demand/Overlimit entries already exist for this draw time.");
      return;
    }

    if (!(selectedDraw && selectedDraw._id)) {
      toast.error("Please select a draw before saving demand/overlimit.");
      return;
    }
    const fetchedEntries = await fetchCombinedVoucherData(drawDate, drawTime, "general");
    if (fetchedEntries.length === 0) {
      toast("No combined records found..");
      return;
    } 
    var processedEntries = [];
    if (Array.isArray(fetchedEntries) && fetchedEntries.length > 0) {
      const allVoucherRows = fetchedEntries.flatMap(entry =>
        entry.data.map(item => ({
          objectId: item._id,
          no: item.uniqueId,
          f: item.firstPrice,
          s: item.secondPrice,
        }))
      );

      const combinedEntries = {};
      allVoucherRows.forEach(({ no, f, s, dealer, dealerId }) => {
        const key = no;
        if (combinedEntries[key]) {
          combinedEntries[key].f += f;
          combinedEntries[key].s += s;
          // combinedEntries[key].dealers.add(`${dealer}(${dealerId})`);
          combinedEntries[key].count += 1;
        } else {
          combinedEntries[key] = {
            no,
            f,
            s,
            // dealers: new Set([`${dealer}(${dealerId})`]),
            count: 1
          };
        }
      });

      // Convert to array and sort
      processedEntries = Object.values(combinedEntries).map(entry => ({
        ...entry,
        // dealers: Array.from(entry.dealers).join(', ')
      }));
      console.log("Processed Entries:", processedEntries);

    }else{
      toast("No records found for the selected date and time slot.");
      return; 
    }

    try {
      const { demand, overlimit } = splitEntriesByLimit(filterEntriesByPrizeType(processedEntries, prizeType), firstPrizeLimit, secondPrizeLimit);
      console.log("Demand Entries:", demand);
      console.log("Overlimit Entries:", overlimit);
      const token = localStorage.getItem("token");

      // Save demand entries
      if (demand.length > 0) {
        if (!(selectedDraw && selectedDraw._id)) {
          toast.error("Please select a draw before saving demand entries.");
          return;
        }
        const payload = { data: demand, category: "demand", drawId: selectedDraw._id };
        await axios.post("/api/v1/data/add-overlimit-data", payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      // Save overlimit entries
      if (overlimit.length > 0) {
        if (!(selectedDraw && selectedDraw._id)) {
          toast.error("Please select a draw before saving overlimit entries.");
          return;
        }
        const payload2 = { data: overlimit, category: "overlimit", drawId: selectedDraw._id };
        await axios.post("/api/v1/data/add-overlimit-data", payload2, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      toast.success("Demand and Overlimit entries saved!");
      await getAndSetVoucherData();
    } catch (error) {
      console.error("Error saving over limit:", error);
      const msg = error?.response?.data?.error || error?.message || "Failed to save overlimit/demand entries";
      toast.error(msg);
    }
  };

  // Add this function in your Center component
  const fetchCombinedVoucherData = async (selectedDate, selectedTimeSlot, category) => {
    try {
      const token = localStorage.getItem("token");
      if (!(selectedDraw && selectedDraw._id)) {
        toast.error("Please select a draw to fetch combined records.");
        return [];
      }
      const params = { category, drawId: selectedDraw._id };

      const response = await axios.get("/api/v1/data/get-combined-voucher-data", {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log("Combined voucher data:", response.data);
      return response.data.data;
    } catch (error) {
      console.error("Error fetching combined voucher data:", error);
      toast.error("Failed to fetch combined voucher data");
      return [];
    }
  };

  // Add this function in your Center component
  const generateCombinedVoucherPDF = async (category = "general") => {
    const fetchedEntries = await fetchCombinedVoucherData(drawDate, drawTime, category);
    if (fetchedEntries.length === 0) {
      toast("No combined records found..");
      return;
    }

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // One-line save/preview helper: saves PDF with category and date in filename
    const savePdf = (docObj, cat) => {
      const drawFileLabel = selectedDraw ? `${(selectedDraw.title || 'draw').replace(/\s+/g, '_')}_${new Date(selectedDraw.draw_date).toISOString().split('T')[0]}` : new Date(drawDate).toISOString().split('T')[0];
      return docObj.save(`Combined_Voucher_${cat}_${drawFileLabel}.pdf`);
    };

    // Process and combine all entries (backend returns draw-specific data)
    const allVoucherRows = fetchedEntries.flatMap(entry =>
      entry.data.map(item => ({
        number: item.uniqueId,
        first: item.firstPrice,
        second: item.secondPrice,
        dealer: entry.userId.username,
        dealerId: entry.userId.dealerId
      }))
    );

    // Group duplicate entries and sum their prizes
    const combinedEntries = {};
    allVoucherRows.forEach(({ number, first, second, dealer, dealerId }) => {
      const key = number;
      if (combinedEntries[key]) {
        combinedEntries[key].first += first;
        combinedEntries[key].second += second;
        combinedEntries[key].dealers.add(`${dealer}(${dealerId})`);
        combinedEntries[key].count += 1;
      } else {
        combinedEntries[key] = {
          number,
          first,
          second,
          dealers: new Set([`${dealer}(${dealerId})`]),
          count: 1
        };
      }
    });

    // Convert to array and sort
    const processedEntries = Object.values(combinedEntries).map(entry => ({
      ...entry,
      dealers: Array.from(entry.dealers).join(', ')
    }));

    // Split entries into categories with ascending sorting
    const hinsa = [], akra = [], tandola = [], pangora = [];

    processedEntries.forEach(({ number, first, second, dealers, count }) => {
      if (/^\d{1}$/.test(number) ||
        (number.includes('+') && number.length === 2) ||
        (number.split('+').length - 1 === 2 && number.length === 3) ||
        (number.split('+').length - 1 === 3 && number.length === 4)
      ) {
        if (selectedPrizeEntry === "All" || selectedPrizeEntry === "Hinsa") {
          hinsa.push([number, first, second, dealers, count]);
        }
      } else if (
        /^\d{2}$/.test(number) ||
        (number.includes('+') && number.length <= 3) ||
        (number.split('+').length - 1 === 2 && number.length === 4)
      ) {
        if (selectedPrizeEntry === "All" || selectedPrizeEntry === "Akra") {
          akra.push([number, first, second, dealers, count]);
        }
      } else if (
        /^\d{3}$/.test(number) ||
        (number.length === 4 && number.includes('+'))
      ) {
        if (selectedPrizeEntry === "All" || selectedPrizeEntry === "Tandola") {
          tandola.push([number, first, second, dealers, count]);
        }
      } else if (/^\d{4}$/.test(number)) {
        if (selectedPrizeEntry === "All" || selectedPrizeEntry === "Pangora") {
          pangora.push([number, first, second, dealers, count]);
        }
      }
    });

    // Sort each section in ascending order
    const sortEntries = (entries) => {
      return entries.sort((a, b) => {
        const numA = a[0].replace(/\+/g, '');
        const numB = b[0].replace(/\+/g, '');
        return numA.localeCompare(numB, undefined, { numeric: true });
      });
    };

    sortEntries(hinsa);
    sortEntries(akra);
    sortEntries(tandola);
    sortEntries(pangora);

    const totalEntries = processedEntries.length;
    const totalRecords = processedEntries.reduce((sum, entry) => sum + entry.count, 0);

    // Calculate totals for each section
    const calculateSectionTotals = (rows) => {
      return rows.reduce(
        (acc, row) => {
          acc.firstTotal += row[1];
          acc.secondTotal += row[2];
          acc.recordCount += row[4];
          return acc;
        },
        { firstTotal: 0, secondTotal: 0, recordCount: 0 }
      );
    };

    const hinsaTotals = calculateSectionTotals(hinsa);
    const akraTotals = calculateSectionTotals(akra);
    const tandolaTotals = calculateSectionTotals(tandola);
    const pangoraTotals = calculateSectionTotals(pangora);

    const grandTotals = {
      firstTotal: hinsaTotals.firstTotal + akraTotals.firstTotal + tandolaTotals.firstTotal + pangoraTotals.firstTotal,
      secondTotal: hinsaTotals.secondTotal + akraTotals.secondTotal + tandolaTotals.secondTotal + pangoraTotals.secondTotal,
      recordCount: hinsaTotals.recordCount + akraTotals.recordCount + tandolaTotals.recordCount + pangoraTotals.recordCount
    };
    const grandTotal = grandTotals.firstTotal + grandTotals.secondTotal;

    const addHeader = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Total Sale Report (" + category + ")", pageWidth / 2, 15, { align: "center" });

      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Main Distributor: ${userData?.user.username} (${userData?.user.dealerId})`, 14, 30);
      doc.text(`City: ${userData?.user.city}`, 14, 40);
  const drawHeaderLabel = selectedDraw ? `${selectedDraw.title} (${new Date(selectedDraw.draw_date).toLocaleDateString()})` : drawDate;
  doc.text(`Draw: ${drawHeaderLabel}`, 14, 50);
      // doc.text(`Draw Time: ${drawTime}`, 14, 60);
      // doc.text(`Unique Entries: ${totalEntries}`, 14, 70);
      // doc.text(`Total Records: ${totalRecords}`, 14, 80);

      // Add grand totals
      doc.text(`First Total: ${grandTotals.firstTotal}`, 110, 50);
      doc.text(`Second Total: ${grandTotals.secondTotal}`, 110, 60);
      doc.text(`Grand Total: ${grandTotal}`, 110, 70);
      // doc.text(`Total Records: ${grandTotals.recordCount}`, 110, 80);
    };

    // Ledger-style renderSection: split into 3 vertical columns with headers and borders
    const renderSection = (title, rows, startY = 90) => {
      if (rows.length === 0) return startY;

      const rowHeight = 8;
      const colWidths = [20, 17, 17];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      let y = startY;

      // Section totals & header
      const totals = calculateSectionTotals(rows);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`${title} (${rows.length} entries)`, 14, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`First Total: ${totals.firstTotal}`, 14, y);
      doc.text(`Second Total: ${totals.secondTotal}`, 60, y);
      doc.text(`Total: ${totals.firstTotal + totals.secondTotal}`, 106, y);
      y += 5;

      // Distribute rows row-wise across three columns (left, middle, right)
      // so entries render across the row: 0 -> left, 1 -> middle, 2 -> right,
      // 3 -> left (next row), etc.
      const leftRows = [];
      const middleRows = [];
      const rightRows = [];
      rows.forEach((r, idx) => {
        if (idx % 3 === 0) leftRows.push(r);
        else if (idx % 3 === 1) middleRows.push(r);
        else rightRows.push(r);
      });

      const leftX = 14;
      const middleX = leftX + tableWidth;
      const rightX = middleX + tableWidth;

      const drawTableHeader = (x, yy) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        // light gray header background + black border
        doc.setFillColor(230, 230, 230);
        doc.setDrawColor(0, 0, 0);
        // draw header boxes first (fill + stroke)
        doc.rect(x, yy, colWidths[0], rowHeight, 'FD');
        doc.rect(x + colWidths[0], yy, colWidths[1], rowHeight, 'FD');
        doc.rect(x + colWidths[0] + colWidths[1], yy, colWidths[2], rowHeight, 'FD');
        // then draw header labels on top
        doc.setTextColor(0, 0, 0);
        doc.text("Number", x + 1, yy + 5);
        doc.text("First", x + colWidths[0] + 1, yy + 5);
        doc.text("Second", x + colWidths[0] + colWidths[1] + 1, yy + 5);
        // reset fill to white for subsequent rows
        doc.setFillColor(255, 255, 255);
        return yy + rowHeight;
      };

      let headerY = drawTableHeader(leftX, y);
      if (middleRows.length > 0) drawTableHeader(middleX, y);
      if (rightRows.length > 0) drawTableHeader(rightX, y);

      let currentY = headerY;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);

      const maxRows = Math.max(leftRows.length, middleRows.length, rightRows.length);

      for (let i = 0; i < maxRows; i++) {
        if (currentY > pageHeight - 30) {
          doc.addPage();
          // don't print continued title per user request; just redraw headers
          currentY = 35;
          drawTableHeader(leftX, currentY);
          if (middleRows.length > 0) drawTableHeader(middleX, currentY);
          if (rightRows.length > 0) drawTableHeader(rightX, currentY);
          currentY += rowHeight;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
        }

        // left
        if (i < leftRows.length) {
          const [num, f, s] = leftRows[i];
          const entryColor = getEntryColor(num);
          // highlight number cell with light gray background
          doc.setFillColor(245, 245, 245);
          doc.setDrawColor(0, 0, 0);
          doc.rect(leftX, currentY, colWidths[0], rowHeight, 'FD');
          doc.setTextColor(entryColor[0], entryColor[1], entryColor[2]);
          doc.text(num.toString(), leftX + 1, currentY + 5);
          // reset fill back to white
          doc.setFillColor(255, 255, 255);
          doc.rect(leftX + colWidths[0], currentY, colWidths[1], rowHeight);
          doc.text(f.toString(), leftX + colWidths[0] + 1, currentY + 5);
          doc.rect(leftX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
          doc.text(s.toString(), leftX + colWidths[0] + colWidths[1] + 1, currentY + 5);
          doc.setTextColor(0, 0, 0);
        }

        // middle
        if (i < middleRows.length) {
          const [num, f, s] = middleRows[i];
          const entryColor = getEntryColor(num);
          // highlight number cell with light gray background
          doc.setFillColor(245, 245, 245);
          doc.setDrawColor(0, 0, 0);
          doc.rect(middleX, currentY, colWidths[0], rowHeight, 'FD');
          doc.setTextColor(entryColor[0], entryColor[1], entryColor[2]);
          doc.text(num.toString(), middleX + 1, currentY + 5);
          doc.setFillColor(255, 255, 255);
          doc.rect(middleX + colWidths[0], currentY, colWidths[1], rowHeight);
          doc.text(f.toString(), middleX + colWidths[0] + 1, currentY + 5);
          doc.rect(middleX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
          doc.text(s.toString(), middleX + colWidths[0] + colWidths[1] + 1, currentY + 5);
          doc.setTextColor(0, 0, 0);
        }

        // right
        if (i < rightRows.length) {
          const [num, f, s] = rightRows[i];
          const entryColor = getEntryColor(num);
          // highlight number cell with light gray background
          doc.setFillColor(245, 245, 245);
          doc.setDrawColor(0, 0, 0);
          doc.rect(rightX, currentY, colWidths[0], rowHeight, 'FD');
          doc.setTextColor(entryColor[0], entryColor[1], entryColor[2]);
          doc.text(num.toString(), rightX + 1, currentY + 5);
          doc.setFillColor(255, 255, 255);
          doc.rect(rightX + colWidths[0], currentY, colWidths[1], rowHeight);
          doc.text(f.toString(), rightX + colWidths[0] + 1, currentY + 5);
          doc.rect(rightX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
          doc.text(s.toString(), rightX + colWidths[0] + colWidths[1] + 1, currentY + 5);
          doc.setTextColor(0, 0, 0);
        }

        currentY += rowHeight;
      }

      return currentY + 10;
    };

    addHeader();
    let nextY = 100;

    // Render each section if it has entries
    if (hinsa.length > 0) {
      nextY = renderSection("HINSA", hinsa, nextY);
    }
    if (akra.length > 0) {
      nextY = renderSection("AKRA", akra, nextY);
    }
    if (tandola.length > 0) {
      nextY = renderSection("TANDOLA", tandola, nextY);
    }
    if (pangora.length > 0) {
      nextY = renderSection("PANGORA", pangora, nextY);
    }

    // Save using helper that includes category and date
    savePdf(doc, category);
    toast.success("Combined Voucher PDF downloaded successfully!");
  };

  
  const generateVoucherPDF = async (category) => {
    const fetchedEntries = await fetchVoucherData(drawDate, drawTime, category);
    if (fetchedEntries.length === 0) {
      toast("No Record found..");
      return;
    }

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // Get all voucher rows and categorize them (backend returns draw-specific data)
    const allVoucherRows = fetchedEntries.flatMap(entry => entry.data.map(item => ({
      number: item.uniqueId,
      first: item.firstPrice,
      second: item.secondPrice
    })));

    // Split entries into categories (same logic as in generateLedgerPDF)
    const hinsa = [], akra = [], tandola = [], pangora = [];

    allVoucherRows.forEach(({ number, first, second }) => {
      if (/^\d{1}$/.test(number) ||
        (number.includes('+') && number.length === 2) ||
        (number.split('+').length - 1 === 2 && number.length === 3) ||
        (number.split('+').length - 1 === 3 && number.length === 4)
      ) {
        // Single digit numbers go to hinsa
        hinsa.push([number, first, second]);
      } else if (
        /^\d{2}$/.test(number) ||
        (number.includes('+') && number.length <= 3) ||
        (number.split('+').length - 1 === 2 && number.length === 4)
      ) {
        akra.push([number, first, second]);
      } else if (
        /^\d{3}$/.test(number) ||
        (number.length === 4 && number.includes('+'))
      ) {
        tandola.push([number, first, second]);
      } else if (/^\d{4}$/.test(number)) {
        pangora.push([number, first, second]);
      }
    });

    const totalEntries = allVoucherRows.length;

    // Calculate totals for each section
    const calculateSectionTotals = (rows) => {
      return rows.reduce(
        (acc, row) => {
          acc.firstTotal += row[1];
          acc.secondTotal += row[2];
          return acc;
        },
        { firstTotal: 0, secondTotal: 0 }
      );
    };

    const hinsaTotals = calculateSectionTotals(hinsa);
    const akraTotals = calculateSectionTotals(akra);
    const tandolaTotals = calculateSectionTotals(tandola);
    const pangoraTotals = calculateSectionTotals(pangora);

    const grandTotals = {
      firstTotal: hinsaTotals.firstTotal + akraTotals.firstTotal + tandolaTotals.firstTotal + pangoraTotals.firstTotal,
      secondTotal: hinsaTotals.secondTotal + akraTotals.secondTotal + tandolaTotals.secondTotal + pangoraTotals.secondTotal
    };
    const grandTotal = grandTotals.firstTotal + grandTotals.secondTotal;

    const addHeader = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      // Use the passed category if available, otherwise default to 'General'
      doc.text(`Voucher (${category || 'General'})`, pageWidth / 2, 15, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Dealer Name: ${userData?.user.username} (${userData?.user.dealerId})`, 14, 30);
  doc.text(`City: ${userData?.user.city}`, 14, 40);
  const drawHeaderLabel = selectedDraw ? `${selectedDraw.title} (${new Date(selectedDraw.draw_date).toLocaleDateString()})` : drawDate;
  doc.text(`Draw: ${drawHeaderLabel}`, 14, 50);
      // doc.text(`Draw Time: ${drawTime}`, 14, 60);
      // doc.text(`Total Entries: ${totalEntries}`, 14, 70);

      // Add grand totals
      doc.text(`First Total: ${grandTotals.firstTotal}`, 110, 50);
      doc.text(`Second Total: ${grandTotals.secondTotal}`, 110, 60);
      doc.text(`Grand Total: ${grandTotal}`, 110, 70);
    };

    // Function to render each section using ledger-style 3-column layout (row-wise)
    const renderSection = (title, rows, startY = 80) => {
      if (rows.length === 0) return startY;

      const rowHeight = 8;
      const colWidths = [20, 17, 17];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      const xStart = 14;

      let y = startY;

      // Section header with totals
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`${title} (${rows.length} entries)`, 14, y);
      y += 8;

      const sectionTotals = calculateSectionTotals(rows);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`First Total: ${sectionTotals.firstTotal}`, 14, y);
      doc.text(`Second Total: ${sectionTotals.secondTotal}`, 60, y);
      doc.text(`Total: ${sectionTotals.firstTotal + sectionTotals.secondTotal}`, 106, y);
      y += 5;

      // Distribute rows row-wise into three columns (0->left,1->middle,2->right,3->left...)
      const leftRows = [];
      const middleRows = [];
      const rightRows = [];
      rows.forEach((r, idx) => {
        if (idx % 3 === 0) leftRows.push(r);
        else if (idx % 3 === 1) middleRows.push(r);
        else rightRows.push(r);
      });

      const leftX = xStart;
      const middleX = leftX + tableWidth;
      const rightX = middleX + tableWidth;

      const drawTableHeader = (x, yy) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        // light gray header background + black border
        doc.setFillColor(230, 230, 230);
        doc.setDrawColor(0, 0, 0);
        // draw header boxes first (fill + stroke)
        doc.rect(x, yy, colWidths[0], rowHeight, 'FD');
        doc.rect(x + colWidths[0], yy, colWidths[1], rowHeight, 'FD');
        doc.rect(x + colWidths[0] + colWidths[1], yy, colWidths[2], rowHeight, 'FD');
        // then draw header labels on top
        doc.setTextColor(0, 0, 0);
        doc.text("Number", x + 1, yy + 5);
        doc.text("First", x + colWidths[0] + 1, yy + 5);
        doc.text("Second", x + colWidths[0] + colWidths[1] + 1, yy + 5);
        // reset fill to white
        doc.setFillColor(255, 255, 255);
        return yy + rowHeight;
      };

      let headerY = drawTableHeader(leftX, y);
      if (middleRows.length > 0) drawTableHeader(middleX, y);
      if (rightRows.length > 0) drawTableHeader(rightX, y);

      let currentY = headerY;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);

      const maxRows = Math.max(leftRows.length, middleRows.length, rightRows.length);

      for (let i = 0; i < maxRows; i++) {
        if (currentY > pageHeight - 30) {
          doc.addPage();
          // don't print continued title; just redraw headers
          currentY = 35;
          drawTableHeader(leftX, currentY);
          if (middleRows.length > 0) drawTableHeader(middleX, currentY);
          if (rightRows.length > 0) drawTableHeader(rightX, currentY);
          currentY += rowHeight;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
        }

        // left
        if (i < leftRows.length) {
          const [num, f, s] = leftRows[i];
          const entryColor = getEntryColor(num);
          // highlight number cell with light gray background
          doc.setFillColor(245, 245, 245);
          doc.setDrawColor(0, 0, 0);
          doc.rect(leftX, currentY, colWidths[0], rowHeight, 'FD');
          doc.setTextColor(entryColor[0], entryColor[1], entryColor[2]);
          doc.text(num.toString(), leftX + 1, currentY + 5);
          // reset fill back to white
          doc.setFillColor(255, 255, 255);
          doc.rect(leftX + colWidths[0], currentY, colWidths[1], rowHeight);
          doc.text(f.toString(), leftX + colWidths[0] + 1, currentY + 5);
          doc.rect(leftX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
          doc.text(s.toString(), leftX + colWidths[0] + colWidths[1] + 1, currentY + 5);
          doc.setTextColor(0, 0, 0);
        }

        // middle
        if (i < middleRows.length) {
          const [num, f, s] = middleRows[i];
          const entryColor = getEntryColor(num);
          // highlight number cell with light gray background
          doc.setFillColor(245, 245, 245);
          doc.setDrawColor(0, 0, 0);
          doc.rect(middleX, currentY, colWidths[0], rowHeight, 'FD');
          doc.setTextColor(entryColor[0], entryColor[1], entryColor[2]);
          doc.text(num.toString(), middleX + 1, currentY + 5);
          doc.setFillColor(255, 255, 255);
          doc.rect(middleX + colWidths[0], currentY, colWidths[1], rowHeight);
          doc.text(f.toString(), middleX + colWidths[0] + 1, currentY + 5);
          doc.rect(middleX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
          doc.text(s.toString(), middleX + colWidths[0] + colWidths[1] + 1, currentY + 5);
          doc.setTextColor(0, 0, 0);
        }

        

        // right
        if (i < rightRows.length) {
          const [num, f, s] = rightRows[i];
          const entryColor = getEntryColor(num);
          // highlight number cell with light gray background
          doc.setFillColor(245, 245, 245);
          doc.setDrawColor(0, 0, 0);
          doc.rect(rightX, currentY, colWidths[0], rowHeight, 'FD');
          doc.setTextColor(entryColor[0], entryColor[1], entryColor[2]);
          doc.text(num.toString(), rightX + 1, currentY + 5);
          doc.setFillColor(255, 255, 255);
          doc.rect(rightX + colWidths[0], currentY, colWidths[1], rowHeight);
          doc.text(f.toString(), rightX + colWidths[0] + 1, currentY + 5);
          doc.rect(rightX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
          doc.text(s.toString(), rightX + colWidths[0] + colWidths[1] + 1, currentY + 5);
          doc.setTextColor(0, 0, 0);
        }

        currentY += rowHeight;
      }

      return currentY + 15; // Extra space between sections
    };

    addHeader();
    let nextY = 85;

    // Render each section if it has entries
    if (hinsa.length > 0) {
      nextY = renderSection("HINSA", hinsa, nextY);
    }
    if (akra.length > 0) {
      nextY = renderSection("AKRA", akra, nextY);
    }
    if (tandola.length > 0) {
      nextY = renderSection("TANDOLA", tandola, nextY);
    }
    if (pangora.length > 0) {
      nextY = renderSection("PANGORA", pangora, nextY);
    }

    {
      const drawFileLabel = selectedDraw ? `${(selectedDraw.title || 'draw').replace(/\s+/g, '_')}_${new Date(selectedDraw.draw_date).toISOString().split('T')[0]}` : new Date(drawDate).toISOString().split('T')[0];
      doc.save(`Voucher_Sheet_${drawFileLabel}.pdf`);
    }
    toast.success("Voucher PDF by sections downloaded successfully!");
  };

  // end voucher here 

  const generateDemandPDF = async () => {

  }
  const generateOverLimitPDF = async () => {
    const fetchedEntries = await fetchVoucherData(drawDate, drawTime);
    if (fetchedEntries.length === 0) {
      toast("No Record found..");
      return;
    }

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // Backend returns draw-specific data; no local timeSlot filtering required
    let allVoucherRows = fetchedEntries.flatMap(entry => entry.data.map(item => [
      item.uniqueId,
      item.firstPrice,
      item.secondPrice
    ]));

    // Filter entries that EXCEED the limits (opposite of prize filter)
    if (enablePrizeFilter && (firstPrizeLimit > 0 || secondPrizeLimit > 0)) {
      const originalCount = allVoucherRows.length;

      allVoucherRows = allVoucherRows.filter(([uniqueId, firstPrice, secondPrice]) => {
        const firstPrizeExceeds = firstPrizeLimit > 0 && firstPrice > firstPrizeLimit;
        const secondPrizeExceeds = secondPrizeLimit > 0 && secondPrice > secondPrizeLimit;
        // Return true if ANY prize exceeds its limit
        return firstPrizeExceeds || secondPrizeExceeds;
      });

      const overLimitCount = allVoucherRows.length;
      const withinLimitCount = originalCount - overLimitCount;

      if (overLimitCount === 0) {
        toast("No entries exceed the set prize limits.");
        return;
      }

      toast(`${overLimitCount} entries exceed limits. ${withinLimitCount} entries are within limits.`);
    } else {
      toast.error("Please enable prize filter and set limits to generate over limit report.");
      return;
    }

    const totalEntries = allVoucherRows.length;

    // Calculate totals
    const totals = allVoucherRows.reduce(
      (acc, row) => {
        acc.firstTotal += row[1];
        acc.secondTotal += row[2];
        return acc;
      },
      { firstTotal: 0, secondTotal: 0 }
    );
    const grandTotal = totals.firstTotal + totals.secondTotal;

    const addHeader = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Over Limit Report", pageWidth / 2, 15, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Dealer Name: ${userData?.user.username}`, 14, 30);
  doc.text(`City: ${userData?.user.city}`, 14, 40);
  const drawHeaderLabel = selectedDraw ? `${selectedDraw.title} (${new Date(selectedDraw.draw_date).toLocaleDateString()})` : drawDate;
  doc.text(`Draw: ${drawHeaderLabel}`, 14, 50);
  doc.text(`Draw Time: ${drawTime}`, 14, 60);
      doc.text(`Over Limit Entries: ${totalEntries}`, 14, 70);

      // Add limit information
      // doc.setFontSize(10);
      // doc.setTextColor(255, 0, 0); // Red color for limit info
      // let limitText = "Limits Set: ";
      // if (firstPrizeLimit > 0) limitText += `First ≥ ${firstPrizeLimit}`;
      // if (firstPrizeLimit > 0 && secondPrizeLimit > 0) limitText += ", ";
      // if (secondPrizeLimit > 0) limitText += `Second ≥ ${secondPrizeLimit}`;

      // doc.text(limitText, 14, 80);
      // doc.setTextColor(0, 0, 0); // Reset to black
      // doc.setFontSize(12);

      // Add totals
      doc.text(`First Total: ${totals.firstTotal}`, 110, 50);
      doc.text(`Second Total: ${totals.secondTotal}`, 110, 60);
      doc.text(`Grand Total: ${grandTotal}`, 110, 70);
    };

    addHeader();

    let startY = 90; // Start after limit information
    let rowHeight = 7;
    const colWidths = [20, 15, 15, 15]; // Added extra column for "Exceeds" indicator
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const gapBetweenTables = 8;
    const xStart = 14;

    // Set manual 3 columns
    const xOffsets = [];
    for (let i = 0; i < 3; i++) {
      xOffsets.push(xStart + i * (tableWidth + gapBetweenTables));
    }

    let currentXIndex = 0;
    let currentY = startY;

    const printTableHeader = (x, y) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      // light gray header background + black stroke
      doc.setFillColor(230, 230, 230);
      doc.setDrawColor(0, 0, 0);
      // draw all header rectangles first (fill + stroke)
      doc.rect(x, yy, colWidths[0], rowHeight, 'FD');
      doc.rect(x + colWidths[0], yy, colWidths[1], rowHeight, 'FD');
      doc.rect(x + colWidths[0] + colWidths[1], yy, colWidths[2], rowHeight, 'FD');
      // then draw texts on top
      doc.setTextColor(0, 0, 0);
      doc.text("Number", x + 1, yy + 5);
      doc.text("First", x + colWidths[0] + 1, yy + 5);
      doc.text("Second", x + colWidths[0] + colWidths[1] + 1, yy + 5);
      // reset fill to white for subsequent rects
      doc.setFillColor(255, 255, 255);

      doc.setFont("helvetica", "normal");
    };

    // Print the first table header
    printTableHeader(xOffsets[currentXIndex], currentY);
    currentY += rowHeight;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    allVoucherRows.forEach((row) => {
      const [number, first, second] = row;
      let x = xOffsets[currentXIndex];

      // Determine what exceeds
      let exceedsText = "";
      const firstExceeds = firstPrizeLimit > 0 && first >= firstPrizeLimit;
      const secondExceeds = secondPrizeLimit > 0 && second >= secondPrizeLimit;

      if (firstExceeds && secondExceeds) {
        exceedsText = "F+S";
      } else if (firstExceeds) {
        exceedsText = "F";
      } else if (secondExceeds) {
        exceedsText = "S";
      }

      // Draw cells with highlighting for exceeded values
      doc.rect(x, currentY, colWidths[0], rowHeight);
      doc.text(number.toString(), x + 2, currentY + 5);

      // Highlight first price if it exceeds limit
      doc.rect(x + colWidths[0], currentY, colWidths[1], rowHeight);
      if (firstExceeds) {
        doc.setTextColor(255, 0, 0); // Red for exceeded values
        doc.text(first.toString(), x + colWidths[0] + 2, currentY + 5);
        doc.setTextColor(0, 0, 0); // Reset to black
      } else {
        doc.text(first.toString(), x + colWidths[0] + 2, currentY + 5);
      }

      // Highlight second price if it exceeds limit
      doc.rect(x + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
      if (secondExceeds) {
        doc.setTextColor(255, 0, 0); // Red for exceeded values
        doc.text(second.toString(), x + colWidths[0] + colWidths[1] + 2, currentY + 5);
        doc.setTextColor(0, 0, 0); // Reset to black
      } else {
        doc.text(second.toString(), x + colWidths[0] + colWidths[1] + 2, currentY + 5);
      }

      // Exceeds indicator column
      // doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2], currentY, colWidths[3], rowHeight);
      // doc.setTextColor(255, 0, 0); // Red for indicator
      // doc.text(exceedsText, x + colWidths[0] + colWidths[1] + colWidths[2] + 2, currentY + 5);
      // doc.setTextColor(0, 0, 0); // Reset to black

      currentY += rowHeight;

      if (currentY > pageHeight - 20) {
        // Reached bottom of page
        currentY = startY;
        currentXIndex++;

        if (currentXIndex >= xOffsets.length) {
          // All columns filled, create new page
          doc.addPage();
          currentXIndex = 0;
          currentY = startY;
        }

        // After new column or page, print new table header
        printTableHeader(xOffsets[currentXIndex], currentY);
        currentY += rowHeight;
      }
    });

    // Add summary at the end
    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 20;
    }

    

    {
      const drawFileLabel = selectedDraw ? `${(selectedDraw.title || 'draw').replace(/\s+/g, '_')}_${new Date(selectedDraw.draw_date).toISOString().split('T')[0]}` : new Date(drawDate).toISOString().split('T')[0];
      doc.save(`Over_Limit_Report_${drawFileLabel}.pdf`);
    }
    toast.success("Over Limit Report PDF downloaded successfully!");
  };

  const generateLedgerPDF = async () => {
    // console.log("Generating Ledger PDF...");

    // user's commison assigned by distributor admin
    // user's share assigned by distributor admin
    // these values come form user data profile 
    // then we can use directly here to calculate 

    const fetchedEntries = await fetchVoucherData(drawDate, drawTime);
    if (fetchedEntries.length === 0) {
      toast("No Record found..");
      return;
    }

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.width;

    // Backend returns draw-specific data; no local timeSlot filtering required
    const allVoucherRows = fetchedEntries.flatMap(entry =>
      entry.data.map(item => ({
        number: item.uniqueId,
        first: item.firstPrice,
        second: item.secondPrice
      }))
    );

    const hinsa = [], akra = [], tandola = [], pangora = [];

    allVoucherRows.forEach(({ number, first, second }) => {
      if (/^\d{1}$/.test(number) ||
        (number.includes('+') && number.length === 2) ||
        (number.split('+').length - 1 === 2 && number.length === 3) ||
        (number.split('+').length - 1 === 3 && number.length === 4)
      ) {
        // Single digit numbers go to hinsa
        hinsa.push([number, first, second]);
      } else if (
        /^\d{2}$/.test(number) ||
        (number.includes('+') && number.length <= 3) ||
        (number.split('+').length - 1 === 2 && number.length === 4)
      ) {
        akra.push([number, first, second]);
      } else if (
        /^\d{3}$/.test(number) ||
        (number.length === 4 && number.includes('+'))
      ) {
        tandola.push([number, first, second]);
      } else if (/^\d{4}$/.test(number)) {
        pangora.push([number, first, second]);
      }
    });

    const addHeader = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Ledger Sheet", pageWidth / 2, 15, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Dealer Name: ${userData?.user.username}`, 14, 30);
  doc.text(`City: ${userData?.user.city}`, 14, 40);
  const drawHeaderLabel = selectedDraw ? `${selectedDraw.title} (${new Date(selectedDraw.draw_date).toLocaleDateString()})` : drawDate;
  doc.text(`Draw: ${drawHeaderLabel}`, 14, 50);
  doc.text(`Draw Time: ${drawTime}`, 14, 60);
      doc.text(`Winning Numbers: `, 14, 70);
      // const winningNumbers = [
      //   { number: "F: 3456", color: [255, 0, 0] },    // Red (RGB)
      //   { number: "S: 6768", color: [0, 0, 255] },    // Blue (RGB)
      //   { number: "S: 7990", color: [0, 0, 255] }     // Blue (RGB)
      // ];

      let xPosition = 14 + doc.getTextWidth("Winning Numbers: "); // Start after the label

      winningNumbers.forEach((item, index) => {
        // Set the color for this number
        doc.setTextColor(item.color[0], item.color[1], item.color[2]);

        // Add the number
        doc.text(item.number, xPosition, 70);

        // Move x position for next number
        xPosition += doc.getTextWidth(item.number);

        // Add comma and space (except for last number)
        if (index < winningNumbers.length - 1) {
          doc.setTextColor(0, 0, 0); // Black for space
          doc.text("    ", xPosition, 70);
          xPosition += doc.getTextWidth("    ");
        }
      });

      // Reset text color to black for subsequent text
      doc.setTextColor(0, 0, 0);
    };

    const calculateTotals = (rows) => {
      return rows.reduce(
        (acc, [, f, s]) => {
          acc.first += f;
          acc.second += s;
          return acc;
        },
        { first: 0, second: 0 }
      );
    };

    // const getEntryColor = (entryNumber) => {
    //   // Check for exact match first
    //   for (const winning of winningNumbers) {
    //     if (entryNumber === winning.number) {
    //       return winning.color;
    //     }
    //   }

    //   // Check for positional matches with + symbols
    //   for (const winning of winningNumbers) {
    //     if (checkPositionalMatch(entryNumber, winning.number)) {
    //       return winning.color;
    //     }
    //   }

    //   return [0, 0, 0]; // Default black color
    // };

    // const checkPositionalMatch = (entry, winningNumber) => {
    //   // Remove any spaces and ensure consistent format
    //   const cleanEntry = entry.toString().trim();

    //   // if (!cleanEntry.includes('+')) {
    //   //   // For plain numbers, only check if they are exact substrings of winning number
    //   //   // AND the entry has '+' patterns or is exactly the winning number
    //   //   return false;
    //   // }
    //   // Handle patterns like +4+6, +34+, etc.
    //   if (cleanEntry.includes('+')) {
    //     // For 2-digit patterns like +4+6
    //     if (cleanEntry.length === 4 && cleanEntry.match(/^\+\d\+\d$/)) {
    //       const digit1 = cleanEntry[1]; // 4
    //       const digit3 = cleanEntry[3]; // 6

    //       // Check if these digits match positions in winning number
    //       if (winningNumber[1] === digit1 && winningNumber[3] === digit3) {
    //         return true; // Matches positions 2 and 4 of 3456
    //       }
    //     }

    //     // For 3-digit patterns like +45+ (positions 2,3)
    //     if (cleanEntry.length === 4 && cleanEntry.match(/^\+\d\d\+$/)) {
    //       const digits = cleanEntry.slice(1, 3); // "45"
    //       if (winningNumber.slice(1, 3) === digits) {
    //         return true;
    //       }
    //     }

    //     // For patterns like 3+5+ (positions 1,3)
    //     if (cleanEntry.length === 4 && cleanEntry.match(/^\d\+\d\+$/)) {
    //       const digit1 = cleanEntry[0];
    //       const digit3 = cleanEntry[2];
    //       if (winningNumber[0] === digit1 && winningNumber[2] === digit3) {
    //         return true;
    //       }
    //     }

    //     // For patterns like ++56 (last two positions)
    //     if (cleanEntry.length === 4 && cleanEntry.match(/^\+\+\d\d$/)) {
    //       const digits = cleanEntry.slice(2); // "56"
    //       if (winningNumber.slice(2) === digits) {
    //         return true;
    //       }
    //     }

    //     // For patterns like +76+ (checking if 76 appears in positions 2,3 of winning number)
    //     if (cleanEntry.length === 4 && cleanEntry.match(/^\+\d\d\+$/)) {
    //       const digits = cleanEntry.slice(1, 3); // "76"
    //       if (winningNumber.slice(1, 3) === digits) {
    //         return true;
    //       }
    //     }

    //     // For patterns like 67+8 (checking consecutive positions)
    //     if (cleanEntry.length === 4 && cleanEntry.match(/^\d\d\+\d$/)) {
    //       const firstTwo = cleanEntry.slice(0, 2); // "67"
    //       const lastDigit = cleanEntry[3]; // "8"
    //       if (winningNumber.slice(0, 2) === firstTwo && winningNumber[3] === lastDigit) {
    //         return true;
    //       }
    //     }

    //     // For patterns like 6+68 (checking positions 1,3,4)
    //     if (cleanEntry.length === 4 && cleanEntry.match(/^\d\+\d\d$/)) {
    //       const firstDigit = cleanEntry[0]; // "6"
    //       const lastTwo = cleanEntry.slice(2); // "68"
    //       if (winningNumber[0] === firstDigit && winningNumber.slice(2) === lastTwo) {
    //         return true;
    //       }
    //     }

    //     // **NEW: For patterns like +990 (last 3 digits of 4-digit winning number)**
    //     if (cleanEntry.length === 4 && cleanEntry.match(/^\+\d\d\d$/)) {
    //       const lastThreeDigits = cleanEntry.slice(1); // "990"
    //       if (winningNumber.slice(1) === lastThreeDigits) { // Check if 7990 ends with 990
    //         return true;
    //       }
    //     }

    //     // **NEW: For patterns like +99 (last 2 digits)**
    //     if (cleanEntry.length === 3 && cleanEntry.match(/^\+\d\d$/)) {
    //       const lastTwoDigits = cleanEntry.slice(1); // "99"
    //       if (winningNumber.slice(-2) === lastTwoDigits) { // Check if 7990 ends with 99
    //         return true;
    //       }
    //     }

    //     // **NEW: For patterns like +9 (last digit)**
    //     if (cleanEntry.length === 2 && cleanEntry.match(/^\+\d$/)) {
    //       const lastDigit = cleanEntry.slice(1); // "9"
    //       if (winningNumber.slice(-1) === lastDigit) { // Check if 7990 ends with 9
    //         return true;
    //       }
    //     }

    //     // Pattern: +8 (matches if 8 appears in position 2,3, or 4 of winning number)
    //     if (cleanEntry.length === 2 && cleanEntry.match(/^\+\d$/)) {
    //       const digit = cleanEntry[1];
    //       // Check positions 2, 3, 4 (indices 1, 2, 3)
    //       for (let i = 1; i < winningNumber.length; i++) {
    //         if (winningNumber[i] === digit) {
    //           return true;
    //         }
    //       }
    //     }

    //     // Pattern: ++8 (matches if 8 appears in position 3 or 4 of winning number)
    //     if (cleanEntry.length === 3 && cleanEntry.match(/^\+\+\d$/)) {
    //       const digit = cleanEntry[2];
    //       // Check positions 3, 4 (indices 2, 3)
    //       for (let i = 2; i < winningNumber.length; i++) {
    //         if (winningNumber[i] === digit) {
    //           return true;
    //         }
    //       }
    //     }

    //     // Pattern: +++8 (matches if 8 appears in position 4 of winning number)
    //     if (cleanEntry.length === 4 && cleanEntry.match(/^\+\+\+\d$/)) {
    //       const digit = cleanEntry[3];
    //       // Check position 4 (index 3)
    //       if (winningNumber[3] === digit) {
    //         return true;
    //       }
    //     }
    //   }


    //   // Check for partial consecutive matches (like 45, 56, etc.)
    //   if (cleanEntry.length >= 2 && cleanEntry.length <= 3 && /^\d+$/.test(cleanEntry)) {
    //     // Only match if the entry starts from the beginning of the winning number
    //     if (winningNumber.startsWith(cleanEntry)) {
    //       return true;
    //     }
    //   }

    //   // **NEW: For single digit numbers without + symbols**
    //   // Pattern: 8 (matches if 8 appears in position 1 of winning number)
    //   if (cleanEntry.length === 1 && /^\d$/.test(cleanEntry)) {
    //     const digit = cleanEntry;
    //     // Check if digit matches first position of winning number
    //     if (winningNumber[0] === digit) {
    //       return true;
    //     }
    //   }

    //   return false;
    // };

    const updateWinningNumbers = (newWinningNumbers) => {
      setWinningNumbers(newWinningNumbers);
    };

    const grandTotals = {
      first: 0,
      second: 0,
      net: 0,
      // commission: 0,
      // payable: 0,
      winningAmount: 0,
      firstWinning: 0,
      secondWinning: 0,
    };

    

    const renderSection = (title, rows, startY = 80) => {
      if (rows.length === 0) return startY;

      const rowHeight = 8;
      const colWidths = [20, 17, 17];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      let y = startY;

      const totals = calculateTotals(rows);
      const net = totals.first + totals.second;

      
      let commissionRate = 0;
      let multiplier = 0;

      const userConfig = userData?.user || {};

      if (title === "HINSA") {
        commissionRate = userConfig.singleFigure;
        multiplier = Number(userConfig.hinsaMultiplier ?? 0) || 0;
      } else if (title === "AKRA") {
        commissionRate = userConfig.doubleFigure;
        multiplier = Number(userConfig.akraMultiplier ?? 0) || 0;
      } else if (title === "TANDOLA") {
        commissionRate = userConfig.tripleFigure;
        multiplier = Number(userConfig.tandolaMultiplier ?? 0) || 0;
      } else if (title === "PANGORA") {
        commissionRate = userConfig.fourFigure;
        multiplier = Number(userConfig.pangoraMultiplier ?? 0) || 0;
      }

      // const commissionAmount = net * commissionRate;
      // const netPayable = net - commissionAmount;

      // Calculate winning amounts for this section
      let firstWinningAmount = 0;
      let secondWinningAmount = 0;
      const secondPrizeDivisor = selectedDraw?.category === 'GTL' ? 5 : 3;

      rows.forEach(([num, f, s]) => {
        const entryColor = getEntryColor(num);

          // Check if this entry is highlighted (has winning color)
          if (entryColor[0] !== 0 || entryColor[1] !== 0 || entryColor[2] !== 0) {
            // Sum over ALL distinct winning numbers that match this entry.
            // This allows one entry (e.g. "12") to win against
            // multiple different winning numbers (129050, 122010, ...).
            for (const winning of winningNumbers) {
              if (num === winning.number || checkPositionalMatch(num, winning.number)) {
                if (winning.type === "first") {
                  firstWinningAmount += f * multiplier;
                } else if (winning.type === "second" || winning.type === "third") {
                  secondWinningAmount += (s * multiplier) / secondPrizeDivisor;
                }
              }
            }
          }
      });

      const totalWinningAmount = firstWinningAmount + secondWinningAmount;

      grandTotals.first += totals.first;
      grandTotals.second += totals.second;
      grandTotals.net += net;
      // grandTotals.commission += commissionAmount;
      // grandTotals.payable += netPayable;
      grandTotals.winningAmount += totalWinningAmount;
      grandTotals.firstWinning += firstWinningAmount;
      grandTotals.secondWinning += secondWinningAmount;

      // Section title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`${title} (${rows.length} entries)`, 14, y);
      y += 8;

      // Summary information with winning amount
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`First Total: ${totals.first}`, 14, y);
      doc.text(`Second Total: ${totals.second}`, 60, y);
      doc.text(`Total: ${net}`, 106, y);
      doc.text(`Commission (${commissionRate}%)`, 140, y);
      y += 5;
      doc.text(`Prize Amount: ${totalWinningAmount.toFixed(2)}`, 14, y);
      y += 5;

      // Split rows into three parts
      const thirdPoint = Math.ceil(rows.length / 3);
      const leftRows = rows.slice(0, thirdPoint);
      const middleRows = rows.slice(thirdPoint, thirdPoint * 2);
      const rightRows = rows.slice(thirdPoint * 2);

      // Table positions
      const leftX = 14;
      const middleX = leftX + tableWidth;
      const rightX = middleX + tableWidth;

      // Function to draw table header
      const drawTableHeader = (x, y) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);

        doc.rect(x, y, colWidths[0], rowHeight);
        doc.text("Number", x + 1, y + 5);

        doc.rect(x + colWidths[0], y, colWidths[1], rowHeight);
        doc.text("First", x + colWidths[0] + 1, y + 5);

        doc.rect(x + colWidths[0] + colWidths[1], y, colWidths[2], rowHeight);
        doc.text("Second", x + colWidths[0] + colWidths[1] + 1, y + 5);

        return y + rowHeight;
      };

      // Draw headers for all three tables
      let headerY = drawTableHeader(leftX, y);
      if (middleRows.length > 0) {
        drawTableHeader(middleX, y);
      }
      if (rightRows.length > 0) {
        drawTableHeader(rightX, y);
      }

      // Synchronized drawing of all three tables
      let currentY = headerY;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);

      const maxRows = Math.max(leftRows.length, middleRows.length, rightRows.length);

      for (let i = 0; i < maxRows; i++) {
        // Check if we need a new page
        if (currentY > 280) {
          doc.addPage();

          // Add section header on new page
          doc.setFont("helvetica", "bold");
          doc.setFontSize(14);
          doc.text(title + " (continued...)", 14, 20);

          // Reset Y position and redraw ALL table headers
          currentY = 35;

          // Draw headers for all three tables
          drawTableHeader(leftX, currentY);
          if (middleRows.length > 0) {
            drawTableHeader(middleX, currentY);
          }
          if (rightRows.length > 0) {
            drawTableHeader(rightX, currentY);
          }

          currentY += rowHeight;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
        }

        // Draw left table row
        if (i < leftRows.length) {
          const [num, f, s] = leftRows[i];
          const entryColor = getEntryColor(num);

          doc.rect(leftX, currentY, colWidths[0], rowHeight);
          doc.setTextColor(entryColor[0], entryColor[1], entryColor[2]);
          doc.text(num.toString(), leftX + 1, currentY + 5);

          doc.rect(leftX + colWidths[0], currentY, colWidths[1], rowHeight);
          doc.text(f.toString(), leftX + colWidths[0] + 1, currentY + 5);
          doc.rect(leftX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
          doc.text(s.toString(), leftX + colWidths[0] + colWidths[1] + 1, currentY + 5);
          doc.setTextColor(0, 0, 0);
        }

        // Draw middle table row
        if (i < middleRows.length) {
          const [num, f, s] = middleRows[i];
          const entryColor = getEntryColor(num);

          doc.rect(middleX, currentY, colWidths[0], rowHeight);
          doc.setTextColor(entryColor[0], entryColor[1], entryColor[2]);
          doc.text(num.toString(), middleX + 1, currentY + 5);

          doc.rect(middleX + colWidths[0], currentY, colWidths[1], rowHeight);
          doc.text(f.toString(), middleX + colWidths[0] + 1, currentY + 5);
          doc.rect(middleX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
          doc.text(s.toString(), middleX + colWidths[0] + colWidths[1] + 1, currentY + 5);
          doc.setTextColor(0, 0, 0);
        }

        // Draw right table row
        if (i < rightRows.length) {
          const [num, f, s] = rightRows[i];
          const entryColor = getEntryColor(num);

          doc.rect(rightX, currentY, colWidths[0], rowHeight);
          doc.setTextColor(entryColor[0], entryColor[1], entryColor[2]);
          doc.text(num.toString(), rightX + 1, currentY + 5);

          doc.rect(rightX + colWidths[0], currentY, colWidths[1], rowHeight);
          doc.text(f.toString(), rightX + colWidths[0] + 1, currentY + 5);
          doc.rect(rightX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
          doc.text(s.toString(), rightX + colWidths[0] + colWidths[1] + 1, currentY + 5);
          doc.setTextColor(0, 0, 0);
        }

        currentY += rowHeight;
      }

      return currentY + 10;
    };

    const renderGrandTotals = (startY = 270) => {
      if (startY > 250) {
        doc.addPage();
        startY = 30;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Grand Totals Summary", 14, startY);
      startY += 8;

      const rowHeight = 8;
      const colWidths = [60, 30, 30, 40];
      const xStart = 14;

      const drawRow = (y, label, first, second, total) => {
        doc.setFont("helvetica", "normal");
        doc.rect(xStart, y, colWidths[0], rowHeight);
        doc.text(label, xStart + 2, y + 6);
        doc.rect(xStart + colWidths[0], y, colWidths[1], rowHeight);
        doc.text(first.toFixed(2), xStart + colWidths[0] + 2, y + 6);
        doc.rect(xStart + colWidths[0] + colWidths[1], y, colWidths[2], rowHeight);
        doc.text(second.toFixed(2), xStart + colWidths[0] + colWidths[1] + 2, y + 6);
        doc.rect(xStart + colWidths[0] + colWidths[1] + colWidths[2], y, colWidths[3], rowHeight);
        doc.text(total.toFixed(2), xStart + colWidths[0] + colWidths[1] + colWidths[2] + 2, y + 6);
      };

      const grandFirst = grandTotals.first;
      const grandSecond = grandTotals.second;
      const netTotal = grandFirst + grandSecond;

      // const commissionFirst = (grandFirst / netTotal) * grandTotals.commission;
      // const commissionSecond = (grandSecond / netTotal) * grandTotals.commission;

      // const netFirst = grandFirst - commissionFirst;
      // const netSecond = grandSecond - commissionSecond;

      let y = startY;

      doc.setFont("helvetica", "bold");
      doc.rect(xStart, y, colWidths[0], rowHeight);
      doc.text("Label", xStart + 2, y + 6);
      doc.rect(xStart + colWidths[0], y, colWidths[1], rowHeight);
      doc.text("First", xStart + colWidths[0] + 2, y + 6);
      doc.rect(xStart + colWidths[0] + colWidths[1], y, colWidths[2], rowHeight);
      doc.text("Second", xStart + colWidths[0] + colWidths[1] + 2, y + 6);
      doc.rect(xStart + colWidths[0] + colWidths[1] + colWidths[2], y, colWidths[3], rowHeight);
      doc.text("Total/Payable", xStart + colWidths[0] + colWidths[1] + colWidths[2] + 2, y + 6);

      y += rowHeight;
      drawRow(y, "Grand Total", grandFirst, grandSecond, netTotal);
      // y += rowHeight;
      // drawRow(y, "Commission", -commissionFirst, -commissionSecond, -grandTotals.commission);
      // y += rowHeight;
      // drawRow(y, "Net Payable", netFirst, netSecond, grandTotals.payable);
      y += rowHeight;
      drawRow(y, "Winning Amount", grandTotals.firstWinning, grandTotals.secondWinning, grandTotals.winningAmount);
    };

    addHeader();
    let nextY = 80;
    nextY = renderSection("HINSA", hinsa, nextY);
    nextY = renderSection("AKRA", akra, nextY);
    nextY = renderSection("TANDOLA", tandola, nextY);
    nextY = renderSection("PANGORA", pangora, nextY);
    renderGrandTotals(nextY);

    {
      const drawFileLabel = selectedDraw ? `${(selectedDraw.title || 'draw').replace(/\s+/g, '_')}_${new Date(selectedDraw.draw_date).toISOString().split('T')[0]}` : new Date(drawDate).toISOString().split('T')[0];
      doc.save(`Ledger_Sheet_${drawFileLabel}.pdf`);
    }
    toast.success("Ledger PDF downloaded successfully!");
  };

  const generateDailyBillPDF2 = async () => {
    console.log("Generating Daily Bill PDF...");

    const fetchedEntries = await fetchVoucherData(drawDate, drawTime);
    if (!Array.isArray(fetchedEntries) || fetchedEntries.length === 0) {
      toast("No record found for the selected date.");
      return;
    }

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Daily Bill", pageWidth / 2, 15, { align: "center" });

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Dealer: ${userData?.user.username}`, 14, 30);
    doc.text(`City: ${userData?.user.city}`, 14, 40);
  const drawHeaderLabel2 = selectedDraw ? `${selectedDraw.title} (${new Date(selectedDraw.draw_date).toLocaleDateString()})` : drawDate;
  doc.text(`Draw: ${drawHeaderLabel2}`, 14, 50);

    const allData = fetchedEntries.flatMap(entry => entry.data);

    let y = 70;
    const rowHeight = 10;
    const colWidths = [60, 60];
    const x = 14;

    // Table Header with box
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.rect(x, y, colWidths[0], rowHeight);
    doc.text("Draw Time", x + 2, y + 7);
    doc.rect(x + colWidths[0], y, colWidths[1], rowHeight);
    doc.text("SALE", x + colWidths[0] + 2, y + 7);
    y += rowHeight;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const dailyGrandTotal = allData.reduce((sum, item) => sum + (item.firstPrice || 0) + (item.secondPrice || 0), 0);

    // Single row summary for the selected draw
    doc.rect(x, y, colWidths[0], rowHeight);
    doc.text(drawHeaderLabel2, x + 2, y + 7);

    doc.rect(x + colWidths[0], y, colWidths[1], rowHeight);
    doc.text(dailyGrandTotal.toString(), x + colWidths[0] + 2, y + 7);

    y += rowHeight;

    // Final Grand Total in styled box
    // y += 10;
    // doc.setFont("helvetica", "bold");
    // doc.rect(x, y, colWidths[0], rowHeight);
    // doc.text("Daily Grand Total:", x + 2, y + 7);
    // doc.rect(x + colWidths[0], y, colWidths[1], rowHeight);
    // doc.text(dailyGrandTotal.toString(), x + colWidths[0] + 2, y + 7);

    {
      const drawFileLabel = selectedDraw ? `${(selectedDraw.title || 'draw').replace(/\s+/g, '_')}_${new Date(selectedDraw.draw_date).toISOString().split('T')[0]}` : new Date(drawDate).toISOString().split('T')[0];
      doc.save(`Daily_Bill_${drawFileLabel}.pdf`);
    }
    toast.success("Daily Bill PDF downloaded successfully!");
  };


  const getEntryColor = (entryNumber) => {
    // Check for exact match first
    for (const winning of winningNumbers) {
      if (entryNumber === winning.number) {
        return winning.color;
      }
    }

    // Check for positional matches with + symbols
    for (const winning of winningNumbers) {
      if (checkPositionalMatch(entryNumber, winning.number)) {
        return winning.color;
      }
    }

    return [0, 0, 0]; // Default black color
  };

  const checkPositionalMatch = (entry, winningNumber) => {
    // Remove any spaces and ensure consistent format
    const cleanEntry = entry.toString().trim();

    // if (!cleanEntry.includes('+')) {
    //   // For plain numbers, only check if they are exact substrings of winning number
    //   // AND the entry has '+' patterns or is exactly the winning number
    //   return false;
    // }
    // Handle patterns like +4+6, +34+, etc.
    if (cleanEntry.includes('+')) {
      // For 2-digit patterns like +4+6
      if (cleanEntry.length === 4 && cleanEntry.match(/^\+\d\+\d$/)) {
        const digit1 = cleanEntry[1]; // 4
        const digit3 = cleanEntry[3]; // 6

        // Check if these digits match positions in winning number
        if (winningNumber[1] === digit1 && winningNumber[3] === digit3) {
          return true; // Matches positions 2 and 4 of 3456
        }
      }

      // For 3-digit patterns like +45+ (positions 2,3)
      if (cleanEntry.length === 4 && cleanEntry.match(/^\+\d\d\+$/)) {
        const digits = cleanEntry.slice(1, 3); // "45"
        if (winningNumber.slice(1, 3) === digits) {
          return true;
        }
      }

      // For patterns like 3+5+ (positions 1,3)
      if (cleanEntry.length === 4 && cleanEntry.match(/^\d\+\d\+$/)) {
        const digit1 = cleanEntry[0];
        const digit3 = cleanEntry[2];
        if (winningNumber[0] === digit1 && winningNumber[2] === digit3) {
          return true;
        }
      }

      // For patterns like ++56 (last two positions)
      if (cleanEntry.length === 4 && cleanEntry.match(/^\+\+\d\d$/)) {
        const digits = cleanEntry.slice(2); // "56"
        if (winningNumber.slice(2) === digits) {
          return true;
        }
      }

      // For patterns like +76+ (checking if 76 appears in positions 2,3 of winning number)
      if (cleanEntry.length === 4 && cleanEntry.match(/^\+\d\d\+$/)) {
        const digits = cleanEntry.slice(1, 3); // "76"
        if (winningNumber.slice(1, 3) === digits) {
          return true;
        }
      }

      // For patterns like 67+8 (checking consecutive positions)
      if (cleanEntry.length === 4 && cleanEntry.match(/^\d\d\+\d$/)) {
        const firstTwo = cleanEntry.slice(0, 2); // "67"
        const lastDigit = cleanEntry[3]; // "8"
        if (winningNumber.slice(0, 2) === firstTwo && winningNumber[3] === lastDigit) {
          return true;
        }
      }

      // For patterns like 6+68 (checking positions 1,3,4)
      if (cleanEntry.length === 4 && cleanEntry.match(/^\d\+\d\d$/)) {
        const firstDigit = cleanEntry[0]; // "6"
        const lastTwo = cleanEntry.slice(2); // "68"
        if (winningNumber[0] === firstDigit && winningNumber.slice(2) === lastTwo) {
          return true;
        }
      }

      // **NEW: For patterns like +990 (last 3 digits of 4-digit winning number)**
      if (cleanEntry.length === 4 && cleanEntry.match(/^\+\d\d\d$/)) {
        const lastThreeDigits = cleanEntry.slice(1); // "990"
        if (winningNumber.slice(1) === lastThreeDigits) { // Check if 7990 ends with 990
          return true;
        }
      }

      // **NEW: For patterns like +99 (last 2 digits)**
      if (cleanEntry.length === 3 && cleanEntry.match(/^\+\d\d$/)) {
        const lastTwoDigits = cleanEntry.slice(1); // "99"
        if (winningNumber.slice(-2) === lastTwoDigits) { // Check if 7990 ends with 99
          return true;
        }
      }

      // **NEW: For patterns like +9 (last digit)**
      if (cleanEntry.length === 2 && cleanEntry.match(/^\+\d$/)) {
        const lastDigit = cleanEntry.slice(1); // "9"
        if (winningNumber.slice(-1) === lastDigit) { // Check if 7990 ends with 9
          return true;
        }
      }

      // Pattern: +8 (matches if 8 appears in position 2,3, or 4 of winning number)
      if (cleanEntry.length === 2 && cleanEntry.match(/^\+\d$/)) {
        const digit = cleanEntry[1];
        // Check positions 2, 3, 4 (indices 1, 2, 3)
        for (let i = 1; i < winningNumber.length; i++) {
          if (winningNumber[i] === digit) {
            return true;
          }
        }
      }

      // Pattern: ++8 (matches if 8 appears in position 3 or 4 of winning number)
      if (cleanEntry.length === 3 && cleanEntry.match(/^\+\+\d$/)) {
        const digit = cleanEntry[2];
        // Check positions 3, 4 (indices 2, 3)
        for (let i = 2; i < winningNumber.length; i++) {
          if (winningNumber[i] === digit) {
            return true;
          }
        }
      }

      // Pattern: +++8 (matches if 8 appears in position 4 of winning number)
      if (cleanEntry.length === 4 && cleanEntry.match(/^\+\+\+\d$/)) {
        const digit = cleanEntry[3];
        // Check position 4 (index 3)
        if (winningNumber[3] === digit) {
          return true;
        }
      }
    }


    // Special handling for 4-digit plain numbers (PANGORA section):
    // treat them as matching if they equal either the first 4 or the
    // last 4 digits of the 6-digit winning number.
    if (cleanEntry.length === 4 && /^\d{4}$/.test(cleanEntry)) {
      const winStr = winningNumber.toString().trim();
      if (winStr.length >= 4 && winStr.slice(0, 4) === cleanEntry) {
        return true;
      }
    }

    // Check for partial consecutive matches (like 45, 56, etc.) for
    // 2- and 3-digit plain numbers.
    if (cleanEntry.length >= 2 && cleanEntry.length <= 3 && /^\d+$/.test(cleanEntry)) {
      // Only match if the entry starts from the beginning of the winning number
      if (winningNumber.startsWith(cleanEntry)) {
        return true;
      }
    }

    // **NEW: For single digit numbers without + symbols**
    // Pattern: 8 (matches if 8 appears in position 1 of winning number)
    if (cleanEntry.length === 1 && /^\d$/.test(cleanEntry)) {
      const digit = cleanEntry;
      // Check if digit matches first position of winning number
      if (winningNumber[0] === digit) {
        return true;
      }
    }

    return false;
  };



  const handleDownloadPDF = async () => {
    // Require a selected draw for PDF generation so PDFs reflect the admin-selected draw date
    if (!selectedDraw) {
      toast.error("Please select a draw before downloading PDFs.");
      return;
    }

    // Prevent PDF generation until draw is closed
    if (!isSelectedDrawClosed()) {
      toast.error("Draw is not close yet");
      return;
    }

    if (ledger === "VOUCHER") {
      await generateVoucherPDF();
    }
    else if (ledger === "LEDGER") {

      await generateLedgerPDF();

    }
    else if (ledger === "DAILY BILL") {
      await generateDailyBillPDF();
    }
    // else if (ledger === "DEMAND") {
    //   await generateVoucherPDF("demand");
    // }
    // else if (ledger === "OVER LIMIT") {
    //   await generateVoucherPDF("overlimit");
    // }
    else if (ledger === "COMBINED") {
      await generateCombinedVoucherPDF();
    }
    else if (ledger === "COMBINED DEMAND") {
      await generateCombinedVoucherPDF("demand");
    }
    else if (ledger === "COMBINED OVER LIMIT") {
      await generateCombinedVoucherPDF("overlimit");
    }
    else {
      toast.error("Please select a valid ledger type.");

    }


  };

  const generateDailyBillPDF = async () => {
    console.log("Generating Daily Bill PDF...");

    const fetchedEntries = await fetchVoucherData(drawDate, drawTime);
    if (!Array.isArray(fetchedEntries) || fetchedEntries.length === 0) {
      toast("No record found for the selected date.");
      return;
    }

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Daily Bill", pageWidth / 2, 15, { align: "center" });

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Dealer: ${userData?.user.username}`, 14, 30);
    doc.text(`City: ${userData?.user.city}`, 14, 40);
  const drawHeaderLabel3 = selectedDraw ? `${selectedDraw.title} (${new Date(selectedDraw.draw_date).toLocaleDateString()})` : drawDate;
  doc.text(`Draw: ${drawHeaderLabel3}`, 14, 50);

    // Initialize grand totals for the day
    const dayGrandTotals = {
      first: 0,
      second: 0,
      net: 0,
      winningAmount: 0,
      firstWinning: 0,
      secondWinning: 0,
    };

    // Group by time slot. If a draw is selected (drawId mode), backend returns Data docs
    // without timeSlot; treat all returned data as belonging to the selected draw.
    const groupedByTimeSlot = {};
    if (selectedDraw && selectedDraw._id) {
      const key = selectedDraw.title || 'Draw';
      groupedByTimeSlot[key] = fetchedEntries.flatMap(entry => entry.data);
    } else {
      fetchedEntries.forEach(entry => {
        const slot = entry.timeSlot;
        if (!groupedByTimeSlot[slot]) {
          groupedByTimeSlot[slot] = [];
        }
        groupedByTimeSlot[slot].push(...entry.data);
      });
    }

    let y = 70;
    const rowHeight = 10;
    const colWidths = [40, 30, 30, 30, 30, 30];
    const x = 14;

    // Enhanced Table Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);

    // Draw header boxes
    doc.rect(x, y, colWidths[0], rowHeight);
    doc.text("Draw Time", x + 2, y + 7);

    doc.rect(x + colWidths[0], y, colWidths[1], rowHeight);
    doc.text("SALE", x + colWidths[0] + 2, y + 7);

    doc.rect(x + colWidths[0] + colWidths[1], y, colWidths[2], rowHeight);
    doc.text("PRIZE", x + colWidths[0] + colWidths[1] + 2, y + 7);

    doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2], y, colWidths[3], rowHeight);
    doc.text("SUB TOTAL", x + colWidths[0] + colWidths[1] + colWidths[2] + 2, y + 7);

    doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y, colWidths[4], rowHeight);
    doc.text("Share (45%)", x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 2, y + 7);

    doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], y, colWidths[5], rowHeight);
    doc.text("Bill", x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + 2, y + 7);

    y += rowHeight;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    // Calculate winning amounts helper function
    const calculateWinningForTimeSlot = (entries) => {
      const allVoucherRows = entries.map(item => ({
        number: item.uniqueId,
        first: item.firstPrice,
        second: item.secondPrice
      }));

      const hinsa = [], akra = [], tandola = [], pangora = [];

      // Categorize entries
      allVoucherRows.forEach(({ number, first, second }) => {
        if (/^\d{1}$/.test(number)) {
          hinsa.push([number, first, second]);
        } else if (
          /^\d{2}$/.test(number) ||
          /^\+\d$/.test(number) ||
          /^\+\+\d$/.test(number) ||
          /^\+\+\+\d$/.test(number) ||
          (number.includes('+') && number.length <= 4)
        ) {
          akra.push([number, first, second]);
        } else if (
          /^\d{3}$/.test(number) ||
          (number.length === 4 && number.includes('x'))
        ) {
          tandola.push([number, first, second]);
        } else if (/^\d{4}$/.test(number)) {
          pangora.push([number, first, second]);
        }
      });

      // Calculate winning amounts for each category
      const calculateSectionWinning = (rows, multiplier) => {
        let firstWinningAmount = 0;
        let secondWinningAmount = 0;
        const secondPrizeDivisor = selectedDraw?.category === 'GTL' ? 5 : 3;

        rows.forEach(([num, f, s]) => {
          const entryColor = getEntryColor(num);

          if (entryColor[0] !== 0 || entryColor[1] !== 0 || entryColor[2] !== 0) {
            // Sum over ALL distinct winning numbers that match this entry
            // so that one entry can win multiple times if there are
            // multiple different winning numbers sharing the same position.
            for (const winning of winningNumbers) {
              if (num === winning.number || checkPositionalMatch(num, winning.number)) {
                if (winning.type === "first") {
                  firstWinningAmount += f * multiplier;
                } else if (winning.type === "second" || winning.type === "third") {
                  secondWinningAmount += (s * multiplier) / secondPrizeDivisor;
                }
              }
            }
          }
        });

        return firstWinningAmount + secondWinningAmount;
      };

      const hinsaWinning = calculateSectionWinning(hinsa, 8);
      const akraWinning = calculateSectionWinning(akra, 80);
      const tandolaWinning = calculateSectionWinning(tandola, 800);
      const pangoraWinning = calculateSectionWinning(pangora, 8000);

      return hinsaWinning + akraWinning + tandolaWinning + pangoraWinning;
    };

    // Process each time slot
    Object.entries(groupedByTimeSlot).forEach(([timeSlot, entries]) => {
      const firstTotal = entries.reduce((sum, item) => sum + item.firstPrice, 0);
      const secondTotal = entries.reduce((sum, item) => sum + item.secondPrice, 0);
      const totalSale = firstTotal + secondTotal;
      const winningAmount = calculateWinningForTimeSlot(entries);
      const subtotal = totalSale - winningAmount;
      const shareAmount = subtotal * 0.45; // 45% share amount
      const billAmount = subtotal - shareAmount; // Bill amount after share deduction
      // Add to day totals
      dayGrandTotals.first += firstTotal;
      dayGrandTotals.second += secondTotal;
      dayGrandTotals.net += totalSale;
      dayGrandTotals.winningAmount += winningAmount;

      // Draw row
      doc.rect(x, y, colWidths[0], rowHeight);
      doc.text(timeSlot, x + 2, y + 7);

      doc.rect(x + colWidths[0], y, colWidths[1], rowHeight);
      doc.text(totalSale.toString(), x + colWidths[0] + 2, y + 7);

      doc.rect(x + colWidths[0] + colWidths[1], y, colWidths[2], rowHeight);
      doc.text(winningAmount.toFixed(2), x + colWidths[0] + colWidths[1] + 2, y + 7);

      doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2], y, colWidths[3], rowHeight);
      doc.text(subtotal.toString(), x + colWidths[0] + colWidths[1] + colWidths[2] + 2, y + 7);

      doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y, colWidths[4], rowHeight);
      doc.text(shareAmount.toString(), x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 2, y + 7);

      doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], y, colWidths[5], rowHeight);
      doc.text(billAmount.toFixed(2), x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + 2, y + 7);

      y += rowHeight;

      
    });

    

    doc.save("Daily_Bill_RLC.pdf");
    toast.success("Daily Bill PDF downloaded successfully!");
  };

  const isPastClosingTime = () => {
    // Use admin-configured draw date / expired flag only (no time-slot logic)
    if (!selectedDraw) return false;

    if (selectedDraw.isExpired) return true;

    if (!selectedDraw.draw_date) return false;

    const drawDateObj = new Date(selectedDraw.draw_date);
    drawDateObj.setHours(23, 59, 59, 999); // end of draw day
    return Date.now() >= drawDateObj.getTime();
  };

  {/* Main Content */ }




  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 p-2 overflow-hidden">
      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5">
          <div className="text-xs text-gray-400">Balance</div>
          <div className="text-base font-semibold">
            {(() => {
              const raw = userData?.user?.balance;
              const num = Number(raw);
              return !isNaN(num) ? num.toLocaleString() : (raw ?? "-");
            })()}
          </div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5">
          <div className="text-xs text-gray-400">Count</div>
          <div className="text-base font-semibold">{distributorSummary.recordCount}</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5">
          <div className="text-xs text-gray-400">Total</div>
          <div className="text-base font-semibold">
            {(() => { const n = Number(distributorSummary.grandTotal); return !isNaN(n) ? n.toLocaleString() : "-"; })()}
          </div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5">
          <div className="text-xs text-gray-400">First</div>
          <div className="text-base font-semibold">
            {(() => { const n = Number(distributorSummary.firstTotal); return !isNaN(n) ? n.toLocaleString() : "-"; })()}
          </div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5">
          <div className="text-xs text-gray-400">Second</div>
          <div className="text-base font-semibold">
            {(() => { const n = Number(distributorSummary.secondTotal); return !isNaN(n) ? n.toLocaleString() : "-"; })()}
          </div>
        </div>
      </div>

      {/* Draw selector bar */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 flex items-center gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <FaClock className="text-purple-400" />
          <span>Draw</span>
        </div>
        <select
          className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 flex-1 min-w-[220px]"
          value={selectedDraw ? selectedDraw._id : ""}
          onChange={(e) => {
            const id = e.target.value;
            const d = draws.find((x) => x._id === id) || null;
            setSelectedDraw(d);
            if (d && d.draw_date) {
              setDrawDate(new Date(d.draw_date).toISOString().split("T")[0]);
            }
          }}
        >
          <option value="">-- Select Live Draw --</option>
          {draws.filter(isDrawActive).map((d) => (
            <option key={d._id} value={d._id}>
              {formatDrawOptionLabel(d)}
            </option>
          ))}
        </select>
        <div className="hidden md:block">
          <DrawCountdown selectedDraw={selectedDraw} />
        </div>
      </div>

      {/* Winning numbers as a slim strip (avoid pushing layout down) */}
      {winningNumbers.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs overflow-x-auto whitespace-nowrap">
          <span className="text-gray-300 mr-2">Winning:</span>
          {winningNumbers.map((item, index) => (
            <span
              key={`${item.type}-${item.number}-${index}`}
              className="inline-flex items-center gap-1 mr-2 px-2 py-1 rounded bg-gray-700 border border-gray-600"
            >
              <span className="text-gray-300">{String(item.type).toUpperCase()}</span>
              <span className="text-yellow-300 font-semibold">{item.number}</span>
            </span>
          ))}
        </div>
      )}

      {/* Main content */}
      {userData?.user?.role === "distributor" ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-white">
            <h3 className="text-lg font-semibold mb-2">Distributor</h3>
            <p className="text-sm text-gray-300">Entries are disabled in this panel.</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-white">
            <h3 className="text-lg font-semibold mb-3 flex items-center space-x-2">
              <FaBell className="text-yellow-300" />
              <span>Notifications</span>
            </h3>

            {winningNumbers.length > 0 ? (
              <div className="space-y-2 text-sm">
                <div className="text-gray-300">Winning numbers:</div>
                <div className="flex flex-wrap gap-2">
                  {winningNumbers.map((item, index) => (
                    <span
                      key={`${item.type}-${item.number}-${index}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-700 border border-gray-600"
                    >
                      <span className="text-gray-300">{String(item.type).toUpperCase()}</span>
                      <span className="text-yellow-300 font-semibold">{item.number}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-300">No notifications yet.</div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Entry row (separate from table) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSingleEntrySubmit();
            }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 flex flex-nowrap items-center gap-2 overflow-x-auto"
          >
            <div className="font-semibold mr-2">General</div>
            <input
              type="text"
              ref={noInputRef}
              value={no}
              onChange={(e) => setNo(e.target.value)}
              onKeyDown={handleNoKeyDown}
              placeholder="Bundle"
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 w-40"
            />
            <input
              type="text"
              ref={fInputRef}
              value={f}
              onChange={(e) => setF(e.target.value)}
              onKeyDown={handleFKeyDown}
              onFocus={handleFocus}
              placeholder="First"
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 w-32"
            />
            <input
              type="text"
              ref={sInputRef}
              value={s}
              onChange={(e) => setS(e.target.value)}
              onKeyDown={handleSKeyDown}
              onFocus={handleFocus2}
              placeholder="Second"
              className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 w-32"
            />
            <button
              type="submit"
              className={`px-4 py-2 rounded text-white ${isPastClosingTime()
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-500"
                }`}
              disabled={isPastClosingTime()}
            >
              + Add
            </button>
            <div className="flex items-center gap-2">
              <span className="font-semibold">Auto:</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoMode}
                onClick={() => setAutoMode((prev) => !prev)}
                className={`relative w-12 h-7 rounded-full border transition-colors ${autoMode ? "bg-green-600 border-green-500" : "bg-gray-600 border-gray-500"}`}
                title="Toggle auto mode"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform ${autoMode ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
              <span className="text-xs text-gray-300">{autoMode ? "ON" : "OFF"}</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-500"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={handleCopySelected}
                className="bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-500"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={handlePasteCopied}
                className="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-500"
              >
                Paste
              </button>
              <button
                type="button"
                onClick={() => {
                  setSmsInput("");
                  setParsedEntries([]);
                  setShowModal(true);
                }}
                className="bg-purple-600 text-white px-3 py-2 rounded text-sm hover:bg-purple-500"
              >
                SMS
              </button>
            </div>
          </form>

          {/* Table + actions row */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
            <div className="flex flex-col min-h-0">
              <div className="flex-1 min-h-0 bg-gray-800/30 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
                <EntriesTable
                  entries={deferredEntries}
                  selectedEntries={selectedEntries}
                  setSelectedEntries={setSelectedEntries}
                  onToggleSelectEntry={toggleSelectEntry}
                  onDeleteRecord={handleDeleteRecord}
                  onDeleteEntry={handleDeleteEntry}
                />
              </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg flex flex-col min-h-0">
              <div className="px-3 py-1.5 border-b border-gray-700 flex items-center justify-between">
                <div className="font-semibold">Action</div>
                <div className="text-xs text-gray-400">None</div>
              </div>
              <div className="p-2 flex-1 min-h-0 overflow-auto app-scroll">
                <div className="flex flex-col gap-2">
                  <button
                    className="w-full flex items-center space-x-2 px-3 py-1.5 text-sm bg-violet-200 text-gray-900 rounded border border-violet-300 hover:bg-violet-300"
                    onClick={handlePaltiAKR}
                    type="button"
                  >
                    <FaStar /> <FaStar /> <span>Palti AKR</span>
                  </button>

                  <button
                    className="w-full flex items-center space-x-2 px-3 py-1.5 text-sm bg-violet-200 text-gray-900 rounded border border-violet-300 hover:bg-violet-300"
                    onClick={handlePaltiTandula}
                    type="button"
                  >
                    <FaStar /> <FaStar /> <FaStar /> <span>Palti Tandula</span>
                  </button>

                  <button
                    className="w-full flex items-center space-x-2 px-3 py-1.5 text-sm bg-violet-200 text-gray-900 rounded border border-violet-300 hover:bg-violet-300"
                    onClick={handleChakriRing}
                    type="button"
                  >
                    <FaStar /> <FaStar /> <FaStar /> <span>24 tandola</span>
                  </button>

                  <button
                    className="w-full flex items-center space-x-2 px-3 py-1.5 text-sm bg-violet-200 text-gray-900 rounded border border-violet-300 hover:bg-violet-300"
                    onClick={handle3FigureRingWithX}
                    type="button"
                  >
                    <FaStar /> <FaStar /> <FaStar /> <span>12 tandulla</span>
                  </button>

                  <button
                    className="w-full flex items-center space-x-2 px-3 py-1.5 text-sm bg-violet-200 text-gray-900 rounded border border-violet-300 hover:bg-violet-300"
                    onClick={handle4FigurePacket}
                    type="button"
                  >
                    <FaStar /> <FaStar /> <FaStar /> <FaStar /> <span>Pangora palti</span>
                  </button>

                  <button
                    className="w-full flex items-center space-x-2 px-3 py-1.5 text-sm bg-violet-200 text-gray-900 rounded border border-violet-300 hover:bg-violet-300"
                    onClick={handleAKR2Figure}
                    type="button"
                  >
                    <span>AKR 6 jaga</span>
                  </button>

                  <button
                    className="w-full flex items-center space-x-2 px-3 py-1.5 text-sm bg-violet-200 text-gray-900 rounded border border-violet-300 hover:bg-violet-300"
                    onClick={handleAKR2Figure3Jaga}
                    type="button"
                  >
                    <span>F+M+B AKR</span>
                  </button>

                  <button
                    className="w-full flex items-center space-x-2 px-3 py-1.5 text-sm bg-violet-200 text-gray-900 rounded border border-violet-300 hover:bg-violet-300"
                    onClick={handleRingPlusAKR}
                    type="button"
                  >
                    <span>Ring + AKR</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {showImportDBFModal && userData?.user?.role === 'distributor' && (
        <div className="fixed inset-0  bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white text-black p-6 rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Import DBF</h3>
              <button className="text-gray-500" onClick={() => setShowImportDBFModal(false)}>✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Select Draw</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={importDrawId}
                  onChange={(e) => setImportDrawId(e.target.value)}
                >
                  <option value="">-- Select Draw --</option>
                  {historyVisibleDraws
                    .map(d => (
                      <option key={d._id} value={d._id}>
                        {formatDrawOptionLabel(d)}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Select Party</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={importPartyId}
                  onChange={(e) => setImportPartyId(e.target.value)}
                >
                  <option value="">-- Select Party --</option>
                  {parties.map(p => (
                    <option key={p._id} value={p._id}>{p.username} {p.partyCode ? `(${p.partyCode})` : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Select Client</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={importClientId}
                  onChange={(e) => setImportClientId(e.target.value)}
                >
                  <option value="">-- Select Client --</option>
                  {clients.map(c => (
                    <option key={c._id} value={c._id}>{c.username}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Select DBF File</label>
                <input type="file" accept=".dbf" onChange={handleImportFileChange} className="w-full" />
                {importFile && (
                  <p className="text-sm text-gray-700 mt-1">Selected: {importFile.name}</p>
                )}
                {importDetectedMode && (
                  <p className="text-sm text-blue-700 mt-1">Detected format: {importDetectedMode}</p>
                )}
                {importParsedRows.length > 0 && (
                  <p className="text-sm text-green-700 mt-1">Parsed {importParsedRows.length} rows</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowImportDBFModal(false)}
                className="px-4 py-2 rounded bg-gray-300 text-black hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImportDbf}
                disabled={importing}
                className="px-4 py-2 rounded bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-60"
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0  bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-lg w-96">
            <h2 className="text-xl text-black font-bold mb-4">Paste SMS</h2>

            <textarea
              className="w-full border text-black rounded p-2 h-24 mb-4"
              placeholder="Paste SMS here"
              value={smsInput}
              onChange={(e) => setSmsInput(e.target.value)}
            ></textarea>

            <button
              onClick={() => setParsedEntries(parseSMS(smsInput))}
              className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 mb-3"
            >
              Preview
            </button>

            {parsedEntries.length > 0 && (
              <div className="border rounded mb-3 max-h-40 overflow-y-auto">
                <table className="w-full text-black text-sm border-collapse">
                  <thead className="bg-gray-200">
                    <tr>
                      <th className="border px-2 py-1">NO</th>
                      <th className="border px-2 py-1">F</th>
                      <th className="border px-2 py-1">S</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedEntries.map((entry, index) => (
                      <tr key={index}>
                        <td className="border px-2 py-1">{entry.no}</td>
                        <td className="border px-2 py-1">{entry.f}</td>
                        <td className="border px-2 py-1">{entry.s}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              {/* Cancel Button */}
              <button
                onClick={closeSmsModal} // Closes and resets modal
                className="bg-gray-400 text-black px-3 py-1 rounded hover:bg-gray-500"
              >
                Cancel
              </button>

              {/* Confirm Button (only if entries parsed) */}

              <button
                onClick={() => {
                  handleConfirmPaste(); // Adds entries (already checks draw time)
                  // closeSmsModal();      // Reset modal after confirm
                }}
                className={`px-3 py-1 rounded text-white bg-green-500 hover:bg-green-600"
      }`}
              >
                Confirm
              </button>

            </div>

          </div>
        </div>
      )}


    </div>


  )

}

export default Center;
