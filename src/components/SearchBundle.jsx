import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { isDrawVisibleForHistory, formatDrawOptionLabel } from '../utils/drawVisibility';
import { useDrawsAutoSync } from '../hooks/useDrawsAutoSync';

const SearchBundle = () => {
  const userData = useSelector((state) => state.user);
  const role = userData?.user?.role || localStorage.getItem('role') || 'user';
  const token = userData?.token || localStorage.getItem('token');

  const [selectedDraw, setSelectedDraw] = useState('');
  const [bundleNo, setBundleNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

  const { draws } = useDrawsAutoSync({
    tokenCandidates: [token, localStorage.getItem('token'), localStorage.getItem('adminToken')],
    filterFn: isDrawVisibleForHistory,
    pollMs: 5000,
  });

  useEffect(() => {
    if (!selectedDraw) return;
    const exists = draws.some((d) => String(d._id) === String(selectedDraw));
    if (!exists) {
      setSelectedDraw('');
      toast('Selected draw changed. Please reselect draw.');
    }
  }, [draws, selectedDraw]);

  const handleSearch = async () => {
    if (!selectedDraw) return toast.error('Select draw first');
    if (!bundleNo.trim()) return toast.error('Enter NO / Bundle');
    if (!token) return toast.error('Please login again');

    try {
      setLoading(true);
      const res = await axios.get('/api/v1/data/search-bundle', {
        params: {
          drawId: selectedDraw,
          no: bundleNo.trim(),
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setResults(res.data.data || []);
      if (!(res.data.data || []).length) {
        toast('No matching entries found');
      }
    } catch (err) {
      console.error('search bundle failed', err);
      toast.error(err?.response?.data?.error || 'Failed to search bundle');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const isDistributor = role === 'distributor';

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Search Bundle</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Select Draw</label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2"
            value={selectedDraw}
            onChange={(e) => setSelectedDraw(e.target.value)}
          >
            <option value="">-- Select Draw --</option>
            {draws.map((d) => (
              <option key={d._id} value={d._id}>
                {formatDrawOptionLabel(d)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">NO / Bundle</label>
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2"
            value={bundleNo}
            onChange={(e) => setBundleNo(e.target.value)}
            placeholder="Enter bundle number"
          />
        </div>

        <div className="flex items-end">
          <button
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded w-full md:w-auto"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      <div className="bg-gray-800 rounded p-4 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="text-gray-300 border-b border-gray-700">
              <th className="py-2">NO</th>
              <th className="py-2">F</th>
              <th className="py-2">S</th>
              {isDistributor && <th className="py-2">DealerId</th>}
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={isDistributor ? 4 : 3} className="py-4 text-gray-400">No results</td>
              </tr>
            ) : (
              results.map((r) => (
                <tr key={`${r.docId}-${r.entryId || r.no}-${r.clientId}`} className="border-b border-gray-700">
                  <td className="py-2">{r.no}</td>
                  <td className="py-2">{r.firstPrice}</td>
                  <td className="py-2">{r.secondPrice}</td>
                  {isDistributor && (
                    <td className="py-2">
                      {`${r.clientDisplayId || r.clientDealerId || r.clientId || '-'} / ${r.clientUsername || '-'}`}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SearchBundle;
