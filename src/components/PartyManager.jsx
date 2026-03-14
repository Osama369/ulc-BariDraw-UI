import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

const PartyManager = () => {
  const userData = useSelector((state) => state.user);
  const token = userData?.token || localStorage.getItem('token');

  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    username: '',
    email: '',
    phone: '',
    city: '',
    dealerId: '',
    balance: 0,
    isActive: true,
    singleFigure: 0,
    doubleFigure: 0,
    tripleFigure: 0,
    fourFigure: 0,
    commission: 0,
    password: '',
    confirmPassword: '',
    partyCode: '',
  });

  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchParties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchParties = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/users/distributor-parties', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setParties(res.data || res.data.users || []);
    } catch (err) {
      console.error('Failed to fetch parties', err);
      toast.error('Failed to load parties');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const resetForm = () =>
    setForm({
      username: '',
      email: '',
      phone: '',
      city: '',
      dealerId: '',
      balance: 0,
      isActive: true,
      singleFigure: 0,
      doubleFigure: 0,
      tripleFigure: 0,
      fourFigure: 0,
      commission: 0,
      password: '',
      confirmPassword: '',
      partyCode: '',
    });

  const createParty = async () => {
    // Basic validations
    if (!form.username || !form.password || !form.partyCode) {
      return toast.error('Username, password and party code are required');
    }
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match');
    if (form.password && form.password.length < 8) return toast.error('Password must be at least 8 characters');
    if (form.dealerId && !/^[A-Za-z0-9]{4,10}$/.test(form.dealerId)) {
      return toast.error('Dealer ID must be 4-10 alphanumeric characters');
    }
    try {
      const res = await axios.post(
        '/api/v1/users/distributor-create-user',
        {
          username: form.username,
          password: form.password,
          email: form.email,
          phone: form.phone,
          city: form.city,
          dealerId: form.dealerId,
          balance: Number(form.balance) || 0,
          isActive: !!form.isActive,
          singleFigure: Number(form.singleFigure) || 0,
          doubleFigure: Number(form.doubleFigure) || 0,
          tripleFigure: Number(form.tripleFigure) || 0,
          fourFigure: Number(form.fourFigure) || 0,
          commission: Number(form.commission) || 0,
          partyCode: form.partyCode,
          accountType: 'party',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Party created');
      resetForm();
      fetchParties();
    } catch (err) {
      console.error('createParty error', err);
      toast.error(err?.response?.data?.error || 'Failed to create party');
    }
  };

  const deleteParty = async (id) => {
    if (!confirm('Delete this party?')) return;
    try {
      await axios.delete(`/api/v1/users/distributor-delete/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Party deleted');
      fetchParties();
    } catch (err) {
      console.error('deleteParty error', err);
      toast.error(err?.response?.data?.error || 'Failed to delete party');
    }
  };

  const startEdit = (party) => {
    setEditingId(party._id);
    setForm({
      username: party.username || '',
      email: party.email || '',
      phone: party.phone || '',
      city: party.city || '',
      dealerId: party.dealerId || '',
      balance: party.balance || 0,
      isActive: party.isActive !== undefined ? party.isActive : true,
      singleFigure: party.singleFigure || 0,
      doubleFigure: party.doubleFigure || 0,
      tripleFigure: party.tripleFigure || 0,
      fourFigure: party.fourFigure || 0,
      commission: party.commission || 0,
      password: '',
      confirmPassword: '',
      partyCode: party.partyCode || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetForm();
  };

  const saveEdit = async () => {
    try {
      const payload = { ...form };
      // remove confirmPassword before send
      delete payload.confirmPassword;
      // validate
      if (payload.password) {
        if (payload.password.length < 8) return toast.error('Password must be at least 8 characters');
        if (payload.password !== form.confirmPassword) return toast.error('Passwords do not match');
      } else {
        delete payload.password;
      }
      await axios.patch(`/api/v1/users/distributor-update/${editingId}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Party updated');
      setEditingId(null);
      resetForm();
      fetchParties();
    } catch (err) {
      console.error('saveEdit error', err);
      toast.error(err?.response?.data?.error || 'Failed to update party');
    }
  };

  return (
    <div className="p-6 bg-gray-900 min-h-full">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-white mb-4">Party Accounts (Distributor)</h2>

        <div className="bg-gray-800 rounded-md p-4 mb-6">
          <h3 className="text-lg text-white mb-2">Create / Edit Party</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input name="username" value={form.username} onChange={handleChange} placeholder="Username" className="p-2 rounded bg-gray-700 text-white" />
            <input name="email" value={form.email} onChange={handleChange} placeholder="Email" className="p-2 rounded bg-gray-700 text-white" />
            <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone" className="p-2 rounded bg-gray-700 text-white" />
            <input name="city" value={form.city} onChange={handleChange} placeholder="City" className="p-2 rounded bg-gray-700 text-white" />
            <input name="dealerId" value={form.dealerId} onChange={handleChange} placeholder="Dealer ID (4-10 alnum)" className="p-2 rounded bg-gray-700 text-white" />
            <input name="partyCode" value={form.partyCode} onChange={handleChange} placeholder="Party Code (e.g., AM01)" className="p-2 rounded bg-gray-700 text-white" />
            <div className="space-y-2">
              <label className="block text-white">Single Figure Comm:</label>
              <input name="singleFigure" type="number" value={form.singleFigure} onChange={handleChange} placeholder="Single Figure" className="p-2 rounded bg-gray-700 text-white w-full" />
            </div>

            <div className="space-y-2">
              <label className="block text-white">Double Figure Comm:</label>
              <input name="doubleFigure" type="number" value={form.doubleFigure} onChange={handleChange} placeholder="Double Figure" className="p-2 rounded bg-gray-700 text-white w-full" />
            </div>

            <div className="space-y-2">
              <label className="block text-white">Triple Figure Comm:</label>
              <input name="tripleFigure" type="number" value={form.tripleFigure} onChange={handleChange} placeholder="Triple Figure" className="p-2 rounded bg-gray-700 text-white w-full" />
            </div>

            <div className="space-y-2">
              <label className="block text-white">Four Figure Comm:</label>
              <input name="fourFigure" type="number" value={form.fourFigure} onChange={handleChange} placeholder="Four Figure" className="p-2 rounded bg-gray-700 text-white w-full" />
            </div>

            <div className="space-y-2">
              <label className="block text-white">Commission (Hissa):</label>
              <input name="commission" type="number" value={form.commission} onChange={handleChange} placeholder="Commission (Hissa)" className="p-2 rounded bg-gray-700 text-white w-full" />
            </div>

            <div className="space-y-2">
              <label className="block text-white">Balance:</label>
              <input name="balance" type="number" value={form.balance} onChange={handleChange} placeholder="Initial Balance" className="p-2 rounded bg-gray-700 text-white w-full" />
            </div>

            <div className="flex items-center gap-2 p-2 bg-gray-700 rounded">
              <input type="checkbox" name="isActive" checked={!!form.isActive} onChange={handleChange} />
              <label className="text-white">Active</label>
            </div>

            <div className="relative">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handleChange}
                placeholder="Password (leave blank on edit)"
                className="p-2 rounded bg-gray-700 text-white w-full"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-2 text-white">
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>

            <div className="relative">
              <input
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm Password"
                className="p-2 rounded bg-gray-700 text-white w-full"
              />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-2 top-2 text-white">
                {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>
          <div className="mt-3">
            {editingId ? (
              <>
                <button onClick={saveEdit} className="bg-green-600 px-4 py-2 rounded mr-2">Save</button>
                <button onClick={cancelEdit} className="bg-gray-600 px-4 py-2 rounded">Cancel</button>
              </>
            ) : (
              <button onClick={createParty} className="bg-blue-600 px-4 py-2 rounded">Create Party</button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-md p-4">
          <h3 className="text-lg font-semibold mb-3">Your Parties</h3>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <table className="min-w-full table-auto">
              <thead>
                <tr className="bg-gray-100 text-black">
                  <th className="px-4 py-2 text-left">Username</th>
                  <th className="px-4 py-2 text-left ">Party Code</th>
                  <th className="px-4 py-2 text-left">Phone</th>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Balance</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p) => (
                  <tr key={p._id} className="hover:bg-gray-50 text-black">
                    <td className="px-4 py-2">{p.username}</td>
                    <td className="px-4 py-2">{p.partyCode || '-'}</td>
                    <td className="px-4 py-2">{p.phone || '-'}</td>
                    <td className="px-4 py-2">{p.email || '-'}</td>
                    <td className="px-4 py-2">{p.balance ?? 0}</td>
                    <td className="px-4 py-2">
                      <button onClick={() => startEdit(p)} className="text-sm text-blue-600 mr-2">Edit</button>
                      <button onClick={() => deleteParty(p._id)} className="text-sm text-red-600">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartyManager;
