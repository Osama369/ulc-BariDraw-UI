import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FaEllipsisH, FaSignOutAlt } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { setUser } from '../redux/features/userSlice';

const CompactHeader = ({ onToggleSidebar }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const userData = useSelector((s) => s.user);

  const handleLogout = () => {
    try {
      dispatch(setUser(null));
    } catch (err) {
      // ignore
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between bg-gray-800 p-2 rounded-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { if (typeof onToggleSidebar === 'function') onToggleSidebar(); }}
            className="p-2 rounded bg-gray-700 text-white hover:bg-gray-600"
            title="Toggle sidebar"
          >
            <FaEllipsisH />
          </button>

          <span className="text-sm text-gray-300">{`User - ${userData?.user?.dealerId || '—'} - ${userData?.user?.username || ''}`}</span>
          <span className="ml-2 text-xs text-gray-400">{userData?.user?.role || ''}</span>
        </div>

        <div>
          <button onClick={handleLogout} className="p-2 rounded bg-gray-700 text-white hover:bg-gray-600" title="Logout">
            <FaSignOutAlt />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompactHeader;
