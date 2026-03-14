import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  FaClock,
  FaCalendarAlt,
  FaSave,
  FaPlus,
  FaTrash,
  FaTrophy
} from 'react-icons/fa';

const WinningNumbers = () => {
  const userData = useSelector((state) => state.user);
  const token = userData?.token || localStorage.getItem("adminToken");

  const [drawDate, setDrawDate] = useState(new Date().toISOString().split('T')[0]);
  const [draws, setDraws] = useState([]);
  const [selectedDraw, setSelectedDraw] = useState(null);
  const [winningNumbers, setWinningNumbers] = useState([
    { number: "", type: "first", color: [255, 0, 0] },
    { number: "", type: "second", color: [0, 0, 255] },
    { number: "", type: "second", color: [0, 0, 255] },
    { number: "", type: "second", color: [0, 0, 255] },
    { number: "", type: "third", color: [0, 0, 255] }
  ]);
  const [existingWinningNumbers, setExistingWinningNumbers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch available draws for selection (admin token or user token)
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

  // When a draw is selected, sync its date into drawDate (which drives winner fetch)
  useEffect(() => {
    if (selectedDraw && selectedDraw.draw_date) {
      const iso = new Date(selectedDraw.draw_date).toISOString().split('T')[0];
      setDrawDate(iso);
    }
  }, [selectedDraw]);

  // Fetch existing winning numbers when draw date changes
  useEffect(() => {
    if (drawDate) {
      fetchWinningNumbers();
    }
  }, [drawDate]);

  const fetchWinningNumbers = async () => {
    try {
      setLoading(true);
      const response = await axios.get("/api/v1/data/get-winning-numbers", {
        params: {
          date: drawDate,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
  
      console.log("Fetched Winning Numbers:", response.data.winningNumbers);
      
      // Check if winningNumbers exist and is an array
      if (response.data.winningNumbers && Array.isArray(response.data.winningNumbers)) {
        const formattedNumbers = response.data.winningNumbers.map(item => ({
          number: item.number,
          type: item.type,
          color: item.type === 'first' ? [255, 0, 0] : 
                 item.type === 'second' ? [0, 0, 255] : 
                 [128, 0, 128] // Purple for third
        }));
        
        setExistingWinningNumbers(formattedNumbers);
        setWinningNumbers(formattedNumbers);
      } else {
        setExistingWinningNumbers([]);
        // Reset to default empty form
        setWinningNumbers([
          { number: "", type: "first", color: [255, 0, 0] },
          { number: "", type: "second", color: [0, 0, 255] },
          { number: "", type: "second", color: [0, 0, 255] },
          { number: "", type: "second", color: [0, 0, 255] },
          { number: "", type: "third", color: [128, 0, 128] }
        ]);
      }
    } catch (error) {
      console.error("Error fetching winning numbers:", error);
      if (error.response?.status !== 404) {
        toast.error("Failed to fetch winning numbers");
      }
      setExistingWinningNumbers([]);
      // Reset to default empty form on error
      setWinningNumbers([
        { number: "", type: "first", color: [255, 0, 0] },
        { number: "", type: "second", color: [0, 0, 255] },
        { number: "", type: "second", color: [0, 0, 255] },
        { number: "", type: "second", color: [0, 0, 255] },
        { number: "", type: "third", color: [128, 0, 128] }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleNumberChange = (index, value) => {
    const updatedNumbers = [...winningNumbers];
    updatedNumbers[index].number = value;
    setWinningNumbers(updatedNumbers);
  };

  const handleTypeChange = (index, type) => {
    const updatedNumbers = [...winningNumbers];
    updatedNumbers[index].type = type;
    // Update color based on type
    if (type === "first") {
      updatedNumbers[index].color = [255, 0, 0]; // Red
    } else {
      updatedNumbers[index].color = [0, 0, 255]; // Blue
    }
    setWinningNumbers(updatedNumbers);
  };

  const addWinningNumber = () => {
    setWinningNumbers([
      ...winningNumbers,
      { number: "", type: "second", color: [0, 0, 255] }
    ]);
  };

  const removeWinningNumber = (index) => {
    if (winningNumbers.length > 1) {
      const updatedNumbers = winningNumbers.filter((_, i) => i !== index);
      setWinningNumbers(updatedNumbers);
    }
  };

  const saveWinningNumbers = async () => {
    try {
      // Validate that all numbers are filled
      const validNumbers = winningNumbers.filter(item => item.number.trim() !== "");
      if (validNumbers.length === 0) {
        toast.error("Please enter at least one winning number");
        return;
      }

      // Validate number formats
      for (const item of validNumbers) {
        if (!/^\d+$/.test(item.number)) {
          toast.error(`Invalid number format: ${item.number}. Only digits are allowed.`);
          return;
        }
      }

      // setLoading(true);

      const response = await axios.post("/api/v1/data/set-winning-numbers", {
        date: drawDate,
        winningNumbers: validNumbers
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.success) {
        toast.success("Winning numbers saved successfully!");
        setExistingWinningNumbers(validNumbers);
      }
    } catch (error) {
      console.error("Error saving winning numbers:", error);
      toast.error(error.response?.data?.error || "Failed to save winning numbers");
    } finally {
      // setLoading(false);
    }
  };

  const updateWinningNumbers = async () => {
    try {
      const validNumbers = winningNumbers.filter(item => item.number.trim() !== "");
      
      if (validNumbers.length === 0) {
        toast.error("Please enter at least one winning number");
        return;
      }

      setLoading(true);

      const response = await axios.put("/api/v1/data/update-winning-numbers", {
        date: drawDate,
        numbers: validNumbers
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.success) {
        toast.success("Winning numbers updated successfully!");
        setExistingWinningNumbers(validNumbers);
      }
    } catch (error) {
      console.error("Error updating winning numbers:", error);
      toast.error(error.response?.data?.error || "Failed to update winning numbers");
    } finally {
      setLoading(false);
    }
  };

  const deleteWinningNumbers = async () => {
    if (!window.confirm("Are you sure you want to delete these winning numbers?")) {
      return;
    }

    try {
      setLoading(true);

      const response = await axios.delete("/api/v1/data/delete-winning-numbers", {
        params: {
          date: drawDate,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.success) {
        toast.success("Winning numbers deleted successfully!");
        setExistingWinningNumbers([]);
        setWinningNumbers([
          { number: "", type: "first", color: [255, 0, 0] },
          { number: "", type: "second", color: [0, 0, 255] },
          { number: "", type: "second", color: [0, 0, 255] },
          { number: "", type: "second", color: [0, 0, 255] },
          { number: "", type: "third", color: [0, 0, 255] }
        ]);
      }
    } catch (error) {
      console.error("Error deleting winning numbers:", error);
      toast.error(error.response?.data?.error || "Failed to delete winning numbers");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-gray-800 p-6 rounded-xl mb-6 border border-gray-700">
          <h1 className="text-3xl font-bold text-center mb-6 flex items-center justify-center space-x-2">
            <FaTrophy className="text-yellow-400" />
            <span>Winning Numbers Management</span>
          </h1>

          {/* Date and Time Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Draw Date */}
            <div className="flex items-center space-x-2">
              <FaCalendarAlt className="text-purple-400" />
              <label className="font-semibold">Draw Date:</label>
              <input
                type="date"
                className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 flex-1"
                value={drawDate}
                onChange={(e) => {
                  setDrawDate(e.target.value);
                  setSelectedDraw(null);
                }}
              />
            </div>

            {/* Draw Selection */}
            <div className="flex items-center space-x-2">
              <FaClock className="text-purple-400" />
              <label className="font-semibold">Select Draw:</label>
              <select
                className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 flex-1"
                value={selectedDraw?._id || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  const draw = draws.find(d => String(d._id) === String(value));
                  setSelectedDraw(draw || null);
                }}
              >
                <option value="">-- Select draw --</option>
                {draws
                  .filter(d => d.isExpired || d.status === 'closed')
                  .map(draw => (
                    <option
                      key={draw._id}
                      value={draw._id}
                    >
                      {`${draw.title || 'Draw'} - ${new Date(draw.draw_date).toLocaleDateString()} ${draw.isExpired ? '(Closed)' : ''}`}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        {/* Existing Winning Numbers Display */}
        {existingWinningNumbers.length > 0 && (
          <div className="bg-gray-800 p-6 rounded-xl mb-6 border border-gray-700">
            <h2 className="text-xl font-bold mb-4 flex items-center space-x-2">
              <FaTrophy className="text-green-400" />
              <span>
                Current Winning Numbers for {selectedDraw && selectedDraw.draw_date
                  ? `${selectedDraw.title || 'Draw'} on ${new Date(selectedDraw.draw_date).toISOString().split('T')[0]}`
                  : drawDate}
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {existingWinningNumbers.map((item, index) => (
                <div
                  key={index}
                  className="bg-gray-700 p-4 rounded-lg border border-gray-600"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-2xl font-bold"
                      style={{ color: `rgb(${item.color[0]}, ${item.color[1]}, ${item.color[2]})` }}
                    >
                      {item.number}
                    </span>
                    <span className={`px-2 py-1 rounded text-sm ${
                      item.type === 'first' ? 'bg-red-600' : 
                      item.type === 'second' ? 'bg-blue-600' : 'bg-purple-600'
                    }`}>
                      {item.type.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {/* <div className="flex space-x-4 mt-4">
              <button
                onClick={() => setEditingIndex(0)}
                className="flex items-center space-x-2 bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded"
                disabled={loading}
              >
                <FaEdit />
                <span>Edit</span>
              </button>
              <button
                onClick={deleteWinningNumbers}
                className="flex items-center space-x-2 bg-red-600 hover:bg-red-500 px-4 py-2 rounded"
                disabled={loading}
              >
                <FaTrash />
                <span>Delete</span>
              </button>
            </div> */}
          </div>
        )}

        {/* Winning Numbers Input Form - always visible */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
          <h2 className="text-xl font-bold mb-4 flex items-center space-x-2">
            <FaPlus className="text-blue-400" />
            <span>
              Winning Numbers for {selectedDraw && selectedDraw.draw_date
                ? `${selectedDraw.title || 'Draw'} on ${new Date(selectedDraw.draw_date).toISOString().split('T')[0]}`
                : drawDate}
            </span>
          </h2>

          <div className="space-y-4">
            {winningNumbers.map((item, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center bg-gray-700 p-4 rounded-lg">
                <div>
                  <label className="block text-sm font-medium mb-1">Number</label>
                  <input
                    type="text"
                    placeholder="Enter winning number"
                    className="w-full bg-gray-600 text-white px-3 py-2 rounded border border-gray-500"
                    value={item.number}
                    onChange={(e) => handleNumberChange(index, e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    className="w-full bg-gray-600 text-white px-3 py-2 rounded border border-gray-500"
                    value={item.type}
                    onChange={(e) => handleTypeChange(index, e.target.value)}
                  >
                    <option value="first">First Prize</option>
                    <option value="second">Second Prize</option>
                    <option value="third">Third Prize</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Preview</label>
                  <div
                    className="w-full px-3 py-2 rounded border border-gray-500 text-center font-bold"
                    style={{ 
                      backgroundColor: `rgba(${item.color[0]}, ${item.color[1]}, ${item.color[2]}, 0.2)`,
                      color: `rgb(${item.color[0]}, ${item.color[1]}, ${item.color[2]})`
                    }}
                  >
                    {item.number || "Preview"}
                  </div>
                </div>

                <div className="flex space-x-2">
                  {winningNumbers.length > 1 && (
                    <button
                      onClick={() => removeWinningNumber(index)}
                      className="bg-red-600 hover:bg-red-500 px-3 py-2 rounded"
                      disabled={loading}
                    >
                      <FaTrash />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4 mt-6">
            <button
              onClick={addWinningNumber}
              className="flex items-center space-x-2 bg-green-600 hover:bg-green-500 px-4 py-2 rounded"
              disabled={loading}
            >
              <FaPlus />
              <span>Add Number</span>
            </button>

            <button
              onClick={existingWinningNumbers.length === 0 ? saveWinningNumbers : updateWinningNumbers}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded"
              disabled={loading}
            >
              <FaSave />
              <span>{loading ? (existingWinningNumbers.length === 0 ? 'Saving...' : 'Updating...') : 'Save Winning Numbers'}</span>
            </button>

            {existingWinningNumbers.length > 0 && (
              <button
                onClick={fetchWinningNumbers}
                className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded"
                disabled={loading}
              >
                <span>Reset to Saved</span>
              </button>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-gray-800 p-6 rounded-xl mt-6 border border-gray-700">
          <h3 className="text-lg font-bold mb-3">Instructions:</h3>
          <ul className="space-y-2 text-gray-300">
            <li>• <strong>First Prize:</strong> Red color - Main winning number</li>
            <li>• <strong>Second Prize:</strong> Blue color - Secondary winning numbers</li>
            <li>• <strong>Third Prize:</strong> Purple color - Third tier winning numbers</li>
            <li>• You can add multiple winning numbers for each draw</li>
            <li>• Numbers should contain only digits (0-9)</li>
            <li>• Each draw time can have different winning numbers</li>
            <li>• Changes will be reflected in user vouchers and ledgers immediately</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default WinningNumbers;
