import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// import axios from "axios";
// import jsPDF from "jspdf";
// import { useSelector, useDispatch } from "react-redux";
// import { showLoading, hideLoading } from '../redux/features/alertSlice';
// import { setUser } from '../redux/features/userSlice';
// imort the FaSignOutAlt
import { FaFile, FaSignOutAlt } from 'react-icons/fa';
// import { setData } from '../redux/features/dataSlice';
import toast from 'react-hot-toast';
import Center from './Center';

import DistributerUsers from '../pages/distributor/DistributerUsers';
import DistributorCreateUser from '../pages/distributor/DistributorCreateUser';
import DistributorEditUser from '../pages/distributor/DistributorEditUser'; // Import the edit user component
import Spinner from '../components/Spinner'
import "jspdf-autotable";
import {
  FaBook,
  FaCalculator,
  FaInbox,
  FaDice,
  FaUsers,
  FaUserPlus,
  FaFileAlt,
  FaUserEdit, // Import icon for editing users
} from 'react-icons/fa';
import RoleBasedComponent from './RoleBasedRoute';
import { Link } from 'react-router-dom';
import Reports from './Reports';
import Hisab from './Hisab';
import PartyManager from './PartyManager';
import CompactHeader from './CompactHeader';
import TotalSaleReport from './TotalSaleReport';
import Emails from './Emails';
const Layout = () => {
  // Hooks to manage states of the variables
  // State for ledger selection, date, and draw time
  //const [user, setUser] = useState(null);
  // using the redux slice reducer

  // const dispatch = useDispatch();
  // const [loading, setLoading] = useState(true);
  // const [error, setError] = useState("");
   const navigate = useNavigate();
  // const userData = useSelector((state) => state.user);
  // const token = userData?.token || localStorage.getItem("token");
  // console.log(token);


  // const [ledger, setLedger] = useState("LEDGER");
  // const [drawTime, setDrawTime] = useState("11 AM");  // time slot
  // const [drawDate, setDrawDate] = useState(new Date().toISOString().split('T')[0]); // date
  // const [closingTime, setClosingTime] = useState("");
  // const [entries, setEntries] = useState([]);  // table entries
  // const [no, setNo] = useState('');
  // const [f, setF] = useState('');
  // const [s, setS] = useState('');
  // const [selectAll, setSelectAll] = useState(false);
  // const [currentTime, setCurrentTime] = useState(new Date());
  // const [file, setFile] = useState(null);
  
   
//    // logout th user 
//    // utils/auth.js (or inside any component)

const handleLogout = (navigate) => {
  localStorage.removeItem("token");
  localStorage.removeItem("user"); // if you're storing user info
  // Optionally show a toast
  toast.success("Logged out successfully!");
  // Navigate to login
  navigate("/login");
};


 
  const [activeTab, setActiveTab] = useState("Sell Department");
  const [selectedUserId, setSelectedUserId] = useState(null); // Add state for selected user ID
  const [sidebarVisible, setSidebarVisible] = useState(true);


  return (
    <div className="flex h-screen min-h-[500px] bg-gray-900 text-gray-100 overflow-hidden">

    {/* Sidebar */}
    {sidebarVisible && (
      <div className="w-64 bg-gray-800 flex flex-col p-5 border-r border-gray-700 min-h-0 overflow-hidden">
      <div className="text-2xl font-bold mb-6 flex items-center gap-2 text-purple-400">
        <FaDice className="text-3xl" />
        <span>Dealer Portal</span>
      </div>

      {/* Scroll only the menu; keep sidebar height fixed and Logout pinned */}
      <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 sidebar-scroll">
        <button
          onClick={() => setActiveTab("Sell Department")}
          className={`flex items-center px-3 py-2.5 rounded-md gap-2 transition-colors ${
            activeTab === "Sell Department" ? "bg-gray-700" : "hover:bg-gray-700"
          }`}
        >
          <FaBook className="text-purple-400" />
          Sell Department
        </button>

        {/* <button
          onClick={() => setActiveTab("Purchase Department")}
          className={`flex items-center px-3 py-2.5 rounded-md gap-2 transition-colors ${
            activeTab === "Purchase Department" ? "bg-gray-700" : "hover:bg-gray-700"
          }`}
        >
          <FaInbox className="text-green-400" />
          Purchase Department
        </button> */}

        {/* Distributor-only features */}
        <RoleBasedComponent requiredRoles={['distributor', 'admin']}>
          <button
            onClick={() => setActiveTab("hisab")}
            className={`flex items-center px-3 py-2.5 rounded-md gap-2 transition-colors ${
              activeTab === "hisab" ? "bg-gray-700" : "hover:bg-gray-700"
            }`}
          >
            <FaCalculator className="text-blue-400" />
            Purchase Department
          </button>

          <button
            onClick={() => setActiveTab("manage-users")}
            className={`flex items-center px-3 py-2.5 rounded-md gap-2 transition-colors ${
              activeTab === "manage-users" ? "bg-gray-700" : "hover:bg-gray-700"
            }`}
          >
            <FaUsers className="text-blue-400" />
            Manage Users
          </button>

          <button
            onClick={() => setActiveTab("manage-parties")}
            className={`flex items-center px-3 py-2.5 rounded-md gap-2 transition-colors ${
              activeTab === "manage-parties" ? "bg-gray-700" : "hover:bg-gray-700"
            }`}
          >
            <FaUsers className="text-blue-400" />
            Party Accounts
          </button>

          <button
            onClick={() => setActiveTab("create-user")}
            className={`flex items-center px-3 py-2.5 rounded-md gap-2 transition-colors ${
              activeTab === "create-user" ? "bg-gray-700" : "hover:bg-gray-700"
            }`}
          >
            <FaUserPlus className="text-green-400" />
            Create User
          </button>

        </RoleBasedComponent>

        {/* Sale Vouchers and Total Sale Report available to normal users as well */}
        <RoleBasedComponent requiredRoles={['user','party','distributor','admin']}>
          <button
            onClick={() => setActiveTab("reports")}
            className={`flex items-center px-3 py-2.5 rounded-md gap-2 transition-colors ${
              activeTab === "reports" ? "bg-gray-700" : "hover:bg-gray-700"
            }`}
          >
            <FaFileAlt className="text-violet-400" />
            Sale Vouchers
          </button>
          <button
            onClick={() => setActiveTab("total-sale-report")}
            className={`flex items-center px-3 py-2.5 rounded-md gap-2 transition-colors ${
              activeTab === "total-sale-report" ? "bg-gray-700" : "hover:bg-gray-700"
            }`}
          >
            <FaFileAlt className="text-yellow-400" />
            Total Sale Report
          </button>
        </RoleBasedComponent>

        {/* Emails only for distributors */}
        <RoleBasedComponent requiredRoles={['distributor']}>
          <button
            onClick={() => setActiveTab("emails")}
            className={`flex items-center px-3 py-2.5 rounded-md gap-2 transition-colors ${
              activeTab === "emails" ? "bg-gray-700" : "hover:bg-gray-700"
            }`}
          >
            <FaInbox className="text-yellow-400" />
            Emails
          </button>

          <button
            onClick={() => setActiveTab("import-dbf")}
            className={`flex items-center px-3 py-2.5 rounded-md gap-2 transition-colors ${
              activeTab === "import-dbf" ? "bg-gray-700" : "hover:bg-gray-700"
            }`}
          >
            <FaFile className="text-yellow-300" />
            Import DBF
          </button>
        </RoleBasedComponent>
      </nav>

      <button
        className="mt-auto flex items-center px-3 py-2.5 rounded-md hover:bg-gray-700 gap-2 transition-colors"
        onClick={() => handleLogout(navigate)}
      >
        <FaSignOutAlt className="text-red-400" />
        Logout
      </button>
      </div>
    )}

    {/* Main Content Area */}
    <div className="flex-1 bg-gray-900 min-h-0 overflow-hidden flex flex-col">
      <CompactHeader onToggleSidebar={() => setSidebarVisible(v => !v)} />

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === "Sell Department" && (
          <Center onToggleSidebar={() => setSidebarVisible(v => !v)} sidebarVisible={sidebarVisible} />
        )}
        {activeTab === "import-dbf" && (
          <Center
            onToggleSidebar={() => setSidebarVisible(v => !v)}
            sidebarVisible={sidebarVisible}
            initialImportOpen
          />
        )}

        {activeTab === "hisab" && <div className="h-full overflow-y-auto"><Hisab /></div>}
        {/* {activeTab === "Purchase Department" && <PurchaseDepartment />} */}
        {activeTab === "manage-users" && (
          <div className="h-full overflow-y-auto">
            <DistributerUsers onEditUser={(userId) => {
              console.log("Editing user with ID:", userId);
              setSelectedUserId(userId);
              setActiveTab("edit-user");
            }} />
          </div>
        )}
        {activeTab === "manage-parties" && <div className="h-full overflow-y-auto"><PartyManager /></div>}
        {activeTab === "create-user" && <div className="h-full overflow-y-auto"><DistributorCreateUser theme="dark" /></div>}
        {activeTab === "edit-user" && <div className="h-full overflow-y-auto"><DistributorEditUser userId={selectedUserId} theme="dark" /></div>}
        {activeTab === "reports" && <div className="h-full overflow-y-auto"><Reports /></div>}
        {activeTab === "total-sale-report" && <div className="h-full overflow-y-auto"><TotalSaleReport /></div>}
        <RoleBasedComponent requiredRoles={["distributor"]}>
          {activeTab === "emails" && <div className="h-full overflow-y-auto"><Emails /></div>}
        </RoleBasedComponent>
      </div>
    </div>
  </div>
  );
};

export default Layout;


