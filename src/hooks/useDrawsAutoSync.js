import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

const normalizeAuthToken = (raw) => {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  const t = /^bearer\s+/i.test(s) ? s.replace(/^bearer\s+/i, '').trim() : s;
  if (!t || t === 'null' || t === 'undefined') return null;
  if (t.split('.').length !== 3) return null;
  return t;
};

const buildDrawSignature = (draws) => {
  if (!Array.isArray(draws)) return '';

  // Keep signature focused on visibility/identity metadata.
  // Excludes remainingMs to avoid periodic re-renders without status changes.
  return draws
    .map((d) => [
      d?._id || '',
      d?.isActive ? '1' : '0',
      d?.isExpired ? '1' : '0',
      d?.draw_date || '',
      d?.updatedAt || '',
      d?.title || '',
      d?.category || '',
      d?.serialNo || '',
      d?.drawNo || '',
      d?.serialNoDisplay || '',
      d?.city || '',
    ].join('|'))
    .sort()
    .join('~');
};

export const useDrawsAutoSync = ({
  tokenCandidates = [],
  filterFn = null,
  pollMs = 5000,
  enabled = true,
}) => {
  const [draws, setDraws] = useState([]);
  const [loadingDraws, setLoadingDraws] = useState(false);

  const signatureRef = useRef('');
  const initializedRef = useRef(false);
  const tokenCandidatesRef = useRef(tokenCandidates);

  const tokenKey = (tokenCandidates || [])
    .map((x) => String(x ?? ''))
    .join('||');

  useEffect(() => {
    tokenCandidatesRef.current = tokenCandidates;
  }, [tokenKey]);

  const fetchDraws = useCallback(async ({ silent = true } = {}) => {
    if (!enabled) return;

    const authToken = (tokenCandidatesRef.current || []).map(normalizeAuthToken).find(Boolean);
    if (!authToken) {
      if (signatureRef.current !== '__NO_TOKEN__') {
        signatureRef.current = '__NO_TOKEN__';
        setDraws([]);
      }
      return;
    }

    if (!silent && !initializedRef.current) {
      setLoadingDraws(true);
    }

    try {
      const res = await axios.get('/api/v1/draws', {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      const allDraws = res.data.draws || res.data || [];
      const filtered = typeof filterFn === 'function' ? allDraws.filter(filterFn) : allDraws;
      const nextSignature = buildDrawSignature(filtered);

      if (nextSignature !== signatureRef.current) {
        signatureRef.current = nextSignature;
        setDraws(filtered);
      }

      initializedRef.current = true;
    } catch (err) {
      if (signatureRef.current !== '__FETCH_ERROR__') {
        signatureRef.current = '__FETCH_ERROR__';
        setDraws([]);
      }
    } finally {
      setLoadingDraws(false);
    }
  }, [enabled, filterFn]);

  useEffect(() => {
    if (!enabled) return undefined;

    fetchDraws({ silent: false });

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchDraws({ silent: true });
      }
    }, Math.max(3000, pollMs));

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDraws({ silent: true });
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, fetchDraws, pollMs, tokenKey]);

  return {
    draws,
    loadingDraws,
    refetchDraws: fetchDraws,
  };
};
