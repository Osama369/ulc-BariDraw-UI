import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';

const Emails = () => {
  const userData = useSelector((s) => s.user);
  const [draws, setDraws] = useState([]);
  const [parties, setParties] = useState([]);
  const [selectedDraw, setSelectedDraw] = useState('');
  const [selectedParty, setSelectedParty] = useState('');
  const [archives, setArchives] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('archives'); // 'archives' | 'demand'

  // Demand/reset state
  const [demandPrizeType, setDemandPrizeType] = useState('Hinsa');
  const [demandDocs, setDemandDocs] = useState([]);
  const [demandLoading, setDemandLoading] = useState(false);

  useEffect(() => {
    const fetchDraws = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/v1/draws', { headers: { Authorization: token ? `Bearer ${token}` : undefined } });
        setDraws(res.data.draws || res.data || []);
      } catch (err) {
        console.error('Failed to fetch draws', err);
        setDraws([]);
      }
    };

    const fetchParties = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/v1/users/distributor-parties', { headers: { Authorization: token ? `Bearer ${token}` : undefined } });
        setParties(res.data || []);
      } catch (err) {
        // not critical
        setParties([]);
      }
    };

    fetchDraws();
    fetchParties();
  }, []);

  const loadArchives = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = {};
      if (selectedDraw) params.drawId = selectedDraw;
      if (selectedParty) params.partyId = selectedParty;
      const res = await axios.get('/api/v1/archives', { params, headers: { Authorization: token ? `Bearer ${token}` : undefined } });
      setArchives(res.data.archives || []);
    } catch (err) {
      console.error('Failed to load archives', err);
      toast.error('Failed to load archives');
    } finally {
      setLoading(false);
    }
  };

  const loadDemand = async () => {
    if (!selectedDraw || !selectedParty) {
      setDemandDocs([]);
      return;
    }
    try {
      setDemandLoading(true);
      const token = localStorage.getItem('token');
      const params = {
        drawId: selectedDraw,
        userId: selectedParty,
        category: 'demand',
      };
      if (demandPrizeType) params.prizeType = demandPrizeType;
      const res = await axios.get('/api/v1/data/get-client-data', {
        params,
        headers: { Authorization: token ? `Bearer ${token}` : undefined },
      });
      setDemandDocs(res.data.data || []);
    } catch (err) {
      console.error('Failed to load demand', err);
      setDemandDocs([]);
      const msg = err?.response?.data?.error || 'No demand data found for selection';
      toast.error(msg);
    } finally {
      setDemandLoading(false);
    }
  };

  const handleResetDemand = async () => {
    if (!selectedDraw || !selectedParty) {
      return toast.error('Select draw and party first');
    }
    const ok = window.confirm('Delete all demand records for this draw, party and prize type?');
    if (!ok) return;
    try {
      setDemandLoading(true);
      const token = localStorage.getItem('token');
      await axios.post('/api/v1/data/delete-demand-for-client', {
        drawId: selectedDraw,
        userId: selectedParty,
        prizeType: demandPrizeType,
      }, {
        headers: { Authorization: token ? `Bearer ${token}` : undefined },
      });
      toast.success('Demand reset successfully');
      setDemandDocs([]);
    } catch (err) {
      console.error('Failed to reset demand', err);
      toast.error(err?.response?.data?.error || 'Failed to reset demand');
    } finally {
      setDemandLoading(false);
    }
  };

  const handleDownload = async (archive) => {
    if (!archive || !archive._id) return toast.error('No archive selected');
    const token = userData?.token || localStorage.getItem('token');
    if (!token) return toast.error('No token provided. Please sign in to download.');
    try {
      const res = await axios.get(`/api/v1/archives/${archive._id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });

      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/zip' });
      let filename = `${archive._id}.zip`;
      const disposition = res.headers['content-disposition'] || res.headers['Content-Disposition'];
      if (disposition) {
        const match = disposition.match(/filename\*?=([^;]+)/);
        if (match) {
          filename = match[1].replace(/UTF-8''/, '').replace(/"/g, '').trim();
        }
      } else if (archive.fileName) {
        filename = archive.fileName;
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
      console.error('Download failed', err);
      const message = err?.response?.data?.error || err?.response?.data || err.message || 'Failed to download archive';
      toast.error(message);
    }
  };

  useEffect(() => {
    // load when filters change
    loadArchives();
    if (activeTab === 'demand') {
      loadDemand();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDraw, selectedParty, activeTab]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this archived email? This will remove the file and unlock related data.')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/v1/archives/${id}`, { headers: { Authorization: token ? `Bearer ${token}` : undefined } });
      toast.success('Archive deleted');
      setArchives((prev) => prev.filter(a => String(a._id) !== String(id)));
    } catch (err) {
      console.error('Delete failed', err);
      toast.error('Failed to delete archive');
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Emails</h2>

      <div className="flex gap-4 mb-4">
        <button
          className={`px-3 py-1 rounded ${activeTab === 'archives' ? 'bg-blue-600' : 'bg-gray-700'}`}
          onClick={() => setActiveTab('archives')}
        >
          Archives
        </button>
        <button
          className={`px-3 py-1 rounded ${activeTab === 'demand' ? 'bg-blue-600' : 'bg-gray-700'}`}
          onClick={() => setActiveTab('demand')}
        >
          Demand
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm">Select Draw</label>
          <select className="bg-gray-800 p-2 rounded w-full" value={selectedDraw} onChange={(e) => setSelectedDraw(e.target.value)}>
            <option value="">All draws</option>
            {draws.map(d => (
              <option key={d._id} value={d._id}>{d.title ? `${d.title} - ${d.draw_date ? new Date(d.draw_date).toLocaleDateString() : ''}` : (d.draw_date ? new Date(d.draw_date).toLocaleDateString() : '')}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm">Select Party</label>
          <select className="bg-gray-800 p-2 rounded w-full" value={selectedParty} onChange={(e) => setSelectedParty(e.target.value)}>
            <option value="">All parties</option>
            {parties.map(p => (
              <option key={p._id} value={p._id}>{p.username} {p.partyCode ? `(${p.partyCode})` : ''}</option>
            ))}
          </select>
        </div>

        <div>
          {activeTab === 'demand' && (
            <>
              <label className="block text-sm">Prize Type</label>
              <select
                className="bg-gray-800 p-2 rounded w-full mb-2"
                value={demandPrizeType}
                onChange={(e) => setDemandPrizeType(e.target.value)}
              >
                <option value="Hinsa">Hinsa</option>
                <option value="Akra">Akra</option>
                <option value="Tandola">Tandola</option>
                <option value="Pangora">Pangora</option>
              </select>
              <div className="flex items-end gap-2">
                <button className="bg-blue-600 px-4 py-2 rounded" onClick={loadDemand} disabled={demandLoading}>
                  {demandLoading ? 'Loading...' : 'Load Demand'}
                </button>
                <button className="bg-red-600 px-4 py-2 rounded" onClick={handleResetDemand} disabled={demandLoading}>
                  Reset Demand
                </button>
              </div>
            </>
          )}
          {activeTab === 'archives' && (
            <div className="flex items-end h-full">
              <button className="bg-blue-600 px-4 py-2 rounded" onClick={loadArchives}>Refresh</button>
            </div>
          )}
        </div>
      </div>
      {activeTab === 'archives' && (
        <div className="bg-gray-800 rounded p-4">
          {loading ? <div>Loading...</div> : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-gray-300">
                  <th className="pb-2">File</th>
                  <th className="pb-2">Invoice No</th>
                  <th className="pb-2">Draw</th>
                  <th className="pb-2">Party</th>
                  <th className="pb-2">Records</th>
                  <th className="pb-2">Created</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archives.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-gray-400">No archived emails found.</td></tr>
                )}
                {archives.map(a => (
                  <tr key={a._id} className="border-t border-gray-700">
                    <td className="py-2">{a.fileName}</td>
                    <td className="py-2">{typeof a.invoiceNo !== 'undefined' && a.invoiceNo !== null ? a.invoiceNo : '—'}</td>
                    <td className="py-2">{a.drawId ? (draws.find(d => String(d._id) === String(a.drawId))?.title || a.drawId) : '—'}</td>
                    <td className="py-2">{a.partyId ? (parties.find(p => String(p._id) === String(a.partyId))?.username || a.partyId) : '—'}</td>
                    <td className="py-2">{a.recordCount || 0}</td>
                    <td className="py-2">{a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}</td>
                    <td className="py-2">
                      <button className="text-blue-400 mr-3" onClick={() => handleDownload(a)}>Download</button>
                      <button className="text-red-400" onClick={() => handleDelete(a._id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'demand' && (
        <div className="bg-gray-800 rounded p-4 mt-4">
          {demandLoading && demandDocs.length === 0 ? (
            <div>Loading...</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-gray-300">
                  <th className="pb-2">Doc Id</th>
                  <th className="pb-2">Entries</th>
                  <th className="pb-2">Prize Type</th>
                  <th className="pb-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {demandDocs.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-gray-400">No demand documents for selection.</td></tr>
                )}
                {demandDocs.map(d => (
                  <tr key={d._id} className="border-t border-gray-700">
                    <td className="py-2">{d._id}</td>
                    <td className="py-2">{Array.isArray(d.data) ? d.data.length : 0}</td>
                    <td className="py-2">{d.prizeType || '—'}</td>
                    <td className="py-2">{d.date ? new Date(d.date).toLocaleString() : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default Emails;
