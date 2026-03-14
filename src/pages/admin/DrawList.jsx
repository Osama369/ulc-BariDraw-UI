import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useDispatch } from 'react-redux';
import { showLoading, hideLoading } from '../../redux/features/alertSlice';
import toast from 'react-hot-toast';

const initialForm = {
  title: '',
  category: 'GTL',
  draw_date: '',
  draw_time: '12:00',
  city: '',
  isActive: true,
  prize: '',
};

const DrawList = () => {
  const [draws, setDraws] = useState([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const dispatch = useDispatch();
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [remainingMap, setRemainingMap] = useState({});

  const fetchDraws = async () => {
    setLoadingLocal(true);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await axios.get('/api/v1/draws', {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      });
      setDraws(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('fetchDraws error', err?.message || err);
      // don't show global loading spinner here; show toast and present empty list
      toast.error(err.response?.data?.message || 'Failed to load draws');
      setDraws([]);
    } finally {
      setLoadingLocal(false);
    }
  };

  useEffect(() => {
    fetchDraws();
  }, []);

  // initialize remainingMap whenever draws change
  useEffect(() => {
    const map = {};
    const now = Date.now();
    draws.forEach(d => {
      const sourceMs = typeof d.remainingMs === 'number' ? d.remainingMs : Math.max(new Date(d.draw_date).getTime() - now, 0);
      map[d._id] = sourceMs;
    });
    setRemainingMap(map);
  }, [draws]);

  // tick down every second
  useEffect(() => {
    const t = setInterval(() => {
      setRemainingMap(prev => {
        const next = {};
        let changed = false;
        Object.keys(prev).forEach(k => {
          const v = Math.max(prev[k] - 1000, 0);
          next[k] = v;
          if (v !== prev[k]) changed = true;
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const formatRemaining = (ms) => {
    if (ms <= 0) return 'Expired';
    const total = Math.floor(ms / 1000);
    const days = Math.floor(total / (24 * 3600));
    const hours = Math.floor((total % (24 * 3600)) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    // Format: 4d : 12h : 19m : 48s (always include days/hours/minutes/seconds)
    return `${days}d : ${pad(hours)}h : ${pad(minutes)}m : ${pad(seconds)}s`;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    // If category changed to GTL, clear the city field
    if (name === 'category') {
      if (value === 'GTL') {
        setForm((prev) => ({ ...prev, category: value, city: '' }));
        return;
      }
      setForm((prev) => ({ ...prev, [name]: value }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // basic validation
    if (!form.title || !form.draw_date) {
      toast.error('Please provide title and draw date');
      return;
    }

    try {
      dispatch(showLoading());
      const token = localStorage.getItem('adminToken');

      // combine date + time into ISO-like string for backend
      const payload = { ...form };
      if (form.draw_date) {
        // form.draw_time expected as HH:MM
        const timePart = form.draw_time || '12:00';
        // create ISO string local timezone (YYYY-MM-DDTHH:MM:00)
        payload.draw_date = `${form.draw_date}T${timePart}:00`;
      }

      if (editingId) {
        const res = await axios.patch(`/api/v1/draws/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDraws((prev) => prev.map(d => d._id === editingId ? res.data : d));
        toast.success('Draw updated');
      } else {
        const res = await axios.post('/api/v1/draws', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDraws((prev) => [res.data, ...prev]);
        toast.success('Draw created');
      }

      setForm(initialForm);
      setEditingId(null);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to save draw');
    } finally {
      dispatch(hideLoading());
    }
  };

  const handleEdit = (draw) => {
    setEditingId(draw._id);
    setForm({
      title: draw.title || '',
      category: draw.category || 'GTL',
      draw_date: draw.draw_date ? draw.draw_date.split('T')[0] : '',
      draw_time: draw.draw_date ? (draw.draw_date.split('T')[1] || '12:00:00').slice(0,5) : '12:00',
      city: draw.city || '',
      isActive: !!draw.isActive,
      prize: draw.prize != null ? String(draw.prize) : '',
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this draw?')) return;
    try {
      dispatch(showLoading());
      const token = localStorage.getItem('adminToken');
      await axios.delete(`/api/v1/draws/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDraws((prev) => prev.filter(d => d._id !== id));
      toast.success('Deleted');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to delete');
    } finally {
      dispatch(hideLoading());
    }
  };

  const expireNow = async (id) => {
    if (!window.confirm('Expire this draw now?')) return;
    try {
      dispatch(showLoading());
      const token = localStorage.getItem('adminToken');
      const res = await axios.patch(`/api/v1/draws/${id}`, { isExpired: true }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDraws((prev) => prev.map(d => d._id === id ? res.data : d));
      setRemainingMap((prev) => ({ ...prev, [id]: 0 }));
      toast.success('Draw expired');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to expire draw');
    } finally {
      dispatch(hideLoading());
    }
  };

  const toggleActive = async (id) => {
    try {
      dispatch(showLoading());
      const token = localStorage.getItem('adminToken');
      const draw = draws.find(d => d._id === id);
      if (!draw) return;
      const res = await axios.patch(`/api/v1/draws/${id}`, { isActive: !draw.isActive }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDraws((prev) => prev.map(d => d._id === id ? res.data : d));
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to update');
    } finally {
      dispatch(hideLoading());
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">Draws</h2>
        <div>
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded"
            onClick={() => { setForm(initialForm); setEditingId(null); }}
          >
            New Draw
          </button>
        </div>
      </div>

      <form className="bg-white p-4 rounded shadow mb-6" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm">Title</label>
            <input name="title" value={form.title} onChange={handleChange} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm">Category</label>
            <select name="category" value={form.category} onChange={handleChange} className="w-full border p-2 rounded">
              <option value="GTL">GTL</option>
              <option value="PAKISTAN">PAKISTAN</option>
            </select>
          </div>
          <div>
            <label className="block text-sm">Draw Date</label>
            <div className="flex gap-2">
              <input type="date" name="draw_date" value={form.draw_date} onChange={handleChange} className="w-full border p-2 rounded" />
              <input type="time" name="draw_time" value={form.draw_time} onChange={handleChange} className="w-32 border p-2 rounded" />
            </div>
          </div>
          <div>
            <label className="block text-sm">City</label>
            <input name="city" value={form.city} onChange={handleChange} className="w-full border p-2 rounded" disabled={form.category === 'GTL'} />
          </div>
          <div>
            <label className="block text-sm">Prize (for PAKISTAN)</label>
            <input
              name="prize"
              type="number"
              step="0.01"
              value={form.prize}
              onChange={handleChange}
              className="w-full border p-2 rounded"
              disabled={form.category !== 'PAKISTAN'}
              placeholder={form.category === 'PAKISTAN' ? 'Enter bond prize' : 'N/A for GTL'}
            />
          </div>
          <div className="flex items-center gap-2">
            <input id="isActive" type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} />
            <label htmlFor="isActive" className="text-sm">Active</label>
          </div>
        </div>

        <div className="mt-4">
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded mr-2">{editingId ? 'Update' : 'Create'}</button>
          <button type="button" className="bg-gray-200 px-4 py-2 rounded" onClick={() => { setForm(initialForm); setEditingId(null); }}>Cancel</button>
        </div>
      </form>

      <div className="bg-white rounded shadow">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm">Filter:</label>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="border p-2 rounded">
              <option value="ALL">All</option>
              <option value="GTL">GTL</option>
              <option value="PAKISTAN">PAKISTAN</option>
            </select>
          </div>
          <div>
            <button className="bg-gray-100 px-3 py-1 rounded" onClick={fetchDraws}>Refresh</button>
          </div>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm">Title</th>
              <th className="px-4 py-2 text-left text-sm">Category</th>
              <th className="px-4 py-2 text-left text-sm">Draw Date</th>
              <th className="px-4 py-2 text-left text-sm">Expires In</th>
              <th className="px-4 py-2 text-left text-sm">City</th>
              <th className="px-4 py-2 text-left text-sm">Prize</th>
              <th className="px-4 py-2 text-left text-sm">Active</th>
              <th className="px-4 py-2 text-sm">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loadingLocal ? (
              <tr><td colSpan={7} className="p-4 text-center">Loading...</td></tr>
            ) : (() => {
              const filtered = filterCategory === 'ALL' ? draws : draws.filter(x => x.category === filterCategory);
              return filtered && filtered.length > 0 ? (
                filtered.map(d => (
                <tr key={d._id} className="border-t">
                  <td className="px-4 py-2">{d.title}</td>
                  <td className="px-4 py-2">{d.category}</td>
                    <td className="px-4 py-2">{d.draw_date ? d.draw_date.split('T')[0] : ''}</td>
                    <td className="px-4 py-2">{formatRemaining(remainingMap[d._id] ?? (d.remainingMs ?? 0))}</td>
                  <td className="px-4 py-2">{d.city}</td>
                  <td className="px-4 py-2">{d.category === 'PAKISTAN' && d.prize != null ? d.prize : '-'}</td>
                    <td className="px-4 py-2">{d.isActive ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2">
                    <button className="text-blue-600 mr-2" onClick={() => handleEdit(d)}>Edit</button>
                    {!d.isExpired && (
                      <button className="text-red-500 mr-2" onClick={() => expireNow(d._id)}>Expire Now</button>
                    )}
                    <button className="text-yellow-600 mr-2" onClick={() => toggleActive(d._id)}>{d.isActive ? 'Deactivate' : 'Activate'}</button>
                    <button className="text-red-600" onClick={() => handleDelete(d._id)}>Delete</button>
                  </td>
                </tr>
                ))
              ) : (
                <tr><td colSpan={7} className="p-4 text-center text-sm text-gray-600">No draws found.</td></tr>
              );
            })()
            }
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DrawList;
