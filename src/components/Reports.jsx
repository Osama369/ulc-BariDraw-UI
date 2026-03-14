import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import { useSelector } from 'react-redux';
// import { toast } from 'react-toastify';
import toast from 'react-hot-toast';

const Reports = () => {
  const userData = useSelector((state) => state.user);
  const token = userData?.token || localStorage.getItem('token');
  const role = userData?.user?.role;
  const currentUserId = userData?.user?._id;
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const selectedClientName = (clients.find(c => String(c._id) === String(selectedClient))?.username) || userData?.user.username;
  const [drawDate, setDrawDate] = useState(new Date().toISOString().split('T')[0]);
  const [drawTime, setDrawTime] = useState('11 AM');
  const [draws, setDraws] = useState([]);
  const [selectedDraw, setSelectedDraw] = useState(null);
  const [drawRemainingMs, setDrawRemainingMs] = useState(null);
  const [entries, setEntries] = useState([]);
  const [prizeType, setPrizeType] = useState('All');
  const [loading, setLoading] = useState(false);
  const [ledger, setLedger] = useState("LEDGER");
  const [winningNumbers, setWinningNumbers] = useState([
    { number: "2453", color: [255, 0, 0], type: "first" },    // Red (RGB)
    { number: "1157", color: [0, 0, 255], type: "second" },   // Blue (RGB)
    { number: "2560", color: [0, 0, 255], type: "second" },   // Blue (RGB)
  ]);
  const [firstPrizeLimit, setFirstPrizeLimit] = useState(0);
  const [secondPrizeLimit, setSecondPrizeLimit] = useState(0);
  const [enablePrizeFilter, setEnablePrizeFilter] = useState(false);
  const [isDemandOverlimit, setIsDemandOverlimit] = useState(false);

  // Fetch clients for this user
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await axios.get('/api/v1/users/distributor-users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setClients(response.data || []);
      } catch (error) {
        toast.error('Failed to fetch clients');
      }
    };
    fetchClients();
  }, [token]);

  // If logged in user is a regular user, default selectedClient to current user's id
  useEffect(() => {
    if (role === 'user') {
      if (currentUserId) setSelectedClient(currentUserId);
    }
  }, [role, currentUserId]);

  useEffect(() => {
    if (drawDate) {
      // getAndSetVoucherData();
      getWinningNumbers(drawDate); 
      // getDemandOverlimit(drawDate, drawTime);
    }
  }, [drawDate]);

  // Fetch admin-managed draws for draw selection
  useEffect(() => {
    const fetchDraws = async () => {
      try {
        const normalizeAuthToken = (raw) => {
          if (raw == null) return null;
          const s = String(raw).trim();
          if (!s || s === 'null' || s === 'undefined') return null;
          const t = /^bearer\s+/i.test(s) ? s.replace(/^bearer\s+/i, '').trim() : s;
          if (!t || t === 'null' || t === 'undefined') return null;
          if (t.split('.').length !== 3) return null;
          return t;
        };

        const storedAdminToken = localStorage.getItem('adminToken');
        const storedUserToken = localStorage.getItem('token');
        const authToken = normalizeAuthToken(token) || normalizeAuthToken(storedUserToken) || normalizeAuthToken(storedAdminToken);
        const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
        const res = await axios.get('/api/v1/draws', { headers });
        setDraws(res.data.draws || res.data || []);
      } catch (err) {
        console.error('Failed to fetch draws', err);
        setDraws([]);
      }
    };
    fetchDraws();
  }, [token]);

  // Update remaining time until selected draw closes every second
  useEffect(() => {
    if (!selectedDraw) {
      setDrawRemainingMs(null);
      return;
    }
    let initialMs = null;
    if (typeof selectedDraw.remainingMs === 'number') {
      initialMs = Math.max(selectedDraw.remainingMs, 0);
    } else {
      const drawDateObj = new Date(selectedDraw.draw_date);
      drawDateObj.setHours(23, 59, 59, 999);
      initialMs = Math.max(drawDateObj.getTime() - Date.now(), 0);
    }
    setDrawRemainingMs(initialMs);
    const t = setInterval(() => {
      setDrawRemainingMs(prev => (prev == null ? null : Math.max(prev - 1000, 0)));
    }, 1000);
    return () => clearInterval(t);
  }, [selectedDraw]);

  const getWinningNumbers = async (date) => {
  
      try {
        const response = await axios.get("/api/v1/data/get-winning-numbers", {
          params: {
            date: date,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.data && response.data.winningNumbers) {
          const formattedNumbers = response.data.winningNumbers.map(item => ({
            number: item.number,
            type: item.type,
            color: item.type === 'first' ? [255, 0, 0] :
              item.type === 'second' ? [0, 0, 255] :
                [128, 0, 128] // Purple for third
          }));

          // Deduplicate by 6-digit number + type so duplicate
          // entries in admin winning list don't multiply prize.
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
  // Fetch entries for selected client/date/time
  const fetchClientEntries = async () => {
    if (role !== 'user' && !selectedClient) {
      toast('Please select a client');
      return;
    }
    setLoading(true);
    try {
      const params = { category: "general" };
      params.userId = role === 'user' ? currentUserId : selectedClient;
      if (selectedDraw && selectedDraw._id) params.drawId = selectedDraw._id;
      else { params.date = drawDate; params.timeSlot = drawTime; }
      const response = await axios.get('/api/v1/data/get-client-data', { params, headers: { Authorization: `Bearer ${token}` } });
      // Flatten entries for table
      const allEntries = response.data.data?.flatMap(record =>
        record.data.map(item => ({
          parentId: record._id,
          objectId: item._id,
          no: item.uniqueId,
          f: item.firstPrice,
          s: item.secondPrice,
        }))
      ) || [];
      setEntries(allEntries);
    } catch (error) {
      toast.error('Failed to fetch report');
      setEntries([]);
    } finally {
      setLoading(false);
    }
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

  // Numeric helpers: avoid floating point drift and format consistently
  const toCents = (v) => Math.round((Number(v) || 0) * 100);
  const fromCents = (c) => (Number(c || 0) / 100);
  const formatCurrency = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0.00';
    return (Math.round(n * 100) / 100).toFixed(2);
  };

  const getPdfDrawHeaderLabel = ({ includeTimeFallback = true } = {}) => {
    if (selectedDraw && selectedDraw.draw_date) {
      const title = selectedDraw.title || 'Draw';
      const dateText = new Date(selectedDraw.draw_date).toLocaleDateString();
      const isPakistan = String(selectedDraw.category || '').toUpperCase() === 'PAKISTAN';
      const city = (selectedDraw.city || '').trim();
      const base = isPakistan && city
        ? `${title} - ${city} - ${dateText}`
        : `${title} - ${dateText}`;
      return `${base}${selectedDraw.isExpired ? ' (Closed)' : ''}`;
    }
    return includeTimeFallback ? `${drawDate} ${drawTime}` : `${drawDate}`;
  };

  const formatDrawOptionLabel = (draw) => {
    const title = draw?.title || "Draw";
    const city = (draw?.city || "").trim();
    const dateText = draw?.draw_date ? new Date(draw.draw_date).toLocaleDateString() : "";
    const closedText = draw?.isExpired ? " (Closed)" : "";
    const base = city ? `${title} - ${city} - ${dateText}` : `${title} - ${dateText}`;
    return `${base}${closedText}`;
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

  const getAndSetVoucherData = async () => {  // use in to fetch data base on time/date
      const fetchedData = await fetchVoucherData(drawDate, drawTime);
  
      if (Array.isArray(fetchedData) && fetchedData.length > 0) {
        const filteredRecords = fetchedData.filter((record) => {
          const recordDate = new Date(record.date).toISOString().split("T")[0];
          const selectedDateISO = new Date(drawDate).toISOString().split("T")[0];
          return (
            recordDate === selectedDateISO &&
            record.timeSlot === drawTime
          );
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
  
        setEntries(combinedEntries);
        console.log("combined entires", combinedEntries);  // jo bhi entries hongi wo yengi
  
  
      } else {
        setEntries([]);
      }
  };

  const fetchVoucherData = async (selectedDate, selectedTimeSlot, category = "general") => {
      // If current user is not a regular user, require selecting a client
      if (role !== 'user' && !selectedClient) {
        toast('Please select a client');
        return;
      }
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const params = { category };
        // For regular users, use current user's id. For distributors/admins use selectedClient.
        params.userId = role === 'user' ? currentUserId : selectedClient;
        if (selectedDraw && selectedDraw._id) params.drawId = selectedDraw._id;
        else { params.date = selectedDate; params.timeSlot = selectedTimeSlot; }
        const response = await axios.get("/api/v1/data/get-client-data", { params, headers: { Authorization: `Bearer ${token}` } });
        return response.data.data;
      } catch (error) {
        toast.error((error.response?.data?.error));
        return [];
      }
  };

    const generateVoucherPDF = async (category, prizeTypeParam = 'All') => {
      const fetchedEntries = await fetchVoucherData(drawDate, drawTime, category);
      if (fetchedEntries.length === 0) {
        toast("No Record found..");
        return;
      }
    
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
    
      // Get all voucher rows and categorize them
      const allVoucherRows = (selectedDraw && selectedDraw._id)
        ? fetchedEntries.flatMap(entry => entry.data.map(item => ({ number: item.uniqueId, first: item.firstPrice, second: item.secondPrice })))
        : fetchedEntries
            .filter(entry => entry.timeSlot === drawTime)
            .flatMap(entry => entry.data.map(item => ({ number: item.uniqueId, first: item.firstPrice, second: item.secondPrice })));
    
      // Split entries into categories (same logic as in generateLedgerPDF)
      const hinsa = [], akra = [], tandola = [], pangora = [];
    
      allVoucherRows.forEach(({ number, first, second }) => {
        if (/^\d{1}$/.test(number) ||
          (number.includes('+') && number.length === 2) || 
          (number.split('+').length - 1 === 2 && number.length === 3) || 
          (number.split('+').length - 1 === 3 && number.length === 4)
        ) {
          // Single digit numbers go to hinsa
          if (prizeTypeParam === 'All' || prizeTypeParam === 'Hinsa') hinsa.push([number, first, second]);
        } else if (
          /^\d{2}$/.test(number) ||
          (number.includes('+') && number.length <= 3) ||
          (number.split('+').length - 1 === 2 && number.length === 4)
        ) {
          if (prizeTypeParam === 'All' || prizeTypeParam === 'Akra') akra.push([number, first, second]);
        } else if (
          /^\d{3}$/.test(number) ||
          (number.length === 4 && number.includes('+'))
        ) {
          if (prizeTypeParam === 'All' || prizeTypeParam === 'Tandola') tandola.push([number, first, second]);
        } else if (/^\d{4}$/.test(number)) {
          if (prizeTypeParam === 'All' || prizeTypeParam === 'Pangora') pangora.push([number, first, second]);
        }
      });
    
      const totalEntries = allVoucherRows.length;
    
      // Calculate totals for each section (work in cents to avoid FP drift)
      const calculateSectionTotals = (rows) => {
        return rows.reduce(
          (acc, row) => {
            acc.firstTotalCents += toCents(row[1]);
            acc.secondTotalCents += toCents(row[2]);
            return acc;
          },
          { firstTotalCents: 0, secondTotalCents: 0 }
        );
      };
    
      const hinsaTotals = calculateSectionTotals(hinsa);
      const akraTotals = calculateSectionTotals(akra);
      const tandolaTotals = calculateSectionTotals(tandola);
      const pangoraTotals = calculateSectionTotals(pangora);

      // Track grand totals including commission and net (store in cents)
      const grandTotals = {
        firstTotalCents: hinsaTotals.firstTotalCents + akraTotals.firstTotalCents + tandolaTotals.firstTotalCents + pangoraTotals.firstTotalCents,
        secondTotalCents: hinsaTotals.secondTotalCents + akraTotals.secondTotalCents + tandolaTotals.secondTotalCents + pangoraTotals.secondTotalCents,
        commissionCents: 0,
        netCents: 0,
      };
      const grandTotalCents = grandTotals.firstTotalCents + grandTotals.secondTotalCents;
    
  const drawHeaderLabel = getPdfDrawHeaderLabel({ includeTimeFallback: true });

  const addHeader = () => {
        doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  // Use the passed category if available, otherwise default to 'General'
  doc.text(`Voucher (${category || 'General'})`, pageWidth / 2, 15, { align: "center" });
    
        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
      // Resolve a readable dealer/client name for the header
      const selectedClientName = (clients.find(c => String(c._id) === String(selectedClient))?.username) || userData?.user.username;
      doc.text(`Dealer Name: ${selectedClientName}`, 14, 30);
    doc.text(`City: ${userData?.user.city}`, 14, 40);
    doc.text(`Draw: ${drawHeaderLabel}`, 14, 50);
        // doc.text(`Total Entries: ${totalEntries}`, 14, 70);
    
        // Grand totals will be printed after sections are rendered (to ensure correct aggregation)
      };
    
      // helper for voucher table cell amounts: show integers only (e.g., 100)
      const formatVoucherCellAmount = (value) => {
        const num = Number(value) || 0;
        return Math.round(num).toString();
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
        const sectionTotalCents = sectionTotals.firstTotalCents + sectionTotals.secondTotalCents;
        const sectionTotal = fromCents(sectionTotalCents);

        // determine commission rate per section
        let commissionRate = 0;
        if (title === 'HINSA') commissionRate = userData?.user?.singleFigure || 0;
        else if (title === 'AKRA') commissionRate = userData?.user?.doubleFigure || 0;
        else if (title === 'TANDOLA') commissionRate = userData?.user?.tripleFigure || 0;
        else if (title === 'PANGORA') commissionRate = userData?.user?.fourFigure || 0;

        // compute commission/net in cents to avoid FP issues
        const commissionAmountCents = Math.round(sectionTotalCents * (Number(commissionRate) || 0) / 100);
        const netAfterCommissionCents = sectionTotalCents - commissionAmountCents;

        // accumulate into grand totals (cents)
        grandTotals.commissionCents += commissionAmountCents;
        grandTotals.netCents += netAfterCommissionCents;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`First: ${formatCurrency(fromCents(sectionTotals.firstTotalCents))}`, 14, y);
        doc.text(`Second: ${formatCurrency(fromCents(sectionTotals.secondTotalCents))}`, 60, y);
        doc.text(`Total: ${formatCurrency(sectionTotal)}`, 106, y);
        doc.text(`Commission (${commissionRate}%): ${formatCurrency(fromCents(commissionAmountCents))}`, 140, y);
        y += 5;
        doc.text(`Net: ${formatCurrency(fromCents(netAfterCommissionCents))}`, 14, y);
        y += 2;

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
            doc.text(formatVoucherCellAmount(f), leftX + colWidths[0] + 1, currentY + 5);
            doc.rect(leftX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
            doc.text(formatVoucherCellAmount(s), leftX + colWidths[0] + colWidths[1] + 1, currentY + 5);
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
            doc.text(formatVoucherCellAmount(f), middleX + colWidths[0] + 1, currentY + 5);
            doc.rect(middleX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
            doc.text(formatVoucherCellAmount(s), middleX + colWidths[0] + colWidths[1] + 1, currentY + 5);
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
            doc.text(formatVoucherCellAmount(f), rightX + colWidths[0] + 1, currentY + 5);
            doc.rect(rightX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
            doc.text(formatVoucherCellAmount(s), rightX + colWidths[0] + colWidths[1] + 1, currentY + 5);
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
      // After rendering all sections, print grand totals, commission and net totals
      try {
        let baseY = nextY + 5; // place summary just below the last section

        // If we're too close to the bottom, move summary to a new page under the header
        if (baseY > pageHeight - 70) {
          doc.addPage();
          addHeader();
          baseY = 70; // below header text on the new page
        }

        // Draw heading and a separator line across the page
        doc.setDrawColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Summary sale voucher", 14, baseY - 2);
        doc.line(14, baseY, pageWidth - 14, baseY);

        const tableX = pageWidth - 90; // small table on the right side
        let tableY = baseY + 4;
        const rowHeight = 7;
        const colWidths = [45, 35]; // Label, Value

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");

        const firstTotal = fromCents(grandTotals.firstTotalCents || 0);
        const secondTotal = fromCents(grandTotals.secondTotalCents || 0);
        const grandTotal = (firstTotal || 0) + (secondTotal || 0);
        const commissionTotal = fromCents(grandTotals.commissionCents || 0);
        const netTotal = fromCents(grandTotals.netCents || 0);

        const rows = [
          ["First Total", formatCurrency(firstTotal)],
          ["Second Total", formatCurrency(secondTotal)],
          ["Grand Total", formatCurrency(grandTotal)],
          ["Commission Total", formatCurrency(commissionTotal)],
          ["Net Total", formatCurrency(netTotal)],
        ];

        rows.forEach(([label, value]) => {
          // label cell
          doc.rect(tableX, tableY, colWidths[0], rowHeight);
          doc.text(label, tableX + 2, tableY + 5);
          // value cell
          doc.rect(tableX + colWidths[0], tableY, colWidths[1], rowHeight);
          doc.text(value, tableX + colWidths[0] + 2, tableY + 5);
          tableY += rowHeight;
        });
      } catch (e) {
        // ignore
      }

      doc.save("Voucher_Sheet_by_Sections_RLC.pdf");
      toast.success("Voucher PDF by sections downloaded successfully!");
  };

  const generateLedgerPDF = async () => {
  
      const fetchedEntries = await fetchVoucherData(drawDate, drawTime);
      if (fetchedEntries.length === 0) {
        toast("No Record found..");
        return;
      }
  
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.width;
  
      const allVoucherRows = (selectedDraw && selectedDraw._id)
        ? fetchedEntries.flatMap(entry => entry.data.map(item => ({ number: item.uniqueId, first: item.firstPrice, second: item.secondPrice })))
        : fetchedEntries
            .filter(entry => entry.timeSlot === drawTime)
            .flatMap(entry => entry.data.map(item => ({ number: item.uniqueId, first: item.firstPrice, second: item.secondPrice })));
  
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
  
      const drawHeaderLabel = getPdfDrawHeaderLabel({ includeTimeFallback: true });

      const addHeader = () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        const titleSuffix = prizeType && prizeType !== 'All' ? ` (${prizeType})` : "";
        doc.text(`Ledger Sheet${titleSuffix}`, pageWidth / 2, 15, { align: "center" });

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.text(`Dealer Name: ${selectedClientName}`, 14, 30);
        doc.text(`City: ${userData?.user.city}`, 14, 40);
        doc.text(`Draw: ${drawHeaderLabel}`, 14, 50);
        doc.text(`Winning Numbers: `, 14, 60);
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
  
      const updateWinningNumbers = (newWinningNumbers) => {
        setWinningNumbers(newWinningNumbers);
      };
  
      const grandTotals = {
        first: 0,
        second: 0,
        net: 0,
        commission: 0,
        payable: 0,
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

        // For reports: use the selected client's configuration when
        // distributor is generating a client ledger; otherwise fall
        // back to the logged-in user's config.
        const selectedClientConfig = clients.find(
          (c) => String(c._id) === String(selectedClient)
        );
        const baseUserConfig = role === 'user' ? userData?.user : (selectedClientConfig || userData?.user || {});

        if (title === "HINSA") {
          commissionRate = baseUserConfig.singleFigure;
          multiplier = Number(baseUserConfig.hinsaMultiplier ?? 0) || 0;
        } else if (title === "AKRA") {
          commissionRate = baseUserConfig.doubleFigure;
          multiplier = Number(baseUserConfig.akraMultiplier ?? 0) || 0;
        } else if (title === "TANDOLA") {
          commissionRate = baseUserConfig.tripleFigure;
          multiplier = Number(baseUserConfig.tandolaMultiplier ?? 0) || 0;
        } else if (title === "PANGORA") {
          commissionRate = baseUserConfig.fourFigure;
          multiplier = Number(baseUserConfig.pangoraMultiplier ?? 0) || 0;
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
            // Sum over ALL distinct winning numbers that match this entry,
            // so one entry (e.g. "12") can win for 129050 AND 122010.
            for (const winning of winningNumbers) {
              if (num === winning.number || checkPositionalMatch(num, winning.number)) {
                if (winning.type === "first") {
                  firstWinningAmount += f * multiplier;
                  // secondWinningAmount += s * multiplier;
                } else if (winning.type === "second" || winning.type === "third") {
                  // firstWinningAmount += (f * multiplier) / 3;
                  secondWinningAmount += (s * multiplier) / secondPrizeDivisor;
                }
              }
            }
          }
        });
  
        const totalWinningAmount = firstWinningAmount + secondWinningAmount;

        // compute commission for this section
        const commissionAmount = (net * (Number(commissionRate) || 0)) / 100;
        const netPayable = net - commissionAmount;

        grandTotals.first += totals.first;
        grandTotals.second += totals.second;
        grandTotals.net += net;
        grandTotals.commission += commissionAmount;
        grandTotals.payable += netPayable;
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
        doc.text(`First Total: ${formatCurrency(totals.first)}`, 14, y);
        doc.text(`Second Total: ${formatCurrency(totals.second)}`, 60, y);
        doc.text(`Total: ${formatCurrency(net)}`, 106, y);
        doc.text(`Commission (${commissionRate}%): ${formatCurrency(commissionAmount)}`, 140, y);
        y += 5;
        doc.text(`Net After Commission: ${formatCurrency(netPayable)}`, 14, y);
        y += 5;
        doc.text(`Prize Amount: ${formatCurrency(totalWinningAmount)}`, 14, y);
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
            // doc.text(title + " (continued...)", 14, 20);
  
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
            doc.text(formatCurrency(f), leftX + colWidths[0] + 1, currentY + 5);
            doc.rect(leftX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
            doc.text(formatCurrency(s), leftX + colWidths[0] + colWidths[1] + 1, currentY + 5);
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
            doc.text(formatCurrency(f), middleX + colWidths[0] + 1, currentY + 5);
            doc.rect(middleX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
            doc.text(formatCurrency(s), middleX + colWidths[0] + colWidths[1] + 1, currentY + 5);
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
            doc.text(formatCurrency(f), rightX + colWidths[0] + 1, currentY + 5);
            doc.rect(rightX + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight);
            doc.text(formatCurrency(s), rightX + colWidths[0] + colWidths[1] + 1, currentY + 5);
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
        y += rowHeight;
        drawRow(y, "Commission Total", -grandTotals.commission, 0, -grandTotals.commission);
        y += rowHeight;
        drawRow(y, "Net Payable", grandTotals.payable, 0, grandTotals.payable);
        y += rowHeight;
        drawRow(y, "Winning Amount", grandTotals.firstWinning, grandTotals.secondWinning, grandTotals.winningAmount);
      };
  
      addHeader();
      let nextY = 80;

      // Render only the sections matching the selected Prize Type.
      // Grand totals are also based only on rendered sections.
      if (prizeType === "All" || prizeType === "Hinsa") {
        nextY = renderSection("HINSA", hinsa, nextY);
      }
      if (prizeType === "All" || prizeType === "Akra") {
        nextY = renderSection("AKRA", akra, nextY);
      }
      if (prizeType === "All" || prizeType === "Tandola") {
        nextY = renderSection("TANDOLA", tandola, nextY);
      }
      if (prizeType === "All" || prizeType === "Pangora") {
        nextY = renderSection("PANGORA", pangora, nextY);
      }
      renderGrandTotals(nextY);
  
      doc.save("Ledger_Sheet_RLC.pdf");
      toast.success("Ledger PDF downloaded successfully!");
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
  const drawHeaderLabel = getPdfDrawHeaderLabel({ includeTimeFallback: false });
  doc.text(`Dealer: ${selectedClientName}`, 14, 30);
  doc.text(`City: ${userData?.user.city}`, 14, 40);
  doc.text(`Date: ${drawHeaderLabel}`, 14, 50);
  
      // Initialize grand totals for the day
      const dayGrandTotals = {
        first: 0,
        second: 0,
        net: 0,
        winningAmount: 0,
        firstWinning: 0,
        secondWinning: 0,
        commission: 0,
        hissa: 0,
        subTotal: 0,
      };
  
      // Group by time slot. If selectedDraw mode, aggregate all data under a single key
      const groupedByTimeSlot = {};
      if (selectedDraw && selectedDraw._id) {
        const key = selectedDraw.title || 'Draw';
        groupedByTimeSlot[key] = fetchedEntries.flatMap(entry => entry.data);
      } else {
        fetchedEntries.forEach(entry => {
          const slot = entry.timeSlot;
          if (!groupedByTimeSlot[slot]) groupedByTimeSlot[slot] = [];
          groupedByTimeSlot[slot].push(...entry.data);
        });
      }
  
      let y = 70;
      const rowHeight = 10;
      const colWidths = [40, 30, 30, 30, 30, 30, 30];
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
  
      // Adjusted columns: Draw Time | SALE | PRIZE | SAFI SALE | SUB TOTAL | Share | Bill
      doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2], y, colWidths[3], rowHeight);
      doc.text("SAFI SALE", x + colWidths[0] + colWidths[1] + colWidths[2] + 2, y + 7);

      doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y, colWidths[4], rowHeight);
      doc.text("SUB TOTAL", x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 2, y + 7);

      doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], y, colWidths[5], rowHeight);
      doc.text("Share (45%)", x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + 2, y + 7);

      doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], y, colWidths[6], rowHeight);
      doc.text("Bill", x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5] + 2, y + 7);
  
      y += rowHeight;
  
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
  
      // Calculate winning amounts helper function
      // Resolve multipliers from client/user config (same as ledger)
      const selectedClientConfig = clients.find(c => String(c._id) === String(selectedClient));
      const baseUserConfig = role === 'user' ? userData?.user : (selectedClientConfig || userData?.user || {});
      const multipliers = {
        HINSA: Number(baseUserConfig.hinsaMultiplier ?? 0) || 0,
        AKRA: Number(baseUserConfig.akraMultiplier ?? 0) || 0,
        TANDOLA: Number(baseUserConfig.tandolaMultiplier ?? 0) || 0,
        PANGORA: Number(baseUserConfig.pangoraMultiplier ?? 0) || 0,
      };

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
              // Sum over ALL distinct winning numbers that match this entry.
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
  
        const hinsaWinning = calculateSectionWinning(hinsa, multipliers.HINSA);
        const akraWinning = calculateSectionWinning(akra, multipliers.AKRA);
        const tandolaWinning = calculateSectionWinning(tandola, multipliers.TANDOLA);
        const pangoraWinning = calculateSectionWinning(pangora, multipliers.PANGORA);
  
        return hinsaWinning + akraWinning + tandolaWinning + pangoraWinning;
      };
  
      // Process each time slot
      Object.entries(groupedByTimeSlot).forEach(([timeSlot, entries]) => {
        const firstTotal = entries.reduce((sum, item) => sum + item.firstPrice, 0);
        const secondTotal = entries.reduce((sum, item) => sum + item.secondPrice, 0);
        const totalSale = firstTotal + secondTotal;
        const winningAmount = calculateWinningForTimeSlot(entries);

        // Determine client/user config and rates
        const selectedClientConfig = clients.find(c => String(c._id) === String(selectedClient));
        const baseConfig = role === 'user' ? userData?.user : (selectedClientConfig || userData?.user || {});
        const hissaShare = (Number(baseConfig.commission ?? 0) || 0) / 100; // e.g., 15 => 0.15
        const rates = {
          HINSA: Number(baseConfig.singleFigure || 0),
          AKRA: Number(baseConfig.doubleFigure || 0),
          TANDOLA: Number(baseConfig.tripleFigure || 0),
          PANGORA: Number(baseConfig.fourFigure || 0),
        };

        // categorize and sum per-section to compute commission
        const sectionSums = { HINSA: 0, AKRA: 0, TANDOLA: 0, PANGORA: 0 };
        entries.forEach(item => {
          const num = String(item.uniqueId || item.number || item.no || '');
          const f = Number(item.firstPrice ?? item.f ?? 0) || 0;
          const s = Number(item.secondPrice ?? item.s ?? 0) || 0;
          let cat = 'OTHER';
          if (/^\d{1}$/.test(num) || (num.includes('+') && num.length === 2) || (num.split('+').length - 1 === 2 && num.length === 3) || (num.split('+').length - 1 === 3 && num.length === 4)) cat = 'HINSA';
          else if (/^\d{2}$/.test(num) || (num.includes('+') && num.length <= 3) || (num.split('+').length - 1 === 2 && num.length === 4)) cat = 'AKRA';
          else if (/^\d{3}$/.test(num) || (num.length === 4 && num.includes('+'))) cat = 'TANDOLA';
          else if (/^\d{4}$/.test(num)) cat = 'PANGORA';
          if (cat in sectionSums) sectionSums[cat] += f + s;
        });

        const commission = Object.entries(sectionSums).reduce((acc, [k, v]) => acc + (v * (rates[k] || 0) / 100), 0);
        const safi = totalSale - commission;
        const subTotal = safi - (winningAmount || 0);
        const hissa = Math.max(0, (winningAmount || 0) - safi) * hissaShare;
        const shareAmount = hissa;
        const billAmount = safi - hissa;

        // Add to day totals
        dayGrandTotals.first += firstTotal;
        dayGrandTotals.second += secondTotal;
        dayGrandTotals.net += totalSale;
        dayGrandTotals.winningAmount += winningAmount;
        dayGrandTotals.commission += commission;
        dayGrandTotals.hissa += hissa;
        dayGrandTotals.subTotal += subTotal;

        // Draw row (updated positions): Draw Time | SALE | PRIZE | SAFI SALE | SUB TOTAL | Share | Bill
        doc.rect(x, y, colWidths[0], rowHeight);
        doc.text(timeSlot, x + 2, y + 7);

        doc.rect(x + colWidths[0], y, colWidths[1], rowHeight);
        doc.text(totalSale.toString(), x + colWidths[0] + 2, y + 7);

        doc.rect(x + colWidths[0] + colWidths[1], y, colWidths[2], rowHeight);
        doc.text(winningAmount.toFixed(2), x + colWidths[0] + colWidths[1] + 2, y + 7);

        // SAFI (sale - commission)
        doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2], y, colWidths[3], rowHeight);
        doc.text(safi.toFixed(2), x + colWidths[0] + colWidths[1] + colWidths[2] + 2, y + 7);

        // SUB TOTAL (safi - prize)
        doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y, colWidths[4], rowHeight);
        doc.text(subTotal.toFixed(2), x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 2, y + 7);

        // Hissa (share)
        doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], y, colWidths[5], rowHeight);
        doc.text(shareAmount.toFixed(2), x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + 2, y + 7);

        // Bill = safi - hissa
        doc.rect(x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], y, colWidths[6], rowHeight);
        doc.text(billAmount.toFixed(2), x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5] + 2, y + 7);

        y += rowHeight;
      });
  
      doc.save("Daily_Bill_RLC.pdf");
      toast.success("Daily Bill PDF downloaded successfully!");
  };

  // Compute daily bill values and keep in state for UI display
  const [dailyBill, setDailyBill] = useState(null);

  const computeDailyBill = async () => {
    const fetchedEntries = await fetchVoucherData(drawDate, drawTime);
    if (!Array.isArray(fetchedEntries) || fetchedEntries.length === 0) {
      toast('No records found for selected date');
      setDailyBill(null);
      return;
    }

    // Flatten all rows depending on draw selection
    let allRows = [];
    if (selectedDraw && selectedDraw._id) {
      allRows = fetchedEntries.flatMap(e => e.data.map(d => ({ ...d })));
    } else {
      fetchedEntries.forEach(e => { if (Array.isArray(e.data)) allRows.push(...e.data); });
    }

    // categorize helper
    const categorize = (num) => {
      if (/^\d{1}$/.test(num) || (num.includes('+') && num.length === 2) || (num.split('+').length - 1 === 2 && num.length === 3) || (num.split('+').length - 1 === 3 && num.length === 4)) return 'HINSA';
      if (/^\d{2}$/.test(num) || (num.includes('+') && num.length <= 3) || (num.split('+').length - 1 === 2 && num.length === 4)) return 'AKRA';
      if (/^\d{3}$/.test(num) || (num.length === 4 && num.includes('+'))) return 'TANDOLA';
      if (/^\d{4}$/.test(num)) return 'PANGORA';
      return 'OTHER';
    };

    const sections = { HINSA: [], AKRA: [], TANDOLA: [], PANGORA: [] };
    allRows.forEach(r => {
      const num = r.uniqueId || r.number || r.no || '';
      const first = Number(r.firstPrice ?? r.f ?? 0) || 0;
      const second = Number(r.secondPrice ?? r.s ?? 0) || 0;
      const cat = categorize(String(num));
      if (cat in sections) sections[cat].push([String(num), first, second]);
    });

    // Ensure we have the latest winning numbers (avoid stale state)
    const latestWinningNumbers = await getWinningNumbers(drawDate);
    const secondPrizeDivisor = selectedDraw?.category === 'GTL' ? 5 : 3;
    // computeSectionTotals now accepts the winningNumbers list to compute prizes
    const computeSectionTotals = (rows, multiplier, wn) => {
      const totals = rows.reduce((acc, [, f, s]) => { acc.first += f; acc.second += s; return acc; }, { first: 0, second: 0 });
      // compute winning amount for this section
      let firstWinning = 0, secondWinning = 0;
      rows.forEach(([num, f, s]) => {
        // Directly check matching against provided winning numbers (do not rely on getEntryColor/state)
        for (const winning of (wn || [])) {
          if (num === winning.number || checkPositionalMatch(num, winning.number)) {
            if (winning.type === 'first') firstWinning += f * multiplier;
            else if (winning.type === 'second' || winning.type === 'third') secondWinning += (s * multiplier) / secondPrizeDivisor;
          }
        }
      });
      return { totals, winning: firstWinning + secondWinning };
    };

    // Resolve client/user config for commission and multipliers
    const selectedClientConfig = clients.find(c => String(c._id) === String(selectedClient));
    const baseConfig = role === 'user' ? userData?.user : (selectedClientConfig || userData?.user || {});
    // Use user's `commission` field (percentage) as Hissa share. Default to 0 if not set.
    const hissaShare = (Number(baseConfig.commission ?? 0) || 0) / 100;
    const multipliers = {
      HINSA: Number(baseConfig.hinsaMultiplier ?? 0) || 0,
      AKRA: Number(baseConfig.akraMultiplier ?? 0) || 0,
      TANDOLA: Number(baseConfig.tandolaMultiplier ?? 0) || 0,
      PANGORA: Number(baseConfig.pangoraMultiplier ?? 0) || 0,
    };
    const rates = {
      HINSA: Number(baseConfig.singleFigure || 0),
      AKRA: Number(baseConfig.doubleFigure || 0),
      TANDOLA: Number(baseConfig.tripleFigure || 0),
      PANGORA: Number(baseConfig.fourFigure || 0),
    };

    const result = { rows: {}, totals: { first:0, second:0, sale:0, prize:0, commission:0, safi:0, hissa:0, subTotal:0 } };

    Object.entries(sections).forEach(([k, rows]) => {
      const multiplier = multipliers[k] || 1;
      const { totals, winning } = computeSectionTotals(rows, multiplier, latestWinningNumbers);
      const first = totals.first; const second = totals.second; const sale = first + second;
      const commission = (sale * (rates[k] || 0)) / 100;
      const safi = sale - commission;
      // Hissa = max(0, prize - safi) * hissaShare (use prize = winning)
      const hissa = Math.max(0, (winning || 0) - safi) * (Number(hissaShare) || 0);
      const subTotal = safi - (winning || 0);
      result.rows[k] = { first, second, sale, winning, commission, safi, hissa, subTotal };
      result.totals.first += first;
      result.totals.second += second;
      result.totals.sale += sale;
      result.totals.prize += winning;
      result.totals.commission += commission;
      // accumulate hissa per-type but final safi/hissa will be recomputed below
      result.totals.hissa += hissa;
      result.totals.subTotal += subTotal;
    });

    // Ensure safi is exactly total sale minus total commission (avoid per-type rounding drift)
    result.totals.safi = result.totals.sale - result.totals.commission;
    // Recompute total hissa based on aggregated safi and total prize
    result.totals.hissa = Math.max(0, (result.totals.prize || 0) - result.totals.safi) * (Number(hissaShare) || 0);
    // Recompute aggregated subTotal as aggregated safi minus aggregated prize
    result.totals.subTotal = result.totals.safi - result.totals.prize;

    setDailyBill(result);
  };

  // PDF export (simple)
  const handleDownloadPDF = async () => {
      // Prevent PDF generation while selected draw is still open
      // if (selectedDraw && drawRemainingMs != null && drawRemainingMs > 0) {
      //   toast('Selected draw is still open. PDF generation is disabled until the draw is closed.');
      //   return;
      // }

      if (ledger === "VOUCHER") {
        await generateVoucherPDF(undefined, prizeType);
      }
      else if (ledger === "LEDGER") {
        await generateLedgerPDF();
      }
      else if (ledger === "DAILY BILL") {
        await generateDailyBillPDF();
      }
      else if(ledger === "DEMAND"){
        await generateVoucherPDF("demand", prizeType);
      }
      else if(ledger === "OVER LIMIT"){
        await generateVoucherPDF("overlimit", prizeType);
      }
      else {
        toast.error("Please select a valid ledger type.");
  
      }
  };

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
  
  
  const saveOverLimit = async () => {
      if(isDemandOverlimit && role !== 'user' && !selectedClient){
        toast("Demand/Overlimit entries already exist for this draw time.");
        return;
      }
      try {
        await getAndSetVoucherData();
        console.log("first prizeLimit:", firstPrizeLimit);
        console.log("second prizeLimit:", secondPrizeLimit);
        const { demand, overlimit } = splitEntriesByLimit(entries, firstPrizeLimit, secondPrizeLimit);
        console.log("Demand Entries:", demand);
        console.log("Overlimit Entries:", overlimit);
        const token = localStorage.getItem("token");
    
        // Save demand entries
        if (demand.length > 0) {
          await axios.post(`/api/v1/data/add-overlimit-data?userId=${role === 'user' ? currentUserId : selectedClient}`, {
            timeSlot: drawTime,
            data: demand,
            category: "demand",
          }, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }
    
        // Save overlimit entries
        if (overlimit.length > 0) {
          await axios.post(`/api/v1/data/add-overlimit-data?userId=${role === 'user' ? currentUserId : selectedClient}`, {
            timeSlot: drawTime,
            data: overlimit,
            category: "overlimit",
          }, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }
    
        toast.success("Demand and Overlimit entries saved!");
        // await getAndSetVoucherData();
      } catch (error) {
        console.error("Error saving over limit:", error);
        toast.error("Failed to save overlimit/demand entries");
      }
    };

  return (
    <div className="bg-gray-900 text-white p-6 rounded-xl max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Client Reports</h2>
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div>
          <label className="block mb-1">Date</label>
          <input type="date" value={drawDate} onChange={e => setDrawDate(e.target.value)} className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600" />
        </div>
        <div>
          <label className="block mb-1">Select Draw</label>
          <select value={selectedDraw?._id || ""} onChange={e => {
            const id = e.target.value;
            const d = draws.find(x => String(x._id) === String(id)) || null;
            setSelectedDraw(d);
            if (d && d.draw_date) setDrawDate(new Date(d.draw_date).toISOString().split('T')[0]);
          }} className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600">
            <option value="">-- Select draw --</option>
            {draws.map(d => (
              <option key={d._id} value={d._id}>{formatDrawOptionLabel(d)}</option>
            ))}
          </select>
        </div>
        {/* Selected Draw info removed per request */}
        {/* Time selection removed: draw-level selection uses admin-managed draws now */}
        {role !== 'user' && (
          <div>
            <label className="block mb-1">Client</label>
            <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600">
              <option value="">Select Client</option>
              {clients.map(client => (
                <option key={client._id} value={client._id}>{client.username}</option>
              ))}
            </select>
          </div>
        )}
        <div>
            <label className="block mb-1">Report</label>
            <select
                className="bg-gray-700 text-gray-100 px-3 py-2 rounded-lg border border-gray-600 flex-1"
                value={ledger}
                onChange={(e) => setLedger(e.target.value)}
              >
              <option>LEDGER</option>
              <option>DAILY BILL</option>
              <option>VOUCHER</option>
            </select>
        </div>
        <div>
          <label className="block mb-1">Prize Type</label>
          <select value={prizeType} onChange={(e) => setPrizeType(e.target.value)} className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600">
            <option>All</option>
            <option>Hinsa</option>
            <option>Akra</option>
            <option>Tandola</option>
            <option>Pangora</option>
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={handleDownloadPDF} className="bg-green-600 px-4 py-2 rounded">Download</button>
        </div>
        <div className="flex items-end">
          {ledger === 'DAILY BILL' && (
            <button onClick={computeDailyBill} className="ml-2 bg-blue-600 px-4 py-2 rounded">Compute Daily Bill</button>
          )}
        </div>
      </div>
      {/* Daily Bill UI */}
      {ledger === 'DAILY BILL' && dailyBill && (
        <div className="mt-4 bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold mb-2">Daily Bill Summary ({drawDate})</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-300">
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">First Sale</th>
                  <th className="px-3 py-2">Second Sale</th>
                  <th className="px-3 py-2">Total Sale</th>
                  <th className="px-3 py-2">Prize Amount</th>
                  <th className="px-3 py-2">Safi Sale</th>
                  <th className="px-3 py-2">Sub Total</th>
                  <th className="px-3 py-2">Commission</th>
                  <th className="px-3 py-2">Hissa</th>
                </tr>
              </thead>
              <tbody>
                {['HINSA','AKRA','TANDOLA','PANGORA'].map(k => {
                  const r = dailyBill.rows[k] || { first:0, second:0, sale:0, winning:0, commission:0, safi:0, hissa:0 };
                  return (
                    <tr key={k} className="border-t border-gray-700">
                      <td className="px-3 py-2 font-semibold">{k}</td>
                      <td className="px-3 py-2">{formatCurrency(r.first)}</td>
                      <td className="px-3 py-2">{formatCurrency(r.second)}</td>
                      <td className="px-3 py-2">{formatCurrency(r.sale)}</td>
                      <td className="px-3 py-2">{formatCurrency(r.winning)}</td>
                      <td className="px-3 py-2">{formatCurrency(r.safi)}</td>
                      <td className="px-3 py-2">{formatCurrency(r.subTotal || (r.safi - (r.winning || 0)))}</td>
                      <td className="px-3 py-2">{formatCurrency(r.commission)}</td>
                      <td className="px-3 py-2">{formatCurrency(r.hissa)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-gray-600 font-semibold text-gray-200">
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2">{formatCurrency(dailyBill.totals.first)}</td>
                  <td className="px-3 py-2">{formatCurrency(dailyBill.totals.second)}</td>
                  <td className="px-3 py-2">{formatCurrency(dailyBill.totals.sale)}</td>
                  <td className="px-3 py-2">{formatCurrency(dailyBill.totals.prize)}</td>
                  <td className="px-3 py-2">{formatCurrency(dailyBill.totals.safi)}</td>
                  <td className="px-3 py-2">{formatCurrency(dailyBill.totals.subTotal)}</td>
                  <td className="px-3 py-2">{formatCurrency(dailyBill.totals.commission)}</td>
                  <td className="px-3 py-2">{formatCurrency(dailyBill.totals.hissa)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* {loading ? <div>Loading...</div> : (
        <>
          <div className="bg-gray-800 rounded p-4">
            <h3 className="text-lg font-semibold mb-2">Entries</h3>
            {entries.length === 0 ? <div>No data found</div> : (
              <ul className="space-y-2">
                {entries.map((entry, idx) => (
                  <li key={entry.objectId || idx} className="border-b border-gray-700 pb-2">
                    <div className="font-bold">{idx + 1}. {entry.no}</div>
                    <div className="text-sm text-gray-300">F: {entry.f} &nbsp; S: {entry.s}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )} */}

      {/* <div className="text-lg font-semibold flex items-center space-x-2">
        <input
          type="checkbox"
          checked={enablePrizeFilter}
          onChange={(e) => setEnablePrizeFilter(e.target.checked)}
          className="w-4 h-4"
        />
        <span>Enable Prize Filter</span>
      </div> */}

      {/* Prize Limit Inputs - Only show when filter is enabled */}
      {enablePrizeFilter && (
        <div className="space-y-2 bg-gray-700 p-3 rounded-lg border border-gray-600">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium min-w-[100px]">First Prize Limit:</label>
            <input
              type="number"
              value={firstPrizeLimit}
              onChange={(e) => setFirstPrizeLimit(Number(e.target.value))}
              className="bg-gray-600 text-white px-2 py-1 rounded border border-gray-500 flex-1"
              placeholder="Enter limit"
              min="0"
            />
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium min-w-[100px]">Second Prize Limit:</label>
            <input
              type="number"
              value={secondPrizeLimit}
              onChange={(e) => setSecondPrizeLimit(Number(e.target.value))}
              className="bg-gray-600 text-white px-2 py-1 rounded border border-gray-500 flex-1"
              placeholder="Enter limit"
              min="0"
            />
          </div>
          <div className="text-xs float-end">
            <button className='bg-blue-600 px-4 py-2 rounded-md' onClick={saveOverLimit}>Save</button>
          </div>
          <div className="text-xs text-gray-400">
            * Only entries with prizes below these limits will be included
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
