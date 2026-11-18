import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useDispatch } from 'react-redux';
import { showLoading, hideLoading } from '../../redux/features/alertSlice';
import toast from 'react-hot-toast';

const initialForm = {
  title: '',
  category: 'GTL',
  serialNo: '',
  drawNo: '',
  draw_date: '',
  draw_time: '12:00',
  city: '',
  isActive: true,
  prize: '',
};

// Value for <input type="datetime-local"> in the browser's own time zone.
const toLocalInput = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const reopenPresets = () => {
  const now = Date.now();
  const tonight = new Date();
  tonight.setHours(23, 59, 0, 0);
  const list = [
    { label: '2 hours', value: new Date(now + 2 * 3600 * 1000) },
    { label: '6 hours', value: new Date(now + 6 * 3600 * 1000) },
    { label: '24 hours', value: new Date(now + 24 * 3600 * 1000) },
  ];
  if (tonight.getTime() - now > 30 * 60 * 1000) list.unshift({ label: 'Till 11:59 PM tonight', value: tonight });
  return list;
};

const formatDateTime = (value) => (value
  ? new Date(value).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '');

const DrawList = () => {
  const [draws, setDraws] = useState([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const dispatch = useDispatch();
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [remainingMap, setRemainingMap] = useState({});
  // { draw, until } while the Reopen box is open
  const [reopenBox, setReopenBox] = useState(null);
  const [reopenBusy, setReopenBusy] = useState(false);

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

  const formatSerialDisplay = (value) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return '';
    return String(n).padStart(2, '0');
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    // If category changed to GTL, clear the city field
    if (name === 'category') {
      if (value === 'GTL') {
        setForm((prev) => ({ ...prev, category: value, city: '', drawNo: '' }));
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
    if (form.category === 'PAKISTAN' && (!form.drawNo || !Number.isInteger(Number(form.drawNo)) || Number(form.drawNo) <= 0)) {
      toast.error('Draw No is required for PAKISTAN and must be a positive integer');
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
      // Serial No is auto-managed by backend (year-wise sequence)
      delete payload.serialNo;
      if (form.category === 'PAKISTAN') {
        payload.drawNo = Number(form.drawNo);
      } else {
        delete payload.drawNo;
        delete payload.prize;
        delete payload.city;
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
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to save draw');
    } finally {
      dispatch(hideLoading());
    }
  };

  const handleEdit = (draw) => {
    setEditingId(draw._id);
    setForm({
      title: draw.title || '',
      category: draw.category || 'GTL',
      serialNo: draw.serialNo != null ? String(draw.serialNo) : '',
      drawNo: draw.drawNo != null ? String(draw.drawNo) : '',
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

  const applyDrawUpdate = (updated) => {
    setDraws((prev) => prev.map(d => d._id === updated._id ? updated : d));
    setRemainingMap((prev) => ({ ...prev, [updated._id]: updated.remainingMs ?? 0 }));
  };

  const openReopenBox = (draw) => {
    const first = reopenPresets()[0].value;
    setReopenBox({ draw, until: toLocalInput(first) });
  };

  const saveReopen = async (draw, until) => {
    setReopenBusy(true);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await axios.patch(`/api/v1/draws/${draw._id}/reopen`, { until }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      applyDrawUpdate(res.data);
      setReopenBox(null);
      toast.success(until
        ? `Draw reopened until ${formatDateTime(res.data.reopenUntil)}`
        : 'Draw closed again');
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to update the draw');
    } finally {
      setReopenBusy(false);
    }
  };

  const submitReopen = () => {
    if (!reopenBox?.until) return toast.error('Pick a time to keep the draw open until.');
    const until = new Date(reopenBox.until);
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      return toast.error('The reopen time must be in the future.');
    }
    saveReopen(reopenBox.draw, until.toISOString());
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm">#Serial NO</label>
            <input
              value={formatSerialDisplay(form.serialNo)}
              readOnly
              className="w-full border p-2 rounded bg-gray-100 text-gray-700"
              placeholder=""
            />
          </div>
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

          {form.category === 'PAKISTAN' && (
            <div>
              <label className="block text-sm">Prize (for PAKISTAN)</label>
              <input
                name="prize"
                type="number"
                step="0.01"
                value={form.prize}
                onChange={handleChange}
                className="w-full border p-2 rounded"
                placeholder="Enter bond prize"
              />
            </div>
          )}

          {form.category === 'PAKISTAN' && (
            <div>
              <label className="block text-sm">Draw No (PrizeBond)</label>
              <input
                name="drawNo"
                type="number"
                min="1"
                step="1"
                value={form.drawNo}
                onChange={handleChange}
                className="w-full border p-2 rounded"
                placeholder="Required for PAKISTAN"
              />
            </div>
          )}

          <div>
            <label className="block text-sm">Draw Date</label>
            <div className="flex gap-2">
              <input type="date" name="draw_date" value={form.draw_date} onChange={handleChange} className="w-full border p-2 rounded" />
              <input type="time" name="draw_time" value={form.draw_time} onChange={handleChange} className="w-32 border p-2 rounded" />
            </div>
          </div>

          {form.category === 'PAKISTAN' && (
            <div>
              <label className="block text-sm">City</label>
              <input name="city" value={form.city} onChange={handleChange} className="w-full border p-2 rounded" />
            </div>
          )}

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
              <th className="px-4 py-2 text-left text-sm">Year</th>
              <th className="px-4 py-2 text-left text-sm">Serial No</th>
              <th className="px-4 py-2 text-left text-sm">Title</th>
              <th className="px-4 py-2 text-left text-sm">Category</th>
              <th className="px-4 py-2 text-left text-sm">Prize (for PAKISTAN)</th>
              <th className="px-4 py-2 text-left text-sm">Draw No (PrizeBond)</th>
              <th className="px-4 py-2 text-left text-sm">Draw Date</th>
              <th className="px-4 py-2 text-left text-sm">Expires In</th>
              <th className="px-4 py-2 text-left text-sm">City</th>
              <th className="px-4 py-2 text-left text-sm">Active</th>
              <th className="px-4 py-2 text-sm">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loadingLocal ? (
              <tr><td colSpan={11} className="p-4 text-center">Loading...</td></tr>
            ) : (() => {
              const filtered = filterCategory === 'ALL' ? draws : draws.filter(x => x.category === filterCategory);
              return filtered && filtered.length > 0 ? (
                filtered.map(d => (
                <tr key={d._id} className="border-t">
                  <td className="px-4 py-2">{d.drawYear || (d.draw_date ? new Date(d.draw_date).getFullYear() : '-')}</td>
                  <td className="px-4 py-2">{Number.isInteger(Number(d.serialNo)) ? String(d.serialNo).padStart(2, '0') : '-'}</td>
                  <td className="px-4 py-2">{d.title}</td>
                  <td className="px-4 py-2">{d.category}</td>
                  <td className="px-4 py-2">{d.category === 'PAKISTAN' && d.prize != null ? d.prize : '-'}</td>
                  <td className="px-4 py-2">{d.category === 'PAKISTAN' ? (d.drawNo ?? '-') : '-'}</td>
                    <td className="px-4 py-2">{d.draw_date ? d.draw_date.split('T')[0] : ''}</td>
                    <td className="px-4 py-2">
                      {formatRemaining(remainingMap[d._id] ?? (d.remainingMs ?? 0))}
                      {d.isReopened && (
                        <div className="mt-1 inline-block rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          Reopened until {formatDateTime(d.reopenUntil)}
                        </div>
                      )}
                    </td>
                  <td className="px-4 py-2">{d.category === 'PAKISTAN' ? (d.city || '-') : '-'}</td>
                    <td className="px-4 py-2">{d.isActive ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2">
                    <button className="text-blue-600 mr-2" onClick={() => handleEdit(d)}>Edit</button>
                    {!d.isExpired && !d.isReopened && (
                      <button className="text-red-500 mr-2" onClick={() => expireNow(d._id)}>Expire Now</button>
                    )}
                    {d.isExpired && (
                      <button className="text-emerald-700 font-semibold mr-2" onClick={() => openReopenBox(d)}>Reopen</button>
                    )}
                    {d.isReopened && (
                      <>
                        <button className="text-emerald-700 mr-2" onClick={() => openReopenBox(d)}>Change time</button>
                        <button className="text-red-500 font-semibold mr-2" disabled={reopenBusy} onClick={() => saveReopen(d, null)}>Close now</button>
                      </>
                    )}
                    <button className="text-yellow-600 mr-2" onClick={() => toggleActive(d._id)}>{d.isActive ? 'Deactivate' : 'Activate'}</button>
                    <button className="text-red-600" onClick={() => handleDelete(d._id)}>Delete</button>
                  </td>
                </tr>
                ))
              ) : (
                <tr><td colSpan={11} className="p-4 text-center text-sm text-gray-600">No draws found.</td></tr>
              );
            })()
            }
          </tbody>
        </table>
      </div>

      {reopenBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !reopenBusy && setReopenBox(null)}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Reopen draw</h3>
            <p className="mt-1 text-sm text-gray-600">
              {reopenBox.draw.title} {reopenBox.draw.serialNoDisplay ? `(S#${reopenBox.draw.serialNoDisplay})` : ''}
              {reopenBox.draw.city ? ` - ${reopenBox.draw.city}` : ''} - draw date {formatDateTime(reopenBox.draw.draw_date)}
            </p>
            <p className="mt-3 text-sm text-gray-700">
              Clients and distributors can add, delete and email entries for this draw again until the time you pick.
              After that it closes by itself.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {reopenPresets().map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`rounded border px-3 py-1 text-sm ${reopenBox.until === toLocalInput(p.value) ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  onClick={() => setReopenBox((b) => ({ ...b, until: toLocalInput(p.value) }))}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-sm font-medium text-gray-700">Keep open until</label>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded border p-2"
              value={reopenBox.until}
              min={toLocalInput(new Date())}
              onChange={(e) => setReopenBox((b) => ({ ...b, until: e.target.value }))}
            />

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded border px-4 py-2 text-sm" disabled={reopenBusy} onClick={() => setReopenBox(null)}>
                Cancel
              </button>
              <button type="button" className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={reopenBusy} onClick={submitReopen}>
                {reopenBusy ? 'Saving...' : 'Reopen draw'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DrawList;
