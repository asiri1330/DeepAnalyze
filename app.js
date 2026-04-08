
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
  