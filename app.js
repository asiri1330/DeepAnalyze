
    // 2. Add your Firebase Settings here
   const firebaseConfig = {
    apiKey: "AIzaSyC52EigxMOjXqkWFWenCnna28klZvmXQsY",
    authDomain: "schoolmarksdb.firebaseapp.com",
    databaseURL: "https://schoolmarksdb-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "schoolmarksdb",
    storageBucket: "schoolmarksdb.firebasestorage.app",
    messagingSenderId: "204637063740",
    appId: "1:204637063740:web:8fffcf26fc627dc2c0d139"
  };
    
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);

    const DB_URL = "https://schoolmarksdb-default-rtdb.asia-southeast1.firebasedatabase.app"; 
    
    // crossorigin="anonymous" යන්න අනිවාර්යයෙන් ඇතුළත් කරන්න (PDF වලට පින්තූරය ලබා ගැනීමට එය අවශ්‍ය වේ)
    const SYS_LOGO_SVG = `<img src="https://i.ibb.co/nWMHnRP/School-Logo-GCC-Transparency.png" crossorigin="anonymous" style="width:100%; height:100%; object-fit:contain;">`;
    // XSS ප්‍රහාර වැළැක්වීමේ ශ්‍රිතය
    window.sanitizeText = function(str) {
        if (!str) return ""; // දත්ත නොමැති නම් හිස් අගයක් ලබා දෙයි
            let temp = document.createElement('div');
            temp.textContent = str; // මෙහිදී අනිෂ්ට HTML කේත සාමාන්‍ය අකුරු බවට පත් වේ (උදා: < යන්න &lt; බවට පත්වේ)
        return temp.innerHTML;
    };
    // 3. Updated apiCall with Auth Token
    async function apiCall(path = '', method = 'GET', data = null, queryParams = '') {
      let token = "";
      const user = firebase.auth().currentUser;
      if (user) {
          token = await user.getIdToken();
          // queryParams දැනටමත් '?' කින් පටන් ගෙන ඇත්නම් '&' යොදයි, නැත්නම් '?' යොදයි
          let separator = queryParams.includes('?') ? '&' : '?';
          queryParams = queryParams + `${separator}auth=${token}`;
      }
      
      const url = `${DB_URL}/${path}.json${queryParams}`;
      const options = { method: method };
      if (data) { options.body = JSON.stringify(data); options.headers = { 'Content-Type': 'application/json' }; }
      try { const response = await fetch(url, options); if (!response.ok) throw new Error("API Error or Access Denied"); return await response.json(); } 
      catch (err) { console.error("Database error:", err); throw err; }
    }

    const CACHE_TIME = 1000 * 60 * 60 * 12; 
    const memoryCache = {};

    // --- IndexedDB Setup ---
    const initDB = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('EliteSchoolDB', 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('apiCache')) {
                    db.createObjectStore('apiCache', { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };

    const getFromIDB = async (key) => {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('apiCache', 'readonly');
            const store = tx.objectStore('apiCache');
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };

    const saveToIDB = async (key, data, timestamp) => {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('apiCache', 'readwrite');
            const store = tx.objectStore('apiCache');
            const request = store.put({ id: key, data: data, time: timestamp });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    };

    async function fetchWithCache(path, forceRefresh = false) {
        const cacheKey = 'elite_cache_' + path.replace(/\//g, '_');
        
        if (!forceRefresh) {
            if (memoryCache[cacheKey]) return memoryCache[cacheKey]; 

            try {
                const cachedItem = await getFromIDB(cacheKey);
                if (cachedItem && (Date.now() - cachedItem.time) < CACHE_TIME) {
                    memoryCache[cacheKey] = cachedItem.data; 
                    return cachedItem.data;
                }
            } catch (e) { console.warn("IndexedDB read error:", e); }
        }
        
        const data = await apiCall(path);
        if (data) {
            memoryCache[cacheKey] = data; 
            
            // දත්ත IndexedDB එකට දැමීම තිරය හිර නොවන සේ පසුබිමෙන් සිදු කිරීම
            setTimeout(async () => {
                try {
                    await saveToIDB(cacheKey, data, Date.now());
                } catch(e) { console.warn("IndexedDB save error:", e); }
            }, 50); 
        }
        return data;
    }

    // --- Debouncing ශ්‍රිතය (මෙය fetchWithCache එකට පහළින් එක් කරන්න) ---
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }                                                                       

    // Fixed Hash Function to work on both Local file:// and HTTPS
    async function hashData(string) {
      try {
          if (window.crypto && window.crypto.subtle) {
              const utf8 = new TextEncoder().encode(string);
              const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              return hashArray.map(bytes => bytes.toString(16).padStart(2, '0')).join('');
          }
      } catch (e) { console.warn("crypto.subtle not available, falling back to CryptoJS"); }
      
      if (typeof CryptoJS !== 'undefined') {
          return CryptoJS.SHA256(string).toString(CryptoJS.enc.Hex);
      }
      return string; // Fallback
    }


    // Fixed Hash Function to work on both Local file:// and HTTPS
    async function hashData(string) {
      try {
          if (window.crypto && window.crypto.subtle) {
              const utf8 = new TextEncoder().encode(string);
              const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              return hashArray.map(bytes => bytes.toString(16).padStart(2, '0')).join('');
          }
      } catch (e) { console.warn("crypto.subtle not available, falling back to CryptoJS"); }
      
      if (typeof CryptoJS !== 'undefined') {
          return CryptoJS.SHA256(string).toString(CryptoJS.enc.Hex);
      }
      return string; // Fallback
    }
    
    // ---------------------------------------------------------
    // නව Vercel API එක හා සම්බන්ධ වන කේතය මෙතැනින් අලවන්න
    // ---------------------------------------------------------

    window.fetchAndCalculateClassMarks = async function(yr, trm, cls) {
        try {
            // ඔබගේ දත්ත ලබාගැනීමේ පැරණි Firebase/Cache කේතය
            let [allStudentsData, allClassesData, marksDB, allSubjectsData] = await Promise.all([
                fetchWithCache('students'),
                fetchWithCache('classes'),
                fetchWithCache(`marks/${yr}/${trm}`),
                fetchWithCache('subjects')
            ]);

            if (!allStudentsData || !marksDB || !allClassesData) {
                throw new Error("Missing required data");
            }

            // එම පන්තියට අදාළ ළමුන්ගේ ලකුණු පමණක් වෙන් කරගැනීම
            let classStsKeys = Object.keys(allStudentsData).filter(k => allStudentsData[k].class === cls);
            let rawData = classStsKeys.map(k => {
                let sData = { admNo: k, ...allStudentsData[k] };
                sData.marks = marksDB[k] || {}; 
                return sData;
            });

            let isALevelReport = allClassesData[cls] && (allClassesData[cls].grade === '12' || allClassesData[cls].grade === '13');
            let ctName = allClassesData[cls] ? allClassesData[cls].classTeacherName : "";
            let displayCols = {}; 

            // Vercel API එකට දත්ත යවා ගණනය කරවා ගැනීම
            const response = await fetch('/api/processMarks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    rawData: rawData, 
                    isALevelReport: isALevelReport 
                }) 
            });

            // සර්වර් එකෙන් යම් දෝෂයක් ආවොත් එය පෙන්වීම
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} - Could not calculate marks.`);
            }

            // Backend එකෙන් ආපසු එවන සකසන ලද ප්‍රතිඵල (JSON) ලබා ගැනීම
            const result = await response.json(); 

            return {
                reportArray: result.reportArray,  
                displayCols: displayCols,
                isALevelReport: result.isALevelReport,
                ctName: ctName
            };

        } catch (error) {
            console.error("Error calculating marks via API:", error);
            throw error;
        }
    };

// --- IIFE Main Logic ---
(function() {
  let currentUser = null; 
  let tempSetupNic = null;
  let allStudentsData = {}; 
  let allTeachersData = {};
  let allSubjectsData = {};
  let allClassesData = {}; 
  
  window.currentReportData = null; 
  let currentReportType = null;
  
  let studentMarksChartInstance = null; let passComboChartInstance = null; let progChartLatest = null; let progChartHistory = null; let compareChartInstance = null;
  let editingTeacher = false, editingStudent = false, editingSubject = false, editingClass = false;
  let currentSubjectKey = null, currentClassKey = null;

  window.onload = function() {
    let currYear = new Date().getFullYear(); let yearHTML = "";
    for(let y = currYear - 1; y <= currYear + 5; y++) yearHTML += `<option value="${y}" ${y===currYear?'selected':''}>${y}</option>`; 
    document.querySelectorAll('.dynamic-years').forEach(sel => sel.innerHTML = yearHTML);
  };

  async function refreshGlobalCache(force = false) {
    try {
      allTeachersData = (await fetchWithCache('teachers', force)) || {};
      allSubjectsData = (await fetchWithCache('subjects', force)) || {}; 
      allClassesData = (await fetchWithCache('classes', force)) || {}; 
      // allStudentsData සම්පූර්ණයෙන් Download කිරීම මෙතැනින් ඉවත් කර ඇත (RAM & Bandwidth ඉතිරි කිරීම සඳහා)
      
      let uniqueClasses = Object.keys(allClassesData).sort();
      if(uniqueClasses.length === 0) { uniqueClasses = [...new Set(Object.values(allStudentsData).map(s => s.class))].filter(Boolean).sort(); } 
      
      populateClassDropdowns(uniqueClasses); populateSubjectDropdowns(); populateTeacherDropdowns(); updateDashboardStats();

      if(currentUser) {
          let myClassObj = Object.entries(allClassesData).find(([cName, cData]) => cData.teacher === currentUser.name);
          window.assignedClass = myClassObj ? myClassObj[0] : null;
          if(window.applyRBAC) window.applyRBAC();
      }

      if(document.getElementById('secStudents').style.display === 'block') filterStudents();
      if(document.getElementById('secTeachers').style.display === 'block') filterTeachers();
      if(document.getElementById('secSubjects').style.display === 'block') filterSubjects();
      if(document.getElementById('secClasses').style.display === 'block') filterClasses(); 
    } catch(err) { console.error("Cache Error:", err); }
  }

  // --- NEW: Role Based Access Control Application ---
  // --- NEW: Role Based Access Control Application ---
  window.applyRBAC = function() {
      if(!currentUser) return;
      let role = currentUser.role ? currentUser.role.toLowerCase() : "teacher";
      let isSysAdmin = currentUser.isAdmin === true || currentUser.isAdmin === "true" || role.includes("system admin") || currentUser.isSetupMode;

      // --- අලුතින් එක් කළ කොටස: CSS Views පාලනයට Body එකට Role එක ලබා දීම ---
      document.body.setAttribute('data-user-role', role);
      document.body.setAttribute('data-is-admin', isSysAdmin);
      // -------------------------------------------------------------------------

      let readOnlyGlobal = ["principal", "vice principal", "assistant principal"].includes(role);
      let isSectionalHead = role === "sectional head";
      let isCT = role === "class teacher" || role === "assistant class teacher";
      let isTeacher = role === "teacher";

      // 1. Menu Visibility
      document.querySelectorAll('.nav-links li').forEach(el => el.style.display = 'none');
      document.getElementById('nav_secDashboard').style.display = 'flex';
      document.getElementById('nav_secProgress').style.display = 'flex';
      document.getElementById('nav_secReports').style.display = 'flex';

      if(isSysAdmin || readOnlyGlobal || isSectionalHead) {
          ['nav_secTeachers', 'nav_secClasses', 'nav_secSubjects', 'nav_secStudents', 'nav_secMarks'].forEach(id => document.getElementById(id).style.display = 'flex');
      } else if (isCT) {
          ['nav_secStudents', 'nav_secMarks'].forEach(id => document.getElementById(id).style.display = 'flex');
      } else if (isTeacher) {
          ['nav_secClasses', 'nav_secMarks'].forEach(id => document.getElementById(id).style.display = 'flex');
      }

      // 2. Capabilities
      window.perms = {
          editTeachers: isSysAdmin,
          editClasses: isSysAdmin || isSectionalHead || isTeacher,
          editSubjects: isSysAdmin || isSectionalHead,
          editStudents: isSysAdmin || isSectionalHead || isCT,
          editMarks: isSysAdmin || isSectionalHead || isCT || isTeacher
      };

      // 3. UI Element Toggles
      let btnAddClass = document.getElementById('btnAddClass'); if(btnAddClass) btnAddClass.style.display = perms.editClasses ? 'inline-flex' : 'none';
      let btnAddSubject = document.getElementById('btnAddSubject'); if(btnAddSubject) btnAddSubject.style.display = perms.editSubjects ? 'inline-flex' : 'none';

      let tAddBox = document.getElementById('teacherAddBox'); if(tAddBox) tAddBox.style.display = perms.editTeachers ? 'block' : 'none';
      let tImportBox = document.getElementById('teacherImportBox');
      if(tImportBox) {
          let h4s = tImportBox.querySelectorAll('h4');
          h4s.forEach(h => { if(h.innerText.includes('Bulk Import') || h.innerText.includes('Firebase Security Sync')) {
              h.style.display = perms.editTeachers ? 'block' : 'none';
              if(h.nextElementSibling) h.nextElementSibling.style.display = perms.editTeachers ? 'flex' : 'none';
          }});
          let fbDiv = tImportBox.querySelector('div[style*="fffbeb"]');
          if(fbDiv) fbDiv.style.display = perms.editTeachers ? 'block' : 'none';
      }

      let sAddBox = document.getElementById('studentAddBox'); if(sAddBox) sAddBox.style.display = perms.editStudents ? 'block' : 'none';
      let sImportBox = document.getElementById('studentImportBox');
      if(sImportBox) {
          let h4s = sImportBox.querySelectorAll('h4');
          h4s.forEach(h => { if(h.innerText.includes('Bulk Import')) {
              h.style.display = perms.editStudents ? 'block' : 'none';
              if(h.nextElementSibling) h.nextElementSibling.style.display = perms.editStudents ? 'flex' : 'none';
          }});
      }

      // Force Class Teacher to their class for Reports/Marks Add
      let repCls = document.getElementById('repClass');
      let marksCls = document.getElementById('marksClassSelect');
      let progCls = document.getElementById('progClassFilter');
      if(isCT && window.assignedClass) {
          if(repCls) { repCls.value = window.assignedClass; repCls.style.pointerEvents = 'none'; repCls.style.opacity = '0.6'; }
          if(marksCls) { marksCls.value = window.assignedClass; marksCls.style.pointerEvents = 'none'; marksCls.style.opacity = '0.6'; }
          if(progCls) { progCls.value = window.assignedClass; progCls.style.pointerEvents = 'none'; progCls.style.opacity = '0.6'; updateProgressStudentList(); }
      } else {
          if(repCls) { repCls.style.pointerEvents = 'auto'; repCls.style.opacity = '1'; }
          if(marksCls) { marksCls.style.pointerEvents = 'auto'; marksCls.style.opacity = '1'; }
          if(progCls) { progCls.style.pointerEvents = 'auto'; progCls.style.opacity = '1'; }
      }
  }

  function populateClassDropdowns(uniqueClasses) {
      let html = '<option value="">-- Select Class --</option>'; 
      uniqueClasses.forEach(c => {
          let gradeStr = allClassesData[c] && allClassesData[c].grade ? ` - (${allClassesData[c].grade})` : "";
          html += `<option value="${c}">${c}${gradeStr}</option>`;
      });
      document.getElementById('sClass').innerHTML = html; 
      document.getElementById('marksClassSelect').innerHTML = html; document.getElementById('progClassFilter').innerHTML = html; 
      document.getElementById('repClass').innerHTML = html; 
      // නව වෙනස: Student section එකේ class filter එකටද දත්ත යැවීම
      if(document.getElementById('studentClassFilter')) document.getElementById('studentClassFilter').innerHTML = html;
  }

  function populateTeacherDropdowns() {
      let html = '<option value="">-- Select Teacher --</option>';
      let sortedKeys = Object.keys(allTeachersData).sort((a,b) => allTeachersData[a].name.localeCompare(allTeachersData[b].name));
      sortedKeys.forEach(k => html += `<option value="${allTeachersData[k].name}">${allTeachersData[k].name} (${allTeachersData[k].empNo||k})</option>`);
      document.getElementById('cTeacher').innerHTML = html;
  }

  async function updateDashboardStats() {
      document.getElementById('statTeachers').innerText = Object.keys(allTeachersData).length;
      document.getElementById('statClasses').innerText = Object.keys(allClassesData).length;
      document.getElementById('statSubjects').innerText = Object.keys(allSubjectsData).length;

      try {
          // RAM ඉතිරි කිරීමට shallow query එක භාවිත කිරීම. (Firebase numeric keys එවන විට Array එකක් සේ සැලකීමේ ගැටළුවද මෙහි නිරාකරණය කර ඇත)
          let studentsData = await apiCall('students', 'GET', null, '?shallow=true');
          let sCount = 0;
          
          if (studentsData) {
              if (Array.isArray(studentsData)) {
                  // Array එකක් නම් null හෝ undefined නොවන දත්ත පමණක් ගණනය කිරීම
                  sCount = studentsData.filter(x => x !== null && x !== undefined).length;
              } else {
                  // Object එකක් නම් එහි keys ගණනය කිරීම
                  sCount = Object.keys(studentsData).length;
              }
          }
          document.getElementById('statStudents').innerText = sCount;
          
      } catch (e) {
          console.warn("Shallow query failed, attempting full fetch for count...", e);
          try {
              // Shallow query අසමත් වුවහොත් සාමාන්‍ය ක්‍රමයට දත්ත ගෙන ගණනය කිරීම (මෙහිදී දත්ත RAM හි ගබඩා නොකරයි, ගණනය කිරීම පමණක් සිදු කෙරේ)
              let allS = await apiCall('students');
              let sCount = 0;
              
              if (allS) {
                  if (Array.isArray(allS)) {
                      sCount = allS.filter(x => x !== null && x !== undefined).length;
                  } else {
                      sCount = Object.keys(allS).length;
                  }
              }
              document.getElementById('statStudents').innerText = sCount;
              
          } catch (err) {
              document.getElementById('statStudents').innerText = "0";
          }
      }

      const dateOptions = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
      if(currentUser) { 
          document.getElementById('dashWelcomeText').innerHTML = `Welcome back, <b>${currentUser.name}</b> • ${new Date().toLocaleDateString('en-US', dateOptions)}`; 
      }
  }

  function populateSubjectDropdowns() {
      let singleSelHTML = '<option value="">-- Select Subject --</option>';
      let marksSelHTML = '<option value="">-- Select Subject/Category --</option>';

      let sortedKeys = Object.keys(allSubjectsData).sort((a,b) => allSubjectsData[a].name.localeCompare(allSubjectsData[b].name));
      let buckets = new Set();
      let mainHTML = '<optgroup label="Main Subjects">';

      sortedKeys.forEach(k => {
          let s = allSubjectsData[k];
          singleSelHTML += `<option value="${k}">${s.name}</option>`;
          if(s.basketName) { buckets.add(s.basketName); } else { mainHTML += `<option value="${k}">${s.name}</option>`; }
      });
      mainHTML += '</optgroup>';

      let bucketHTML = '<optgroup label="Subject Categories / Buckets">';
      buckets.forEach(b => { bucketHTML += `<option value="BUCKET:::${b}">[Category] ${b}</option>`; });
      bucketHTML += '</optgroup>';

      document.getElementById('marksSubjectSelect').innerHTML = marksSelHTML + bucketHTML + mainHTML;
      document.getElementById('repSubject').innerHTML = singleSelHTML;
  }

  window.togglePwd = function(inputId, iconSpan) {
    const input = document.getElementById(inputId);
    if (input.type === "password") { input.type = "text"; iconSpan.innerHTML = '<span class="material-symbols-outlined icon-small" style="font-size:20px; color:var(--primary);">visibility_off</span>'; } 
    else { input.type = "password"; iconSpan.innerHTML = '<span class="material-symbols-outlined icon-small" style="font-size:20px;">visibility</span>'; }
  }

  // ==========================================
  // CHART VISIBILITY TOGGLE (NEW)
  // ==========================================
  window.toggleChartVisibility = function(containerId, btnElement) {
      let container = document.getElementById(containerId);
      if (container.style.display === 'none') {
          container.style.display = 'block';
          btnElement.innerHTML = '<span class="material-symbols-outlined icon-small">visibility_off</span> Hide Chart';
      } else {
          container.style.display = 'none';
          btnElement.innerHTML = '<span class="material-symbols-outlined icon-small">visibility</span> Show Chart';
      }
  };

  // ==========================================
  // LOGIN & AUTH (ප්‍රතිනිර්මාණය කළ ආරක්ෂිත ලොගින් පද්ධතිය)
  // ==========================================
  window.login = async function() {
    let nic = document.getElementById('nicInput').value.trim().toUpperCase();
    let pass = document.getElementById('passInput').value.trim();
    let msg = document.getElementById('loginMsg');
    let btn = document.getElementById('loginBtn');
    
    if(!nic || !pass) return msg.innerText = "Please enter both ID and Password.";
    msg.innerText = ""; btn.innerHTML = 'Logging in...'; btn.disabled = true;

    try {
      let loginEmail = nic + "@elite.edu";
      
      // 1. Firebase Auth හරහා පමණක් ලොග් වීම තහවුරු කිරීම
      await firebase.auth().signInWithEmailAndPassword(loginEmail, pass);

      // 2. Database එකෙන් පරිශීලක දත්ත ලබා ගැනීම
      let data = await apiCall('teachers/' + nic);
      if(!data) { 
          msg.innerText = "User not found in Database."; 
          btn.disabled = false; btn.innerHTML = 'Login'; 
          return;
      }
      
      // 3. පළමු වරට ලොග් වන්නේ නම් Setup Box එක පෙන්වීම
      if(data.isFirstLogin || !data.password) { 
          tempSetupNic = nic; 
          document.getElementById('loginBox').style.display = 'none'; 
          document.getElementById('setupBox').style.display = 'flex'; 
          return; 
      }
      
      // 4. දත්ත සමුදායේ ඇති Hash කළ මුරපදය පරීක්ෂා කිරීම
      if(data.password === await hashData(pass)) {
          grantAccess(data, nic); 
      } else { 
          msg.innerText = "Wrong password details."; 
          btn.disabled = false; btn.innerHTML = 'Login'; 
      }
      
    } catch(err) { 
        msg.innerText = "Wrong ID/Password (or accounts not synced)."; 
        btn.disabled = false; btn.innerHTML = 'Login'; 
        console.error(err);
    }
  }

  function grantAccess(data, nic) {
    currentUser = data; currentUser.nic = nic;
    document.getElementById('setupBox').style.display = 'none'; document.getElementById('loginBox').style.display = 'none'; document.getElementById('appLayout').style.display = 'flex';
    let role = data.role || "Teacher"; let badgeHtml = `<span class="badge badge-blue">${role}</span>`; if(data.isAdmin) badgeHtml += `<span class="badge badge-red">ADMIN</span>`;
    document.getElementById('topbarUser').innerHTML = `${data.name} ${badgeHtml}`;

    // Show temporary initial state before cache loads
    document.getElementById('nav_secDashboard').style.display = 'flex';
    switchSection('secDashboard');

    refreshGlobalCache(); 
  }

  window.switchSection = function(secId) {
    document.querySelectorAll('.section-box').forEach(el => el.style.display = 'none'); document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
    document.getElementById(secId).style.display = 'block'; let navEl = document.getElementById('nav_' + secId); if(navEl) navEl.classList.add('active');
    let titleMap = { 'secDashboard': 'Home', 'secClasses': 'Classes', 'secSubjects': 'Subjects', 'secTeachers': 'Teachers', 'secStudents': 'Students', 'secMarks': 'Mark Entry', 'secProgress': 'Progress', 'secReports': 'Reports' };
    document.getElementById('pageTitle').innerText = titleMap[secId] || "Home";
    if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
    if(secId === 'secReports') closeReportConfig(); 
    if(secId === 'secClasses') filterClasses(); if(secId === 'secSubjects') filterSubjects(); if(secId === 'secTeachers') filterTeachers(); if(secId === 'secStudents') filterStudents();
  }
  
  window.logout = async function() { 
      await firebase.auth().signOut();
      location.reload(); 
  }
  
  window.completeFirstSetup = async function() {
    let p1 = document.getElementById('newPass1').value, p2 = document.getElementById('newPass2').value, msg = document.getElementById('setupMsg');
    if(p1.length < 6) return msg.innerText = "Password needs 6+ characters."; if(p1 !== p2) return msg.innerText = "Passwords are not the same.";
    msg.style.color = "var(--primary)"; msg.innerText = "Saving..."; 
    
    try {
        await firebase.auth().currentUser.updatePassword(p1);
        await apiCall('teachers/' + tempSetupNic, 'PATCH', { password: await hashData(p1), isFirstLogin: false });
        let data = await apiCall('teachers/' + tempSetupNic); 
        grantAccess(data, tempSetupNic);
    } catch(err) {
        msg.style.color = "var(--danger)"; msg.innerText = "Error: " + err.message;
    }
  }

  window.bulkCreateAuthAccounts = async function() {
    if(!confirm("Start creating Auth accounts for all teachers? (This may take a few minutes)")) return;
    const app2 = firebase.apps.find(app => app.name === "SecondaryApp") || firebase.initializeApp(firebaseConfig, "SecondaryApp");
    const auth2 = app2.auth();
    let nics = Object.keys(allTeachersData); 
    let successCount = 0; let existCount = 0;

    for (let nic of nics) {
        if(nic === "ADMIN") continue;
        let email = nic.toUpperCase() + "@elite.edu";
        let defaultPass = nic.toUpperCase(); 

        try {
            await auth2.createUserWithEmailAndPassword(email, defaultPass);
            await auth2.signOut(); 
            successCount++;
        } catch (e) {
            if (e.code === 'auth/email-already-in-use') { existCount++; } 
            else if (e.code === 'auth/too-many-requests') { alert("Firebase limit reached. Try again in an hour."); break; } 
        }
    }
    alert("Done! Created: " + successCount + ", Existing: " + existCount);
  }

    window.showAddClassForm = function() { document.getElementById('addClassForm').style.display = 'block'; }
    window.filterClasses = debounce(function() {
        let filterVal = document.getElementById('filterClassInput').value.trim().toLowerCase();
        let tbody = document.getElementById('classesTbody'); 
        let keys = Object.keys(allClassesData);
        let filteredKeys = keys.filter(k => k.toLowerCase().includes(filterVal) || (allClassesData[k].grade || "").toLowerCase().includes(filterVal) || (allClassesData[k].teacher || "").toLowerCase().includes(filterVal));
        
        if(filteredKeys.length === 0) return tbody.innerHTML = `<tr><td colspan='4' style='text-align:center; padding:20px; color:var(--text-muted); background:#fff;'>No classes found.</td></tr>`;
        filteredKeys.sort(); 
        
        let actionTh = document.querySelector('#classesTable th:last-child');
        if(actionTh) actionTh.style.display = window.perms.editClasses ? '' : 'none';

        let tableData = ""; 
        filteredKeys.forEach(k => { 
            let c = allClassesData[k]; 
            let btnHtml = window.perms.editClasses ? `<td style="text-align:center; white-space:nowrap;"><button class="btn-action btn-small" onclick="editClass('${k}', '${c.grade}', '${c.teacher}')"><span class="material-symbols-outlined icon-small">edit</span></button> <button class="btn-action btn-small" onclick="deleteClass('${k}')" style="color:var(--danger);"><span class="material-symbols-outlined icon-small">delete</span></button></td>` : '';
            tableData += `<tr><td style="font-weight:800;">${k}</td><td><span class="badge badge-gray">${c.grade || '-'}</span></td><td style="color:var(--text-muted); font-weight:600;">${c.teacher || '-'}</td>${btnHtml}</tr>`; 
        });
        tbody.innerHTML = tableData;
    }, 400);

    window.saveClass = async function() {
      let cName = document.getElementById('cName').value.trim().toUpperCase(), cGrade = document.getElementById('cGrade').value, cTeacher = document.getElementById('cTeacher').value, msg = document.getElementById('adminMsgCls');
      if (!cName) return msg.innerText = "Class Name is needed.";
      let btn = document.getElementById('btnSaveClass'); btn.disabled = true; msg.style.color = "var(--primary)"; msg.innerText = "Saving...";
      try { await apiCall('classes/' + cName, 'PUT', { grade: cGrade, teacher: cTeacher }); msg.style.color = "var(--success)"; msg.innerText = editingClass ? "Updated!" : "Saved!"; setTimeout(() => msg.innerText="", 3000); resetClassForm(); await refreshGlobalCache(true); } catch (err) { msg.style.color = "var(--danger)"; msg.innerText = "Error saving."; } btn.disabled = false;
  }
    window.editClass = function(name, grade, teacher) { editingClass = true; document.getElementById('addClassForm').style.display = 'block'; document.getElementById('cName').value = name; document.getElementById('cName').readOnly = true; document.getElementById('cGrade').value = grade; document.getElementById('cTeacher').value = teacher; document.getElementById('btnSaveClass').innerHTML = '<span class="material-symbols-outlined icon-small">save</span> Update'; document.getElementById('btnCancelClass').style.display = "inline-flex"; }
    window.resetClassForm = function() { editingClass = false; document.getElementById('cName').value = ""; document.getElementById('cName').readOnly = false; document.getElementById('cTeacher').value = ""; document.getElementById('btnSaveClass').innerHTML = '<span class="material-symbols-outlined icon-small">save</span> Save'; document.getElementById('btnCancelClass').style.display = "none"; document.getElementById('addClassForm').style.display = "none"; }
    window.deleteClass = async function(name) { if(confirm(`Delete Class "${name}"?`)) { await apiCall('classes/' + name, 'DELETE'); refreshGlobalCache(true); } }

    window.showAddSubjectForm = function() { document.getElementById('addSubjectForm').style.display = 'block'; }

    window.toggleSubjectBasket = function() {
      let type = document.getElementById('subGradeType').value;
      let basketDiv = document.getElementById('subBasketDiv');
      if(type !== 'ol_main' && type !== 'al_main') { 
          basketDiv.style.display = 'block'; 
      } else { 
          basketDiv.style.display = 'none'; 
          document.getElementById('subBasketName').value = ''; 
      }
    }
  
    window.filterSubjects = debounce(function() {
        let filterVal = document.getElementById('filterSubject').value.trim().toLowerCase();
        let tbody = document.getElementById('subjectsTbody'); 
        let keys = Object.keys(allSubjectsData); 
        let filteredKeys = keys.filter(k => allSubjectsData[k].name.toLowerCase().includes(filterVal) || (allSubjectsData[k].code || "").toLowerCase().includes(filterVal) || (allSubjectsData[k].basketName || "").toLowerCase().includes(filterVal));
        
        if(filteredKeys.length === 0) return tbody.innerHTML = `<tr><td colspan='4' style='text-align:center; padding:20px;'>No subjects found.</td></tr>`; 
        filteredKeys.sort((a,b) => allSubjectsData[a].name.localeCompare(allSubjectsData[b].name));
        
        let actionTh = document.querySelector('#subjectsTable th:last-child');
        if(actionTh) actionTh.style.display = window.perms.editSubjects ? '' : 'none';

        let tableData = ""; 
        filteredKeys.forEach(k => { 
            let s = allSubjectsData[k]; 
            let tBadge = s.gradeType ? `<span class="badge badge-gray" style="margin:0;">${s.gradeType.replace('_', ' ').toUpperCase()}</span>` : '';
            let bBadge = s.basketName ? `<span class="badge badge-blue" style="margin:0;">${s.basketName}</span>` : '';
            let btnHtml = window.perms.editSubjects ? `<td style="text-align:center; white-space:nowrap;"><button class="btn-action btn-small" onclick="editSubject('${k}', '${s.name.replace(/'/g, "\\'")}', '${s.code || ''}', '${s.gradeType || 'ol_main'}', '${s.basketName || ''}')"><span class="material-symbols-outlined icon-small">edit</span></button> <button class="btn-action btn-small" onclick="deleteSubject('${k}', '${s.name.replace(/'/g, "\\'")}')" style="color:var(--danger);"><span class="material-symbols-outlined icon-small">delete</span></button></td>` : '';
            
            tableData += `<tr>
                            <td>
                               <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                                <span style="font-weight:700; white-space:nowrap;">${s.name}</span>
                                ${bBadge}
                            </div>
                            </td>
                            <td style="color:var(--text-muted); font-weight:600;">${s.code || '-'}</td>
                            <td>${tBadge}</td>
                            ${btnHtml}
                        </tr>`; 
        });
        tbody.innerHTML = tableData;
    }, 400);
  
    window.saveSubject = async function() {
      let subName = document.getElementById('subName').value.trim(), subCode = document.getElementById('subCode').value.trim().toUpperCase(), msg = document.getElementById('adminMsgSub');
      let subType = document.getElementById('subGradeType').value;
      let subBasket = document.getElementById('subBasketName').value.trim();
      if(subBasket) subBasket = subBasket.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

      if (!subName || !subCode) return msg.innerText = "Name and Code are needed.";
      let btn = document.getElementById('btnSaveSubject'); btn.disabled = true; msg.style.color = "var(--primary)"; msg.innerText = "Saving...";
      try { 
          let subKey = editingSubject ? currentSubjectKey : "SUBJ_" + Date.now(); 
          await apiCall('subjects/' + subKey, 'PUT', { name: subName, code: subCode, gradeType: subType, basketName: subBasket }); 
          msg.style.color = "var(--success)"; msg.innerText = editingSubject ? "Updated!" : "Saved!"; 
          setTimeout(() => msg.innerText="", 3000); resetSubjectForm(); await refreshGlobalCache(true); 
      } catch (err) { msg.style.color = "var(--danger)"; msg.innerText = "Error saving."; } 
      btn.disabled = false;
  }
  
    window.editSubject = function(key, name, code, type, basket) { 
      editingSubject = true; currentSubjectKey = key; 
      document.getElementById('addSubjectForm').style.display = 'block'; 
      document.getElementById('subName').value = name; 
      document.getElementById('subCode').value = code; 
      document.getElementById('subGradeType').value = type || 'ol_main';
      document.getElementById('subBasketName').value = basket || '';
      toggleSubjectBasket();
      document.getElementById('btnSaveSubject').innerHTML = '<span class="material-symbols-outlined icon-small">save</span> Update'; 
      document.getElementById('btnCancelSubject').style.display = "inline-flex"; 
  }
  
    window.resetSubjectForm = function() { 
      editingSubject = false; currentSubjectKey = null; 
      document.getElementById('subName').value = ""; 
      document.getElementById('subCode').value = ""; 
      document.getElementById('subGradeType').value = "ol_main";
      document.getElementById('subBasketName').value = "";
      toggleSubjectBasket();
      document.getElementById('btnSaveSubject').innerHTML = '<span class="material-symbols-outlined icon-small">save</span> Save'; 
      document.getElementById('btnCancelSubject').style.display = "none"; 
      document.getElementById('addSubjectForm').style.display = "none"; 
  }
    window.deleteSubject = async function(key, name) { if(confirm(`Delete Subject "${name}"?`)) { await apiCall('subjects/' + key, 'DELETE'); refreshGlobalCache(true); } }

    window.checkTeacherEmpNo = function() {
    let val = document.getElementById('tEmpNo').value.trim(); let warn = document.getElementById('tEmpNoWarning'); if(!val) { warn.style.display = 'none'; return; }
    let currentNIC = document.getElementById('tNIC').value.trim().toUpperCase(); let exists = Object.keys(allTeachersData).some(k => { return allTeachersData[k].empNo === val && (!editingTeacher || k !== currentNIC); }); warn.style.display = exists ? 'block' : 'none';
  }
    window.checkTeacherNIC = function() { if(editingTeacher) return; let inputEl = document.getElementById('tNIC'); inputEl.value = inputEl.value.toUpperCase(); let val = inputEl.value.trim(); let warn = document.getElementById('tNICWarning'); warn.style.display = (val && allTeachersData[val]) ? 'block' : 'none'; }
  
    window.filterTeachers = debounce(function() {
        let filterVal = document.getElementById('filterTeacher').value.trim().toLowerCase(); 
        let tbody = document.getElementById('teachersTbody'); 
        let keys = Object.keys(allTeachersData);
        
        let filteredKeys = keys.filter(k => { 
            let t = allTeachersData[k]; 
            return k.toLowerCase().includes(filterVal) || (t.name || "").toLowerCase().includes(filterVal) || (t.empNo || "").toLowerCase().includes(filterVal); 
        }).slice(0, 50);
        
        if(filteredKeys.length === 0) return tbody.innerHTML = `<tr><td colspan='5' style='text-align:center; padding:20px;'>No teachers found</td></tr>`;
      
      let actionTh = document.querySelector('#secTeachers table th:last-child');
      if(actionTh) actionTh.style.display = window.perms.editTeachers ? '' : 'none';

      let tableData = "";
      filteredKeys.forEach(key => { 
          let t = allTeachersData[key]; 
          let rBadge = t.isAdmin ? `<span class="badge badge-red" style="margin:0;">ADMIN</span>` : "";
          let btnHtml = window.perms.editTeachers ? `<td style="text-align:center; white-space:nowrap;"><button class="btn-action btn-small" onclick="adminResetPassword('${key}','${t.name}')" title="Reset Password"><span class="material-symbols-outlined icon-small">key</span></button> <button class="btn-action btn-small" onclick="editTeacher('${key}','${t.name.replace(/'/g, "\\'")}','${t.role}','${t.empNo||''}','${t.isAdmin||false}')"><span class="material-symbols-outlined icon-small">edit</span></button> <button class="btn-action btn-small" onclick="deleteTeacher('${key}','${t.name.replace(/'/g, "\\'")}')" style="color:var(--danger);"><span class="material-symbols-outlined icon-small">delete</span></button></td>` : ''; 
          
          tableData += `<tr>
                            <td style="font-weight:700;">${t.empNo || '-'}</td>
                            <td>${key}</td>
                            <td style="font-weight:800; color:var(--text-main);">${t.name}</td>
                            <td>
                                <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-start;">
                                    <span class="badge badge-gray" style="margin:0;">${t.role}</span>
                                    ${rBadge}
                                </div>
                            </td>
                            ${btnHtml}
                        </tr>`; 
      });
      tbody.innerHTML = tableData;
    }, 400);
  
    window.saveTeacher = async function() {
    let nic = document.getElementById('tNIC').value.trim().toUpperCase(); let name = document.getElementById('tName').value.trim(); let role = document.getElementById('tRole').value; let empNo = document.getElementById('tEmpNo').value.trim(); let isAdmin = document.getElementById('tIsAdmin').checked; let msg = document.getElementById('adminMsgT');
    if(!nic || !name) return msg.innerText = "ID and Name are needed!"; 
    if(!editingTeacher && allTeachersData[nic]) { if(!confirm("This ID already exists! Overwrite?")) return; }
    let empExists = Object.keys(allTeachersData).some(k => allTeachersData[k].empNo === empNo && k !== nic); 
    if(empExists) { if(!confirm(`This Number (${empNo}) is already used! Continue?`)) return; }
    
    let updateData = { name: name, role: role, empNo: empNo, isAdmin: isAdmin }; 
    if(!editingTeacher) { updateData.isFirstLogin = true; updateData.password = null; }
    msg.style.color = "var(--primary)"; msg.innerText = "Saving..."; 
    
    try {
        if (!editingTeacher) {
            let app2 = firebase.apps.find(app => app.name === "SecondaryApp") || firebase.initializeApp(firebaseConfig, "SecondaryApp");
            let email = nic + "@elite.edu"; let defaultPass = nic; 
            try { await app2.auth().createUserWithEmailAndPassword(email, defaultPass); await app2.auth().signOut(); } catch (authErr) { if (authErr.code !== 'auth/email-already-in-use') { msg.style.color = "var(--danger)"; msg.innerText = "Auth Error: " + authErr.message; return; } }
        }
        await apiCall('teachers/' + nic, 'PATCH', updateData); 
        msg.style.color = "var(--success)"; msg.innerText = editingTeacher ? "Updated!" : "Added!"; 
        setTimeout(() => msg.innerText="", 3000); resetTeacherForm(); refreshGlobalCache(true);
    } catch(err) { msg.style.color = "var(--danger)"; msg.innerText = "Database Error: " + err.message; }
  }
  
  window.adminResetPassword = async function(nic, name) { alert("Please delete and re-add the teacher, or use Firebase Console to reset the password."); }
  
  window.editTeacher = function(nic, name, role, empNo, isAdmin) { editingTeacher = true; document.getElementById('tNIC').value = nic; document.getElementById('tNIC').readOnly = true; document.getElementById('tName').value = name; document.getElementById('tRole').value = role; document.getElementById('tEmpNo').value = empNo; document.getElementById('tIsAdmin').checked = (isAdmin === 'true' || isAdmin === true); document.getElementById('btnSaveTeacher').innerHTML = '<span class="material-symbols-outlined icon-small">save</span> Update'; document.getElementById('btnCancelTeacher').style.display = "inline-flex"; checkTeacherEmpNo(); document.querySelector('.scroll-area')?.scrollTo(0,0); }
  window.deleteTeacher = async function(nic, name) { if(currentUser.nic === nic) return alert("You cannot delete yourself."); if(confirm(`Delete "${name}"?`)) { await apiCall('teachers/' + nic, 'DELETE'); refreshGlobalCache(true); } }
  window.resetTeacherForm = function() { editingTeacher = false; document.getElementById('tNIC').value = ""; document.getElementById('tNIC').readOnly = false; document.getElementById('tName').value = ""; document.getElementById('tEmpNo').value = ""; document.getElementById('tIsAdmin').checked = false; document.getElementById('tRole').value = "Teacher"; document.getElementById('btnSaveTeacher').innerHTML = '<span class="material-symbols-outlined icon-small">save</span> Save'; document.getElementById('btnCancelTeacher').style.display = "none"; document.getElementById('tEmpNoWarning').style.display = 'none'; document.getElementById('tNICWarning').style.display = 'none'; }

  function parseCSV(str) { let arr = []; let quote = false; let col = "", row = []; for (let c of str) { if (c === '"' && quote) quote = false; else if (c === '"' && !quote) quote = true; else if (c === ',' && !quote) { row.push(col.trim()); col = ""; } else if (c === '\n' && !quote) { row.push(col.trim()); arr.push(row); col = ""; row = []; } else if (c !== '\r') col += c; } if (col || row.length) { row.push(col.trim()); arr.push(row); } return arr.filter(r => r.join('').trim() !== ''); }
  window.downloadTeacherTemplate = function() { let csv = "EmpNo,NIC,Name,Role,IsAdmin(Yes/No)\nT001,850000000V,Kamal Perera,Teacher,No"; let a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `Teacher_File_Format.csv`; a.click(); }
  window.importTeachersCSV = function() {
    let file = document.getElementById('tCsvFile').files[0]; let msg = document.getElementById('tImportMsg'); if(!file) return msg.innerText = "Please pick a file first."; msg.style.color = "var(--primary)"; msg.innerText = "Reading file...";
    let reader = new FileReader(); reader.onload = async function(e) { try { let rows = parseCSV(e.target.result); if(rows.length < 2) return msg.innerText = "File has no data."; let updates = {}; let count = 0; for(let i=1; i<rows.length; i++) { let r = rows[i]; if(r.length >= 5) { let empNo = r[0], nic = r[1] ? r[1].trim().toUpperCase() : "", name = r[2], role = r[3], isAdminStr = r[4].toLowerCase(); if(nic && name) { updates[nic] = { empNo: empNo, name: name, role: role, isAdmin: (isAdminStr === 'yes' || isAdminStr === 'true'), isFirstLogin: true, password: null }; count++; } } }
        if(count > 0) { msg.innerText = `Saving ${count} teachers...`; await apiCall('teachers', 'PATCH', updates); msg.style.color = "var(--success)"; msg.innerText = `Saved ${count} teachers!`; document.getElementById('tCsvFile').value = ""; setTimeout(()=>msg.innerText="", 4000); refreshGlobalCache(true); } else { msg.innerText = "No correct data to save."; } } catch(err) { msg.style.color = "var(--danger)"; msg.innerText = "File error: " + err.message; }
    }; reader.readAsText(file);
  }

  window.checkStudentAdmNo = function() { if(editingStudent) return; let val = document.getElementById('sAdmNo').value.trim(); let warn = document.getElementById('sAdmNoWarning'); warn.style.display = (val && allStudentsData[val]) ? 'block' : 'none'; }
  
  // අලුතින් එක් කළ ශ්‍රිතය: තෝරන ලද පන්තියට අදාළ සිසුන් පමණක් Database එකෙන් Query කිරීම
  window.loadStudentsByClass = async function() {
      let cls = document.getElementById('studentClassFilter').value;
      let tbody = document.getElementById('studentsTbody');
      
      if(!cls) {
          allStudentsData = {}; // පන්තියක් තෝරා නොමැති නම් දත්ත හිස් කරයි
          tbody.innerHTML = `<tr><td colspan='5' style='text-align:center; padding:20px; font-weight:600; color:var(--text-muted);'>Please select a class to view students.</td></tr>`;
          return;
      }
      
      tbody.innerHTML = `<tr><td colspan='5' style='text-align:center; padding:20px; font-weight:600;'><span class="material-symbols-outlined" style="animation: spin 1s linear infinite; vertical-align:middle; margin-right:8px; color:var(--primary);">sync</span> Loading students...</td></tr>`;

      try {
          // Firebase Query එක හරහා අදාළ පන්තියේ සිසුන් පමණක් Download කරගැනීම
          let queryParams = `?orderBy="class"&equalTo="${cls}"`;
          let classStudents = await apiCall('students', 'GET', null, queryParams);
          
          allStudentsData = classStudents || {}; // Cache එකට අදාළ පන්තිය පමණක් යෙදීම

          // --- DATA CLEANING FIX FOR GENDER ---
          Object.keys(allStudentsData).forEach(k => {
              let g = (allStudentsData[k].gender || "Male").trim().toLowerCase();
              allStudentsData[k].gender = (g === 'female' || g === 'girl' || g === 'f') ? 'Female' : 'Male';
          });

          filterStudents(); // දත්ත පැමිණි පසු Table එක Render කිරීම
      } catch (err) {
          console.error("Error loading students:", err);
          tbody.innerHTML = `<tr><td colspan='5' style='text-align:center; padding:20px; color:var(--danger); font-weight:600;'>Error loading students from database.</td></tr>`;
      }
  };

  // යාවත්කාලීන කළ ශ්‍රිතය: Load වූ පන්තියේ සිසුන් අතරින් Search කිරීම
  window.filterStudents = debounce(function() {
      let cls = document.getElementById('studentClassFilter').value;
      let filterVal = document.getElementById('filterStudentInput').value.trim().toLowerCase();
      let tbody = document.getElementById('studentsTbody');
      
      if(!cls && Object.keys(allStudentsData).length === 0) {
          return tbody.innerHTML = `<tr><td colspan='5' style='text-align:center; padding:20px; font-weight:600; color:var(--text-muted);'>Please select a class to view students.</td></tr>`;
      }

      let keys = Object.keys(allStudentsData);
      
      let filteredKeys = keys.filter(k => { 
          let s = allStudentsData[k]; 
          return k.toLowerCase().includes(filterVal) || 
                 (s.name||"").toLowerCase().includes(filterVal) || 
                 (s.class||"").toLowerCase().includes(filterVal); 
      });

      if(filterVal === "" && filteredKeys.length > 50) {
          filteredKeys = filteredKeys.slice(0, 50); 
      }
        
      filteredKeys.sort((a,b) => { let sA = allStudentsData[a]; let sB = allStudentsData[b]; let gA = sA.gender === 'Female' ? 1 : 0; let gB = sB.gender === 'Female' ? 1 : 0; if(gA !== gB) return gA - gB; return a.localeCompare(b, undefined, {numeric: true}); });

      if(filteredKeys.length === 0) return tbody.innerHTML = `<tr><td colspan='5' style='text-align:center; padding:20px;'>No students found</td></tr>`; 
        
      let role = currentUser ? (currentUser.role ? currentUser.role.toLowerCase() : "") : "";
      let isCT = role === "class teacher" || role === "assistant class teacher";
      let isSysAdmin = currentUser && (currentUser.isAdmin === true || currentUser.isAdmin === "true" || role.includes("system admin") || currentUser.isSetupMode);

      let actionTh = document.querySelector('#secStudents table th:last-child');
      if(actionTh) actionTh.style.display = window.perms.editStudents ? '' : 'none';

      let tableData = "";
      filteredKeys.forEach(key => { 
          let s = allStudentsData[key]; 
          let canEditThis = false;
          if (window.perms.editStudents) {
              if (isSysAdmin || (!isCT && window.perms.editStudents)) { 
                  canEditThis = true;
              } else if (isCT && s.class === window.assignedClass) {
                  canEditThis = true;
              }
          }

          let btnHtml = '';
          if(window.perms.editStudents) {
              if(canEditThis) {
                btnHtml = `<td style="text-align:center; white-space:nowrap;"><button class="btn-action btn-small" onclick="editStudent('${key}', '${s.name.replace(/'/g, "\\'")}', '${s.class}', '${s.gender}', '${s.contact || ''}')"><span class="material-symbols-outlined icon-small">edit</span></button> <button class="btn-action btn-small" onclick="deleteStudent('${key}', '${s.name.replace(/'/g, "\\'")}')" style="color:var(--danger);"><span class="material-symbols-outlined icon-small">delete</span></button></td>`;
              } else {
                btnHtml = `<td></td>`;
              }
          }
          
          tableData += `<tr><td style="font-weight:700;">${key}</td><td style="font-weight:800; color:var(--text-main);">${s.name}</td><td><span class="badge badge-gray">${s.class}</span></td><td><span class="badge badge-blue">${s.gender || 'Male'}</span></td>${btnHtml}</tr>`; 
      });
      tbody.innerHTML = tableData;
  }, 400);
  
  window.saveStudent = async function() {
    let admNo = document.getElementById('sAdmNo').value.trim(), name = document.getElementById('sName').value.trim(), cls = document.getElementById('sClass').value, gender = document.getElementById('sGender').value, contact = document.getElementById('sContact').value.trim(), msg = document.getElementById('adminMsgS');
    if(!admNo || !name || !cls) return msg.innerText = "Admission No, Name and Class are needed!"; 
    if(!editingStudent && allStudentsData[admNo]) { if(!confirm("This Number already exists! Overwrite?")) return; }
    msg.style.color = "var(--primary)"; msg.innerText = "Saving..."; 
    await apiCall('students/' + admNo, 'PUT', { name: name, class: cls, gender: gender, contact: contact }); 
    msg.style.color = "var(--success)"; msg.innerText = editingStudent ? "Updated!" : "Added!"; 
    setTimeout(() => msg.innerText="", 3000); resetStudentForm(); refreshGlobalCache(true);
}
  window.editStudent = function(a, n, c, g, contact) { 
    editingStudent = true; 
    document.getElementById('sAdmNo').value = a; document.getElementById('sAdmNo').readOnly = true; 
    document.getElementById('sName').value = n; 
    document.getElementById('sClass').value = c; 
    document.getElementById('sGender').value = g || 'Male'; 
    document.getElementById('sContact').value = contact || ''; 
    document.getElementById('btnSaveStudent').innerHTML = '<span class="material-symbols-outlined icon-small">save</span> Update'; 
    document.getElementById('btnCancelStudent').style.display = "inline-flex"; 
    document.getElementById('sAdmNoWarning').style.display = 'none'; 
    document.querySelector('.scroll-area')?.scrollTo(0,0); 
}
  window.deleteStudent = async function(admNo, name) { 
    if(confirm(`Delete "${name}"?`)) { 
        await apiCall('students/' + admNo, 'DELETE'); 
        refreshGlobalCache(true); } 
    }
  window.resetStudentForm = function() { 
    editingStudent = false; 
    document.getElementById('sAdmNo').value = ""; document.getElementById('sAdmNo').readOnly = false; 
    document.getElementById('sName').value = ""; document.getElementById('sClass').value = ""; 
    document.getElementById('sGender').value = "Male"; document.getElementById('sContact').value = ""; 
    document.getElementById('btnSaveStudent').innerHTML = '<span class="material-symbols-outlined icon-small">save</span> Save'; 
    document.getElementById('btnCancelStudent').style.display = "none"; 
    document.getElementById('sAdmNoWarning').style.display = 'none'; 
}

  window.downloadStudentTemplate = function() { let csv = "AdmNo,Name,Class,Gender(Male/Female)\n1001,Nimal Silva,12-A,Male"; let a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `Student_File_Format.csv`; a.click(); }
  window.importStudentsCSV = function() {
    let file = document.getElementById('sCsvFile').files[0]; let msg = document.getElementById('sImportMsg'); if(!file) return msg.innerText = "Please pick a file first."; msg.style.color = "var(--primary)"; msg.innerText = "Reading file...";
    let reader = new FileReader(); reader.onload = async function(e) { try { let rows = parseCSV(e.target.result); if(rows.length < 2) return msg.innerText = "File has no data."; let updates = {}; let count = 0; 
    for(let i=1; i<rows.length; i++) { 
        let r = rows[i]; 
        if(r.length >= 3) { 
            let admNo = r[0], name = r[1], cls = r[2];
            
            // --- CSV GENDER FIX ---
            let rawGen = r[3] ? r[3].trim().toLowerCase() : 'male';
            let gender = (rawGen === 'female' || rawGen === 'girl' || rawGen === 'f') ? 'Female' : 'Male';
            // ----------------------
            
            if(admNo && name && cls) { updates[admNo] = { name: name, class: cls, gender: gender }; count++; } 
        } 
    }
    if(count > 0) { msg.innerText = `Saving ${count} students...`; await apiCall('students', 'PATCH', updates); msg.style.color = "var(--success)"; msg.innerText = `Saved ${count} students!`; document.getElementById('sCsvFile').value = ""; setTimeout(()=>msg.innerText="", 4000); refreshGlobalCache(true); } else { msg.innerText = "No correct data to save."; } } catch(err) { msg.style.color = "var(--danger)"; msg.innerText = "File error: " + err.message; }
    }; reader.readAsText(file);
  }

    window.filterMarkStudents = debounce(function() {
        let filterVal = document.getElementById('markSearchInput').value.toLowerCase();
        let rows = document.querySelectorAll('#markEntryTbody tr');
        rows.forEach(row => { 
            let admNo = row.cells[0].innerText.toLowerCase(); 
            let name = row.cells[1].innerText.toLowerCase(); 
            row.style.display = (admNo.includes(filterVal) || name.includes(filterVal)) ? '' : 'none';
        });
    }, 300);

  window.loadStudentsToMark = async function() {
    let cls = document.getElementById('marksClassSelect').value, yr = document.getElementById('yearSelect').value, trm = document.getElementById('termSelect').value, subKey = document.getElementById('marksSubjectSelect').value, cont = document.getElementById('studentListContainer');
    if(!cls || !subKey) return alert("Please select Class and Subject."); cont.innerHTML = "<div style='text-align:center; padding:20px; color:var(--text-muted);'><span class='material-symbols-outlined' style='animation: spin 1s linear infinite; font-size:32px;'>sync</span><br><br>Getting students...</div>";
    
    let isBucket = subKey.startsWith('BUCKET:::');
    let actualBucketName = isBucket ? subKey.split(':::')[1] : null;

    let bucketSubjects = [];
    if(isBucket) { Object.keys(allSubjectsData).forEach(k => { if(allSubjectsData[k].basketName === actualBucketName) { bucketSubjects.push({key: k, name: allSubjectsData[k].name}); } }); }

    try {
      // Server-Side Filtering: Firebase හරහා අදාළ පන්තියේ සිසුන් පමණක් ලබා ගැනීම
      let queryParams = `?orderBy="class"&equalTo="${cls}"`;
      let classStudentsData = await apiCall('students', 'GET', null, queryParams);
      
      let classSts = [];
      if (classStudentsData) {
          classSts = Object.keys(classStudentsData).map(k => {
              let s = {admNo: k, ...classStudentsData[k]};
              // --- GENDER FIX: ඩේටාබේස් එකෙන් කෙලින්ම එන දත්ත සඳහා ---
              let rawGen = s.gender ? s.gender.trim().toLowerCase() : 'male';
              s.gender = (rawGen === 'female' || rawGen === 'girl' || rawGen === 'f') ? 'Female' : 'Male';
              return s;
          });
      } 
      if(classSts.length === 0) return cont.innerHTML = "<p style='color:var(--danger); font-weight:700;'>No students in this class.</p>"; 
      
      let marksData = {};
      // සම්පූර්ණ වාරයටම අදාළ ලකුණු එකවර Cache එක හරහා ලබා ගැනීම
      let allMarksForTerm = await fetchWithCache(`marks/${yr}/${trm}`, false) || {};
      classSts.forEach(s => { 
          if(allMarksForTerm[s.admNo]) marksData[s.admNo] = allMarksForTerm[s.admNo]; 
      });
      
      classSts.sort((a,b) => { let gA = a.gender === 'Female' ? 1 : 0; let gB = b.gender === 'Female' ? 1 : 0; if (gA !== gB) return gA - gB; return a.admNo.localeCompare(b.admNo, undefined, {numeric: true}); });

      let disabledAttr = window.perms.editMarks ? "" : "disabled";

      let html = `<input type="text" id="markSearchInput" class="input-modern" placeholder="Search by Adm No or Name..." onkeyup="filterMarkStudents()" style="margin-bottom: 20px; max-width: 320px;">`;
      html += `<div class="table-container"><table class='ui-data-table'><thead><tr><th style="width:100px;">Adm. No</th><th>Student Name</th>`;

      if(isBucket) { html += `<th style="text-align:center; width:220px;">Assign Category Subject</th>`; }
      
      let titleSuffix = isBucket ? actualBucketName : (allSubjectsData[subKey]?allSubjectsData[subKey].name:'');
      html += `<th style="text-align:center; width:150px;">Marks for ${titleSuffix}</th></tr></thead><tbody id="markEntryTbody">`;
      
      classSts.forEach(s => { 
          let eMark = ""; let existingSubKey = "";
          // අලුතින් එක් කළ Delete අයිකනය 
          let delBtn = window.perms.editMarks ? `<button class="btn-action btn-small" onclick="deleteSingleMark('${s.admNo}')" style="color:var(--danger); border:none; background:transparent; padding:0; margin-left:8px;" title="Delete Mark"><span class="material-symbols-outlined" style="font-size:20px; vertical-align:middle;">delete</span></button>` : '';

          if(isBucket) {
              for(let bSub of bucketSubjects) { if(marksData[s.admNo] && marksData[s.admNo][bSub.key] !== undefined && marksData[s.admNo][bSub.key] !== null) { existingSubKey = bSub.key; eMark = marksData[s.admNo][bSub.key]; break; } }
              let selHtml = `<select class="input-modern" id="bsel_${s.admNo}" style="margin-bottom:0; padding:8px; font-size:13px; font-weight:700;" ${disabledAttr}><option value="">-- Not Assigned --</option>`;
              bucketSubjects.forEach(bSub => { selHtml += `<option value="${bSub.key}" ${existingSubKey === bSub.key ? 'selected' : ''}>${bSub.name}</option>`; });
              selHtml += `</select>`;
              html += `<tr><td style="font-weight:700;">${s.admNo}</td><td style="font-weight:800; white-space:nowrap; color:var(--text-main);">${s.name}</td><td style="text-align:center;">${selHtml}</td><td style="text-align:center; white-space:nowrap;"><input type='text' class='mark-input' id='m_${s.admNo}' value='${eMark}' placeholder='AB' autocomplete="off" oninput="validateMarkInput(this)" ${disabledAttr}> ${delBtn}</td></tr>`;
          } else {
              eMark = (marksData[s.admNo] && marksData[s.admNo][subKey]) ? marksData[s.admNo][subKey] : ""; 
              html += `<tr><td style="font-weight:700;">${s.admNo}</td><td style="font-weight:800; white-space:nowrap; color:var(--text-main);">${s.name}</td><td style="text-align:center; white-space:nowrap;"><input type='text' class='mark-input' id='m_${s.admNo}' value='${eMark}' placeholder='AB' autocomplete="off" oninput="validateMarkInput(this)" ${disabledAttr}> ${delBtn}</td></tr>`; 
          }
      }); 
      html += `</tbody></table></div>`;
      if (window.perms.editMarks) {
          // Edit සහ Bulk Delete පහසුකම සඳහා බොත්තම්
          html += `<div style="display:flex; gap:15px; margin-top:25px;">
                      <button class="btn-success" onclick="saveMarks()" id="saveBtn" style="flex:2; padding:14px; font-size:16px; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3);"><span class="material-symbols-outlined icon-small">save</span> Save Marks</button>
                      <button class="btn-danger" onclick="deleteAllMarksForSubject()" id="deleteMarksBtn" style="flex:1; padding:14px; font-size:16px; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.3);"><span class="material-symbols-outlined icon-small">delete_sweep</span> Delete All</button>
                   </div>
                   <div id="saveMsg" style="text-align:center; margin-top:15px; font-weight:800; font-size:15px;"></div>`;
      }
      cont.innerHTML = html;
      setTimeout(() => { let firstInput = document.querySelector('.mark-input'); if(firstInput && window.perms.editMarks) firstInput.focus(); }, 100);
    } catch(err) { cont.innerHTML = "Error getting data."; }
  }

  window.saveMarks = async function() {
    let yr = document.getElementById('yearSelect').value, trm = document.getElementById('termSelect').value, cls = document.getElementById('marksClassSelect').value, subKey = document.getElementById('marksSubjectSelect').value;
    let isBucket = subKey.startsWith('BUCKET:::'); let actualBucketName = isBucket ? subKey.split(':::')[1] : null; let bucketSubjectsKeys = [];
    
    if(isBucket) { bucketSubjectsKeys = Object.keys(allSubjectsData).filter(k => allSubjectsData[k].basketName === actualBucketName); } 
    else { var sData = allSubjectsData[subKey] || {}; var mGradeType = sData.gradeType || 'ol_main'; var mBasket = sData.basketName || ""; }

    let inputs = document.getElementsByClassName('mark-input'), updates = {}, msg = document.getElementById('saveMsg'), btn = document.getElementById('saveBtn');
    
    for(let i=0; i<inputs.length; i++) { 
        let val = inputs[i].value.trim().toUpperCase(), admNo = inputs[i].id.split('_')[1]; 
        
        // --- මෙහිදී හිස් තීරු (Blank) "AB" ලෙස ස්වයංක්‍රීයව සටහන් වේ ---
        if (val === "" || val === "ABSENT") {
            val = "AB";
            inputs[i].value = "AB"; // UI එකෙහිද යාවත්කාලීන වීම සඳහා
        }

        if (val !== "AB") {
            let numMark = Number(val);
            
            // අංකයක් නොවේ නම් හෝ අගය 0-100 අතර නොමැති නම්
            if (isNaN(numMark) || numMark < 0 || numMark > 100) {
                // වැරදි කොටුව රතු පාටින් Highlight කර පෙන්වීම
                inputs[i].style.borderColor = "var(--danger)"; 
                inputs[i].style.backgroundColor = "#fef2f2";
                inputs[i].focus(); // ගුරුවරයාට පහසුවෙන් හදාගන්න කොටුවට focus කිරීම
                
                btn.disabled = false;
                msg.innerText = "";
                return alert(`Invalid mark for Admission No: ${admNo}!\n\nMarks must be strictly between 0 and 100 (or 'AB' for Absent).`);
            }
            // නිවැරදි නම් ආපසු සාමාන්‍ය පාටට හැරවීම (කලින් වැරදිලා හදාගත්තා නම්)
            inputs[i].style.borderColor = "#cbd5e1";
            inputs[i].style.backgroundColor = "#ffffff";
        }

        if(isBucket) {
            let sel = document.getElementById(`bsel_${admNo}`); let selectedSubKey = sel ? sel.value : "";
            bucketSubjectsKeys.forEach(k => { updates[`marks/${yr}/${trm}/${admNo}/${k}`] = null; });
            // val හිස් නොවන බැවින් (අවම වශයෙන් AB හෝ ඇති බැවින්)
            if(selectedSubKey) { 
                updates[`marks/${yr}/${trm}/${admNo}/${selectedSubKey}`] = val; 
                updates[`class_subjects/${yr}/${trm}/${cls}/${selectedSubKey}`] = { grade: allSubjectsData[selectedSubKey].gradeType, type: 'basket', basketName: actualBucketName }; 
            }
        } else {
            updates[`marks/${yr}/${trm}/${admNo}/${subKey}`] = val; 
            updates[`class_subjects/${yr}/${trm}/${cls}/${subKey}`] = { grade: mGradeType, type: (mGradeType.includes('basket') || mGradeType.includes('common') || mBasket !== "") ? 'basket' : 'main', basketName: mBasket || "" }; 
        }
    }
    
    btn.disabled = true; msg.style.color = "var(--primary)"; msg.innerText = "Saving..."; 
    try { await apiCall('', 'PATCH', updates); btn.disabled = false; msg.style.color = "var(--success)"; msg.innerText = "Marks Saved Successfully!"; setTimeout(()=>msg.innerText="",3000); } 
    catch(e){ btn.disabled=false; msg.style.color="var(--danger)"; msg.innerText="Error Saving!";}
  }

  // --- අලුතින් එක් කළ Delete Functions ---
  
  // තනි සිසුවෙකුගේ ලකුණු මකා දැමීම
  window.deleteSingleMark = async function(admNo) {
      let yr = document.getElementById('yearSelect').value, trm = document.getElementById('termSelect').value, subKey = document.getElementById('marksSubjectSelect').value;
      let actualSubKey = subKey;
      let isBucket = subKey.startsWith('BUCKET:::');
      
      if (isBucket) {
          let sel = document.getElementById(`bsel_${admNo}`);
          actualSubKey = sel ? sel.value : "";
          if (!actualSubKey) return alert("No subject assigned to delete.");
      }

      if(!confirm(`Are you sure you want to completely DELETE the mark for student ${admNo}?`)) return;

      try {
          await apiCall(`marks/${yr}/${trm}/${admNo}/${actualSubKey}`, 'DELETE');
          document.getElementById(`m_${admNo}`).value = ""; // Clear visual input
          if(isBucket) document.getElementById(`bsel_${admNo}`).value = "";
      } catch(e) {
          alert("Error deleting mark.");
      }
  }

  // මුළු පංතියේම අදාළ විෂයයේ ලකුණු එකවර මකා දැමීම
  window.deleteAllMarksForSubject = async function() {
      let yr = document.getElementById('yearSelect').value, trm = document.getElementById('termSelect').value, cls = document.getElementById('marksClassSelect').value, subKey = document.getElementById('marksSubjectSelect').value;
      if(!confirm(`Are you sure you want to completely DELETE ALL marks for this subject in ${cls}?`)) return;
      
      let isBucket = subKey.startsWith('BUCKET:::');
      let actualBucketName = isBucket ? subKey.split(':::')[1] : null;
      let bucketSubjectsKeys = isBucket ? Object.keys(allSubjectsData).filter(k => allSubjectsData[k].basketName === actualBucketName) : [];

      let inputs = document.getElementsByClassName('mark-input');
      let updates = {};
      
      for(let i=0; i<inputs.length; i++) { 
          let admNo = inputs[i].id.split('_')[1];
          if(isBucket) {
              bucketSubjectsKeys.forEach(k => { updates[`marks/${yr}/${trm}/${admNo}/${k}`] = null; });
          } else {
              updates[`marks/${yr}/${trm}/${admNo}/${subKey}`] = null;
          }
      }
      
      let msg = document.getElementById('saveMsg');
      msg.style.color = "var(--danger)"; msg.innerText = "Deleting all marks..."; 
      try { 
          await apiCall('', 'PATCH', updates); 
          msg.style.color = "var(--success)"; msg.innerText = "All Marks Deleted Successfully!"; 
          setTimeout(()=> { msg.innerText=""; loadStudentsToMark(); }, 2000); 
      } 
      catch(e){ msg.style.color="var(--danger)"; msg.innerText="Error Deleting!";}
  }

  // --- Absent වූ විට Grade එක "-" ලෙස දැක්වීමට අදාළ වෙනස ---
  function getGr(m) { 
      let str = String(m).trim().toUpperCase();
      if (str === "AB" || str === "ABSENT") return "-"; 
      let val = Number(m); 
      if (isNaN(val)) return "-"; 
      return val>=75?"A":val>=65?"B":val>=50?"C":val>=35?"S":"W"; 
  }

    window.updateProgressStudentList = async function() {
        let cls = document.getElementById('progClassFilter').value; 
        document.getElementById('progAdmNo').value = '';
        
        if(cls) {
            // දත්ත cache එකේ නොමැති නම් අදාළ පන්තිය පමණක් ලබාගෙන cache එකට එක් කරයි
            try {
                let queryParams = `?orderBy="class"&equalTo="${cls}"`;
                let classStudents = await apiCall('students', 'GET', null, queryParams);
                if(classStudents) {
                    Object.assign(allStudentsData, classStudents); // ලබාගත් සිසුන් එකතු කිරීම
                }
            } catch(e) { console.error("Error loading class students for progress view"); }
            
            showStudentSuggestions(''); 
        } else {
            document.getElementById('progSuggestions').style.display = 'none';
        }
    }
  
    window.showStudentSuggestions = debounce(function(val) { 
        let box = document.getElementById('progSuggestions'); val = val.trim().toLowerCase(); let clsFilter = document.getElementById('progClassFilter').value.trim(); 
        let matches = Object.keys(allStudentsData).filter(k => { let s = allStudentsData[k]; let matchText = val === "" || k.toLowerCase().includes(val) || s.name.toLowerCase().includes(val); let matchCls = clsFilter === "" || s.class === clsFilter; return matchText && matchCls; }); 
        if(matches.length === 0) { box.innerHTML = '<div class="autocomplete-item" style="color:var(--text-muted); cursor:default;">No students found</div>'; box.style.display = 'block'; return; } 
        
        let html = ''; let limit = (val === "" && clsFilter !== "") ? 100 : 15;
        matches.slice(0, limit).forEach(k => { let s = allStudentsData[k]; html += `<div class="autocomplete-item" onclick="selectProgressStudent('${k}', '${s.name.replace(/'/g, "\\'")}')"><b>${k}</b> - ${s.name} <span style="float:right; color:var(--primary); font-size:12px; font-weight:800;">${s.class}</span></div>`; }); 
        box.innerHTML = html; box.style.display = 'block'; 
    }, 300);
    window.selectProgressStudent = function(admNo, name) { document.getElementById('progAdmNo').value = admNo; document.getElementById('progSuggestions').style.display = 'none'; loadStudentProgress(); }
    document.addEventListener("click", function (e) { 
      if (e.target.id !== "progAdmNo" && e.target.id !== "compareSearchInput" && e.target.id !== "studentMarksSearch") { 
          document.querySelectorAll(".autocomplete-items").forEach(el=>el.style.display="none"); 
      } 
    });

  window.loadStudentProgress = async function() {
    let admNo = document.getElementById('progAdmNo').value.trim(); if(!admNo) return alert("Please type an Admission Number."); document.getElementById('progressProfile').style.display = 'block'; document.getElementById('progStName').innerHTML = "Getting data...";
    let stData = allStudentsData[admNo] || await apiCall('students/' + admNo); if(!stData) { document.getElementById('progStName').innerHTML = `<span style="color:var(--danger);">Student not found!</span>`; document.getElementById('progChartLatest').parentElement.style.display = 'none'; document.getElementById('progChartHistory').parentElement.style.display = 'none'; document.getElementById('progTableContainer').innerHTML = ""; return; } document.getElementById('progStName').innerText = `${stData.name} (${admNo})`;
    
    let timeline = []; let subjectData = {}; let tableHtml = `<table class='ui-data-table'><thead><tr><th>Subject</th>`;
    let currYr = new Date().getFullYear(); let yearsToCheck = [currYr-2, currYr-1, currYr, currYr+1]; let termsToCheck = ['Term 1', 'Term 2', 'Term 3'];
    let proms = []; let fetchedMarks = {};
    yearsToCheck.forEach(yr => { fetchedMarks[yr] = {}; termsToCheck.forEach(trm => { proms.push(apiCall(`marks/${yr}/${trm}/${admNo}`).then(res => { if(res){ fetchedMarks[yr][trm] = res; } })); }); });
    await Promise.all(proms);

    yearsToCheck.forEach(yr => { termsToCheck.forEach(trm => { if(fetchedMarks[yr][trm]) { let timeKey = `${yr} ${trm}`; timeline.push(timeKey); tableHtml += `<th>${timeKey}</th>`; let subs = fetchedMarks[yr][trm]; Object.keys(subs).forEach(subKey => { if(!subjectData[subKey]) subjectData[subKey] = {}; subjectData[subKey][timeKey] = subs[subKey]; }); } }); });
    tableHtml += `</tr></thead><tbody>`;
    if(timeline.length === 0) { document.getElementById('progChartLatest').parentElement.style.display = 'none'; document.getElementById('progChartHistory').parentElement.style.display = 'none'; document.getElementById('progTableContainer').innerHTML = "<p>No marks saved yet.</p>"; return; }
    
    let sortedSubjects = Object.keys(subjectData).sort((a,b) => Object.keys(subjectData[b]).length - Object.keys(subjectData[a]).length); let topSubjects = sortedSubjects.slice(0, 8); 
    let latestTerm = timeline[timeline.length - 1]; let latestLabels = []; let latestData = []; let latestColors = []; let datasetsLine = []; let colors = ['#2563eb', '#dc2626', '#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6']; let cIndex = 0;
    
    sortedSubjects.forEach(subKey => { 
        let actualName = allSubjectsData[subKey] ? allSubjectsData[subKey].name : subKey; 
        tableHtml += `<tr><td style="font-weight:800;">${actualName}</td>`; 
        timeline.forEach(t => { let m = subjectData[subKey][t]; tableHtml += `<td style="text-align:center; font-weight:700;">${m !== undefined ? m : "-"}</td>`; }); tableHtml += `</tr>`; 
        
        if(topSubjects.includes(subKey)) { 
            let dataPoints = timeline.map(time => { let val = subjectData[subKey][time]; return (val === "AB" || val === undefined) ? null : Number(val); }); 
            datasetsLine.push({ label: actualName, data: dataPoints, borderColor: colors[cIndex % colors.length], backgroundColor: colors[cIndex % colors.length] + '22', fill: true, tension: 0.4, borderWidth: 3, pointRadius: 5 }); 
            
            let lMark = subjectData[subKey][latestTerm];
            if(lMark !== undefined && lMark !== "AB") { latestLabels.push(actualName); latestData.push(Number(lMark)); latestColors.push(colors[cIndex % colors.length]); }
            cIndex++; 
        } 
    }); 
    tableHtml += `</tbody></table>`; document.getElementById('progTableContainer').innerHTML = tableHtml;
    
    document.getElementById('progChartLatest').parentElement.style.display = 'block'; document.getElementById('progChartHistory').parentElement.style.display = 'block'; 
    
    let ctxBar = document.getElementById('progChartLatest').getContext('2d'); if(progChartLatest) progChartLatest.destroy(); 
    progChartLatest = new Chart(ctxBar, { type: 'bar', data: { labels: latestLabels, datasets: [{ label: `Latest Term (${latestTerm})`, data: latestData, backgroundColor: latestColors, borderRadius: 8 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: `Latest Term Marks (${latestTerm})`, font: { family: 'Inter', size: 15, weight: 'bold' } } }, scales: { y: { beginAtZero: true, max: 100 } } } });

    let ctxLine = document.getElementById('progChartHistory').getContext('2d'); if(progChartHistory) progChartHistory.destroy(); 
    progChartHistory = new Chart(ctxLine, { type: 'line', data: { labels: timeline, datasets: datasetsLine }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels:{font:{family:'Inter', weight:'bold'}, boxWidth: 14} }, title: { display: true, text: 'Past Marks Trend', font: { family: 'Inter', size: 15, weight: 'bold' } } }, scales: { y: { beginAtZero: true, max: 100 } } } });
  }

  // REPORTS SECTION
  window.openReportConfig = function(type) {
    currentReportType = type;
    document.getElementById('reportSelectionView').style.display = 'none'; 
    document.getElementById('reportConfigPanel').style.display = 'block'; 
    document.getElementById('reportOutputContainer').style.display = 'none'; 
    document.getElementById('analyticsPreview').style.display = 'none';
    
    let titleMap = { 
        'class_master': 'Class Master Sheet', 
        'class_student_list': 'Class Student List', 
        'individual_cards': 'Report Cards', 
        'subject_list': 'Subject Marks', 
        'top_achievers': 'Top Students (Class)', 
        'top_achievers_section': 'Grade Top Students', 
        'class_analytics': 'Class Charts', 
        'passes_summary_class': 'Pass Summary (Class)', 
        'passes_summary_section': 'Pass Summary (Grade)', 
        'prediction_report': 'O/L AI Prediction', 
        'al_prediction_report': 'A/L AI Prediction',
        'remedial_action_class': 'Remedial Action Report (Class)',
        'remedial_action_grade': 'Remedial Action Report (Grade)'
    };
    
    document.getElementById('configTitle').innerHTML = `<span class="material-symbols-outlined" style="color:var(--primary);">settings</span> ${titleMap[type]}`;
    
    document.getElementById('configYearDiv').style.display = 'block'; 
    document.getElementById('configTermDiv').style.display = 'block';
    document.getElementById('configClassDiv').style.display = 'block'; 
    document.getElementById('configGradeDiv').style.display = 'none';
    document.getElementById('configSubjectDiv').style.display = 'none';

    if(type === 'subject_list') document.getElementById('configSubjectDiv').style.display = 'block';
    if(type === 'top_achievers_section' || type === 'passes_summary_section' || type === 'remedial_action_grade') { 
        document.getElementById('configClassDiv').style.display = 'none'; 
        document.getElementById('configGradeDiv').style.display = 'block'; 
    } 
    
    if(type === 'prediction_report' || type === 'al_prediction_report' || type === 'class_student_list') { 
        document.getElementById('configYearDiv').style.display = 'none'; 
        document.getElementById('configTermDiv').style.display = 'none'; 
    } 

    document.getElementById('btnGenerateReport').onclick = () => routeReportGeneration(type);
}
    window.closeReportConfig = function() {
      // Config Panel සහ Output කොටස් සැඟවීම
      document.getElementById('reportConfigPanel').style.display = 'none';
      document.getElementById('reportOutputContainer').style.display = 'none';
      document.getElementById('analyticsPreview').style.display = 'none';
      
      // ප්‍රධාන මෙනුව නැවත දර්ශනය කිරීම
      document.getElementById('reportSelectionView').style.display = 'block';
      
      // පෙර ජනනය කළ වාර්තාවල දත්ත ඉවත් කිරීම
      let htmlContainer = document.getElementById('reportHtmlContainer');
      if(htmlContainer) htmlContainer.innerHTML = '';
      
      currentReportType = null;
}

function routeReportGeneration(type) {
    if(type === 'class_master') generateClassMasterReport(); 
    else if(type === 'class_student_list') generateClassStudentList(); 
    else if(type === 'individual_cards') generateIndividualCards(); 
    else if(type === 'subject_list') generateSubjectReport(); 
    else if(type === 'top_achievers') generateTopAchievers(); 
    else if(type === 'class_analytics') generateClassAnalytics(); 
    else if(type === 'top_achievers_section') generateTopAchieversSection();
    else if(type === 'passes_summary_class') generatePassesSummary('class');
    else if(type === 'passes_summary_section') generatePassesSummary('section');
    else if(type === 'prediction_report') generatePredictionReport();
    else if(type === 'al_prediction_report') generateALPredictionReport();
    else if(type === 'remedial_action_class') generateRemedialReport('class');
    else if(type === 'remedial_action_grade') generateRemedialReport('section');
}

  // --- අලුතින් එක් කරන ලද Top Achievers Renders ---
  async function generateTopAchievers() {
      let yr = document.getElementById('repYear').value, trm = document.getElementById('repTerm').value, cls = document.getElementById('repClass').value;
      if(!cls) return alert("Select a class.");
      let btn = document.getElementById('btnGenerateReport'); btn.innerHTML = "Processing..."; btn.disabled = true;
      let out = document.getElementById('reportOutputContainer'), htmlContainer = document.getElementById('reportHtmlContainer');
      out.style.display = 'block'; htmlContainer.innerHTML = "<div style='text-align:center; padding:30px;'><span class='material-symbols-outlined' style='animation: spin 1s linear infinite; font-size:32px; color:var(--primary);'>sync</span></div>";

      try {
          let { reportArray, isALevelReport, ctName } = await fetchAndCalculateClassMarks(yr, trm, cls);
          let topStudents = reportArray.filter(s => s.rank !== "-" && parseInt(s.rank) <= 10);

          // Rank එක අනුව කුඩා අගයේ සිට විශාල අගයට (Ascending) පෙළගැස්වීම සඳහා මෙම පේළිය අලුතින් එක් කරන්න
          topStudents.sort((a, b) => parseInt(a.rank) - parseInt(b.rank));

          // Type එක 'TopClass' ලෙසත්, cls යන්න 'targetName' ලෙසත් යාවත්කාලීන කර ඇත.
          window.currentReportData = { year: yr, term: trm, targetName: cls, ctName: ctName, students: topStudents, type: 'TopClass', isALevel: isALevelReport };

          let html = `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e2e8f0; padding-bottom:15px; margin-bottom:25px;">
                          <div><h3 style="margin:0; color:#f59e0b; font-size:24px; font-weight:900;"><span class="material-symbols-outlined" style="vertical-align:middle;">workspace_premium</span> Top Students (Class)</h3><p style="margin:6px 0 0 0; color:var(--text-muted); font-weight:700;">Class: <span style="color:var(--text-main);">${cls}</span> | Term: ${yr} ${trm}</p></div>
                          <div style='display:flex; gap:12px;'>
                              <button class='btn-danger btn-small' onclick='downloadReportPDF()'><span class="material-symbols-outlined icon-small">picture_as_pdf</span> PDF</button>
                              <button class='btn-success btn-small' onclick='exportReportToCSV()'><span class="material-symbols-outlined icon-small">table_view</span> CSV</button>
                          </div>
                      </div>
                      <table class='ui-data-table'><thead><tr><th style="width:70px; text-align:center;">Rank</th><th style="width:100px;">Adm No</th><th>Student Name</th><th style="text-align:center;">Total</th><th style="text-align:center;">${isALevelReport ? 'Z-Score' : 'Average'}</th></tr></thead><tbody>`;

          topStudents.forEach(s => {
              let medal = s.rank == 1 ? '🥇 ' : s.rank == 2 ? '🥈 ' : s.rank == 3 ? '🥉 ' : '';
              html += `<tr><td style="text-align:center; font-weight:900; font-size:16px; color:#f59e0b;">${medal}${s.rank}</td><td style="font-weight:700;">${s.admNo}</td><td style="font-weight:800; color:var(--text-main);">${s.name}</td><td style="text-align:center; font-weight:800;">${s.total}</td><td style="text-align:center; font-weight:800; color:var(--primary);">${isALevelReport ? s.overallZ : s.average}</td></tr>`;
          });
          html += `</tbody></table>`;
          htmlContainer.innerHTML = html; btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined icon-small">play_circle</span> Generate Report`;
      } catch(err) { htmlContainer.innerHTML = `<p style="color:var(--danger); font-weight:800;">Error: ${err.message}</p>`; btn.disabled = false; btn.innerHTML = `Generate Report`;}
  }

  async function generateTopAchieversSection() {
      let yr = document.getElementById('repYear').value, trm = document.getElementById('repTerm').value, grade = document.getElementById('repGrade').value;
      if(!grade) return alert("Select a Grade.");
      let btn = document.getElementById('btnGenerateReport'); btn.innerHTML = "Processing..."; btn.disabled = true;
      let out = document.getElementById('reportOutputContainer'), htmlContainer = document.getElementById('reportHtmlContainer');
      out.style.display = 'block'; htmlContainer.innerHTML = "<div style='text-align:center; padding:30px;'><span class='material-symbols-outlined' style='animation: spin 1s linear infinite; font-size:32px; color:var(--primary);'>sync</span></div>";

      try {
          let classesInGrade = Object.keys(allClassesData).filter(c => allClassesData[c].grade === grade);
          if(classesInGrade.length === 0) throw new Error("No classes found for this grade.");

          let sectionStudents = [];
          let isALevelReport = grade.includes("Grade 12") || grade.includes("Grade 13");

          for(let cls of classesInGrade) {
              try {
                  let res = await fetchAndCalculateClassMarks(yr, trm, cls);
                  res.reportArray.forEach(s => s.className = cls);
                  sectionStudents.push(...res.reportArray);
              } catch(e) {}
          }

          // 1. අගයන් අනුව පෙළගැස්වීම (Sorting)
          sectionStudents.sort((a,b) => {
              if (isALevelReport) {
                  if (a.hasAbsent && !b.hasAbsent) return 1;
                  if (!a.hasAbsent && b.hasAbsent) return -1;
                  return (parseFloat(b.overallZ) || 0) - (parseFloat(a.overallZ) || 0);
              } else {
                  return parseFloat(b.average) - parseFloat(a.average);
              }
          });

          // 2. Standard Competition Ranking (1, 1, 3, 4...) ලබා දීම
          let currentRank = 1;
          for (let i = 0; i < sectionStudents.length; i++) {
              let std = sectionStudents[i];
              let valid = isALevelReport ? (!std.hasAbsent && std.zCount > 0) : (std.total > 0 || std.count > 0);
              
              if (!valid) {
                  std.sectionRank = "-";
              } else {
                  let isTie = false;
                  if (i > 0) {
                      let prevStd = sectionStudents[i - 1];
                      let prevValid = isALevelReport ? (!prevStd.hasAbsent && prevStd.zCount > 0) : (prevStd.total > 0 || prevStd.count > 0);
                      
                      if (prevValid) {
                          if (isALevelReport && prevStd.overallZ === std.overallZ) isTie = true;
                          if (!isALevelReport && prevStd.average === std.average) isTie = true;
                      }
                  }

                  if (isTie) {
                      std.sectionRank = sectionStudents[i - 1].sectionRank; // සමාන නම් පෙර Rank එක
                  } else {
                      currentRank = i + 1;
                      std.sectionRank = currentRank; // සමාන නැත්නම් Array එකේ ඊළඟ අංකය
                  }
              }
          }

          let topStudents = sectionStudents.filter(s => s.sectionRank !== "-" && parseInt(s.sectionRank) <= 20);

          // Type එක 'TopSection' ලෙසත්, grade යන්න 'targetName' ලෙසත් යාවත්කාලීන කර ඇත.
          window.currentReportData = { year: yr, term: trm, targetName: grade, students: topStudents, type: 'TopSection', isALevel: isALevelReport };

          let html = `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e2e8f0; padding-bottom:15px; margin-bottom:25px;">
                          <div><h3 style="margin:0; color:#8b5cf6; font-size:24px; font-weight:900;"><span class="material-symbols-outlined" style="vertical-align:middle;">social_leaderboard</span> Top Students (Grade)</h3><p style="margin:6px 0 0 0; color:var(--text-muted); font-weight:700;">Grade: <span style="color:var(--text-main);">${grade}</span> | Term: ${yr} ${trm}</p></div>
                          <div style='display:flex; gap:12px;'>
                              <button class='btn-danger btn-small' onclick='downloadReportPDF()'><span class="material-symbols-outlined icon-small">picture_as_pdf</span> PDF</button>
                              <button class='btn-success btn-small' onclick='exportReportToCSV()'><span class="material-symbols-outlined icon-small">table_view</span> CSV</button>
                          </div>
                      </div>
                      <table class='ui-data-table'><thead><tr><th style="width:70px; text-align:center;">Grade Rank</th><th style="width:100px;">Adm No</th><th>Student Name</th><th>Class</th><th style="text-align:center;">Total</th><th style="text-align:center;">${isALevelReport ? 'Z-Score' : 'Average'}</th></tr></thead><tbody>`;

          topStudents.forEach(s => {
              let medal = s.sectionRank == 1 ? '🥇 ' : s.sectionRank == 2 ? '🥈 ' : s.sectionRank == 3 ? '🥉 ' : '';
              html += `<tr><td style="text-align:center; font-weight:900; font-size:16px; color:#8b5cf6;">${medal}${s.sectionRank}</td><td style="font-weight:700;">${s.admNo}</td><td style="font-weight:800; color:var(--text-main);">${s.name}</td><td><span class="badge badge-gray">${s.className}</span></td><td style="text-align:center; font-weight:800;">${s.total}</td><td style="text-align:center; font-weight:800; color:var(--primary);">${isALevelReport ? s.overallZ : s.average}</td></tr>`;
          });
          html += `</tbody></table>`;
          htmlContainer.innerHTML = html; btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined icon-small">play_circle</span> Generate Report`;
      } catch(err) { htmlContainer.innerHTML = `<p style="color:var(--danger); font-weight:800;">Error: ${err.message}</p>`; btn.disabled = false; btn.innerHTML = `Generate Report`;}
  }


  async function getGradeZStats(yr, trm, grade) {
      let classesInGrade = Object.keys(allClassesData).filter(c => allClassesData[c].grade === grade);
      let marksDB = await fetchWithCache(`marks/${yr}/${trm}`, false) || {}; 

      let isTech = grade.toUpperCase().includes('TECHNOLOGY');
      let subjectMarks = { ET: {}, BST: {}, OTHER: {} }; 

      classesInGrade.forEach(c => {
          let studentsInClass = Object.keys(allStudentsData).filter(k => allStudentsData[k].class === c);
          studentsInClass.forEach(admNo => {
              if(marksDB[admNo]) {
                  let stream = 'OTHER';
                  if (isTech) {
                      let hasET = Object.keys(marksDB[admNo]).some(k => allSubjectsData[k] && allSubjectsData[k].name.toLowerCase().includes('engineering'));
                      let hasBST = Object.keys(marksDB[admNo]).some(k => allSubjectsData[k] && (allSubjectsData[k].name.toLowerCase().includes('bio system') || allSubjectsData[k].name.toLowerCase().includes('biosystem')));
                      if (hasET) stream = 'ET'; else if (hasBST) stream = 'BST';
                  }

                  Object.keys(marksDB[admNo]).forEach(subKey => {
                      let mk = marksDB[admNo][subKey];
                      let subjName = allSubjectsData[subKey] ? allSubjectsData[subKey].name.toLowerCase() : "";
                      let ignore = subjName.includes("general english") || subjName.includes("git") || subjName.includes("common general test") || subjName.includes("comman general test");

                      if(mk !== "AB" && mk !== undefined && !isNaN(Number(mk)) && !ignore) {
                          if(!subjectMarks[stream][subKey]) subjectMarks[stream][subKey] = [];
                          subjectMarks[stream][subKey].push(Number(mk));
                      }
                  });
              }
          });
      });

      let stats = { ET: {}, BST: {}, OTHER: {} };
      ['ET', 'BST', 'OTHER'].forEach(stream => {
          Object.keys(subjectMarks[stream]).forEach(subKey => {
              let arr = subjectMarks[stream][subKey];
              let n = arr.length;
              if(n > 0) {
                  let mean = arr.reduce((a,b)=>a+b,0) / n;
                  let variance = arr.reduce((a,b)=>a + Math.pow(b-mean, 2), 0) / n;
                  let sd = Math.sqrt(variance) || 1; 
                  stats[stream][subKey] = { mean: mean, sd: sd };
              }
          });
      });
      return { isTech, stats };
  }

  // --- CORE CALCULATION ENGINE ---
  async function fetchAndCalculateClassMarks(yr, trm, cls) {
      let classMeta = await apiCall(`class_subjects/${yr}/${trm}/${cls}`) || {}; 
      let classSts = Object.keys(allStudentsData).filter(k => allStudentsData[k].class === cls).map(k => ({admNo: k, ...allStudentsData[k]})); 
      if(classSts.length === 0) throw new Error("No students found in class: " + cls);
      
      let marksData = {};
      let allMarksForTerm = await fetchWithCache(`marks/${yr}/${trm}`, false) || {};
      classSts.forEach(st => { 
          if(allMarksForTerm[st.admNo]) marksData[st.admNo] = allMarksForTerm[st.admNo]; 
      });

      let ctName = allClassesData[cls] ? allClassesData[cls].teacher : "........................................"; 
      let cGrade = allClassesData[cls] ? allClassesData[cls].grade : "";
      
      let isALevelReport = cGrade.includes("Grade 12") || cGrade.includes("Grade 13");

      let reportMap = {}; let allRawSubjectKeys = []; let gradeTally = { 'A': 0, 'B': 0, 'C': 0, 'S': 0, 'W': 0, 'AB': 0 };
      classSts.forEach(st => { reportMap[st.admNo] = { admNo: st.admNo, name: st.name, gender: st.gender || 'Male', rawMarks: {}, displayMarks: {}, total: 0, count: 0, zTotal: 0, zCount: 0, hasAbsent: false }; }); 
      classSts.forEach(st => { 
          if(marksData[st.admNo]) { 
              Object.keys(marksData[st.admNo]).forEach(subKey => { 
                  let rawMark = marksData[st.admNo][subKey]; 
                  let isAB = (String(rawMark).trim().toUpperCase() === "AB" || String(rawMark).trim().toUpperCase() === "ABSENT"); 
                  let calcMark = isAB ? 0 : (Number(rawMark) || 0); 
                  reportMap[st.admNo].rawMarks[subKey] = isAB ? "AB" : calcMark; 
                  if(!allRawSubjectKeys.includes(subKey)) allRawSubjectKeys.push(subKey); 
              }); 
          } 
      });

      // --- වෙනස් කළ කොටස ආරම්භය: විෂයයන් අනුපිළිවෙලට සකස් කිරීම ---
      let mainCols = []; 
      let basketCols = [];
      allRawSubjectKeys.forEach(subKey => { 
          let sName = allSubjectsData[subKey] ? allSubjectsData[subKey].name : "Unknown"; 
          let sData = allSubjectsData[subKey] || {};
          let fallbackType = (sData.gradeType && (sData.gradeType.includes('basket') || sData.gradeType.includes('common') || sData.basketName)) ? 'basket' : 'main';
          let meta = classMeta[subKey] || { type: fallbackType, basketName: sData.basketName || '' };
          
          if(meta.type === 'basket' && meta.basketName) { 
              if(!basketCols.includes(meta.basketName)) basketCols.push(meta.basketName); 
          } else { 
              if(!mainCols.includes(sName)) mainCols.push(sName); 
          } 
      });

      mainCols.sort((a,b) => a.localeCompare(b));
      basketCols.sort((a,b) => a.localeCompare(b));

      let displayCols = [...mainCols, ...basketCols];
      // --- වෙනස් කළ කොටස අවසානය ---

      let globalZStatsData = {};
      if(isALevelReport && cGrade) { globalZStatsData = await getGradeZStats(yr, trm, cGrade); }
      let globalZStats = globalZStatsData.stats || { OTHER: {} };
      let isTechGrade = globalZStatsData.isTech || false;

      let reportArray = Object.keys(reportMap).map(k => reportMap[k]); 
      
      reportArray.forEach(std => { 
        std.stream = 'OTHER';
        if (isTechGrade) {
            let hasET = Object.keys(std.rawMarks).some(k => allSubjectsData[k] && allSubjectsData[k].name.toLowerCase().includes('engineering'));
            let hasBST = Object.keys(std.rawMarks).some(k => allSubjectsData[k] && (allSubjectsData[k].name.toLowerCase().includes('bio system') || allSubjectsData[k].name.toLowerCase().includes('biosystem')));
            if (hasET) std.stream = 'ET'; else if (hasBST) std.stream = 'BST';
        }

        displayCols.forEach(colName => { 
            let mk = undefined; let actualSubj = ""; let actualSubjCode = ""; let currentSubKey = null;
            
            for(let subKey of allRawSubjectKeys) { 
                let sName = allSubjectsData[subKey] ? allSubjectsData[subKey].name : "Unknown"; 
                let sCode = allSubjectsData[subKey] ? allSubjectsData[subKey].code : ""; 
                let sData = allSubjectsData[subKey] || {};
                let fallbackType = (sData.gradeType && (sData.gradeType.includes('basket') || sData.gradeType.includes('common') || sData.basketName)) ? 'basket' : 'main';
                let meta = classMeta[subKey] || { type: fallbackType, basketName: sData.basketName || '' };

                if(meta.type === 'basket' && meta.basketName === colName && std.rawMarks[subKey] !== undefined) { 
                    mk = std.rawMarks[subKey]; actualSubj = sName; actualSubjCode = sCode; currentSubKey = subKey; break; 
                } else if (meta.type !== 'basket' && sName === colName && std.rawMarks[subKey] !== undefined) { 
                    mk = std.rawMarks[subKey]; actualSubj = sName; actualSubjCode = sCode; currentSubKey = subKey; break; 
                } 
            } 
            
            std.displayMarks[colName] = { value: mk, actualSubj: actualSubj, actualSubjCode: actualSubjCode }; 
            
            if(mk !== undefined && mk !== "AB") { 
                std.total += mk; std.count++; 
                let gr = getGr(mk); gradeTally[gr]++; 
                
                let subjName = allSubjectsData[currentSubKey] ? allSubjectsData[currentSubKey].name.toLowerCase() : "";
                let ignore = subjName.includes("general english") || subjName.includes("git") || subjName.includes("common general test") || subjName.includes("comman general test");

                if(isALevelReport && currentSubKey && !ignore) {
                    let streamStats = globalZStats[std.stream] ? globalZStats[std.stream][currentSubKey] : null;
                    if (!streamStats && globalZStats['OTHER']) streamStats = globalZStats['OTHER'][currentSubKey]; // Fallback
                    if (streamStats) {
                        let z = (mk - streamStats.mean) / streamStats.sd;
                        std.zTotal += z; std.zCount++;
                    }
                }
            } else if (mk === "AB") { 
                std.count++; gradeTally['AB']++;
                std.hasAbsent = true;
            } 
        }); 
        
        std.average = std.count > 0 ? (std.total / std.count).toFixed(2) : "0.00"; 
        std.overallZ = std.hasAbsent ? "-" : (std.zCount > 0 ? (std.zTotal / std.zCount).toFixed(4) : "0.0000"); 
      });

      if(isALevelReport) { 
          // 12-13 ශ්‍රේණි සඳහා (Absent නම් Rank නොදෙයි)
          reportArray.sort((a, b) => {
              if (a.hasAbsent && !b.hasAbsent) return 1; 
              if (!a.hasAbsent && b.hasAbsent) return -1;
              return (parseFloat(b.overallZ) || 0) - (parseFloat(a.overallZ) || 0);
          }); 
          let currentRank = 1;
          for (let i = 0; i < reportArray.length; i++) {
              let std = reportArray[i];
              if (std.zCount === 0 || std.hasAbsent) {
                  std.rank = "-";
              } else {
                  if (i > 0 && reportArray[i - 1].rank !== "-" && reportArray[i - 1].overallZ === std.overallZ) {
                      std.rank = reportArray[i - 1].rank;
                  } else {
                      currentRank = i + 1;
                      std.rank = currentRank;
                  }
              }
          }
      } else { 
          // 6-11 ශ්‍රේණි සඳහා (Standard Competition Ranking)
          reportArray.sort((a, b) => {
              return parseFloat(b.average) - parseFloat(a.average);
          }); 
          let currentRank = 1;
          for (let i = 0; i < reportArray.length; i++) {
              let std = reportArray[i];
              if (std.total === 0 && std.count === 0) {
                  std.rank = "-";
              } else {
                  if (i > 0 && reportArray[i - 1].rank !== "-" && reportArray[i - 1].average === std.average) {
                      std.rank = reportArray[i - 1].rank;
                  } else {
                      currentRank = i + 1;
                      std.rank = currentRank;
                  }
              }
          }
      }

      reportArray.sort((a, b) => {
          let gA = a.gender === 'Female' ? 1 : 0;
          let gB = b.gender === 'Female' ? 1 : 0;
          if (gA !== gB) return gA - gB;
          return a.admNo.localeCompare(b.admNo, undefined, {numeric: true});
      });
      
      return { reportArray, displayCols, isALevelReport, ctName, gradeTally };
  }

  function getComboStringAndScore(student) {
      let grades = {'A':0, 'B':0, 'C':0, 'S':0, 'W':0, 'AB':0};
      Object.values(student.displayMarks).forEach(dm => { if(dm && dm.value !== undefined) { let g = getGr(dm.value); if(grades[g] !== undefined) grades[g]++; } });
      let comboArr = [];
      
      // පෙර තිබූ 9A වෙනුවට A9 ලෙස සකසා ඇත
      if(grades['A']>0) comboArr.push('A' + grades['A']); 
      if(grades['B']>0) comboArr.push('B' + grades['B']); 
      if(grades['C']>0) comboArr.push('C' + grades['C']); 
      if(grades['S']>0) comboArr.push('S' + grades['S']); 
      if(grades['W']>0) comboArr.push('W' + grades['W']);
      
      let comboStr = comboArr.join(' ') || 'No Marks';
      let score = (grades['A']*10000) + (grades['B']*1000) + (grades['C']*100) + (grades['S']*10) - (grades['W']*10);
      return { str: comboStr, score: score };
  }

async function generateClassMasterReport() {
      let yr = document.getElementById('repYear').value, trm = document.getElementById('repTerm').value, cls = document.getElementById('repClass').value;
      if(!cls) return alert("Select a class."); let btn = document.getElementById('btnGenerateReport'); btn.innerHTML = "Processing..."; btn.disabled = true;
      let out = document.getElementById('reportOutputContainer'), htmlContainer = document.getElementById('reportHtmlContainer'); out.style.display = 'block'; htmlContainer.innerHTML = "<div style='text-align:center; padding:30px;'><span class='material-symbols-outlined' style='animation: spin 1s linear infinite; font-size:32px; color:var(--primary);'>sync</span></div>";

      try {
          let { reportArray, displayCols, isALevelReport, ctName } = await fetchAndCalculateClassMarks(yr, trm, cls);
          let cGrade = allClassesData[cls] ? allClassesData[cls].grade : "";
          let isMiddleSchool = cGrade.includes("Grade 6") || cGrade.includes("Grade 7") || cGrade.includes("Grade 8") || cGrade.includes("Grade 9");

          let extraStats = null;
          if(!isMiddleSchool) {
              extraStats = { classAvg: {'>=75':0, '65-74':0, '50-64':0, '35-49':0, '<35':0}, secAvg: {'>=75':0, '65-74':0, '50-64':0, '35-49':0, '<35':0}, classCombos: {}, secCombos: {} };
              let classesInGrade = Object.keys(allClassesData).filter(c => allClassesData[c].grade === cGrade);
              let sectionStudents = [];
              for(let c of classesInGrade) { try { let res = await fetchAndCalculateClassMarks(yr, trm, c); res.reportArray.forEach(s => s.className = c); sectionStudents.push(...res.reportArray); } catch(e) {} }
              sectionStudents.forEach(s => {
                  let avg = parseFloat(s.average);
                  let avgCat = avg >= 75 ? '>=75' : avg >= 65 ? '65-74' : avg >= 50 ? '50-64' : avg >= 35 ? '35-49' : '<35';
                  extraStats.secAvg[avgCat]++; if(s.className === cls) extraStats.classAvg[avgCat]++;
                  let combo = getComboStringAndScore(s);
                  extraStats.secCombos[combo.str] = (extraStats.secCombos[combo.str] || 0) + 1;
                  if(s.className === cls) extraStats.classCombos[combo.str] = (extraStats.classCombos[combo.str] || 0) + 1;
              });
          }

          window.currentReportData = { year: yr, term: trm, cls: cls, ctName: ctName, displayCols: displayCols, students: reportArray, type: 'Class', isALevel: isALevelReport, extraStats: extraStats };

          // Build Subject Tallies (Subject-wise Range Count)
          let subjectTallies = {};
          displayCols.forEach(col => { subjectTallies[col] = { 'A':0, 'B':0, 'C':0, 'S':0, 'W':0, 'AB':0 }; });
          
          reportArray.forEach(s => {
              displayCols.forEach(col => {
                  let cellData = s.displayMarks[col];
                  let val = cellData && cellData.value !== undefined ? cellData.value : "-";
                  if(val === "AB") subjectTallies[col]['AB']++;
                  else if(val !== "-" && !isNaN(val)) {
                      let num = Number(val);
                      if(num >= 75) subjectTallies[col]['A']++;
                      else if(num >= 65) subjectTallies[col]['B']++;
                      else if(num >= 50) subjectTallies[col]['C']++;
                      else if(num >= 35) subjectTallies[col]['S']++;
                      else subjectTallies[col]['W']++;
                  }
              });
          });

          let html = `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e2e8f0; padding-bottom:15px; margin-bottom:25px;">
                        <div><h3 style="margin:0; color:var(--primary); font-size:24px; font-weight:900;">Class Master Sheet</h3><p style="margin:6px 0 0 0; color:var(--text-muted); font-weight:700;">Class: <span style="color:var(--text-main);">${cls}</span> | Teacher: <span style="color:var(--text-main);">${ctName}</span> | Term: ${yr} ${trm}</p></div>
                        <div style='display:flex; gap:12px;'>
                            <button class='btn-danger btn-small' onclick='downloadReportPDF()'><span class="material-symbols-outlined icon-small">picture_as_pdf</span> PDF</button>
                            <button class='btn-success btn-small' onclick='exportReportToCSV()'><span class="material-symbols-outlined icon-small">table_view</span> CSV</button>
                        </div>
                      </div>
                      <table class='ui-data-table'><thead><tr><th style="width:70px;">Adm No</th><th style="width:200px; white-space:nowrap;">Student Name</th>`;
          displayCols.forEach(c => html += `<th style="text-align:center;">${c}</th>`);
          html += `<th style="text-align:center;">Total</th><th style="text-align:center;">${isALevelReport ? 'Z-Score' : 'Average'}</th><th style="text-align:center;">Rank</th></tr></thead><tbody>`;
          
          reportArray.forEach(s => { html += `<tr><td style="font-weight:700;">${s.admNo}</td><td style="font-weight:800; white-space:normal; color:var(--text-main);">${s.name}</td>`; displayCols.forEach(col => { let cellData = s.displayMarks[col]; let val = cellData && cellData.value !== undefined ? cellData.value : "-"; if(cellData && cellData.actualSubj && val !== "-" && val !== "AB" && cellData.actualSubj !== col) val += `<br><span style="font-size:11px; color:var(--text-muted); font-weight:600;">(${cellData.actualSubjCode || cellData.actualSubj})</span>`; html += `<td style='text-align:center; font-weight:600; white-space:nowrap;'>${val}</td>`; }); html += `<td style='text-align:center; font-weight:800;'>${s.total}</td><td style='text-align:center; font-weight:800; color:var(--primary);'>${isALevelReport ? s.overallZ : s.average}</td><td style='text-align:center; font-weight:900; color:var(--success); font-size:16px;'>${s.rank}</td></tr>`; });
          
          // Close Main Table
          html += `</tbody></table>`;

          // NEW SEPARATE TABLE: Subject-wise Grade Summary (Width Auto & Left Aligned)
          html += `<div style="margin-top:35px; margin-bottom:20px;">
                    <h4 style="margin:0 0 12px 0; font-size:16px; font-weight:800; color:var(--text-main);">Subject-wise Grade Summary</h4>
                    <div style="overflow-x: auto;">
                        <table class="ui-data-table" style="font-size:13px; width: auto; min-width: auto; margin-left: 0; margin-right: auto;">
                            <thead>
                                <tr><th style="text-align:left; padding: 10px 15px;">Grade / Criteria</th>`;
          displayCols.forEach(c => html += `<th style="text-align:center; padding: 10px 15px;">${c}</th>`);
          html += `</tr></thead><tbody>`;

          const addStandaloneTallyRow = (label, key, color) => {
              html += `<tr><td style="text-align:left; font-weight:800; color:#475569; padding: 10px 15px;">${label}</td>`;
              displayCols.forEach(col => { html += `<td style="text-align:center; font-weight:900; color:${color}; font-size:14px; padding: 10px 15px;">${subjectTallies[col][key]}</td>`; });
              html += `</tr>`;
          };

          addStandaloneTallyRow("A (>= 75)", "A", "#10b981");
          addStandaloneTallyRow("B (65 - 74)", "B", "#3b82f6");
          addStandaloneTallyRow("C (50 - 64)", "C", "#f59e0b");
          addStandaloneTallyRow("S (35 - 49)", "S", "#8b5cf6");
          addStandaloneTallyRow("W (< 35)", "W", "#ef4444");
          addStandaloneTallyRow("Absent (AB)", "AB", "#64748b");

          html += `</tbody></table></div></div>`;
          
          if(extraStats) {
               html += `<div style="display:flex; gap:25px; margin-top:25px; margin-bottom:20px;">`;
               let getScore = (str) => { let s = 0; str.split(' ').forEach(p => { let c=parseInt(p.replace(/[^0-9]/g, ''))||0; if(p.includes('A'))s+=c*10000; if(p.includes('B'))s+=c*1000; if(p.includes('C'))s+=c*100; if(p.includes('S'))s+=c*10; if(p.includes('W'))s-=c*10;}); return s; };
               let allCombos = Array.from(new Set([...Object.keys(extraStats.classCombos), ...Object.keys(extraStats.secCombos)])).sort((a,b) => getScore(b) - getScore(a));
               html += `<div style="flex:1; max-width: 500px;"><h4 style="margin:0 0 12px 0; font-size:15px; font-weight:800; color:var(--text-main);">Pass Summary</h4><table class="ui-data-table" style="font-size:12px;"><thead><tr><th>Pass Combination</th><th style="text-align:center;">Class Count</th><th style="text-align:center;">Grade Count</th></tr></thead><tbody>`;
               allCombos.forEach(combo => { html += `<tr><td style="font-weight:800;">${combo}</td><td style="text-align:center; font-weight:800; color:var(--primary);">${extraStats.classCombos[combo] || 0}</td><td style="text-align:center; font-weight:700;">${extraStats.secCombos[combo] || 0}</td></tr>`; });
               html += `</tbody></table></div></div>`;
          }

          htmlContainer.innerHTML = html; btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined icon-small">play_circle</span> Generate Report`;
      } catch (err) { htmlContainer.innerHTML = `<p style="color:var(--danger); font-weight:800;">Error: ${err.message}</p>`; btn.disabled = false; btn.innerHTML = `Generate Report`;}
  }

  async function generateClassStudentList() {
      let cls = document.getElementById('repClass').value;
      if(!cls) return alert("Select a class.");
      let btn = document.getElementById('btnGenerateReport'); btn.innerHTML = "Processing..."; btn.disabled = true;
      let out = document.getElementById('reportOutputContainer'), htmlContainer = document.getElementById('reportHtmlContainer');
      out.style.display = 'block'; htmlContainer.innerHTML = "<div style='text-align:center; padding:30px;'><span class='material-symbols-outlined' style='animation: spin 1s linear infinite; font-size:32px; color:var(--primary);'>sync</span></div>";

      try {
        let queryParams = `?orderBy="class"&equalTo="${cls}"`;
        let classStudentsData = await apiCall('students', 'GET', null, queryParams);
      
        let classSts = [];
        if (classStudentsData) {
            classSts = Object.keys(classStudentsData).map(k => {
                let s = {admNo: k, ...classStudentsData[k]};
                // --- GENDER FIX: වාර්තා සඳහා ඩේටාබේස් එකෙන් කෙලින්ම එන දත්ත ---
                let rawGen = s.gender ? s.gender.trim().toLowerCase() : 'male';
                s.gender = (rawGen === 'female' || rawGen === 'girl' || rawGen === 'f') ? 'Female' : 'Male';
                return s;
            });
        }

          if(classSts.length === 0) throw new Error("No students found in this class.");

          // Gender සහ Adm No අනුව පෙළගැස්වීම
          classSts.sort((a,b) => {
              let gA = a.gender === 'Female' ? 1 : 0; let gB = b.gender === 'Female' ? 1 : 0;
              if(gA !== gB) return gA - gB;
              return a.admNo.localeCompare(b.admNo, undefined, {numeric: true});
          });

          let ctName = allClassesData[cls] ? allClassesData[cls].teacher : "Not Assigned";

          window.currentReportData = { cls: cls, ctName: ctName, students: classSts, type: 'ClassStudentList' };

          let html = `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e2e8f0; padding-bottom:15px; margin-bottom:20px;">
                          <div><h3 style="margin:0; color:var(--primary); font-size:24px; font-weight:900;"><span class="material-symbols-outlined" style="vertical-align:middle; font-size:28px;">group</span> Class Student List</h3><p style="margin:6px 0 0 0; color:var(--text-muted); font-weight:700;">Class: <span style="color:var(--text-main);">${cls}</span> | Class Teacher: <span style="color:var(--text-main);">${ctName}</span> | Total: ${classSts.length}</p></div>
                          <div style='display:flex; gap:12px;'>
                              <button class='btn-danger btn-small' onclick='downloadReportPDF()'><span class="material-symbols-outlined icon-small">picture_as_pdf</span> PDF</button>
                              <button class='btn-success btn-small' onclick='exportReportToCSV()'><span class="material-symbols-outlined icon-small">table_view</span> CSV</button>
                          </div>
                      </div>
                      
                      <div style="background:#f8fafc; padding:15px; border-radius:12px; border:1px solid #cbd5e1; margin-bottom:20px; display:flex; align-items:center; gap:15px;">
                          <span class="material-symbols-outlined" style="color:var(--text-muted);">search</span>
                          <input type="text" id="advStudentSearch" class="input-modern" placeholder="Advanced Search by Adm No, Name, Gender or Contact Number..." onkeyup="filterStudentListReport()" style="margin:0; flex:1;">
                      </div>

                      <table class='ui-data-table' id='studentListReportTable'>
                          <thead><tr><th style="width:10%;">No</th><th style="width:15%;">Adm No</th><th style="width:40%;">Student Name</th><th style="width:15%;">Gender</th><th style="width:20%;">Contact Number</th></tr></thead>
                          <tbody>`;
          
          classSts.forEach((s, index) => {
              let contact = s.contact || "-";
              let gBadge = s.gender === 'Female' ? 'badge-red' : 'badge-blue';
              html += `<tr><td style="font-weight:800; color:var(--text-muted);">${index + 1}</td>
                       <td style="font-weight:800;">${s.admNo}</td>
                       <td style="font-weight:800; color:var(--text-main);">${s.name}</td>
                       <td><span class="badge ${gBadge}">${s.gender || 'Male'}</span></td>
                       <td style="font-weight:600; color:var(--text-muted);">${contact}</td></tr>`;
          });
          
          html += `</tbody></table>`;
          htmlContainer.innerHTML = html; btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined icon-small">play_circle</span> Generate Report`;
      } catch (err) { htmlContainer.innerHTML = `<p style="color:var(--danger); font-weight:800;">Error: ${err.message}</p>`; btn.disabled = false; btn.innerHTML = `Generate Report`;}
  }

    window.filterStudentListReport = debounce(function() {
        let filter = document.getElementById('advStudentSearch').value.toLowerCase();
        let rows = document.querySelectorAll('#studentListReportTable tbody tr');
        rows.forEach(row => {
            let text = row.textContent.toLowerCase();
            row.style.display = text.includes(filter) ? '' : 'none';
        });
    }, 300)

  async function generateIndividualCards() {
      let yr = document.getElementById('repYear').value, trm = document.getElementById('repTerm').value, cls = document.getElementById('repClass').value;
      if(!cls) return alert("Select a class."); let btn = document.getElementById('btnGenerateReport'); btn.innerHTML = "Processing..."; btn.disabled = true;
      let out = document.getElementById('reportOutputContainer'), htmlContainer = document.getElementById('reportHtmlContainer'); out.style.display = 'block'; htmlContainer.innerHTML = "<div style='text-align:center; padding:30px;'><span class='material-symbols-outlined' style='animation: spin 1s linear infinite; font-size:32px; color:var(--primary);'>sync</span></div>";

      try {
          let { reportArray, displayCols, isALevelReport, ctName } = await fetchAndCalculateClassMarks(yr, trm, cls);
          window.currentReportData = { year: yr, term: trm, cls: cls, ctName: ctName, displayCols: displayCols, students: reportArray, type: 'IndividualCards', isALevel: isALevelReport };

          let html = `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e2e8f0; padding-bottom:15px; margin-bottom:25px;">
                        <div><h3 style="margin:0; color:var(--primary); font-size:24px; font-weight:900;">Report Cards</h3><p style="margin:6px 0 0 0; color:var(--text-muted); font-weight:700;">Class: ${cls} | Generated ${reportArray.length} cards.</p></div>
                        <button class='btn-danger btn-small' onclick='downloadReportPDF()'><span class="material-symbols-outlined icon-small">print</span> Print Cards</button>
                      </div><div style="display:flex; flex-direction:column; gap:25px;">`;
          
          if(reportArray.length > 0) {
              let s = reportArray[0];
              html += `<div style="border:1px solid #cbd5e1; border-radius:12px; padding:25px; background:#fff; max-width:650px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                  <div style="display:flex; align-items:center; justify-content:center; gap:15px; margin-bottom:20px;"><div style="width: 55px; height: 55px;">${SYS_LOGO_SVG}</div><div><h4 style="margin:0; font-size:20px; font-weight:900;">R/Gankanda Central College</h4><p style="margin:2px 0 0 0; font-size:13px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">Student Progress Report - ${yr} ${trm}</p></div></div>
                  <div style="display:flex; justify-content:space-between; font-size:14px; font-weight:800; margin-bottom:20px; background:#f8fafc; padding:12px 16px; border-radius:8px; border:1px solid #e2e8f0;"><span>Name: ${s.name}</span><span style="color:var(--primary);">Adm No: ${s.admNo}</span></div>
                  <table style="width:100%; border-collapse:collapse; font-size:13px;"><thead><tr style="background:#f1f5f9;"><th style="border:1px solid #cbd5e1; padding:10px; text-align:left; font-weight:800;">Subject</th><th style="border:1px solid #cbd5e1; padding:10px; text-align:center; width:80px; font-weight:800;">Marks</th><th style="border:1px solid #cbd5e1; padding:10px; text-align:center; width:80px; font-weight:800;">Grade</th></tr></thead><tbody>`;
              displayCols.forEach(col => { let cellData = s.displayMarks[col]; let val = cellData && cellData.value !== undefined ? cellData.value : "-"; let finalSubjName = (cellData && cellData.actualSubj && cellData.actualSubj !== col) ? `${col} <span style="font-size:11px; color:#64748b;">(${cellData.actualSubjCode || cellData.actualSubj})</span>` : col; html += `<tr><td style="border:1px solid #cbd5e1; padding:10px; font-weight:600;">${finalSubjName}</td><td style="border:1px solid #cbd5e1; padding:10px; text-align:center; font-weight:800; font-size:14px;">${val}</td><td style="border:1px solid #cbd5e1; padding:10px; text-align:center; font-weight:900; font-size:14px; color:var(--primary);">${getGr(val)}</td></tr>`; });
              html += `</tbody></table><div style="display:flex; justify-content:space-around; margin-top:20px; padding:15px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; font-size:15px; font-weight:900;"><span>Total: <span style="color:var(--primary);">${s.total}</span></span><span>${isALevelReport ? 'Z-Score: <span style="color:var(--primary);">'+s.overallZ+'</span>' : 'Avg: <span style="color:var(--primary);">'+s.average+'</span>'}</span><span style="color:var(--success);">Rank: ${s.rank}</span></div><p style="text-align:center; font-size:12px; font-weight:600; color:var(--text-muted); margin-top:20px;">(Sample card shown. Click "Print Cards" to view all.)</p></div>`;
          }
          html += `</div>`; htmlContainer.innerHTML = html; btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined icon-small">play_circle</span> Generate Report`;
      } catch (err) { htmlContainer.innerHTML = `<p style="color:var(--danger); font-weight:800;">Error: ${err.message}</p>`; btn.disabled = false; btn.innerHTML = `Generate Report`;}
  }

  async function generateSubjectReport() {
    let yr = document.getElementById('repYear').value, trm = document.getElementById('repTerm').value, cls = document.getElementById('repClass').value, subKey = document.getElementById('repSubject').value;
    if(!cls || !subKey) return alert("Select Class and Subject."); let btn = document.getElementById('btnGenerateReport'); btn.innerHTML = "Processing..."; btn.disabled = true;
    let out = document.getElementById('reportOutputContainer'), htmlContainer = document.getElementById('reportHtmlContainer'); out.style.display = 'block'; htmlContainer.innerHTML = "<div style='text-align:center; padding:30px;'><span class='material-symbols-outlined' style='animation: spin 1s linear infinite; font-size:32px; color:var(--primary);'>sync</span></div>";
    try {
      let marksData = {}; let classStsKeys = Object.keys(allStudentsData).filter(k => allStudentsData[k].class === cls); let classSts = classStsKeys.map(k => ({admNo: k, ...allStudentsData[k]}));
      let fetchProms = classSts.map(async s => { let m = await apiCall(`marks/${yr}/${trm}/${s.admNo}`); if(m) marksData[s.admNo] = m; });
      await Promise.all(fetchProms);
      
      classSts.sort((a,b) => { let gA = a.gender === 'Female' ? 1 : 0; let gB = b.gender === 'Female' ? 1 : 0; if (gA !== gB) return gA - gB; return a.admNo.localeCompare(b.admNo, undefined, {numeric: true}); });

      let reportArray = []; 
      classSts.forEach(s => {  
      let mk = (marksData[s.admNo] && marksData[s.admNo][subKey] !== undefined && marksData[s.admNo][subKey] !== null && marksData[s.admNo][subKey] !== "") ? marksData[s.admNo][subKey] : "-"; 
      // ලකුණු ඇතුළත් කර ඇති සිසුන් පමණක් ලැයිස්තුවට එක් කිරීම
      if (mk !== "-") { 
        reportArray.push({ admNo: s.admNo, name: s.name, mark: mk, grade: getGr(mk) }); 
      } 
    });
      let actualSubjName = allSubjectsData[subKey] ? allSubjectsData[subKey].name : "Unknown Subject";
      window.currentReportData = { year: yr, term: trm, cls: cls, subject: actualSubjName, students: reportArray, type: 'Subject' };
      
      let html = `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e2e8f0; padding-bottom:15px; margin-bottom:25px;">
                    <div><h3 style="margin:0; color:var(--info); font-size:24px; font-weight:900;">Subject Marks</h3><p style="margin:6px 0 0 0; color:var(--text-muted); font-weight:700;">Subject: <span style="color:var(--text-main);">${actualSubjName}</span> | Class: ${cls} | Year: ${yr} ${trm}</p></div>
                    <div style='display:flex; gap:12px;'>
                        <button class='btn-danger btn-small' onclick='downloadReportPDF()'><span class="material-symbols-outlined icon-small">picture_as_pdf</span> PDF</button>
                        <button class='btn-success btn-small' onclick='exportReportToCSV()'><span class="material-symbols-outlined icon-small">table_view</span> CSV</button>
                    </div>
                  </div>
                  <table class='ui-data-table'><thead><tr><th style="width:100px;">Adm No</th><th style="white-space:nowrap;">Student Name</th><th style="text-align:center;">Marks</th><th style="text-align:center;">Grade</th></tr></thead><tbody>`;
      reportArray.forEach(s => { html += `<tr><td style="font-weight:700;">${s.admNo}</td><td style="font-weight:800; white-space:nowrap; color:var(--text-main);">${s.name}</td><td style="text-align:center; font-weight:800; font-size:16px;">${s.mark}</td><td style="text-align:center; color:var(--primary); font-weight:900; font-size:16px;">${s.grade}</td></tr>`; });
      html += `</tbody></table>`; htmlContainer.innerHTML = html; btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined icon-small">play_circle</span> Generate Report`;
    } catch(err) { htmlContainer.innerHTML = `<p style="color:var(--danger); font-weight:800;">Error: ${err.message}</p>`; btn.disabled = false; btn.innerHTML = `Generate Report`;}
  }

  async function generatePassesSummary(scope) {
      let yr = document.getElementById('repYear').value, trm = document.getElementById('repTerm').value;
      let target = scope === 'class' ? document.getElementById('repClass').value : document.getElementById('repGrade').value;
      if(!target) return alert("Select a target."); let btn = document.getElementById('btnGenerateReport'); btn.innerHTML = "Processing..."; btn.disabled = true;
      let out = document.getElementById('reportOutputContainer'), htmlContainer = document.getElementById('reportHtmlContainer'); out.style.display = 'block'; htmlContainer.innerHTML = "<div style='text-align:center; padding:30px;'><span class='material-symbols-outlined' style='animation: spin 1s linear infinite; font-size:32px; color:var(--primary);'>sync</span></div>";

      try {
          let mergedStudents = [];
          if(scope === 'class') {
              let res = await fetchAndCalculateClassMarks(yr, trm, target);
              res.reportArray.forEach(s => s.className = target); mergedStudents.push(...res.reportArray);
          } else {
              let classesInGrade = Object.keys(allClassesData).filter(c => allClassesData[c].grade === target);
              if(classesInGrade.length === 0) throw new Error("No classes found.");
              for(let cls of classesInGrade) { try { let res = await fetchAndCalculateClassMarks(yr, trm, cls); res.reportArray.forEach(s => s.className = cls); mergedStudents.push(...res.reportArray); } catch(e) {} }
          }
          if(mergedStudents.length === 0) throw new Error("No student marks found.");

          let grouped = {};
          mergedStudents.forEach(s => { let combo = getComboStringAndScore(s); if(!grouped[combo.str]) grouped[combo.str] = { score: combo.score, students: [] }; grouped[combo.str].students.push(s); });
          let sortedCombos = Object.keys(grouped).sort((a,b) => grouped[b].score - grouped[a].score);

          window.currentReportData = { year: yr, term: trm, target: target, combos: grouped, type: scope === 'class' ? 'PassesSummaryClass' : 'PassesSummarySection' };

          let html = `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e2e8f0; padding-bottom:15px; margin-bottom:25px;">
                        <div><h3 style="margin:0; color:#10b981; font-size:24px; font-weight:900; display:flex; align-items:center; gap:8px;"><span class="material-symbols-outlined" style="font-size:28px;">checklist</span> Pass Summary</h3><p style="margin:6px 0 0 0; color:var(--text-muted); font-weight:700;">${scope === 'class' ? 'Class' : 'Grade'}: <span style="color:var(--text-main);">${target}</span> | Term: ${yr} ${trm}</p></div>
                        <div style='display:flex; gap:12px;'>
                            <button class='btn-danger btn-small' onclick='downloadReportPDF()'><span class="material-symbols-outlined icon-small">picture_as_pdf</span> PDF</button>
                            <button class='btn-success btn-small' onclick='exportReportToCSV()'><span class="material-symbols-outlined icon-small">table_view</span> CSV</button>
                        </div>
                      </div>`;
          
          sortedCombos.forEach(combo => {
             let stds = grouped[combo].students;
             stds.sort((a, b) => { let gA = a.gender === 'Female' ? 1 : 0; let gB = b.gender === 'Female' ? 1 : 0; if (gA !== gB) return gA - gB; return a.admNo.localeCompare(b.admNo, undefined, {numeric: true}); });
             html += `<div style="background:#fff; border:1px solid #cbd5e1; border-radius:12px; margin-bottom:25px; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="background:#f8fafc; padding:12px 20px; font-weight:900; font-size:16px; border-bottom:1px solid #cbd5e1; display:flex; justify-content:space-between; color:var(--text-main);"><span>${combo}</span><span style="color:var(--primary);">${stds.length} Students</span></div>
                <div style="padding:20px; display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px;">`;
             stds.forEach(s => { html += `<div style="font-size:14px; font-weight:700; padding:6px 0; border-bottom:1px dashed #e2e8f0;">${s.admNo} - <span style="color:var(--text-main);">${s.name}</span> <span style="color:var(--text-muted); font-size:12px; font-weight:600;"><br>(${scope==='section'?s.className+', ':''}Avg: <span style="color:var(--primary); font-weight:800;">${s.average}</span>)</span></div>`; });
             html += `</div></div>`;
          });
          
          htmlContainer.innerHTML = html; btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined icon-small">play_circle</span> Generate Report`;
      } catch (err) { htmlContainer.innerHTML = `<p style="color:var(--danger); font-weight:800;">Error: ${err.message}</p>`; btn.disabled = false; btn.innerHTML = `Generate Report`;}
  }

  let remedialChartInstance = null;

  async function generateRemedialReport(scope) {
      let yr = document.getElementById('repYear').value, trm = document.getElementById('repTerm').value;
      let target = scope === 'class' ? document.getElementById('repClass').value : document.getElementById('repGrade').value;
      
      if(!target) return alert("Select a target."); 
      let btn = document.getElementById('btnGenerateReport'); btn.innerHTML = "Processing..."; btn.disabled = true;
      let out = document.getElementById('reportOutputContainer'), htmlContainer = document.getElementById('reportHtmlContainer'); 
      out.style.display = 'block'; htmlContainer.innerHTML = "<div style='text-align:center; padding:30px;'><span class='material-symbols-outlined' style='animation: spin 1s linear infinite; font-size:32px; color:var(--primary);'>sync</span></div>";

      try {
          let mergedStudents = [];
          if(scope === 'class') {
              let res = await fetchAndCalculateClassMarks(yr, trm, target);
              res.reportArray.forEach(s => s.className = target); mergedStudents.push(...res.reportArray);
          } else {
              let classesInGrade = Object.keys(allClassesData).filter(c => allClassesData[c].grade === target);
              if(classesInGrade.length === 0) throw new Error("No classes found.");
              for(let cls of classesInGrade) { try { let res = await fetchAndCalculateClassMarks(yr, trm, cls); res.reportArray.forEach(s => s.className = cls); mergedStudents.push(...res.reportArray); } catch(e) {} }
          }
          if(mergedStudents.length === 0) throw new Error("No student marks found.");

          // වෙනස් කළ කොටස 1: ස්ථාවර විෂයන් වෙනුවට සියලුම විෂයන් ගතිකව (Dynamically) හඳුනා ගැනීම
          let subjectStats = {};
          let weakStudents = [];

          mergedStudents.forEach(student => {
              let weakSubjects = []; 
              let wCount = 0; let sCount = 0;

              Object.keys(student.displayMarks).forEach(subKey => {
                  let cell = student.displayMarks[subKey];
                  if (!cell || cell.value === undefined || cell.value === "-" || cell.value === "AB") return;

                  let mark = Number(cell.value);
                  if (isNaN(mark)) return;

                  // නිවැරදි විෂය නාමය ලබා ගැනීම
                  let actualSubjectName = allSubjectsData[subKey] ? allSubjectsData[subKey].name : subKey;

                  let grade = "";
                  if (mark < 35) { grade = "W"; wCount++; }
                  else if (mark < 50) { grade = "S"; sCount++; }

                  if (grade !== "") {
                      weakSubjects.push({ subject: actualSubjectName, mark: mark, grade: grade });
                      
                      // විෂයය කලින් එකතු කර නොමැති නම් අලුතින් එක් කිරීම
                      if (!subjectStats[actualSubjectName]) {
                          subjectStats[actualSubjectName] = { W: 0, S: 0 };
                      }
                      subjectStats[actualSubjectName][grade]++;
                  }
              });

              if (wCount > 0 || sCount > 0) {
                  weakStudents.push({ admNo: student.admNo, name: student.name, className: student.className, wCount: wCount, sCount: sCount, details: weakSubjects });
              }
          });

          weakStudents.sort((a, b) => b.wCount - a.wCount || b.sCount - a.sCount);

          window.currentReportData = { year: yr, term: trm, target: target, students: weakStudents, subjectStats: subjectStats, type: scope === 'class' ? 'RemedialClass' : 'RemedialGrade' };

          let html = `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e2e8f0; padding-bottom:15px; margin-bottom:25px;">
                          <div><h3 style="margin:0; color:#ef4444; font-size:24px; font-weight:900; display:flex; align-items:center; gap:8px;"><span class="material-symbols-outlined" style="font-size:28px;">healing</span> Remedial Action Report</h3><p style="margin:6px 0 0 0; color:var(--text-muted); font-weight:700;">${scope === 'class' ? 'Class' : 'Grade'}: <span style="color:var(--text-main);">${target}</span> | Focus: Marks < 50</p></div>
                          <div style='display:flex; gap:12px;'>
                              <button class='btn-danger btn-small' onclick='downloadReportPDF()'><span class="material-symbols-outlined icon-small">picture_as_pdf</span> PDF</button>
                              <button class='btn-success btn-small' onclick='exportReportToCSV()'><span class="material-symbols-outlined icon-small">table_view</span> CSV</button>
                          </div>
                      </div>`;
          
          // Chart Container
          html += `<div style="background:#fff; border:1px solid #cbd5e1; border-radius:12px; padding:20px; margin-bottom:25px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                      <h4 style="margin:0 0 15px 0; font-size:16px; font-weight:800; color:var(--text-main);">Subjects Vulnerability Analysis</h4>
                      <div style="height:300px;"><canvas id="remedialChart"></canvas></div>
                   </div>`;

          html += `<table class='ui-data-table'><thead><tr><th style="width:8%;">Adm No</th><th style="width:25%;">Student Name</th>${scope === 'section' ? '<th>Class</th>' : ''}<th style="text-align:center;">W Grades</th><th style="text-align:center;">S Grades</th><th style="width:40%;">Subjects to Improve</th></tr></thead><tbody>`;
          
          weakStudents.forEach(s => {
              let subDetails = s.details.map(d => `<span class="${d.grade === 'W' ? 'badge badge-red' : 'badge badge-gray'}" style="margin:2px;">${d.subject} (${d.mark})</span>`).join(' ');
              html += `<tr><td style="font-weight:700;">${s.admNo}</td><td style="font-weight:800; color:var(--text-main);">${s.name}</td>${scope === 'section' ? `<td><span class="badge badge-gray">${s.className}</span></td>` : ''}<td style="text-align:center; font-weight:900; color:#dc2626; font-size:16px;">${s.wCount}</td><td style="text-align:center; font-weight:800; color:#d97706; font-size:16px;">${s.sCount}</td><td><div style="display:flex; flex-wrap:wrap; gap:4px;">${subDetails}</div></td></tr>`;
          });
          
          html += `</tbody></table>`;
          htmlContainer.innerHTML = html; btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined icon-small">play_circle</span> Generate Report`;

          // Render Chart
          const ctx = document.getElementById('remedialChart');
          if(ctx) {
              if (remedialChartInstance) remedialChartInstance.destroy();
              
              // දුර්වලතා වැඩි විෂයන් මුලින් පෙන්වීමට අනුපිළිවෙලට සැකසීම (Sort by total W + S)
              const sortedLabels = Object.keys(subjectStats).sort((a, b) => {
                  let totalA = subjectStats[a].W + subjectStats[a].S;
                  let totalB = subjectStats[b].W + subjectStats[b].S;
                  return totalB - totalA; 
              });

              const wData = sortedLabels.map(label => subjectStats[label].W);
              const sData = sortedLabels.map(label => subjectStats[label].S);

              remedialChartInstance = new Chart(ctx, {
                  type: 'bar',
                  data: {
                      labels: sortedLabels,
                      datasets: [
                          { label: "Critical (W Grades < 35)", data: wData, backgroundColor: '#ef4444', borderRadius: 4 },
                          { label: "Needs Attention (S Grades 35-49)", data: sData, backgroundColor: '#f59e0b', borderRadius: 4 }
                      ]
                  },
                  // මෙහි scales හි ඇති stacked: true යන්න stacked: false ලෙස වෙනස් කර ඇත
                  options: { 
                      responsive: true, 
                      maintainAspectRatio: false, 
                      scales: { 
                          x: { stacked: false }, 
                          y: { stacked: false, beginAtZero: true } 
                      } 
                  }
              });
          }

      } catch (err) { htmlContainer.innerHTML = `<p style="color:var(--danger); font-weight:800;">Error: ${err.message}</p>`; btn.disabled = false; btn.innerHTML = `Generate Report`;}
  }

  async function generatePredictionReport() {
      let cls = document.getElementById('repClass').value; if(!cls) return alert("Select a class."); 
      let cGrade = allClassesData[cls] ? allClassesData[cls].grade : ""; 
      if(cGrade !== "Grade 10" && cGrade !== "Grade 11") return alert("Prediction report is only for Grade 10 and 11 students.");
      
      let btn = document.getElementById('btnGenerateReport'); btn.innerHTML = "Processing..."; btn.disabled = true;
      let out = document.getElementById('reportOutputContainer'), htmlContainer = document.getElementById('reportHtmlContainer'); out.style.display = 'block'; htmlContainer.innerHTML = "<div style='text-align:center; padding:40px;'><span class='material-symbols-outlined' style='animation: spin 1s linear infinite; font-size:40px; color:var(--primary);'>memory</span><br><h3 style='color:var(--text-main); margin-top:15px;'>AI is thinking...</h3></div>";

      try {
          let marksDB = await fetchWithCache(`marks`, false) || {}; 
          let classStsKeys = Object.keys(allStudentsData).filter(k => allStudentsData[k].class === cls);
          let classSts = classStsKeys.map(k => ({admNo: k, ...allStudentsData[k]})); if(classSts.length === 0) throw new Error("No students found.");
          
          let predictData = []; let allSubjectsUsed = new Set();
          classSts.forEach(s => {
              let subHistory = {};
              Object.keys(marksDB).forEach(yr => {
                 Object.keys(marksDB[yr]).forEach(trm => {
                    let stMarks = marksDB[yr][trm][s.admNo];
                    if(stMarks) {
                        Object.keys(stMarks).forEach(subK => {
                           let m = stMarks[subK]; if(m !== "AB" && m !== undefined && !isNaN(m)) { if(!subHistory[subK]) subHistory[subK] = []; subHistory[subK].push(Number(m)); allSubjectsUsed.add(subK); }
                        });
                    }
                 });
              });
              
              let predictedMarks = {}; let totalP = 0; let countP = 0;
              Object.keys(subHistory).forEach(subK => { let arr = subHistory[subK]; let avg = arr.reduce((a,b)=>a+b,0)/arr.length; predictedMarks[subK] = Math.round(avg); totalP+=predictedMarks[subK]; countP++; });
              let avgP = countP > 0 ? (totalP/countP).toFixed(2) : "0.00";
              predictData.push({ admNo: s.admNo, name: s.name, gender: s.gender || 'Male', predicted: predictedMarks, avg: avgP });
          });

          predictData.sort((a,b) => { let gA = a.gender === 'Female' ? 1 : 0; let gB = b.gender === 'Female' ? 1 : 0; if (gA !== gB) return gA - gB; return a.admNo.localeCompare(b.admNo, undefined, {numeric: true}); });
          let displayCols = Array.from(allSubjectsUsed).map(k => allSubjectsData[k] ? allSubjectsData[k].name : k);
          let rawSubKeys = Array.from(allSubjectsUsed);

          window.currentReportData = { cls: cls, students: predictData, rawSubKeys: rawSubKeys, displayCols: displayCols, type: 'Prediction' };

          let html = `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e2e8f0; padding-bottom:15px; margin-bottom:25px;">
                        <div><h3 style="margin:0; color:#8b5cf6; font-size:24px; font-weight:900; display:flex; align-items:center; gap:8px;"><span class="material-symbols-outlined" style="font-size:28px;">online_prediction</span> O/L AI Prediction</h3><p style="margin:6px 0 0 0; color:var(--text-muted); font-weight:700;">Class: <span style="color:var(--text-main);">${cls}</span> | Based on past marks trajectory</p></div>
                        <div style='display:flex; gap:12px;'>
                            <button class='btn-danger btn-small' onclick='downloadReportPDF()'><span class="material-symbols-outlined icon-small">picture_as_pdf</span> PDF</button>
                            <button class='btn-success btn-small' onclick='exportReportToCSV()'><span class="material-symbols-outlined icon-small">table_view</span> CSV</button>
                        </div>
                      </div>
                      <table class='ui-data-table'><thead><tr><th style="width:70px;">Adm No</th><th style="width:180px;">Student Name</th>`;
          displayCols.forEach(c => html += `<th style="text-align:center;">${c}</th>`); html += `<th style="text-align:center;">Pred. Avg</th></tr></thead><tbody>`;
          
          predictData.forEach(s => {
             html += `<tr><td style="font-weight:700;">${s.admNo}</td><td style="font-weight:800; color:var(--text-main); white-space:nowrap;">${s.name}</td>`;
             rawSubKeys.forEach(k => { let val = s.predicted[k]; if(val !== undefined) { html += `<td style="text-align:center;"><span style="font-weight:800; font-size:14px;">${val}</span> <span style="color:var(--primary); font-weight:900;">(${getGr(val)})</span></td>`; } else { html += `<td style="text-align:center; font-weight:700; color:var(--text-muted);">-</td>`; } });
             html += `<td style="text-align:center; font-weight:900; font-size:15px; color:var(--primary);">${s.avg}</td></tr>`;
          });
          html += `</tbody></table><p style="font-size:13px; font-weight:600; color:var(--text-muted); margin-top:15px;">* Predicted scores are estimated using historical grade averages.</p>`;
          
          htmlContainer.innerHTML = html; btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined icon-small">play_circle</span> Generate Report`;
      } catch (err) { htmlContainer.innerHTML = `<p style="color:var(--danger); font-weight:800;">Error: ${err.message}</p>`; btn.disabled = false; btn.innerHTML = `Generate Report`;}
  }

  async function generateALPredictionReport() {
      let cls = document.getElementById('repClass').value; if(!cls) return alert("Select a class."); 
      let cGrade = allClassesData[cls] ? allClassesData[cls].grade : ""; 
      if(!cGrade.includes("Grade 12") && !cGrade.includes("Grade 13")) return alert("A/L AI Prediction report is only for Grade 12 and 13 students.");
      
      let btn = document.getElementById('btnGenerateReport'); btn.innerHTML = "Processing..."; btn.disabled = true;
      let out = document.getElementById('reportOutputContainer'), htmlContainer = document.getElementById('reportHtmlContainer'); out.style.display = 'block'; htmlContainer.innerHTML = "<div style='text-align:center; padding:40px;'><span class='material-symbols-outlined' style='animation: spin 1s linear infinite; font-size:40px; color:var(--primary);'>memory</span><br><h3 style='color:var(--text-main); margin-top:15px;'>AI is thinking...</h3><p style='color:var(--text-muted); font-size:14px; font-weight:600;'>Looking at old marks and writing advice.</p></div>";

      try {
          let marksDB = await fetchWithCache(`marks`, false) || {}; let classMetaDB = await fetchWithCache(`class_subjects`, false) || {};
          let classStsKeys = Object.keys(allStudentsData).filter(k => allStudentsData[k].class === cls);
          let classSts = classStsKeys.map(k => ({admNo: k, ...allStudentsData[k]})); if(classSts.length === 0) throw new Error("No students found.");
          
          let predictData = [];
          
          classSts.forEach(s => {
              let mainSubjectsData = {}; 
              Object.keys(marksDB).forEach(yr => {
                 Object.keys(marksDB[yr]).forEach(trm => {
                    let stMarks = marksDB[yr][trm][s.admNo];
                    if(stMarks) {
                        Object.keys(stMarks).forEach(subK => {
                           let meta = { grade: allSubjectsData[subK] ? (allSubjectsData[subK].gradeType || 'ol_main') : 'ol_main' };
                           if (classMetaDB && classMetaDB[yr] && classMetaDB[yr][trm] && classMetaDB[yr][trm][cls] && classMetaDB[yr][trm][cls][subK]) {
                               meta = classMetaDB[yr][trm][cls][subK];
                           }
                           
                           if(meta.grade === 'al_main' || meta.grade === 'al_basket') {
                               let m = stMarks[subK]; 
                               if(m !== "AB" && m !== undefined && !isNaN(m)) { 
                                   if(!mainSubjectsData[subK]) mainSubjectsData[subK] = { marks: [], name: allSubjectsData[subK] ? allSubjectsData[subK].name : subK }; 
                                   mainSubjectsData[subK].marks.push(Number(m)); 
                               }
                           }
                        });
                    }
                 });
              });
              
              let predictedGrades = {}; let adviceData = []; let totalP = 0; let zCount = 0;
              Object.keys(mainSubjectsData).forEach(subK => { 
                  let arr = mainSubjectsData[subK].marks; 
                  if(arr.length > 0) {
                      let avg = arr.reduce((a,b)=>a+b,0) / arr.length; let recentMark = arr[arr.length - 1];
                      let predictedMark = arr.length > 1 ? Math.round((avg * 0.4) + (recentMark * 0.6)) : Math.round(avg);
                      let grade = getGr(predictedMark);
                      let trend = arr.length > 1 ? (recentMark > arr[arr.length - 2] ? 'up' : (recentMark < arr[arr.length - 2] ? 'down' : 'stable')) : 'stable';
                      predictedGrades[subK] = { name: mainSubjectsData[subK].name, mark: predictedMark, grade: grade, trend: trend };
                      adviceData.push(grade); totalP += predictedMark; zCount++;
                  }
              });

              let overallAvg = zCount > 0 ? (totalP / zCount).toFixed(1) : "0.0";
              let adviceTitle = "", adviceText = "", adviceColor = "";
              let counts = { 'A':0, 'B':0, 'C':0, 'S':0, 'W':0 }; adviceData.forEach(g => { if(counts[g]!==undefined) counts[g]++; });
              
              if(zCount < 3 && zCount > 0) { adviceTitle = "Missing Subjects"; adviceColor = "#f59e0b"; adviceText = "Student did not do all 3 main subjects. Cannot give a full prediction. Must do all subjects."; } 
              else if(zCount === 0) { adviceTitle = "No Data"; adviceColor = "#64748b"; adviceText = "Not enough past marks to guess future marks."; } 
              else {
                  if(counts['A'] === 3) { adviceTitle = "Great Work"; adviceColor = "#10b981"; adviceText = "Very good marks! Keep working hard to go to a top university. You are doing great."; }
                  else if(counts['A'] >= 2 && counts['B'] === 1) { adviceTitle = "Very Good"; adviceColor = "#10b981"; adviceText = "Strong marks. Try to get the B grade to an A. You have a good chance for university."; }
                  else if(counts['A'] >= 1 && counts['W'] === 0 && counts['S'] === 0) { adviceTitle = "Good Chance for University"; adviceColor = "#3b82f6"; adviceText = "Good work. Do more past papers to make the C and B grades better to get a higher Z-Score."; }
                  else if(counts['W'] > 0) { adviceTitle = "Needs Help Fast"; adviceColor = "#ef4444"; adviceText = `You must pass all subjects to go to university. The 'W' grade is a big problem. Talk to the teacher and study more.`; }
                  else if(counts['S'] >= 2) { adviceTitle = "Low Marks"; adviceColor = "#f59e0b"; adviceText = "Marks are very low. It will be hard to go to university with this Z-Score. Please change how you study."; }
                  else if(counts['C'] >= 2) { adviceTitle = "Average Marks"; adviceColor = "#0ea5e9"; adviceText = "Marks are okay, but not enough for top university courses. Need to read more and write better answers."; }
                  else { adviceTitle = "Marks go up and down"; adviceColor = "#8b5cf6"; adviceText = "Sometimes marks are good, sometimes bad. Try to study every day to keep marks high."; }
              }

              predictData.push({ admNo: s.admNo, name: s.name, gender: s.gender || 'Male', subjects: predictedGrades, avg: overallAvg, advice: { title: adviceTitle, text: adviceText, color: adviceColor } });
          });

          predictData.sort((a,b) => { let gA = a.gender === 'Female' ? 1 : 0; let gB = b.gender === 'Female' ? 1 : 0; if(gA !== gB) return gA - gB; return a.admNo.localeCompare(b.admNo, undefined, {numeric: true}); });
          window.currentReportData = { cls: cls, students: predictData, type: 'ALPrediction' };

          let html = `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e2e8f0; padding-bottom:15px; margin-bottom:25px;">
                        <div><h3 style="margin:0; color:#ec4899; font-size:24px; font-weight:900; display:flex; align-items:center; gap:8px;"><span class="material-symbols-outlined" style="font-size:28px;">psychology</span> A/L AI Prediction</h3><p style="margin:6px 0 0 0; color:var(--text-muted); font-weight:700; font-size:14px;">Class: <span style="color:#0f172a;">${cls}</span> | Student Progress Details</p></div>
                        <div style='display:flex; gap:12px;'>
                            <button class='btn-danger btn-small' onclick='downloadReportPDF()'><span class="material-symbols-outlined icon-small">picture_as_pdf</span> PDF</button>
                            <button class='btn-success btn-small' onclick='exportReportToCSV()'><span class="material-symbols-outlined icon-small">table_view</span> CSV</button>
                        </div>
                      </div>`;
          
          html += `<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 25px;">`;
          
          predictData.forEach(s => {
             html += `<div style="background:#fff; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); transition:transform 0.2s;">
                        <div style="background:#f8fafc; padding:18px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                            <div><h4 style="margin:0; font-size:18px; font-weight:800; color:#0f172a;">${s.name}</h4><span style="font-size:13px; color:#64748b; font-weight:700;">Adm No: ${s.admNo}</span></div>
                            <div style="background:#eff6ff; color:#2563eb; font-weight:900; padding:8px 14px; border-radius:8px; font-size:15px; border:1px solid #bfdbfe; box-shadow:0 2px 4px rgba(37,99,235,0.1);">Avg: ${s.avg}</div>
                        </div>
                        <div style="padding:24px;">
                            <h5 style="margin:0 0 16px 0; font-size:12px; font-weight:800; text-transform:uppercase; color:#94a3b8; letter-spacing:0.5px;">Guessed Final Grades</h5>
                            <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:24px;">`;
             
             let subKeys = Object.keys(s.subjects);
             if(subKeys.length === 0) {
                 html += `<div style="text-align:center; padding:15px; color:#94a3b8; font-size:14px; font-weight:600;">No A/L Main Subjects found.</div>`;
             } else {
                 subKeys.forEach(k => {
                     let sub = s.subjects[k];
                     let trendIcon = sub.trend === 'up' ? '<span class="material-symbols-outlined" style="color:#10b981; font-size:20px;">trending_up</span>' : (sub.trend === 'down' ? '<span class="material-symbols-outlined" style="color:#ef4444; font-size:20px;">trending_down</span>' : '<span class="material-symbols-outlined" style="color:#f59e0b; font-size:20px;">trending_flat</span>');
                     let gradeColor = sub.grade === 'A' ? '#10b981' : sub.grade === 'B' ? '#3b82f6' : sub.grade === 'C' ? '#f59e0b' : sub.grade === 'S' ? '#8b5cf6' : '#ef4444';
                     
                     html += `<div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:12px 16px; border-radius:10px; border:1px solid #e2e8f0;">
                                <span style="font-weight:700; font-size:14px; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${sub.name}</span>
                                <div style="display:flex; align-items:center; gap:16px;">
                                    <span style="font-weight:800; font-size:16px; color:#0f172a;">${sub.mark}</span>
                                    <span style="font-weight:900; font-size:18px; color:${gradeColor}; width:24px; text-align:center;">${sub.grade}</span>
                                    ${trendIcon}
                                </div>
                              </div>`;
                 });
             }
             
             html += `</div>
                        <div style="border-left:5px solid ${s.advice.color}; background:#f8fafc; padding:16px 20px; border-radius:0 12px 12px 0; border-top:1px solid #e2e8f0; border-right:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0;">
                            <h5 style="margin:0 0 8px 0; font-size:15px; color:${s.advice.color}; font-weight:900; display:flex; align-items:center; gap:8px;"><span class="material-symbols-outlined" style="font-size:20px;">insights</span> ${s.advice.title}</h5>
                            <p style="margin:0; font-size:13px; color:#475569; line-height:1.6; font-weight:600;">${s.advice.text}</p>
                        </div>
                    </div></div>`;
          });
          html += `</div>`;
          
          htmlContainer.innerHTML = html; btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined icon-small">play_circle</span> Generate Report`;
      } catch (err) { htmlContainer.innerHTML = `<p style="color:var(--danger); font-weight:bold;">Error: ${err.message}</p>`; btn.disabled = false; btn.innerHTML = `Generate Report`;}
  }

  // --- REWRITTEN CLASS ANALYTICS GENERATOR ---
  async function generateClassAnalytics() {
      let yr = document.getElementById('repYear').value, trm = document.getElementById('repTerm').value, cls = document.getElementById('repClass').value;
      if(!cls) return alert("Select a class."); 
      let btn = document.getElementById('btnGenerateReport'); btn.innerHTML = "Processing..."; btn.disabled = true;
      let out = document.getElementById('reportOutputContainer'), htmlContainer = document.getElementById('reportHtmlContainer'); 
      out.style.display = 'block'; htmlContainer.innerHTML = ""; document.getElementById('analyticsPreview').style.display = 'flex';
      
      try {
          let cGrade = allClassesData[cls] ? allClassesData[cls].grade : "";
          let isALevelReport = cGrade.includes("Grade 12") || cGrade.includes("Grade 13");

          // Fetch target class data
          let { reportArray } = await fetchAndCalculateClassMarks(yr, trm, cls);

          // Fetch all section (grade) data to compute Section Rank 1 and section combinations
          let sectionStudents = [];
          let classesInGrade = Object.keys(allClassesData).filter(c => allClassesData[c].grade === cGrade);
          for(let c of classesInGrade) {
              try {
                  let res = await fetchAndCalculateClassMarks(yr, trm, c);
                  res.reportArray.forEach(s => s.className = c);
                  sectionStudents.push(...res.reportArray);
              } catch(e) {}
          }

          // Rank sorting to find section first
          sectionStudents.sort((a,b) => {
              if (isALevelReport) {
                  if (a.hasAbsent && !b.hasAbsent) return 1;
                  if (!a.hasAbsent && b.hasAbsent) return -1;
                  return (parseFloat(b.overallZ) || 0) - (parseFloat(a.overallZ) || 0);
              } else {
                  return parseFloat(b.average) - parseFloat(a.average);
              }
          });

          let currentRank = 1;
          for (let i = 0; i < sectionStudents.length; i++) {
              let std = sectionStudents[i];
              let valid = isALevelReport ? (!std.hasAbsent && std.zCount > 0) : (std.total > 0 || std.count > 0);
              
              if (!valid) {
                  std.sectionRank = "-";
              } else {
                  let isTie = false;
                  if (i > 0 && sectionStudents[i - 1].sectionRank !== "-") {
                      if (isALevelReport && sectionStudents[i - 1].overallZ === std.overallZ) isTie = true;
                      if (!isALevelReport && sectionStudents[i - 1].average === std.average) isTie = true;
                  }

                  if (isTie) {
                      std.sectionRank = sectionStudents[i - 1].sectionRank;
                  } else {
                      currentRank = i + 1;
                      std.sectionRank = currentRank;
                  }
              }
          }
          
          let sectionRank1 = sectionStudents[0];
          let classRank1 = reportArray.find(s => parseInt(s.rank) === 1) || reportArray[0];

          // Compute Pass Combinations (A9, A8 etc.) for Chart 2
          let classCombos = {};
          let secCombos = {};
          let getACountCombo = (s) => {
              let aCount = 0; let hasGrades = false;
              Object.values(s.displayMarks).forEach(dm => {
                  if(dm && dm.value !== undefined && dm.value !== "AB") {
                      hasGrades = true; if (getGr(dm.value) === 'A') aCount++;
                  }
              });
              if (!hasGrades) return null;
              return aCount > 0 ? 'A' + aCount : 'No A';
          };

          sectionStudents.forEach(s => {
              let combo = getACountCombo(s);
              if (combo) {
                  secCombos[combo] = (secCombos[combo] || 0) + 1;
                  if (s.className === cls) classCombos[combo] = (classCombos[combo] || 0) + 1;
              }
          });

          // Store for usage in individual chart functions
          window.currentAnalyticsData = {
              yr, trm, cls, cGrade,
              reportArray, sectionStudents,
              classRank1, sectionRank1,
              classCombos, secCombos,
              allMarksDB: await fetchWithCache(`marks/${yr}/${trm}`) || {}
          };

          // Initialize charts
          document.getElementById('passComboSearch').value = "";
          renderPassComboChart();

          if (classRank1) {
              // Student Marks Chart එක අදාල කේත මෙතැනින් ඉවත් කර ඇත

              document.getElementById('compareSearchInput').value = `${classRank1.admNo} - ${classRank1.name}`;
              window.selectedCompareAdmNo = classRank1.admNo;
              renderCompareChart();
          }

          btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined icon-small">play_circle</span> Refresh Data`;
      } catch (err) { 
          htmlContainer.innerHTML = `<p style="color:var(--danger); font-weight:800;">${err.message}</p>`; 
          btn.disabled = false; btn.innerHTML = `Generate Report`; document.getElementById('analyticsPreview').style.display = 'none';
      }
  }

  // --- CHART 2: PASS SUMMARY (A9, A8..) CHART ---
  window.renderPassComboChart = function(filterVal = "") {
      let data = window.currentAnalyticsData;
      if(!data) return;

      let allKeys = Array.from(new Set([...Object.keys(data.classCombos), ...Object.keys(data.secCombos)]));
      allKeys.sort((a,b) => {
          if(a === 'No A') return 1; if(b === 'No A') return -1;
          let numA = parseInt(a.replace('A','')); let numB = parseInt(b.replace('A',''));
          return numB - numA;
      });

      if (filterVal) {
          filterVal = filterVal.toLowerCase();
          allKeys = allKeys.filter(k => k.toLowerCase().includes(filterVal));
      }

      let classData = allKeys.map(k => data.classCombos[k] || 0);
      let secData = allKeys.map(k => data.secCombos[k] || 0);

      let ctx = document.getElementById('passComboChart').getContext('2d');
      if(passComboChartInstance) passComboChartInstance.destroy();

      passComboChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
              labels: allKeys,
              datasets: [
                  { label: 'Class Count', data: classData, backgroundColor: '#FF9F40', borderRadius: 4 },
                  { label: 'Grade Count', data: secData, backgroundColor: '#9966FF', borderRadius: 4 }
              ]
          },
          options: {
              responsive: true, maintainAspectRatio: false,
              scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
          }
      });
  }

    window.filterPassComboChart = debounce(function() {
        let val = document.getElementById('passComboSearch').value;
        renderPassComboChart(val);
    }, 300);

  // --- CHART 3: COMPARE STUDENT VS RANK 1 ---
    window.filterCompareSuggestions = debounce(function(val) {
        let box = document.getElementById('compareSuggestions');
        val = val.trim().toLowerCase();
        let matches = Object.keys(allStudentsData).filter(k => k.toLowerCase().includes(val) || allStudentsData[k].name.toLowerCase().includes(val));
        if(matches.length === 0) { box.innerHTML = '<div class="autocomplete-item">No students found</div>'; box.style.display = 'block'; return; }
        let html = '';
        matches.slice(0, 10).forEach(k => {
            let sName = allStudentsData[k].name;
            html += `<div class="autocomplete-item" onclick="selectCompareStudent('${k}', '${sName.replace(/'/g, "\\'")}')"><b>${k}</b> - ${sName}</div>`;
        });
        box.innerHTML = html; box.style.display = 'block';
    }, 300);

  window.selectCompareStudent = function(admNo, name) {
      window.selectedCompareAdmNo = admNo;
      document.getElementById('compareSearchInput').value = `${admNo} - ${name}`;
      document.getElementById('compareSuggestions').style.display = 'none';
      renderCompareChart();
  }

  window.renderCompareChart = function() {
      let data = window.currentAnalyticsData;
      let admNo = window.selectedCompareAdmNo;
      if(!data || !admNo) return;

      let selectedMarks = data.allMarksDB[admNo] || {};
      let classFirstMarks = data.classRank1 ? (data.allMarksDB[data.classRank1.admNo] || {}) : {};
      let secFirstMarks = data.sectionRank1 ? (data.allMarksDB[data.sectionRank1.admNo] || {}) : {};

      let labels = [];
      let sData = [];
      let cData = [];
      let secData = [];

      Object.keys(selectedMarks).forEach(subKey => {
          let m = selectedMarks[subKey];
          if (m !== "AB" && m !== undefined && m !== null && m !== "") {
              let subjName = allSubjectsData[subKey] ? allSubjectsData[subKey].name : subKey;
              labels.push(subjName);
              sData.push(Number(m));

              let cm = classFirstMarks[subKey];
              cData.push(cm !== undefined && cm !== "AB" ? Number(cm) : 0);

              let sm = secFirstMarks[subKey];
              secData.push(sm !== undefined && sm !== "AB" ? Number(sm) : 0);
          }
      });

      let ctx = document.getElementById('compareChart').getContext('2d');
      if(compareChartInstance) compareChartInstance.destroy();

      compareChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
              labels: labels,
              datasets: [
                  { label: 'Selected Student', data: sData, backgroundColor: '#8B5CF6', borderRadius: 4 },
                  { label: 'Class First Rank', data: cData, backgroundColor: '#10B981', borderRadius: 4 },
                  { label: 'Grade First Rank', data: secData, backgroundColor: '#EC4899', borderRadius: 4 }
              ]
          },
          options: {
              responsive: true, maintainAspectRatio: false,
              scales: { y: { beginAtZero: true, max: 100 } }
          }
      });
  }

  // CLOSE DROPDOWNS ON CLICK
  document.addEventListener("click", function (e) { 
      if (e.target.id !== "progAdmNo" && e.target.id !== "compareSearchInput" && e.target.id !== "studentMarksSearch") { 
          document.querySelectorAll(".autocomplete-items").forEach(el=>el.style.display="none"); 
      } 
  });


 // ==========================================
  // PDF & CSV EXPORT 
  // ==========================================
    window.downloadReportPDF = function() {
    const data = window.currentReportData; if (!data) return alert("No report generated.");
    const schoolName = "R/Gankanda Central College"; 
    
    // --- MOBILE FIX: Popup වෙනුවට Hidden Iframe එකක් භාවිතා කිරීම ---
    let oldIframe = document.getElementById('mobilePrintFrame');
    if (oldIframe) { oldIframe.remove(); } // කලින් Iframe එකක් ඇත්නම් එය ඉවත් කිරීම

    let iframe = document.createElement('iframe');
    iframe.id = 'mobilePrintFrame';
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    
    const printWindow = iframe.contentWindow;
    // ---------------------------------------------------------------
    
    // පන්තිය සහ පන්තිභාර ගුරුතුමාගේ නම ලබා ගැනීම
    let repClass = data.cls || data.targetName || data.target || "";
    let repTeacher = data.ctName || (repClass && allClassesData[repClass] ? allClassesData[repClass].teacher : "..........................");
    
    let commonStyles = `@page { size: A4 portrait; margin: 10mm; } 
    * { color: #000 !important; font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; text-rendering: optimizeLegibility; -webkit-print-color-adjust: exact; print-color-adjust: exact;}
    body { margin:0; text-transform: capitalize;} 
    .header { display: flex; align-items: center; justify-content: center; gap: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; } 
    .header h1 { margin: 0; font-size: 18px; font-weight:900; text-transform: uppercase;} 
    .header h2 { margin: 4px 0; font-size: 14px; font-weight:bold;} 
    .header h3 { margin: 0; font-weight:normal; font-size:12px;} 
    table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: auto;} 
    th, td { border: 1px solid #000 !important; padding: 6px; text-align: left !important; font-size: 10px; vertical-align: middle; } 
    th { background-color: transparent !important; font-weight: bold !important; border-bottom: 1.5px solid #000 !important; text-transform: uppercase;} 
    td { font-weight: bold; } 
    .sig-section { display: flex; justify-content: flex-end; margin-top: 40px; } 
    .sig-box { text-align: center; width: 200px; font-weight: bold; font-size: 11px;} 
    .sig-line { border-top: 1px dashed #000; margin-bottom: 5px; width: 100%; }`;

    if(data.type === 'Class') {
        const isLandscape = data.displayCols.length > 8; const orientation = isLandscape ? 'landscape' : 'portrait'; const studentsPerPage = isLandscape ? 30 : 40; 
        
        let reportStyles = `<style>
        @page { size: A4 ${orientation}; margin: 10mm; } 
        * { color: #000 !important; font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; text-rendering: optimizeLegibility; -webkit-print-color-adjust: exact; print-color-adjust: exact;}
        body { background: transparent; margin: 0; text-transform: capitalize;} 
        .page-break { page-break-after: always; } 
        .header-container { display: flex; align-items: center; justify-content: center; gap: 15px; border-bottom: 1.5px solid #000; padding-bottom: 8px; margin-bottom: 15px; } 
        .header-container h1 { margin: 0; font-size: 18px; font-weight:900; text-transform: uppercase;} 
        .header-container h2 { margin: 4px 0 0 0; font-size: 14px; font-weight: bold;} 
        .info-row { display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 10px; font-size: 11px;} 
        .official-table { width: 100%; border-collapse: collapse; table-layout: auto; } 
        .official-table th, .official-table td { border: 1px solid #000 !important; padding: 5px; text-align: left !important; font-size: 10px; font-weight:bold; vertical-align: middle; } 
        .official-table th { background-color: transparent !important; vertical-align: bottom; font-weight:bold !important; border-bottom: 1.5px solid #000 !important; text-transform:uppercase; white-space: nowrap; } 
        .official-table td.marks-cell { text-align: left !important; white-space: nowrap; }
        .official-table td.name-cell { white-space: normal; }
        .vertical-text { writing-mode: vertical-rl; transform: rotate(180deg); padding-bottom: 4px; font-size:10px; white-space:nowrap; text-align: left !important;} 
        .signature-section { display: flex; justify-content: space-between; margin-top: 30px; page-break-inside: avoid;} 
        .sig-box { text-align: center; width: 30%; font-weight: bold; font-size: 11px;} 
        .sig-line { border-top: 1px dashed #000; margin-bottom: 5px; width: 80%; margin-left: auto; margin-right: auto; } 
        </style>`;
        
        let finalHtml = `<html><head>${reportStyles}</head><body>`;
        for (let i = 0; i < data.students.length; i += studentsPerPage) {
            const studentChunk = data.students.slice(i, i + studentsPerPage); const isLastPage = (i + studentsPerPage) >= data.students.length;
            
            finalHtml += `<div class="${!isLastPage ? 'page-break' : ''}"><div class="header-container"><div style="width: 70px; height: 70px;">${SYS_LOGO_SVG}</div><div style="text-align:left;"><h1>${schoolName}</h1><h2>Term Test Report - ${data.year} ${data.term}</h2></div></div><div class="info-row"><span style="text-align:left;">Class: ${sanitizeText(repClass)}</span><span style="text-align:right;">Class Teacher: ${repTeacher}</span></div><table class="official-table"><thead><tr><th style="width:1%;">Adm No</th><th style="width:99%;">Student Name</th>`;
            data.displayCols.forEach(c => finalHtml += `<th><span class="vertical-text">${c}</span></th>`);
            finalHtml += `<th><span class="vertical-text">Total</span></th>`;
            if(data.isALevel) finalHtml += `<th><span class="vertical-text">Z-Score</span></th>`; else finalHtml += `<th><span class="vertical-text">Average</span></th>`;
            finalHtml += `<th><span class="vertical-text">Rank</span></th></tr></thead><tbody>`;
            
            studentChunk.forEach(s => {
                finalHtml += `<tr><td class="marks-cell">${s.admNo}</td><td class="name-cell">${s.name}</td>`;
                data.displayCols.forEach(col => { 
                    let cellData = s.displayMarks[col]; 
                    let val = cellData && cellData.value !== undefined ? cellData.value : "-"; 
                    if(cellData && cellData.actualSubj && val !== "-" && val !== "AB" && cellData.actualSubj !== col) { 
                        val += ` (${cellData.actualSubjCode || cellData.actualSubj})`; 
                    } 
                    finalHtml += `<td class="marks-cell">${val}</td>`; 
                });
                finalHtml += `<td class="marks-cell">${s.total}</td><td class="marks-cell">${data.isALevel ? s.overallZ : s.average}</td><td class="marks-cell">${s.rank}</td></tr>`;
            });
            
            finalHtml += `</tbody></table>`;
            
            if(isLastPage) {
                let subjectTalliesPDF = {};
                data.displayCols.forEach(col => { subjectTalliesPDF[col] = { 'A':0, 'B':0, 'C':0, 'S':0, 'W':0, 'AB':0 }; });
                data.students.forEach(s => {
                    data.displayCols.forEach(col => {
                        let cellData = s.displayMarks[col];
                        let val = cellData && cellData.value !== undefined ? cellData.value : "-";
                        if(val === "AB") subjectTalliesPDF[col]['AB']++;
                        else if(val !== "-" && !isNaN(val)) {
                            let num = Number(val);
                            if(num >= 75) subjectTalliesPDF[col]['A']++; else if(num >= 65) subjectTalliesPDF[col]['B']++; else if(num >= 50) subjectTalliesPDF[col]['C']++; else if(num >= 35) subjectTalliesPDF[col]['S']++; else subjectTalliesPDF[col]['W']++;
                        }
                    });
                });
                
                // වගු දෙක වෙන්ව දකුණු පසින් පෙන්වීම සඳහා Flex Container එක ආරම්භ කිරීම
                finalHtml += `<div style="display: flex; gap: 40px; page-break-inside: avoid; margin-top: 30px; margin-bottom: 25px; align-items: flex-start;">`;
                
                // 1. Subject-wise Grade Summary (වම් පස වගුව)
                finalHtml += `<div style="flex: 1;">
                              <h3 style="margin:0 0 10px 0; font-size:14px; text-transform:uppercase;">Subject-wise Grade Summary</h3>
                              <table class="official-table" style="margin-top:0; width:auto;">
                              <thead><tr><th style="background:transparent; min-width:100px;">Grade / Criteria</th>`;
                data.displayCols.forEach(c => finalHtml += `<th style="background:transparent; text-align:center !important;">${c}</th>`);
                finalHtml += `</tr></thead><tbody>`;
                
                const addPDFTallyRow = (label, key) => {
                    finalHtml += `<tr><td style="white-space:nowrap;">${label}</td>`;
                    data.displayCols.forEach(col => { finalHtml += `<td style="text-align:center !important;">${subjectTalliesPDF[col][key]}</td>`; });
                    finalHtml += `</tr>`;
                };
                
                addPDFTallyRow("A (>= 75)", "A");
                addPDFTallyRow("B (65 - 74)", "B");
                addPDFTallyRow("C (50 - 64)", "C");
                addPDFTallyRow("S (35 - 49)", "S");
                addPDFTallyRow("W (< 35)", "W");
                addPDFTallyRow("Absent (AB)", "AB");
                
                finalHtml += `</tbody></table></div>`;
                
                // 2. Pass Summary (දකුණු පස වගුව - Grade 10,11,12,13 සඳහා පමණි)
                if(data.extraStats) {
                     let getScore = (str) => { let s = 0; str.split(' ').forEach(p => { let c=parseInt(p.replace(/[^0-9]/g, ''))||0; if(p.includes('A'))s+=c*10000; if(p.includes('B'))s+=c*1000; if(p.includes('C'))s+=c*100; if(p.includes('S'))s+=c*10; if(p.includes('W'))s-=c*10;}); return s; };
                     let allCombos = Array.from(new Set([...Object.keys(data.extraStats.classCombos), ...Object.keys(data.extraStats.secCombos)])).sort((a,b) => getScore(b) - getScore(a));

                     finalHtml += `<div style="flex: 1;">
                         <h3 style="margin:0 0 10px 0; font-size:14px; text-transform:uppercase;">Pass Summary</h3>
                         <table class="official-table" style="margin-top:0; width:100%;">
                             <thead><tr><th style="background:transparent;">Pass Combination</th><th style="background:transparent; text-align:center !important;">Class Count</th><th style="background:transparent; text-align:center !important;">Grade Count</th></tr></thead>
                             <tbody>`;
                     allCombos.forEach(combo => {
                         let cCount = data.extraStats.classCombos[combo] || 0;
                         let sCount = data.extraStats.secCombos[combo] || 0;
                         finalHtml += `<tr><td>${combo}</td><td style="text-align:center !important;">${cCount}</td><td style="text-align:center !important;">${sCount}</td></tr>`;
                     });
                     finalHtml += `</tbody></table></div>`;
                }
                
                // Flex Container එක අවසන් කිරීම
                finalHtml += `</div>`;
                
                finalHtml += `<div class="signature-section"><div class="sig-box"><div class="sig-line"></div>Class Teacher / Sectional Head</div><div class="sig-box"><div class="sig-line"></div>Principal / Vice Principal</div></div>`;
            }
            finalHtml += `</div>`;
        }
        finalHtml += `</body></html>`; printWindow.document.write(finalHtml);
    } 
    else if(data.type === 'Subject') {
        let finalHtml = `<html><head><style>${commonStyles}</style></head><body>
        <div class="header"><div style="width: 75px; height: 75px;">${SYS_LOGO_SVG}</div><div style="text-align:left;"><h1>${schoolName}</h1><h2>Subject Marks</h2><h3>Subject: ${data.subject} | Class: ${sanitizeText(repClass)} | Class Teacher: ${repTeacher} | Year: ${data.year} ${data.term}</h3></div></div>
        <table><thead><tr><th>Adm No</th><th>Student Name</th><th>Marks</th><th>Grade</th></tr></thead><tbody>`;
        data.students.forEach(s => { finalHtml += `<tr><td>${sanitizeText(s.admNo)}</td><td style="width:100%;">${s.name}</td><td>${s.mark}</td><td>${s.grade}</td></tr>`; });
        finalHtml += `</tbody></table><div class="sig-section"><div class="sig-box"><div class="sig-line"></div>Subject Teacher</div></div></body></html>`;
        printWindow.document.write(finalHtml);
    }
    else if(data.type === 'TopClass' || data.type === 'TopSection') {
        let title = data.type === 'TopClass' ? "Class Top Students" : "Grade Top Students";
        let subTitle = data.type === 'TopClass' ? `Class: ${data.targetName} | Class Teacher: ${repTeacher}` : `Grade: ${data.targetName}`;
        let sigText = data.type === 'TopClass' ? "Class Teacher" : "Sectional Head / Vice Principal";
        
        let finalHtml = `<html><head><style>${commonStyles}</style></head><body>
        <div class="header"><div style="width: 75px; height: 75px;">${SYS_LOGO_SVG}</div><div style="text-align:left;"><h1>${schoolName}</h1><h2>${title}</h2><h3>${subTitle} | Term: ${data.year} ${data.term}</h3></div></div>
        <table><thead><tr><th style="width:1%;">Rank</th><th style="width:1%;">Adm No</th><th style="width:99%;">Student Name</th>${data.type === 'TopSection' ? '<th>Class</th>' : ''}<th>${data.isALevel ? 'Z-Score' : 'Average'}</th><th>Total</th></tr></thead><tbody>`;
        data.students.forEach(s => { let rnk = data.type === 'TopSection' ? s.sectionRank : s.rank; finalHtml += `<tr><td>${rnk}</td><td>${sanitizeText(s.admNo)}</td><td>${sanitizeText(s.name)}</td>${data.type === 'TopSection' ? `<td>${s.className}</td>` : ''}<td>${data.isALevel ? s.overallZ : s.average}</td><td>${s.total}</td></tr>`; });
        finalHtml += `</tbody></table><div class="sig-section"><div class="sig-box"><div class="sig-line"></div>${sigText}</div></div></body></html>`;
        printWindow.document.write(finalHtml);
    }
    else if(data.type === 'IndividualCards') {
        let finalHtml = `<html><head><style>
        @page { size: A4 portrait; margin: 15mm; } 
        * { color: #000 !important; font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; text-rendering: optimizeLegibility; -webkit-print-color-adjust: exact; print-color-adjust: exact;}
        body { margin:0; text-transform: capitalize;} 
        .card { border: 2px solid #000; border-radius: 10px; padding: 25px; margin-bottom: 30px; height: 45%; box-sizing: border-box; page-break-inside: avoid;} 
        .header { display: flex; align-items: center; justify-content: center; gap: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;} 
        .header h1 { margin: 0; font-size: 20px; font-weight: 900;} 
        .header p { margin: 5px 0 0 0; font-size: 14px; font-weight: bold;} 
        .info { display: flex; flex-wrap: wrap; justify-content: space-between; gap:10px; font-size: 13px; font-weight: bold; margin-bottom: 15px; background:transparent; border-bottom:1px solid #000; padding-bottom:8px;} 
        table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: auto;} 
        th, td { border: 1.5px solid #000 !important; padding: 5px; text-align: left !important; font-weight:bold; } 
        th { background-color: transparent !important; text-transform: uppercase; font-weight: bold !important; white-space: nowrap;} 
        .summary { display: flex; justify-content: space-around; margin-top: 15px; font-size: 14px; font-weight: bold; border-top: 2px solid #000; padding-top: 10px;} 
        .signatures { display: flex; justify-content: space-between; margin-top: 40px;} 
        .sig-box { text-align: center; width: 30%; font-size: 12px; font-weight: bold;} 
        .sig-line { border-top: 1.5px dashed #000; margin-bottom: 5px; width: 80%; margin: 0 auto;}
        </style></head><body>`;
        data.students.forEach((s) => {
            finalHtml += `<div class="card"><div class="header"><div style="width: 55px; height: 55px;">${SYS_LOGO_SVG}</div><div style="text-align:left;"><h1>${schoolName}</h1><p>Student Progress Report - ${data.year} ${data.term}</p></div></div><div class="info"><span>Name: ${s.name}</span><span>Adm No: ${s.admNo}</span><span>Class: ${sanitizeText(repClass)}</span><span>Teacher: ${repTeacher}</span></div><table><thead><tr><th style="width:100%;">Subject</th><th style="width:1%; text-align:center !important;">Marks</th><th style="width:1%; text-align:center !important;">Grade</th></tr></thead><tbody>`;
            data.displayCols.forEach(col => { 
                let cellData = s.displayMarks[col]; 
                let val = cellData && cellData.value !== undefined ? cellData.value : "-"; 
                let finalSubjName = (cellData && cellData.actualSubj && cellData.actualSubj !== col) ? `${col} (${cellData.actualSubjCode || cellData.actualSubj})` : col; 
                finalHtml += `<tr><td>${finalSubjName}</td><td style="text-align:center !important; white-space:nowrap;">${val}</td><td style="text-align:center !important; white-space:nowrap;">${getGr(val)}</td></tr>`; 
            });
            
            finalHtml += `</tbody></table><div class="summary"><span>Total Marks: ${s.total}</span><span>${data.isALevel ? 'Z-Score: '+s.overallZ : 'Average: '+s.average}</span><span>Class Rank: ${s.rank}</span></div><div class="signatures"><div class="sig-box"><div class="sig-line"></div>Class Teacher / Sectional Head</div><div class="sig-box"><div class="sig-line"></div>Principal / Vice Principal</div><div class="sig-box"><div class="sig-line"></div>Parent / Guardian</div></div></div>`;
        });
        finalHtml += `</body></html>`; printWindow.document.write(finalHtml);
    }
    else if (data.type === 'PassesSummaryClass' || data.type === 'PassesSummarySection') {
        let title = data.type === 'PassesSummaryClass' ? "Pass Summary (Class)" : "Pass Summary (Grade)";
        let subTitle = data.type === 'PassesSummaryClass' ? `Class: ${data.target} | Class Teacher: ${repTeacher}` : `Grade: ${data.target}`;
        let finalHtml = `<html><head><style>${commonStyles} .combo-title { font-size: 14px; font-weight: bold; background: transparent; padding: 8px; margin-top: 20px; border: 1.5px solid #000; }</style></head><body>
        <div class="header"><div style="width: 75px; height: 75px;">${SYS_LOGO_SVG}</div><div style="text-align:left;"><h1>${schoolName}</h1><h2>${title}</h2><h3>${subTitle} | Term: ${data.year} ${data.term}</h3></div></div>`;

        let sortedCombos = Object.keys(data.combos).sort((a,b) => data.combos[b].score - data.combos[a].score);
        sortedCombos.forEach(combo => {
            let stds = data.combos[combo].students;
            finalHtml += `<div class="combo-title">${combo} (${stds.length} Students)</div>`;
            finalHtml += `<table><thead><tr><th>Adm No</th><th style="width:100%;">Student Name</th><th>Class</th><th>Average</th></tr></thead><tbody>`;
            stds.forEach(s => { finalHtml += `<tr><td>${sanitizeText(s.admNo)}</td><td>${sanitizeText(s.name)}</td><td>${s.className || data.target}</td><td>${s.average}</td></tr>`; });
            finalHtml += `</tbody></table>`;
        });
        finalHtml += `</body></html>`;
        printWindow.document.write(finalHtml);
    }
    else if (data.type === 'Prediction') {
        let finalHtml = `<html><head><style>${commonStyles}</style></head><body>
        <div class="header"><div style="width: 75px; height: 75px;">${SYS_LOGO_SVG}</div><div style="text-align:left;"><h1>${schoolName}</h1><h2>O/L AI Prediction</h2><h3>Class: ${sanitizeText(repClass)} | Class Teacher: ${repTeacher} | Based on past marks</h3></div></div>
        <table><thead><tr><th>Adm No</th><th style="width:100%;">Student Name</th>`;
        data.displayCols.forEach(c => finalHtml += `<th>${c}</th>`);
        finalHtml += `<th>Pred. Avg</th></tr></thead><tbody>`;
        data.students.forEach(s => {
            finalHtml += `<tr><td>${sanitizeText(s.admNo)}</td><td>${sanitizeText(s.name)}</td>`;
            data.rawSubKeys.forEach(k => {
                let val = s.predicted[k];
                if(val !== undefined) finalHtml += `<td style="white-space:nowrap;">${val} (${getGr(val)})</td>`;
                else finalHtml += `<td>-</td>`;
            });
            finalHtml += `<td>${s.avg}</td></tr>`;
        });
        finalHtml += `</tbody></table></body></html>`;
        printWindow.document.write(finalHtml);
    }
    else if (data.type === 'ALPrediction') {
        let finalHtml = `<html><head><style>
        @page { size: A4 portrait; margin: 15mm; } 
        * { color: #000 !important; font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; text-rendering: optimizeLegibility; -webkit-print-color-adjust: exact; print-color-adjust: exact;}
        body { margin:0;} 
        .header { display: flex; align-items: center; justify-content: center; gap: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;} 
        .card { border: 1.5px solid #000; padding: 15px; margin-bottom: 20px; page-break-inside: avoid; border-radius:5px;} 
        .card-header { font-weight: bold; font-size: 14px; margin-bottom: 10px; display:flex; justify-content:space-between; border-bottom:1px dashed #000; padding-bottom:5px; }
        .table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px; }
        .table th, .table td { border: 1px solid #000 !important; padding: 6px; text-align: left !important; vertical-align:middle; }
        .table th { font-weight: bold !important; text-transform:uppercase; background-color: transparent !important;}
        .advice-box { border: 1px solid #000; padding: 10px; font-size: 12px; border-radius:3px; background-color: #f8fafc;}
        .advice-title { font-weight: bold; margin-bottom: 5px; font-size:13px;}
        .sig-section { display: flex; justify-content: space-between; margin-top: 40px; }
        .sig-box { text-align: center; width: 25%; font-weight: bold; font-size: 11px;}
        .sig-line { border-top: 1px dashed #000; margin-bottom: 5px; width: 100%; }
        </style></head><body>
        <div class="header">
            <div style="width: 60px; height: 60px;">${SYS_LOGO_SVG}</div>
            <div style="text-align:left;">
                <h1 style="margin:0; font-size:18px; text-transform:uppercase;">${schoolName}</h1>
                <h2 style="margin:4px 0; font-size:14px;">A/L AI Prediction & Progress Report</h2>
                <h3 style="margin:0; font-size:12px; font-weight:normal;">Class: ${sanitizeText(repClass)} | Class Teacher: ${repTeacher}</h3>
            </div>
        </div>`;
        
        data.students.forEach(s => {
            finalHtml += `<div class="card">
                <div class="card-header">
                    <span>Name: ${s.name} (Adm: ${s.admNo})</span>
                    <span>Predicted Avg: ${s.avg}</span>
                </div>
                <table class="table">
                    <thead><tr><th>Subject</th><th style="width:80px; text-align:center !important;">Guessed Mark</th><th style="width:80px; text-align:center !important;">Guessed Grade</th></tr></thead>
                    <tbody>`;
            let subKeys = Object.keys(s.subjects);
            if(subKeys.length === 0) {
                finalHtml += `<tr><td colspan="3" style="text-align:center !important;">No A/L Main Subjects found.</td></tr>`;
            } else {
                subKeys.forEach(k => {
                    let sub = s.subjects[k];
                    finalHtml += `<tr><td>${sub.name}</td><td style="text-align:center !important; font-weight:bold;">${sub.mark}</td><td style="text-align:center !important; font-weight:bold;">${sub.grade}</td></tr>`;
                });
            }
            finalHtml += `</tbody></table>
                <div class="advice-box" style="border-left: 4px solid ${s.advice.color};">
                    <div class="advice-title" style="color: ${s.advice.color};">${s.advice.title}</div>
                    <div>${s.advice.text}</div>
                </div>
            </div>`;
        });

        finalHtml += `
        <div class="sig-section">
            <div class="sig-box"><div class="sig-line"></div>Class Teacher</div>
            <div class="sig-box"><div class="sig-line"></div>Sectional Head</div>
            <div class="sig-box"><div class="sig-line"></div>Principal</div>
        </div>
        </body></html>`;
        printWindow.document.write(finalHtml);
    }
    else if (data.type === 'ClassStudentList') {
        let finalHtml = `<html><head><style>${commonStyles}</style></head><body>
        <div class="header">
            <div style="width: 75px; height: 75px;">${SYS_LOGO_SVG}</div>
            <div style="text-align:left;">
                <h1>${schoolName}</h1>
                <h2>Class Student List</h2>
                <h3>Class: ${data.cls} | Class Teacher: ${data.ctName} | Total Students: ${data.students.length}</h3>
            </div>
        </div>
        <table>
            <thead>
                <tr>
                    <th style="width:5%; text-align:center !important;">No</th>
                    <th style="width:15%;">Adm No</th>
                    <th style="width:45%;">Student Name</th>
                    <th style="width:15%;">Gender</th>
                    <th style="width:20%;">Contact Number</th>
                </tr>
            </thead>
            <tbody>`;
        
        data.students.forEach((s, index) => {
            finalHtml += `<tr>
                <td style="text-align:center !important;">${index + 1}</td>
                <td>${sanitizeText(s.admNo)}</td>
                <td>${sanitizeText(s.name)}</td>
                <td>${s.gender || 'Male'}</td>
                <td>${s.contact || '-'}</td>
            </tr>`;
        });
        
        finalHtml += `</tbody></table>
        <div class="sig-section"><div class="sig-box"><div class="sig-line"></div>Class Teacher</div></div>
        </body></html>`;
        
        printWindow.document.write(finalHtml);
    }
    else if(data.type === 'RemedialClass' || data.type === 'RemedialGrade') {
        let title = data.type === 'RemedialClass' ? "Remedial Action Report (Class)" : "Remedial Action Report (Grade)";
        let subTitle = data.type === 'RemedialClass' ? `Class: ${data.target} | Class Teacher: ${repTeacher}` : `Grade: ${data.target}`;

        let finalHtml = `<html><head><style>${commonStyles} 
        .w-grade { color: #dc2626 !important; font-weight:900;} 
        .s-grade { color: #d97706 !important; font-weight:bold;}
        .stat-table th, .stat-table td { font-size: 11px; padding: 4px; border: 1px solid #000 !important;}
        </style></head><body>
        <div class="header">
            <div style="width: 75px; height: 75px;">${SYS_LOGO_SVG}</div>
            <div style="text-align:left;">
                <h1>${schoolName}</h1><h2>${title}</h2><h3>${subTitle} | Term: ${data.year} ${data.term}</h3>
                <p style="font-size:10px; margin:2px 0; font-weight:bold;">Focus: Students scoring below 50 marks ('W' & 'S' Grades)</p>
            </div>
        </div>`;

        finalHtml += `<div style="margin-bottom:20px; width:60%;">
            <h4 style="margin:0 0 5px 0; font-size:12px;">Core Subjects Summary</h4>
            <table class="stat-table">
            <thead><tr><th style="background:transparent;">Subject</th><th style="background:transparent; text-align:center !important;">'W' (< 35)</th><th style="background:transparent; text-align:center !important;">'S' (35-49)</th></tr></thead><tbody>`;
        
        Object.keys(data.subjectStats).forEach(sub => {
            let stat = data.subjectStats[sub];
            if(stat.W > 0 || stat.S > 0) finalHtml += `<tr><td>${sub}</td><td style="text-align:center !important; font-weight:bold;">${stat.W}</td><td style="text-align:center !important;">${stat.S}</td></tr>`;
        });
        finalHtml += `</tbody></table></div>`;

        finalHtml += `<table><thead><tr><th style="width:8%;">Adm No</th><th style="width:25%;">Student Name</th>${data.type === 'RemedialGrade' ? '<th>Class</th>' : ''}<th style="text-align:center !important; width:5%;">W</th><th style="text-align:center !important; width:5%;">S</th><th style="width:57%;">Subjects to Improve</th></tr></thead><tbody>`;

        data.students.forEach(s => {
            let subDetails = s.details.map(d => `<span class="${d.grade === 'W' ? 'w-grade' : 's-grade'}">${d.subject} (${d.mark})</span>`).join(', ');
            finalHtml += `<tr><td>${sanitizeText(s.admNo)}</td><td>${sanitizeText(s.name)}</td>${data.type === 'RemedialGrade' ? `<td>${s.className}</td>` : ''}<td style="text-align:center !important;">${s.wCount}</td><td style="text-align:center !important;">${s.sCount}</td><td style="font-size:10px; font-weight:normal;">${subDetails}</td></tr>`;
        });
        
        // --- වෙනස් කළ කොටස: Signatures සඳහා Flexbox Space-between භාවිත කිරීම ---
        let leftSigText = data.type === 'RemedialClass' ? "Class Teacher" : "Sectional Head";
        finalHtml += `</tbody></table>
            <div style="display: flex; justify-content: space-between; margin-top: 40px;">
                <div class="sig-box" style="text-align: left;"><div class="sig-line"></div>${leftSigText}</div>
                <div class="sig-box" style="text-align: right;"><div class="sig-line"></div>Principal / Vice Principal</div>
            </div>
        </body></html>`;
        // -------------------------------------------------------------------------
        
        printWindow.document.write(finalHtml);
    }
    // --- PDF නාමය වෙනස් කිරීමේ ස්ථිරසාර ක්‍රමය (Strict Overwrite) ---
    let d = new Date();
    let timeString = d.getHours() + "" + d.getMinutes() + "" + d.getSeconds(); 
    let safeClassName = (data.class || data.className || data.grade || 'Report').replace(/\s+/g, '_');
    let fileName = `${data.type || 'Marks'}_${safeClassName}_${data.year || d.getFullYear()}_${data.term || 'Term'}_${timeString}`.replace(/\s+/g, '_');
    
    printWindow.document.close(); 
    
    // 1. Iframe එකේ HTML ඇතුළත ඇති පරණ Title එක සොයාගෙන එය අලුත් නමට වෙනස් කිරීම
    let frameTitleTag = printWindow.document.querySelector('title');
    if (frameTitleTag) {
        frameTitleTag.innerText = fileName;
    } else {
        let newTitle = printWindow.document.createElement('title');
        newTitle.innerText = fileName;
        printWindow.document.head.appendChild(newTitle);
    }

    // 2. ප්‍රධාන වෙබ් පිටුවේ නම තාවකාලිකව වෙනස් කිරීම
    let originalTitle = document.title;
    document.title = fileName;
    
    // බ්‍රවුසරයට නම වෙනස් කරගැනීමට මදක් වැඩිපුර කාලයක් (තත්පර 1ක්) ලබා දී Print කිරීම
    setTimeout(() => { 
        printWindow.focus();
        printWindow.print(); 
        
        // Print තිරය පැමිණි පසු නැවත පරණ නම යථා තත්ත්වයට පත් කිරීම
        setTimeout(() => { document.title = originalTitle; }, 2000);
    }, 1000);
  }

  window.exportReportToCSV = function() {
    const data = window.currentReportData; if (!data) return alert("No report generated.");
    let csvContent = "data:text/csv;charset=utf-8,";

    if(data.type === 'Class') {
        csvContent += `Class Master Sheet,Class: ${data.cls},Term: ${data.year} ${data.term}\n\n`;
        csvContent += `Adm No,Student Name,${data.displayCols.join(',')},Total,${data.isALevel ? 'Z-Score' : 'Average'},Rank\n`;
        data.students.forEach(s => {
            let row = [`"${s.admNo}"`, `"${s.name}"`];
            data.displayCols.forEach(col => { let cell = s.displayMarks[col]; let val = cell && cell.value !== undefined ? cell.value : "-"; row.push(`"${val}"`); });
            row.push(`"${s.total}"`, `"${data.isALevel ? s.overallZ : s.average}"`, `"${s.rank}"`);
            csvContent += row.join(',') + "\n";
        });
    } 
    else if(data.type === 'Subject') {
        csvContent += `Subject Marks,Subject: ${data.subject},Class: ${data.cls},Term: ${data.year} ${data.term}\n\n`;
        csvContent += `Adm No,Student Name,Marks,Grade\n`;
        data.students.forEach(s => { csvContent += `"${s.admNo}","${s.name}","${s.mark}","${s.grade}"\n`; });
    }
    else if(data.type === 'TopClass' || data.type === 'TopSection') {
        let title = data.type === 'TopClass' ? "Class Top Students" : "Grade Top Students";
        csvContent += `${title},Target: ${data.targetName},Term: ${data.year} ${data.term}\n\n`;
        csvContent += `Rank,Adm No,Student Name,${data.type === 'TopSection' ? 'Class,' : ''}${data.isALevel ? 'Z-Score' : 'Average'},Total\n`;
        data.students.forEach(s => { let rnk = data.type === 'TopSection' ? s.sectionRank : s.rank; csvContent += `"${rnk}","${s.admNo}","${s.name}",${data.type === 'TopSection' ? `"${s.className}",` : ''}"${data.isALevel ? s.overallZ : s.average}","${s.total}"\n`; });
    }
    else if(data.type === 'PassesSummaryClass' || data.type === 'PassesSummarySection') {
        let title = data.type === 'PassesSummaryClass' ? "Passes Summary (Class)" : "Passes Summary (Grade)";
        csvContent += `${title},Target: ${data.target},Term: ${data.year} ${data.term}\n\n`;
        let sortedCombos = Object.keys(data.combos).sort((a,b) => data.combos[b].score - data.combos[a].score);
        sortedCombos.forEach(combo => {
            let stds = data.combos[combo].students;
            csvContent += `Combo: ${combo} (${stds.length} Students)\n`;
            csvContent += `Adm No,Student Name,Class,Average\n`;
            stds.forEach(s => { csvContent += `"${s.admNo}","${s.name}","${s.className || data.target}","${s.average}"\n`; });
            csvContent += `\n`;
        });
    }
    else if(data.type === 'Prediction') {
        csvContent += `O/L AI Prediction,Class: ${data.cls}\n\n`;
        csvContent += `Adm No,Student Name,${data.displayCols.join(',')},Predicted Avg\n`;
        data.students.forEach(s => {
            let row = [`"${s.admNo}"`, `"${s.name}"`];
            data.rawSubKeys.forEach(k => { let val = s.predicted[k]; row.push(`"${val !== undefined ? val : '-'}"`); });
            row.push(`"${s.avg}"`);
            csvContent += row.join(',') + "\n";
        });
    }
    else if (data.type === 'ClassStudentList') {
        csvContent += `Class Student List,Class: ${data.cls}\n`;
        csvContent += `Class Teacher: ${data.ctName},Total Students: ${data.students.length}\n\n`;
        csvContent += `No,Adm No,Student Name,Gender,Contact Number\n`;
        
        data.students.forEach((s, index) => {
            csvContent += `"${index + 1}","${s.admNo}","${s.name}","${s.gender || 'Male'}","${s.contact || '-'}"\n`;
        });
    }
    else if (data.type === 'ALPrediction') {
        csvContent += `A/L AI Prediction,Class: ${data.cls}\n\n`;
        csvContent += `Adm No,Student Name,Predicted Avg,Advice Title,Advice Details\n`;
        data.students.forEach(s => {
            csvContent += `"${s.admNo}","${s.name}","${s.avg}","${s.advice.title}","${s.advice.text.replace(/"/g, '""')}"\n`;
        });
    }
    else if(data.type === 'RemedialClass' || data.type === 'RemedialGrade') {
        let title = data.type === 'RemedialClass' ? "Remedial Action Report (Class)" : "Remedial Action Report (Grade)";
        csvContent += `${title},Target: ${data.target},Term: ${data.year} ${data.term}\n\n`;
        csvContent += `Core Subjects Summary\nSubject,W Grades (<35),S Grades (35-49)\n`;
        Object.keys(data.subjectStats).forEach(sub => {
            let stat = data.subjectStats[sub];
            if(stat.W > 0 || stat.S > 0) csvContent += `"${sub}","${stat.W}","${stat.S}"\n`;
        });
        csvContent += `\nStudent Details\nAdm No,Student Name,${data.type === 'RemedialGrade' ? 'Class,' : ''}Total 'W' Grades,Total 'S' Grades,Subjects to Improve\n`;
        data.students.forEach(s => {
            let subDetails = s.details.map(d => `${d.subject}: ${d.mark} [${d.grade}]`).join(' | ');
            csvContent += `"${s.admNo}","${s.name}",${data.type === 'RemedialGrade' ? `"${s.className}",` : ''}"${s.wCount}","${s.sCount}","${subDetails}"\n`;
        });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${data.type}_Report_${data.year}_${data.term}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // INITIALIZATION
  firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
          let email = user.email;
          let nic = email.split('@')[0].toUpperCase();
          if(nic === "ADMIN") {
              let snapshot = await fetch(`${DB_URL}/teachers/ADMIN.json`).then(r => r.json()); 
              if(!snapshot) { grantAccess({name: "Super Admin", role: "System Admin", isSetupMode: true}, "ADMIN"); } 
              else { grantAccess(snapshot, "ADMIN"); }
          } else {
              let tData = await apiCall('teachers/' + nic);
              if (tData && !tData.isFirstLogin) grantAccess(tData, nic);
              else if (tData && tData.isFirstLogin) {
                  tempSetupNic = nic;
                  document.getElementById('loginBox').style.display = 'none';
                  document.getElementById('setupBox').style.display = 'flex';
              }
              else firebase.auth().signOut();
          }
      } else {
          document.getElementById('appLayout').style.display = 'none';
          document.getElementById('setupBox').style.display = 'none';
          document.getElementById('loginBox').style.display = 'flex';
      }
  });
  // ==========================================
  // CUSTOM ERROR HANDLING (නව කේත කොටස)
  // ==========================================

  window.showErrorAlert = function(message) {
      const errorDiv = document.getElementById("error-message-box");
      if (!errorDiv) return;
      
      errorDiv.innerText = message;
      errorDiv.style.display = "block";
      errorDiv.style.backgroundColor = "#fef2f2"; 
      errorDiv.style.color = "#dc2626"; 
      errorDiv.style.padding = "12px 20px";
      errorDiv.style.border = "1px solid #fecaca";
      errorDiv.style.borderRadius = "8px";
      
      // තත්පර 6කින් පසු Error එක ස්වයංක්‍රීයව මැකී යාමට සැලැස්වීම (අවශ්‍ය නම් පමණක්)
      setTimeout(() => {
          errorDiv.style.display = "none";
      }, 6000);
  };
  // --- Real-time Mark Validation Function ---
  window.validateMarkInput = function(input) {
      let val = input.value.toUpperCase();
      
      // 'A' සහ 'B' අකුරු දෙක හැර වෙනත් ඉංග්‍රීසි අකුරු සහ සංකේත මැකීම (Numbers පමණක් ඉතිරි කිරීම)
      if (val !== "A" && val !== "AB" && val !== "ABS" && val !== "ABSENT") {
          input.value = val.replace(/[^0-9]/g, ''); // අංක පමණක් ඉතිරි කරයි
      }

      // 100 ට වඩා වැඩිනම් ස්වයංක්‍රීයව 100 බවට පත් කිරීම
      if (input.value !== "") {
          let numMark = Number(input.value);
          if (!isNaN(numMark)) {
              if (numMark > 100) {
                  input.value = 100; 
              } else if (numMark < 0) {
                  input.value = 0;
              }
          }
      }
      
      // Type කරනකොට Highlight වෙලා තියෙන රතු පාට අයින් කිරීම
      input.style.borderColor = "var(--primary)";
      input.style.backgroundColor = "#eff6ff";
  };

  window.fetchStudentReport = async function() {
      try {
          // ඔබගේ දත්ත ලබා ගැනීමේ කේතය මෙහි ලියන්න
          // උදාහරණ: let data = await apiCall('students/' + admNo);

      } catch (error) {
          let userFriendlyMessage = "A system error occurred. Please try again."; 

          if (error.code === 'PERMISSION_DENIED' || (error.message && error.message.includes('Access Denied'))) {
              userFriendlyMessage = "You do not have permission to view data for this class. Please contact the system administrator.";
          } 
          else if (error.code === 'NETWORK_ERROR' || !navigator.onLine) {
              userFriendlyMessage = "Your internet connection is disconnected. Please check your connection and try again.";
          } 
          else if (error.message && (error.message.includes('null') || error.message.includes('not found'))) {
              userFriendlyMessage = "Marks have not been entered for this student yet.";
          }

          // UI එකේ Error එක පෙන්වීම
          showErrorAlert(userFriendlyMessage);
      }
  };

})();
  