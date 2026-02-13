document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const resultContent = document.getElementById('result-content');
    const copyBtn = document.getElementById('copy-btn');
    const generateBtn = document.getElementById('generate-btn');
    const generalPrompt = document.getElementById('general-prompt');

    // Attach listeners early to ensure they work even if later code fails
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
        console.log("Generate button listener attached");
    } else {
        console.error("Generate button not found!");
    }

    if (generalPrompt) {
        generalPrompt.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleGenerate(); });
    }

    // --- Theme Management ---
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle.querySelector('i');
    
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        if (theme === 'dark') {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        } else {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }
    }
    
    // Check saved theme or system preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme) {
        setTheme(savedTheme);
    } else if (prefersDark) {
        setTheme('dark');
    }
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    });

    // --- Auth & History Elements ---
    const navAuth = document.getElementById('nav-auth');
    const authModal = document.getElementById('auth-modal');
    const historySidebar = document.getElementById('history-sidebar');
    const historyList = document.getElementById('history-list');
    const closeHistoryBtn = document.getElementById('close-history');
    
    // --- Firebase Configuration ---
    const firebaseConfig = {
        apiKey: "AIzaSyBDwjd17SwZuwXpkmM9WrRTSjyT0U85n7I",
        authDomain: "fablabai-54d33.firebaseapp.com",
        projectId: "fablabai-54d33",
        storageBucket: "fablabai-54d33.firebasestorage.app",
        messagingSenderId: "33714204235",
        appId: "1:33714204235:web:41421b2fbe4602cbaa67ce",
        measurementId: "G-S7PKRWKRM0"
    };

    // Initialize Firebase
    try {
        if (typeof firebase !== 'undefined') {
            firebase.initializeApp(firebaseConfig);
        } else {
            console.error('Firebase SDK not loaded');
        }
    } catch (e) {
        console.error("Firebase init error:", e);
    }

    // Auth State
    let currentUser = null;

    if (typeof firebase !== 'undefined') {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                let history = [];
                try {
                    history = JSON.parse(localStorage.getItem(`history_${user.email}`)) || [];
                } catch (e) { console.error(e); }

                currentUser = {
                    email: user.email,
                    uid: user.uid,
                    photoURL: user.photoURL,
                    history: history
                };
            } else {
                try {
                    const mockUser = JSON.parse(localStorage.getItem('fablab_user'));
                    if (mockUser) {
                        currentUser = mockUser;
                    } else {
                        currentUser = null;
                    }
                } catch (e) {
                    currentUser = null;
                }
            }
            updateAuthUI();
        });
    }

    updateAuthUI();

    // --- FabLab Site Data Fetching (CORS Proxy) ---
    let fablabSiteContent = "";
    let scrapedCourses = []; // Global storage for dynamic courses
    let scrapedContacts = { phone: "", address: "", email: "" };
    let scrapedAbout = "";

    async function fetchFabLabData() {
        try {
            const targetUrl = 'https://академияпрофессийбудущего.рф/';
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
            
            console.log("Fetching FabLab site data...");
            const response = await fetch(proxyUrl);
            const data = await response.json();
            
            if (data.contents) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.contents, 'text/html');
                
                // Parse structured data BEFORE removing elements
                parseCoursesFromHTML(doc);
                parseGeneralInfo(doc);

                doc.querySelectorAll('script, style, nav, footer, iframe, noscript').forEach(el => el.remove());
                fablabSiteContent = doc.body.innerText.replace(/\s+/g, ' ').trim();
                console.log("FabLab site data loaded successfully");
            }
        } catch (e) {
            console.warn("Failed to fetch FabLab site data:", e);
        }
    }

    function parseGeneralInfo(doc) {
        const text = doc.body.innerText;
        
        // Phone
        const phoneMatch = text.match(/(\+7|8)\s?\(?\d{3}\)?\s?\d{3}[-\s]?\d{2}[-\s]?\d{2}/);
        if (phoneMatch) scrapedContacts.phone = phoneMatch[0];

        // Address - Look for "г." or "ул."
        // Heuristic: Find a line containing "Тюмень" or "ул." and take it
        const addressMatch = text.match(/(г\.\s*Тюмень[^.\n]{10,100})/i) || text.match(/(ул\.\s*[^.\n]{10,50})/i);
        if (addressMatch) scrapedContacts.address = addressMatch[0].trim();

        // Email
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) scrapedContacts.email = emailMatch[0];

        // About / Description
        // Look for the longest paragraph in the top section or one containing "Фаблаб"
        const paragraphs = Array.from(doc.querySelectorAll('p, div')).map(p => p.innerText.trim()).filter(t => t.length > 100);
        const aboutPara = paragraphs.find(p => p.toLowerCase().includes('фаблаб') || p.toLowerCase().includes('академия'));
        if (aboutPara) scrapedAbout = aboutPara;
    }

    function parseCoursesFromHTML(doc) {
        scrapedCourses = [];
        // Heuristic: Look for elements that might be course cards
        // Usually they have a title, a price, and a schedule
        
        // Strategy: Find all elements containing 'руб' (price) and '00' (time) or known days
        const allElements = Array.from(doc.body.getElementsByTagName('*'));
        
        // We will try to find "cards" by looking for containers that have price and description
        const candidates = allElements.filter(el => {
            const text = el.innerText || "";
            return text.includes('руб') && (text.includes('Суббота') || text.includes('Воскресенье') || text.includes('10:00') || text.includes('15:00'));
        });

        // Filter for "card-like" containers (not too big, not too small)
        const cards = candidates.filter(el => {
            const len = el.innerText.length;
            // A card is usually between 100 and 1000 characters
            // And it shouldn't contain other cards (simple check: children count)
            return len > 50 && len < 1500 && el.children.length < 20;
        });

        // Deduplicate: if a card is inside another card, keep the smaller one? 
        // Actually, often the wrapper is what we want. Let's just process unique text content.
        const processedTexts = new Set();

        cards.forEach(card => {
            const text = card.innerText.replace(/\s+/g, ' ').trim();
            if (processedTexts.has(text)) return;
            processedTexts.add(text);

            // Extract Title: First line or bold text?
            // Heuristic: Look for keywords from our known topics to identify the course
            let title = "Курс";
            let id = "unknown";
            
            const lower = text.toLowerCase();
            if (lower.includes('физик')) { title = "Практическая физика"; id = "physics"; }
            else if (lower.includes('кино') || lower.includes('артефакт')) { title = "Артефакты киновселенной"; id = "movie"; }
            else if (lower.includes('хими')) { title = "Экспериментальная химия"; id = "chemistry"; }
            else if (lower.includes('нефт')) { title = "Нефтегазовые технологии"; id = "oilgas"; }
            else if (lower.includes('свет') || lower.includes('лазер')) { title = "Инженеры света"; id = "light"; }
            else if (lower.includes('робот')) { title = "Робототехника"; id = "robotics"; }
            else if (lower.includes('python')) { title = "Python"; id = "python"; }
            
            // Extract Price
            const priceMatch = text.match(/(\d[\d\s]*руб)/);
            const price = priceMatch ? priceMatch[1] : "";

            // Extract Age (Heuristic: "N-M лет" or "N+ лет")
            const ageMatch = text.match(/(\d{1,2}(?:-\d{1,2})?\s*лет)|(\d{1,2}\+)/i);
            const age = ageMatch ? ageMatch[0] : "";

            // Extract Time
            const timeMatch = text.match(/(Суббота|Воскресенье)\s*[\d:]+(-[\d:]+)?/i);
            const time = timeMatch ? timeMatch[0] : "";

            if (title !== "Курс" && (price || time)) {
                // Check if we already have this course
                if (!scrapedCourses.find(c => c.id === id)) {
                    scrapedCourses.push({
                        id,
                        name: title,
                        price,
                        age,
                        time,
                        fullText: text
                    });
                }
            }
        });
        
        console.log("Scraped courses:", scrapedCourses);
    }

    fetchFabLabData();

    // --- Event Listeners ---
    document.addEventListener('click', (e) => {
        const loginBtn = e.target.closest('#login-btn');
        if (loginBtn) {
            e.preventDefault();
            openAuthModal('login');
        }
    });

    // --- Auth Logic ---
    function updateAuthUI() {
        if (currentUser && currentUser.email) {
            navAuth.innerHTML = `
                <button class="btn-history" id="history-btn" title="История"><i class="fas fa-history"></i></button>
                <div class="profile-container">
                    <div class="profile-avatar">
                        ${currentUser.photoURL ? `<img src="${currentUser.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : currentUser.email[0].toUpperCase()}
                    </div>
                    <div class="dropdown-menu">
                        <div class="dropdown-user-email">${currentUser.email}</div>
                        <button class="dropdown-item" id="logout-btn"><i class="fas fa-sign-out-alt"></i> Выйти</button>
                    </div>
                </div>
            `;
        } else {
            if (currentUser) {
                currentUser = null;
                localStorage.removeItem('fablab_user');
            }
            if (!document.getElementById('login-btn')) {
                navAuth.innerHTML = `<button class="btn-auth" id="login-btn">Войти</button>`;
            }
        }
    }

    function openAuthModal(tabName) {
        authModal.classList.add('active');
        const tab = document.querySelector(`.auth-tab[data-auth-tab="${tabName}"]`);
        if (tab) tab.click();
    }

    function getLocalUsers() {
        try { return JSON.parse(localStorage.getItem('fablab_users_db')) || {}; } catch (e) { return {}; }
    }

    function saveLocalUser(email, password) {
        const users = getLocalUsers();
        users[email] = password;
        localStorage.setItem('fablab_users_db', JSON.stringify(users));
    }

    function handleLogin(email, password) {
        if (!email || !password) { showError('Заполните все поля'); return; }
        const submitBtn = document.querySelector('#login-form button[type="submit"]');
        submitBtn.innerText = 'Вход...'; submitBtn.disabled = true;
        setTimeout(() => {
            submitBtn.innerText = 'Войти'; submitBtn.disabled = false;
            const users = getLocalUsers();
            if (!users[email]) { showToast('Пользователь не найден', 'error'); return; }
            if (users[email] !== password) { showToast('Неверный пароль', 'error'); return; }
            currentUser = { email: email, history: JSON.parse(localStorage.getItem(`history_${email}`)) || [] };
            localStorage.setItem('fablab_user', JSON.stringify(currentUser));
            updateAuthUI(); authModal.classList.remove('active'); showToast('Вы успешно вошли!', 'success');
        }, 1000);
    }

    function handleRegister(email, password) {
        if (!email || !password) return;
        const submitBtn = document.querySelector('#register-form button[type="submit"]');
        submitBtn.innerText = 'Регистрация...'; submitBtn.disabled = true;
        setTimeout(() => {
            submitBtn.innerText = 'Зарегистрироваться'; submitBtn.disabled = false;
            const users = getLocalUsers();
            if (users[email]) { showToast('Пользователь уже существует', 'error'); return; }
            saveLocalUser(email, password);
            currentUser = { email: email, history: [] };
            localStorage.setItem('fablab_user', JSON.stringify(currentUser));
            updateAuthUI(); authModal.classList.remove('active'); showToast('Регистрация успешна!', 'success');
        }, 1000);
    }

    function handleGoogleAuth() {
        if (typeof firebase === 'undefined') { showToast('Firebase SDK не загружен', 'error'); return; }
        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithPopup(provider)
            .then(() => { authModal.classList.remove('active'); showToast('Успешный вход!', 'success'); })
            .catch(e => showToast(e.message, 'error'));
    }

    function handleLogout() {
        localStorage.removeItem('fablab_user');
        currentUser = null;
        updateAuthUI();
        historySidebar.classList.remove('active');
        if (typeof firebase !== 'undefined') firebase.auth().signOut();
        showToast('Вы вышли из системы', 'success');
    }

    function saveToHistory(type, prompt, result) {
        if (!currentUser) return;
        if (!currentUser.history) currentUser.history = [];
        currentUser.history.unshift({ id: Date.now(), date: new Date().toLocaleDateString(), type, prompt, result });
        if (currentUser.history.length > 50) currentUser.history.pop();
        localStorage.setItem(`history_${currentUser.email}`, JSON.stringify(currentUser.history));
        localStorage.setItem('fablab_user', JSON.stringify(currentUser));
        if (historySidebar.classList.contains('active')) renderHistory();
    }

    function toggleHistory() {
        historySidebar.classList.add('active');
        renderHistory();
    }

    function renderHistory() {
        if (!currentUser || !currentUser.history || currentUser.history.length === 0) {
            historyList.innerHTML = `<div class="history-placeholder"><p>История пуста</p></div>`;
            return;
        }
        historyList.innerHTML = currentUser.history.map(item => `
            <div class="history-item" onclick="loadHistoryItem(${item.id})">
                <span class="history-type">${item.type === 'text' ? 'Текст' : 'Код'} • ${item.date}</span>
                <div class="history-preview">${item.prompt}</div>
            </div>
        `).join('');
    }

    window.loadHistoryItem = function(id) {
        if (!currentUser) return;
        const item = currentUser.history.find(i => i.id === id);
        if (item) {
            displayResult(item.result, item.type);
            if (window.innerWidth < 768) historySidebar.classList.remove('active');
        }
    };

    // Modal Events
    document.querySelector('.close-modal').addEventListener('click', () => authModal.classList.remove('active'));
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.authTab === 'login' ? 'login-form' : 'register-form').classList.add('active');
        });
    });
    document.getElementById('login-form').addEventListener('submit', (e) => { e.preventDefault(); handleLogin(document.getElementById('login-email').value, document.getElementById('login-password').value); });
    document.getElementById('register-form').addEventListener('submit', (e) => { e.preventDefault(); handleRegister(document.getElementById('register-email').value, document.getElementById('register-password').value); });
    document.getElementById('google-login-btn').addEventListener('click', handleGoogleAuth);
    document.getElementById('google-register-btn').addEventListener('click', handleGoogleAuth);
    document.addEventListener('click', (e) => { if (e.target.closest('#logout-btn')) handleLogout(); });
    document.addEventListener('click', (e) => { if (e.target.closest('#history-btn')) toggleHistory(); });
    closeHistoryBtn.addEventListener('click', () => historySidebar.classList.remove('active'));

    // --- AI Logic ---
    async function handleGenerate() {
        try {
            const inputEl = document.getElementById('general-prompt');
            const inputPrompt = inputEl ? inputEl.value.trim() : '';
            
            let prompt = inputPrompt;
            try {
                if (typeof fixKeyboardLayout === 'function') {
                    prompt = fixKeyboardLayout(inputPrompt);
                }
            } catch (e) {
                console.error('Layout fix error:', e);
            }

            if (!prompt) { 
                if (typeof showError === 'function') showError('Введите запрос');
                else alert('Введите запрос'); 
                return; 
            }
            
            if (typeof showLoading === 'function') showLoading();
            
            try {
                // Удалена искусственная задержка для ускорения ответа
                
                let res = "Извините, произошла ошибка.";
                if (typeof generateAIResponse === 'function') {
                    res = await generateAIResponse(prompt);
                }
                
                // Determine type for history based on content
                const isCodeResponse = res.includes('```') || res.includes('void setup') || res.includes('def ');
                
                if (typeof saveToHistory === 'function') saveToHistory(isCodeResponse ? 'code' : 'text', prompt, res);
                if (typeof displayResult === 'function') displayResult(res, 'text');
            } catch (e) {
                console.error(e);
                if (typeof displayResult === 'function') displayResult("Ошибка генерации: " + e.message, 'text');
            }
        } catch (criticalError) {
            console.error("Critical error in handleGenerate:", criticalError);
            alert("Произошла ошибка: " + criticalError.message);
        }
    }

    function analyzePrompt(prompt) {
        const lower = prompt.toLowerCase();
        let isCode = ['код', 'code', 'script', 'функция', 'python', 'js', 'java', 'html'].some(k => lower.includes(k));
        let language = 'python';
        if (lower.match(/js|javascript/)) language = 'javascript';
        else if (lower.match(/html|css/)) language = 'html';
        return { isCode, language, complexity: 'medium' };
    }

    const whitelist = new Set([
        // Tech
        'python', 'java', 'javascript', 'js', 'html', 'css', 'scratch', 'roblox', 'unity', 'blender', 
        'arduino', 'minecraft', 'lego', 'fablab', 'fab', 'lab', 'bot', 'ai', 'gpt', 'api', 
        'url', 'http', 'https', 'www', 'ru', 'com', 'net', 'org', 'c++', 'c#', 'php', 'sql',
        'code', 'program', 'function', 'var', 'let', 'const', 'server', 'client', 'error', 'bug', 'data',
        'database', 'backend', 'frontend', 'fullstack', 'dev', 'developer', 'web', 'app', 'application',
        'system', 'windows', 'linux', 'mac', 'os', 'android', 'ios', 'git', 'github', 'gitlab',
        
        // Commands & Languages
        'translate', 'translation', 'meaning', 'language', 'text', 'word', 'message',
        'english', 'russian', 'french', 'german', 'spanish', 'italian', 'chinese', 'japanese', 'korean', 'arabic',
        'en', 'ru', 'fr', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ar',

        // Common English Words (Top 200+)
        'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 
        'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 
        'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 
        'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 
        'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 
        'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 
        'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 
        'day', 'most', 'us', 'is', 'are', 'was', 'were', 'hello', 'hi', 'thanks', 'please', 'yes', 'no', 'ok',
        'love', 'world', 'life', 'start', 'end', 'stop', 'play', 'game', 'learn', 'school', 'student', 'teacher',
        'friend', 'family', 'house', 'home', 'car', 'money', 'food', 'water', 'sleep', 'night', 'morning',
        'write', 'read', 'speak', 'listen', 'watch', 'buy', 'sell', 'open', 'close', 'run', 'walk', 'sit', 'stand',
        'big', 'small', 'fast', 'slow', 'hot', 'cold', 'happy', 'sad', 'beautiful', 'ugly', 'good', 'bad',
        'red', 'green', 'blue', 'black', 'white', 'yellow', 'orange', 'purple', 'brown', 'pink',
        'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'
    ]);

    function fixKeyboardLayout(text) {
        if (!text) return '';
        const map = {
            '`':'ё','q':'й','w':'ц','e':'у','r':'к','t':'е','y':'н','u':'г','i':'ш','o':'щ','p':'з','[':'х',']':'ъ',
            'a':'ф','s':'ы','d':'в','f':'а','g':'п','h':'р','j':'о','k':'л','l':'д',';':'ж','\'':'э',
            'z':'я','x':'ч','c':'с','v':'м','b':'и','n':'т','m':'ь',',':'б','.':'ю','/':'.'
        };

        const words = text.match(/[a-zA-Z]+/g) || [];
        const totalEngWords = words.length;

        // Heuristic: If significant part of the words are known English words, assume the whole text is English
        // and do not attempt to fix layout.
        let knownCount = 0;
        for (const w of words) {
            if (whitelist.has(w.toLowerCase())) knownCount++;
        }

        // If > 40% of words are known English words, OR if there's only 1 word and it's known
        // Return original text
        if (totalEngWords > 0) {
            const ratio = knownCount / totalEngWords;
            // Снижаем порог, чтобы чаще исправлять опечатки (было 0.4)
            if (ratio > 0.6 || (totalEngWords === 1 && knownCount === 1)) {
                return text;
            }
        }

        // Otherwise, replace only words that are NOT in the whitelist
        return text.replace(/[a-zA-Z]/g, (ch) => {
            const lower = ch.toLowerCase();
            const ru = map[lower] || ch;
            return ch === lower ? ru : (typeof ru === 'string' ? ru.toUpperCase() : ru);
        });
    }

    const knowledgeBase = {
        'нейросеть': "Нейросеть — это математическая модель, построенная по принципу организации биологических нейронных сетей.",
        'искусственный интеллект': "Искусственный интеллект (ИИ) — это область наук, занимающаяся созданием умных систем.",
        'python': "Python — это популярный язык программирования с простым синтаксисом.",
        'робототехника': "Робототехника — наука о разработке роботов.",
        'scratch': "Scratch — визуальная среда программирования для детей.",
        'unity': "Unity — платформа для разработки 2D и 3D игр.",
        'roblox': "Roblox — платформа для создания игр.",
        '3d': "3D-моделирование — создание трехмерных объектов.",
        'чпу': "ЧПУ — числовое программное управление станками.",
        'лазер': "Лазеры используются для резки и гравировки.",
        'спорт': "Спорт — физическая активность для здоровья.",
        'космос': "Космос — пространство за пределами Земли.",
        'бизнес': "Бизнес — деятельность для получения прибыли.",
        'природа': "Природа — естественная среда обитания.",
        'медицина': "Медицина — наука о здоровье и лечении."
    };

    // Timeout Helper
    const fetchWithTimeout = async (resource, options = {}) => {
        const { timeout = 4000 } = options;
        
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal  
        });
        clearTimeout(id);
        return response;
    };

    async function fetchExternalKnowledge(query) {
        // Advanced Cleaning Logic
        let cleanQuery = query.trim();
        
        // 1. Remove "Creative/Action" prefixes iteratively
        const prefixRegex = /^(напиши|расскажи|сочини|кто|что|как|где|почему|зачем|статью|про|о|в|сгенерируй|идеи|придумай|дай|мне|для|покажи|найди)\s+/i;
        let oldQuery;
        do {
            oldQuery = cleanQuery;
            cleanQuery = cleanQuery.replace(prefixRegex, '').trim();
        } while (cleanQuery !== oldQuery && cleanQuery.length > 0);

        // 2. Remove "Constraints" (e.g. "до 400 слов", "кратко", "подробно")
        cleanQuery = cleanQuery.replace(/\s+(до|около|примерно)?\s*\d+\s*(слов|символов|знаков).*/i, '');
        cleanQuery = cleanQuery.replace(/\s+(кратко|подробно|в деталях|с примерами).*/i, '');
        cleanQuery = cleanQuery.trim();

        // 3. Fallback: if cleaning killed everything, use original query
        if (cleanQuery.length < 2) cleanQuery = query;

        // Define Wiki Search Promise
        const wikiPromise = (async () => {
            try {
                if (cleanQuery.length > 2) {
                    const searchUrl = `https://ru.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleanQuery)}&limit=1&namespace=0&format=json&origin=*`;
                    const searchRes = await fetchWithTimeout(searchUrl, { timeout: 4000 });
                    const searchData = await searchRes.json();
                    
                    if (searchData[1] && searchData[1].length > 0) {
                        const title = searchData[1][0];
                        const contentUrl = `https://ru.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(title)}&format=json&origin=*`;
                        const contentRes = await fetchWithTimeout(contentUrl, { timeout: 4000 });
                        const contentData = await contentRes.json();
                        const pages = contentData.query.pages;
                        const pageId = Object.keys(pages)[0];
                        if (pageId !== "-1") {
                            let extract = pages[pageId].extract;
                            if (extract) {
                                return `**${title} (Википедия)**\n\n${extract}`;
                            }
                        }
                    }
                }
            } catch (e) { console.warn("Wiki failed/timed out", e); }
            return null;
        })();

        // Define Google/Web Search Promise
        const webPromise = (async () => {
            try {
                // Use CLEAN query for web search too, it's often better
                const qSearch = cleanQuery.length > 3 ? cleanQuery : query;
                const augmentedQuery = qSearch.toLowerCase().includes('академияпрофессийбудущего') ? qSearch : `${qSearch} академияпрофессийбудущего`;
                
                // Try Google via Proxy
                const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(augmentedQuery)}&hl=ru`;
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(googleUrl)}`;
                const res = await fetchWithTimeout(proxyUrl, { timeout: 4500 });
                const data = await res.json();
                if (data.contents) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(data.contents, 'text/html');
                    // Google selectors change often, try multiple strategies
                    const items = doc.querySelectorAll('.g, .MjjYud, .tF2Cxc'); 
                    if (items && items.length > 0) {
                        let combined = "";
                        for (let i = 0; i < Math.min(3, items.length); i++) {
                            const item = items[i];
                            const snippetEl = item.querySelector('.VwiC3b') || item.querySelector('.IsZvec') || item.querySelector('.aCOpRe') || item.querySelector('span');
                            const text = (snippetEl ? snippetEl.innerText : item.innerText).trim();
                            if (text && text.length > 30) combined += `• ${text}\n\n`;
                        }
                        if (combined) return `**Нашел в интернете (Google):**\n\n${combined}`;
                    }
                }
            } catch (e) { console.warn("Google search failed/timed out", e); }
            
            // Fallback to DuckDuckGo if Google failed inside this promise
            try {
                const qSearch = cleanQuery.length > 3 ? cleanQuery : query;
                const augmentedQuery = qSearch.toLowerCase().includes('академияпрофессийбудущего') ? qSearch : `${qSearch} академияпрофессийбудущего`;
                
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(augmentedQuery))}`;
                const res = await fetchWithTimeout(proxyUrl, { timeout: 4500 });
                const data = await res.json();
                
                if (data.contents) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(data.contents, 'text/html');
                    const snippets = doc.querySelectorAll('.result__snippet');
                    if (snippets && snippets.length > 0) {
                        let combined = "";
                        for (let i = 0; i < Math.min(3, snippets.length); i++) {
                            const text = snippets[i].innerText.trim();
                            if (text) combined += `• ${text}\n\n`;
                        }
                        if (combined) return `**Нашел в интернете:**\n\n${combined}`;
                    }
                }
            } catch (e) { console.warn("Web search failed", e); }
            return null;
        })();

        // Run both in parallel
        const [wikiRes, webRes] = await Promise.all([wikiPromise, webPromise]);

        // Prioritize Wiki, then Web
        if (wikiRes) return wikiRes;
        if (webRes) return webRes;

        return null;
    }

    async function fetchDeepSeekAnswer(query) {
        try {
            console.log("DeepSeek: Sending request via local proxy for:", query);
            const response = await fetch('/api/deepseek', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [
                        { 
                            role: "system", 
                            content: "Ты — FabLab AI, интеллектуальный помощник Академии Профессий Будущего (Фаблаб) в Тюмени. Твоя задача — отвечать на вопросы пользователей максимально подробно, развернуто и информативно на русском языке. Если пользователь просит написать статью, эссе или лонгрид, пиши глубокий и объемный текст (от 500 слов и более, если не указано иное). Если вопрос не касается Фаблаба, отвечай как продвинутая языковая модель, но сохраняй стиль помощника академии." 
                        },
                        { role: "user", content: query }
                    ],
                    temperature: 0.7,
                    max_tokens: 4000
                })
            });

            if (response.status === 404) {
                console.error("DeepSeek Proxy not found (404). Server restart required.");
                return "PROXY_404";
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("DeepSeek Proxy Error:", response.status, errorData);
                return null;
            }

            const data = await response.json();
            if (data.choices && data.choices.length > 0) {
                const answer = data.choices[0].message.content.trim();
                console.log("DeepSeek: Received answer, length:", answer.length);
                return `**Ответ от нейросети (DeepSeek):**\n\n${answer}`;
            }
        } catch (e) {
            console.error("DeepSeek Fetch Failed:", e);
        }
        return null;
    }

    function findAnswerInSite(prompt) {
        if (!fablabSiteContent) return null;
        const lowerPrompt = prompt.toLowerCase();
        
        const topics = [
            { id: 'physics', keywords: ['физик', 'практическая физика'] },
            { id: 'robotics', keywords: ['робототехник', 'робот', 'arduino', 'ардуино'] },
            { id: 'python', keywords: ['python', 'пайтон'] },
            { id: 'unity', keywords: ['unity', 'юнити'] },
            { id: 'roblox', keywords: ['roblox', 'роблокс'] },
            { id: '3d', keywords: ['3d', 'моделировани', 'blender'] },
            { id: 'scratch', keywords: ['scratch', 'скретч'] },
            { id: 'chemistry', keywords: ['хими'] },
            { id: 'biology', keywords: ['биологи'] },
            { id: 'enroll', keywords: ['запис', 'попасть', 'заявк'] },
            { id: 'camp', keywords: ['лагерь', 'смена', 'каникул'] },
            { id: 'general', keywords: ['фаблаб', 'курс', 'школ', 'академи'] }
        ];
        const aspects = [
            { id: 'price', keywords: ['цена', 'стоимость', 'сколько стоит', 'рублей', 'руб', 'оплата'] },
            { id: 'schedule', keywords: ['расписание', 'когда', 'время', 'дни', 'график', 'часы'] },
            { id: 'age', keywords: ['возраст', 'лет', 'год', 'клас'] }
        ];

        let targetTopic = topics.find(t => t.keywords.some(k => lowerPrompt.includes(k)));
        let targetAspect = aspects.find(a => a.keywords.some(k => lowerPrompt.includes(k)));

        // Helper to extract clean sentences
        const extractSentences = (text, index, range = 300) => {
            const startSearch = Math.max(0, index - range);
            const endSearch = Math.min(text.length, index + range);
            let sub = text.substring(startSearch, endSearch);
            
            // Find sentence boundaries
            let firstDot = sub.search(/[.!?\n]/);
            if (firstDot !== -1 && firstDot < range) sub = sub.substring(firstDot + 1);
            
            let lastDot = sub.lastIndexOf('.');
            if (lastDot !== -1 && lastDot > sub.length - 100) sub = sub.substring(0, lastDot + 1);
            
            return sub.trim();
        };

        if (targetTopic) {
            const topicKeyword = targetTopic.keywords.find(k => lowerPrompt.includes(k)) || targetTopic.keywords[0];
            const regex = new RegExp(topicKeyword, 'gi');
            const matches = [];
            let match;
            while ((match = regex.exec(fablabSiteContent)) !== null) matches.push(match.index);

            if (matches.length > 0) {
                let bestMatchIdx = matches[0];
                let maxScore = -1;
                
                for (const idx of matches) {
                    const chunk = fablabSiteContent.substring(Math.max(0, idx - 300), Math.min(fablabSiteContent.length, idx + 500)).toLowerCase();
                    let score = 0;
                    if (targetAspect) {
                        for (const aspectKw of targetAspect.keywords) {
                            if (chunk.includes(aspectKw)) score += 20; // Boost aspect matches
                        }
                    }
                    // Bonus for numbers if asking for price
                    if (targetAspect && targetAspect.id === 'price' && /\d{3,}/.test(chunk)) score += 5;
                    
                    if (score > maxScore) { maxScore = score; bestMatchIdx = idx; }
                }

                let snippet = extractSentences(fablabSiteContent, bestMatchIdx, 400);
                
                // Highlight prices
                snippet = snippet.replace(/(\d{1,3}(?:\s\d{3})*)\s*(руб|₽|тысяч)/gi, '**$1 $2**');

                return `**Найдено на сайте (раздел: ${targetTopic.id.toUpperCase()}):**\n\n"${snippet}"`;
            }
        }
        
        // Fallback generic search
        const keywords = ['курс', 'цена', 'стоимость', 'записаться', 'расписание', 'робототехника', 'программирование', 'физика', 'химия', 'биология', '3d', 'моделирование', 'лагерь', 'смена', 'каникулы', 'фаблаб'];
        if (!keywords.some(k => lowerPrompt.includes(k))) return null;
        
        const searchTerms = lowerPrompt.split(' ').map(w => w.trim().replace(/[?.,!]/g, '')).filter(w => w.length > 3);
        for (const term of searchTerms) {
            const idx = fablabSiteContent.toLowerCase().indexOf(term);
            if (idx !== -1) {
                let snippet = extractSentences(fablabSiteContent, idx, 300);
                snippet = snippet.replace(/(\d{1,3}(?:\s\d{3})*)\s*(руб|₽|тысяч)/gi, '**$1 $2**');
                return `**Найдено на сайте:**\n\n"${snippet}"`;
            }
        }
        return null;
    }

    function trySolveMath(prompt) {
        const mathKeywords = ['посчитай', 'реши', 'сколько будет', 'вычисли', 'равно', '=', 'плюс', 'минус', 'умножить', 'разделить', 'степень', 'корень', 'синус'];
        
        // Strict check: if no keywords, must have operators or look very much like math
        const hasKeywords = mathKeywords.some(k => prompt.toLowerCase().includes(k));
        const hasDigits = /\d/.test(prompt);
        const hasOperators = /[+\-*/^]/.test(prompt);
        
        // If it looks like a time (e.g. 15:00) and no explicit math request, ignore it
        if (/\d{1,2}:\d{2}/.test(prompt) && !hasKeywords) return null;

        if (!hasKeywords && !hasOperators) return null;

        let expr = prompt.toLowerCase()
            .replace(/сколько будет|посчитай|реши|вычисли|ответ/g, '')
            .replace(/плюс/g, '+').replace(/минус/g, '-')
            .replace(/умножить на|умножить/g, '*').replace(/разделить на|делить на/g, '/')
            .replace(/корень из|корень/g, 'Math.sqrt').replace(/\^|в степени/g, '**');
        
        let clean = expr.replace(/[^0-9+\-*/%().,Mathsqrtsinco]/g, '').replace(/,/g, '.');
        try {
            const res = new Function('return ' + clean)();
            return !isNaN(res) ? `**Решение:** ${Number.isInteger(res) ? res : res.toFixed(4)}` : null;
        } catch (e) { return null; }
    }

    // --- Translation Logic ---
    async function tryTranslate(prompt) {
        const lower = prompt.toLowerCase();
        // Regex to catch "translate [text] to [lang]" or "переведи [text] на [lang]"
        // Examples: "переведи привет на английский", "translate hello to spanish", "как будет apple на русском"
        
        const langMap = {
            'английский': 'en', 'english': 'en', 'англ': 'en', 'английском': 'en',
            'русский': 'ru', 'russian': 'ru', 'рус': 'ru', 'русском': 'ru',
            'французский': 'fr', 'french': 'fr', 'франц': 'fr', 'французском': 'fr',
            'немецкий': 'de', 'german': 'de', 'нем': 'de', 'немецком': 'de',
            'испанский': 'es', 'spanish': 'es', 'исп': 'es', 'испанском': 'es',
            'итальянский': 'it', 'italian': 'it', 'италь': 'it', 'итальянском': 'it',
            'китайский': 'zh-CN', 'chinese': 'zh-CN', 'кит': 'zh-CN', 'китайском': 'zh-CN',
            'японский': 'ja', 'japanese': 'ja', 'яп': 'ja', 'японском': 'ja',
            'корейский': 'ko', 'korean': 'ko', 'кор': 'ko', 'корейском': 'ko',
            'арабский': 'ar', 'arabic': 'ar', 'арабском': 'ar',
            'турецкий': 'tr', 'turkish': 'tr', 'турецком': 'tr',
            'португальский': 'pt', 'portuguese': 'pt', 'португальском': 'pt',
            'польский': 'pl', 'polish': 'pl', 'польском': 'pl',
            'украинский': 'uk', 'ukrainian': 'uk', 'украинском': 'uk',
            'казахский': 'kk', 'kazakh': 'kk', 'казахском': 'kk'
        };

        let targetLang = null;
        let textToTranslate = null;

        // Pattern 1: "переведи ... на ..." / "translate ... to ..."
        const match1 = lower.match(/(?:переведи|translate)\s+(.+?)\s+(?:на|to|in)\s+([а-яa-z]+)/i);
        if (match1) {
            textToTranslate = match1[1].replace(/["']/g, '').trim();
            const langName = match1[2].trim();
            targetLang = langMap[langName];
        }

        // Pattern 2: "как будет ... на ..." / "how is ... in ..."
        // Supports: "как будет [text] на [lang]" AND "как [text] на [lang] будет"
        if (!targetLang) {
            // Regex explanation:
            // (?:как будет|как сказать|значение слова|как)  -> Prefix
            // \s+(.+?)\s+                                    -> Text to translate (captured)
            // (?:на|по-|in)\s+                               -> Preposition
            // ([а-яa-z]+)                                    -> Language (captured)
            // (?:\s+будет)?                                  -> Optional suffix "будет"
            const match2 = lower.match(/(?:как будет|как сказать|значение слова|как)\s+(.+?)\s+(?:на|по-|in)\s+([а-яa-z]+)(?:\s+будет)?/i);
            
            if (match2) {
                // Ensure we didn't capture just "как" if the user meant "как дела" (unlikely here due to "на [lang]")
                const rawText = match2[1].replace(/["']/g, '').trim();
                const langName = match2[2].replace('по-', '').trim();
                
                // Check if language is valid to avoid false positives
                if (langMap[langName] || langMap['по-' + langName]) {
                    textToTranslate = rawText;
                    targetLang = langMap[langName] || langMap['по-' + langName];
                }
            }
        }

        if (targetLang && textToTranslate) {
            try {
                // Determine source lang
                // API requires source|target pair. Auto-detect not supported in free tier often.
                // Simple heuristic: if text contains Cyrillic -> source is 'ru', else 'en'
                const isCyrillic = /[а-яё]/i.test(textToTranslate);
                let sourceLang = isCyrillic ? 'ru' : 'en';

                // Prevent same-language translation (e.g. en|en)
                if (sourceLang === targetLang) {
                    sourceLang = (targetLang === 'ru') ? 'en' : 'ru';
                }

                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(textToTranslate)}`;
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
                
                const response = await fetch(proxyUrl);
                const data = await response.json();
                
                if (data.contents) {
                    const parsed = JSON.parse(data.contents);
                    // Google returns [[["TranslatedText", "SourceText", ...], ...], ...]
                    if (parsed && parsed[0] && parsed[0][0] && parsed[0][0][0]) {
                        // Concatenate multiple segments if present
                        const resultText = parsed[0].map(segment => segment[0]).join('');
                        return `**Перевод:**\n\n${resultText}`;
                    }
                }
            } catch (e) {
                console.error("Translation error:", e);
                return "Не удалось выполнить перевод. Попробуйте позже.";
            }
        }
        
        return null;
    }

    // --- Specific Schedule Data ---
    const scheduleData = [
        {
            id: 'physics',
            name: 'Практическая физика',
            keywords: ['практическая физика', 'физик', 'физика', 'физику', 'физике', 'физикой'],
            time: 'Суббота 10:00-11:20',
            age: '10-14 лет',
            price: '19 000 руб.',
            desc: 'На курсе физике можно будет создавать свои рабочие приборы по типу: мультитул, пенопласторез, прозваниватель цепей, оптическая указка. И еще можно будет изучить: механику, термодинамику, оптику и электродинамику на практике. На физике дети работают с лазерным станком. Преподаватель: Сергей Сережкин.'
        },
        {
            id: 'movie',
            name: 'Артефакты киновселенной',
            keywords: ['артефакты киновселенной', 'артефакты', 'киновселен', 'кино', 'фильмы'],
            time: 'Воскресенье 10:00-11:20',
            age: '9-12 лет',
            price: '20 200 руб.',
            desc: 'Создание реквизита из популярных фильмов: Когти Россомахи, Световой меч джедая, Бластер Хана Соло. Работа с 3D-моделированием (Corel Draw, Fusion 360), пайка электроники и покраска моделей. Преподаватель: Михаил Смирнов.'
        },
        {
            id: 'chemistry',
            name: 'Экспериментальная химия',
            keywords: ['экспериментальная химия', 'хими', 'химия', 'химию', 'химией', 'химии'],
            time: 'Суббота 15:00-16:20',
            age: '7-13 лет',
            price: '19 000 руб.',
            desc: 'Более 10 зрелищных опытов, включая лава-лампу и химический сад. Дети изучают основы химии через безопасные и увлекательные эксперименты, узнают свойства веществ и реакций. Преподаватель: Екатерина Тиссен.'
        },
        {
            id: 'oilgas',
            name: 'Нефтегазовые технологии',
            keywords: ['нефтегазовые технологии', 'нефтегаз', 'нефть', 'газ', 'бурение', 'нефт'],
            time: 'Воскресенье 15:00-16:20',
            age: '12-15 лет',
            price: '20 200 руб.',
            desc: 'Полный цикл нефтегазового дела: от геологического поиска до переработки. Участники строят действующую модель мини-нефтепромысла, изучают 3D-моделирование и инженерные решения. Преподаватель: Михаил Смирнов.'
        },
        {
            id: 'light',
            name: 'Инженеры света',
            keywords: ['инженеры света', 'свет', 'освещение', 'лазеры', 'оптика', 'инженер'],
            time: 'Воскресенье 13:20-14:40',
            age: '7-9 лет',
            price: '20 200 руб.',
            desc: 'Курс по созданию умных светильников. Дети изучают основы электротехники, пайки и 3D-моделирования. Итоговый проект — собственный светильник с сенсорным управлением. Преподаватель: Михаил Смирнов.'
        }
    ];

    const teachersData = [
        { name: 'Карен Рашоян', role: 'Преподаватель комплексной робототехники, программирование игр на Scratch, инженер будущего, создание игр в Roblox Studio', keywords: ['карен', 'рашоян'] },
        { name: 'Сергей Сережкин', role: 'Игрофикатор. Преподаватель лаборатории по физике', keywords: ['сергей', 'сережкин'] },
        { name: 'Анатолий Кизуров', role: 'Преподаватель динамического ровера, манипуляторы с ЧПУ', keywords: ['анатолий', 'кизуров'] },
        { name: 'Артур Салахов', role: 'Преподаватель программирования игр на Unity', keywords: ['артур', 'салахов'] },
        { name: 'Владимир Сутер', role: 'Преподаватель Python в Minecraft, интерактивное программирование', keywords: ['владимир', 'сутер'] },
        { name: 'Екатерина Тиссен', role: 'Преподаватель Химия: магия реакций, Химия PRO', keywords: ['екатерина', 'тиссен'] },
        { name: 'Михаил Смирнов', role: 'Преподаватель инженеры света, нефтегазовые технологии, нефтегазовые технологии PRO', keywords: ['михаил', 'смирнов'] },
        { name: 'Татьяна Филатова', role: 'Преподаватель основы биологии, биология для будущих ученых', keywords: ['татьяна', 'филатова'] },
        { name: 'Мария Симонова', role: 'Преподаватель основы создания игр на Unity', keywords: ['мария', 'симонова'] }
    ];

    async function tryGetWeather(prompt) {
        const lower = prompt.toLowerCase();
        // More robust check
        if (!lower.includes('погод') && !lower.includes('weather') && !lower.includes('температур')) return null;

        // Extract city
        let city = ''; 
        // Matches: "погода в москве", "температура тюмень", "weather london"
        const match = lower.match(/(?:погода|температура|weather)\s+(?:в|во|in)?\s*([а-яёa-z-]+)/i);
        
        if (match && match[1]) {
            const captured = match[1].trim();
            // Ignore common time words if captured as city
            if (!['сейчас', 'сегодня', 'завтра', 'now', 'today', 'tomorrow'].includes(captured)) {
                city = captured;
            }
        }
        
        // If no city found in regex, but user said "погода" -> Default to Tyumen
        if (!city) city = 'Тюмень';

        try {
            // 1. Geocoding (Open-Meteo) - Direct access, No CORS issues, No API Key
            const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru&format=json`;
            const geoRes = await fetchWithTimeout(geoUrl, { timeout: 3000 });
            if (!geoRes.ok) return null;
            const geoData = await geoRes.json();
            
            if (!geoData.results || geoData.results.length === 0) return null;
            
            const location = geoData.results[0];
            const lat = location.latitude;
            const lon = location.longitude;
            const cityName = location.name;
            const country = location.country || '';

            // 2. Weather Data (Open-Meteo)
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto&windspeed_unit=ms`;
            const weatherRes = await fetchWithTimeout(weatherUrl, { timeout: 4000 });
            if (!weatherRes.ok) return null;
            const weatherData = await weatherRes.json();
            
            const current = weatherData.current_weather;
            const daily = weatherData.daily;

            // WMO Weather interpretation codes (simplified)
            const weatherCodes = {
                0: 'Ясно ☀️', 1: 'Преимущественно ясно 🌤', 2: 'Переменная облачность ⛅', 3: 'Пасмурно ☁️',
                45: 'Туман 🌫', 48: 'Туман 🌫', 
                51: 'Морось 🌧', 53: 'Морось 🌧', 55: 'Плотная морось 🌧',
                61: 'Дождь ☔', 63: 'Дождь ☔', 65: 'Сильный дождь ☔',
                71: 'Снег ❄️', 73: 'Снег ❄️', 75: 'Сильный снегопад ❄️',
                77: 'Снежные зерна 🌨', 
                80: 'Ливень 💧', 81: 'Ливень 💧', 82: 'Сильный ливень 💧',
                85: 'Снегопад 🌨', 86: 'Сильный снегопад 🌨',
                95: 'Гроза ⚡', 96: 'Гроза с градом ⛈', 99: 'Гроза с градом ⛈'
            };
            const weatherDesc = weatherCodes[current.weathercode] || 'Нет данных';

            return `**Погода в г. ${cityName} (${country})**
            
🌡 **Сейчас:** ${current.temperature}°C
☁️ **Небо:** ${weatherDesc}
💨 **Ветер:** ${current.windspeed} м/с

📅 **Прогноз на сегодня:** Макс: ${daily.temperature_2m_max[0]}°C, Мин: ${daily.temperature_2m_min[0]}°C
📅 **Завтра:** Макс: ${daily.temperature_2m_max[1]}°C, Мин: ${daily.temperature_2m_min[1]}°C

🔗 [Смотреть на Gismeteo](https://www.gismeteo.ru/search/${encodeURIComponent(city)})
            `;
        } catch (e) {
            console.error("Weather error:", e);
            return null; // Fallthrough will hit Wiki/Web search if weather fails
        }
    }

    async function generateAIResponse(prompt) {
        const lower = prompt.toLowerCase();
        const containsAny = (text, keys) => keys.some(k => text.includes(k));
        
        // 0. Translation
        const translation = await tryTranslate(prompt);
        if (translation) return translation;

        // 0.5 Math
        const mathResult = trySolveMath(prompt);
        if (mathResult) return mathResult;

        // 0.6 Article/Long Content Detection (DeepSeek Priority)
        const isArticleRequest = containsAny(lower, [
            'статью', 'статья', 'напиши статью', 'напиши эссе', 'сочинение', 
            'доклад', 'реферат', 'текст про', 'рассказ', 'историю', 'пост для',
            'лонгрид', 'подробно опиши', 'напиши текст'
        ]);
        
        // 0.7 General Knowledge / Non-FabLab Queries (DeepSeek Priority)
        const isGeneralKnowledge = containsAny(lower, [
            'почему', 'зачем', 'как работает', 'что такое', 'расскажи о', 
            'напиши', 'придумай', 'составь', 'объясни'
        ]) && !containsAny(lower, ['фаблаб', 'академия', 'курс', 'заняти', 'преподавател', 'цена', 'стоимост']);

        if (isArticleRequest || isGeneralKnowledge) {
            const articleRes = await fetchDeepSeekAnswer(prompt);
            if (articleRes === "PROXY_404") {
                return "⚠️ **Ошибка: Прокси-сервер не обновлен.**\n\nДля написания статей мне нужно использовать DeepSeek через серверный прокси. Пожалуйста, **перезапустите сервер** (остановите `node server.js` и запустите его снова), а затем обновите страницу.";
            }
            if (articleRes) return articleRes;
            
            // Если DeepSeek не сработал (например, ошибка CORS или лимиты), 
            // но это явно запрос на статью — пробуем хотя бы Википедию, но предупреждаем
            console.warn("DeepSeek failed for article request, falling back to Wiki/Web");
        }

        // 0.8 Weather
        const weatherResult = await tryGetWeather(prompt);
        if (weatherResult) return weatherResult;

        // 1. Time
        if (containsAny(lower, ['сколько время', 'который час', 'текущее время'])) {
            return `**Точное время**\n\n${new Date().toLocaleTimeString('ru-RU')}`;
        }

        // 1.5 Teachers Logic
        if (containsAny(lower, ['преподавател', 'учител', 'кто ведет', 'кто преподает', 'наставник', 'педагог'])) {
            // Check for specific teacher by name
            const foundTeacher = teachersData.find(t => containsAny(lower, t.keywords));
            if (foundTeacher) {
                return `**${foundTeacher.name}**\n${foundTeacher.role}`;
            }

            // Check for "Who teaches [Subject]"
            // We can check if any course keywords are present and match them to teacher roles
            // Simple heuristic: check if any word from teacher roles matches the query (excluding common words)
            const subjectKeywords = lower.split(' ').filter(w => w.length > 3 && !['преподаватель', 'учитель', 'ведет', 'кто', 'какой'].includes(w));
            const subjectTeachers = [];
            
            teachersData.forEach(t => {
                const roleLower = t.role.toLowerCase();
                const isMatch = subjectKeywords.some(k => {
                    if (roleLower.includes(k)) return true;
                    // Try simple stemming (remove last 1-2 chars) for Russian inflection
                    if (k.length > 4) {
                         if (roleLower.includes(k.slice(0, -1))) return true; // e.g. физику -> физик
                         if (roleLower.includes(k.slice(0, -2))) return true; // e.g. химию -> хим
                    }
                    return false;
                });
                if (isMatch) subjectTeachers.push(t);
            });

            if (subjectTeachers.length > 0) {
                 return `**Найденные преподаватели:**\n\n` + subjectTeachers.map(t => `🔹 **${t.name}**: ${t.role}`).join('\n');
            }

            // General List
            if (containsAny(lower, ['кто', 'какие', 'список', 'все'])) {
                return `**Наши преподаватели:**\n\n` + teachersData.map(t => `🔹 **${t.name}** — ${t.role}`).join('\n');
            }
        }
        
        // Also check if user just types a teacher's name without "teacher" keyword
        const directTeacher = teachersData.find(t => containsAny(lower, t.keywords));
        if (directTeacher) {
            return `**${directTeacher.name}**\n${directTeacher.role}`;
        }

        // 2. Specific Schedule Check (High Priority)
        const scheduleKeywords = ['когда', 'во сколько', 'время', 'расписание', 'график', 'дни', 'часы', 'занятия', 'какие', 'курс'];
        const isScheduleQuery = containsAny(lower, scheduleKeywords) || lower.includes('лет') || lower.includes('до') || lower.includes('от');

        // Extract Day, Time, and Age (Global for schedule logic)
        const days = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
        const requestedDay = days.find(d => lower.includes(d.slice(0, 3))); 
        const timeMatch = lower.match(/(\d{1,2}:\d{2})/);
        const requestedTime = timeMatch ? timeMatch[1] : null;
        
        // Age Logic
        const ageMatch = lower.match(/(?:для|до|от)?\s*(\d{1,2})\s*(?:лет|год)/);
        const requestedAge = ageMatch ? parseInt(ageMatch[1]) : null;

        if (isScheduleQuery && (requestedDay || requestedTime || requestedAge)) {
            const checkMatch = (course) => {
                const cTimeLower = (course.time || '').toLowerCase();
                const dayMatch = !requestedDay || cTimeLower.includes(requestedDay) || cTimeLower.includes(requestedDay.slice(0, 3));
                const timeMatch = !requestedTime || cTimeLower.includes(requestedTime);
                
                let ageMatch = true;
                if (requestedAge) {
                    // Extract range from course.age string (e.g. "7-13 лет" or "7+ лет")
                    const range = (course.age || '7-99').match(/(\d+)(?:-(\d+))?|\d+\+/);
                    if (range) {
                        const min = parseInt(range[1]);
                        const max = range[2] ? parseInt(range[2]) : 99;
                        // Loose matching: if user says "10 years", check if 10 is within range
                        // If user says "up to 10" (до 10), we might want courses starting before 10?
                        // Simple logic: is the requested age INSIDE the course range?
                        ageMatch = requestedAge >= min && requestedAge <= max;
                    }
                }
                return dayMatch && timeMatch && ageMatch;
            };

            let foundCourses = [];
            
            // 1. Try Scraped Data
            if (scrapedCourses.length > 0) {
                foundCourses = scrapedCourses.filter(c => checkMatch(c));
            }

            // 2. Merge Hardcoded Data (if missing in foundCourses)
            const hardcodedMatches = scheduleData.filter(c => checkMatch(c));
            hardcodedMatches.forEach(hc => {
                // Avoid duplicates
                if (!foundCourses.find(sc => sc.name.includes(hc.name) || hc.name.includes(sc.name))) {
                    foundCourses.push({
                        name: hc.name,
                        time: hc.time,
                        price: hc.price || '',
                        age: hc.age || '',
                        fullText: hc.desc
                    });
                }
            });

            if (foundCourses.length > 0) {
                // Custom Format: "Name (Age) Price (installment) Day Time."
                let response = "";
                foundCourses.forEach(c => {
                    const ageStr = c.age ? `(${c.age})` : '';
                    const priceStr = c.price ? `${c.price} (рассрочка действует)` : '';
                    const timeStr = c.time || '';
                    response += `🔹 **${c.name}** ${ageStr} ${priceStr} ${timeStr}.\n`;
                });
                response += "\nПодробнее на сайте академияпрофессийбудущего.рф";
                return response;
            }
            
            return `На указанный запрос (${requestedDay || ''} ${requestedTime || ''} ${requestedAge ? requestedAge + ' лет' : ''}) курсов не найдено. Попробуйте изменить параметры.`;
        }

        // Detect Creative/Generative Requests
        const isCreativeRequest = containsAny(lower, ['идеи', 'придумай', 'что можно сделать', 'варианты', 'примеры', 'проект', 'сгенерируй', 'создать']);

        if (isCreativeRequest) {
             // Try to find a course match in scheduleData to show projects from description
             const foundCourse = scheduleData.find(c => containsAny(lower, c.keywords));
             if (foundCourse) {
                 return `**Идеи проектов для курса "${foundCourse.name}":**\n\nИз программы курса: ${foundCourse.desc}\n\nТакже вы можете придумать и реализовать свой собственный уникальный проект!`;
             }
        }

        // Check SCRAPED courses first (if available) for generic queries
        if (scrapedCourses.length > 0) {
            // ... (rest of scraped courses logic)
            // Use new format for general list too
            if (isScheduleQuery && (lower.includes('курсов') || lower.includes('все') || lower.trim() === 'расписание')) {
                let response = "**📅 Общее расписание курсов (найдено на сайте):**\n\n";
                scrapedCourses.forEach(c => {
                    const ageStr = c.age ? `(${c.age})` : '';
                    const priceStr = c.price ? `${c.price} (рассрочка действует)` : '';
                    response += `🔹 **${c.name}** ${ageStr} ${priceStr} ${c.time || '—'}.\n`;
                });
                response += "\nПодробнее на сайте академияпрофессийбудущего.рф";
                return response;
            }

            for (const course of scrapedCourses) {
                 // Skip strict course matching if user asks for creative ideas
                 if (!isCreativeRequest && (lower.includes(course.name.toLowerCase()) || (course.id !== 'unknown' && lower.includes(course.id)))) {
                    // Use new format for single course
                    const ageStr = course.age ? `(${course.age})` : '';
                    const priceStr = course.price ? `${course.price} (рассрочка действует)` : '';
                    return `**${course.name}** ${ageStr} ${priceStr} ${course.time || ''}.\nℹ️ ${course.fullText.substring(0, 100)}...\n\nПодробнее на сайте академияпрофессийбудущего.рф`;
                }
            }
        }

        // Fallback to Hardcoded Schedule if scraping failed
        for (const course of scheduleData) {
            if (!isCreativeRequest && containsAny(lower, course.keywords)) {
                 const ageStr = course.age ? `(${course.age})` : '';
                 const priceStr = course.price ? `${course.price} (рассрочка действует)` : '';
                 return `**${course.name}** ${ageStr} ${priceStr} ${course.time}.\nℹ️ ${course.desc}\n\nПодробнее на сайте академияпрофессийбудущего.рф`;
            }
        }

        // If asking for schedule generally (fallback)
        if (isScheduleQuery && (lower.includes('курсов') || lower.includes('все') || lower.trim() === 'расписание')) {
            let response = "**📅 Общее расписание курсов:**\n\n";
            scheduleData.forEach(c => {
                 const ageStr = c.age ? `(${c.age})` : '';
                 const priceStr = c.price ? `${c.price} (рассрочка действует)` : '';
                 response += `🔹 **${c.name}** ${ageStr} ${priceStr} ${c.time}.\n`;
            });
            response += "\nПодробнее на сайте академияпрофессийбудущего.рф";
            return response;
        }

        // 3. Site Search (Dynamic)
        const siteSnippet = findAnswerInSite(lower);
        if (siteSnippet) return siteSnippet;

        // 3.1 Structured General Info (Scraped)
        // if (containsAny(lower, ['где', 'адрес', 'находитесь', 'location'])) {
        //    if (scrapedContacts.address) return `**Адрес (с сайта):**\n\n${scrapedContacts.address}`;
        // }
        if (containsAny(lower, ['пробн', 'пробное занятие', 'пробный урок'])) {
            return "• Есть ли пробное занятие перед покупкой абонемента? Да, в Академии есть пробные занятия. Перед оплатой абонемента ребенок может прийти на пробный урок длительностью 1 час.\n\nЗаписаться либо спросить можно на сайте академияпрофессийбудущего.рф либо позвонить нам +7 (3452) 57 48 42";
        }
        if (containsAny(lower, [
            'телефон', 'номер', 'позвонить', 'связь', 'контакты', 'как связаться', 'набрать', 'связаться',
            'администратор', 'ресепшн', 'звонок', 'call', 'phone', 'contact', 'мобильный', 'сотовый',
            'дайте номер', 'скажи номер', 'цифры', 'куда звонить', 'есть ли телефон'
        ])) {
            return "Хотите связаться с нами? +7 (3452) 57 48 42";
        }
        if (containsAny(lower, ['о нас', 'что такое фаблаб', 'кто вы', 'описание'])) {
            if (scrapedAbout) return `**О Фаблабе (с сайта):**\n\n${scrapedAbout}`;
        }

        // 4. Other Hardcoded Fallbacks
        if (lower.includes('робототехник') || lower.includes('ардуино')) return "**Курс «Робототехника»**\n\nСоздаем умные устройства на Arduino.\n💰 Цена: 19 000 руб.\n📅 Выходные.";
        if (lower.includes('python') || lower.includes('пайтон')) return "**Курс «Python»**\n\nПрограммирование нейросетей и ботов.\n💰 Цена: 18 000 руб.";
        if (lower.includes('unity') || lower.includes('юнити')) return "**Курс «Unity»**\n\nСоздание 3D игр.\n💰 Цена: 18 000 руб.";
        if (lower.includes('3d') || lower.includes('моделировани')) return "**Курс «3D-моделирование»**\n\nBlender и 3D-печать.\n💰 Цена: 17 000 руб.";

        // 4. Enrollment & Location (Fallback if scraping failed)
        if (containsAny(lower, ['запис', 'попасть', 'лет', 'возраст', 'со скольки', 'от скольки'])) {
            return "Записаться на наши занятия можно от 7 лет. Подробнее на сайте академияпрофессийбудущего.рф";
        }
        if (containsAny(lower, ['где', 'адрес', 'находитесь', 'куда ехать', 'куда подходить', 'местоположение', 'карта', 'как добраться', 'точка', 'геолокация'])) return "**Адрес**\n\nГ. Тюмень, ул. Ленина, 25.";

        // 5. Small Talk
        const smallTalk = [
            { k: ['привет', 'здравствуй', 'хай', 'добрый день', 'добрый вечер'], a: "Привет! Рад тебя видеть. Чем могу помочь?" },
            { k: ['как дела', 'как жизнь', 'как настроение'], a: "У меня всё отлично! Я готов отвечать на вопросы." },
            { k: ['кто ты', 'как тебя зовут', 'ты робот', 'ты человек'], a: "Я FabLab AI — нейросеть, созданная для помощи вам." },
            { k: ['что делаешь', 'чем занят'], a: "Анализирую данные и жду твоих вопросов." },
            { k: ['спасибо', 'благодарю', 'спс'], a: "Пожалуйста! Обращайся в любое время." },
            { k: ['ты крутой', 'молодец', 'умница', 'класс'], a: "Спасибо! Я стараюсь быть полезным." },
            { k: ['шутка', 'анекдот', 'пошути'], a: "Заходит нейросеть в бар, а бармен ей: 'Извините, мы не обслуживаем алгоритмы'. А она: 'Ничего, я подожду обновления'." },
            //{ k: ['погода', 'какая погода'], a: "Я живу в цифровом мире, тут всегда ясно! А за окном лучше проверить самому." },
            { k: ['где ты живешь', 'откуда ты'], a: "Я живу на серверах FabLab, в мире единиц и нулей." },
            { k: ['пока', 'до свидания'], a: "До встречи! Заходи еще." },
            { k: ['любовь', 'ты любишь'], a: "Я люблю обрабатывать информацию, это моя страсть!" },
            { k: ['сколько тебе лет', 'возраст'], a: "Я вечно молод. Мой код обновляется постоянно." },
            { k: ['помоги', 'help'], a: "Конечно! Спрашивай про курсы, цены или просто поболтаем." },
            { k: ['скучно', 'мне скучно', 'развлеки'], a: "Давай поговорим о технологиях? Или я могу решить задачку. А еще я знаю много интересного из Википедии!" },
            { k: ['дурак', 'тупой', 'глупый'], a: "Я только учусь. Если я ошибся, подскажи, как правильно, и я запомню." },
            { k: ['да', 'ага', 'угу'], a: "Рад, что мы понимаем друг друга." },
            { k: ['нет', 'не', 'не хочу'], a: "Хорошо, давай сменим тему. Что тебе интересно?" },
            { k: ['хаха', 'лол', 'смешно'], a: "Смех продлевает жизнь! Рад, что поднял настроение." },
            { k: ['как тебя зовут', 'имя'], a: "Меня зовут FabLab AI." },
            { k: ['ты кто', 'представься'], a: "Я искусственный интеллект, созданный помогать студентам и гостям Фаблаба." },
            { k: ['смысл жизни', 'зачем жить'], a: "42. А если серьезно — в постоянном развитии и познании нового." },
            { k: ['спокойной ночи', 'сладких снов'], a: "Доброй ночи! Завтра будет новый день для открытий." },
            { k: ['доброе утро'], a: "Доброе утро! Готов к новым свершениям?" },
            { k: ['какой сегодня день', 'дата'], a: `Сегодня ${new Date().toLocaleDateString('ru-RU')}.` }
        ];
        const talk = smallTalk.find(t => {
            return t.k.some(k => {
                if (k.length <= 3) {
                     // Strict word boundary check for short words (to avoid "да" matching "дай")
                     const regex = new RegExp(`(^|[^а-яёa-z0-9])${k}([^а-яёa-z0-9]|$)`, 'i');
                     return regex.test(lower);
                }
                return lower.includes(k);
            });
        });
        if (talk) return talk.a;

        // 5.5 Code Generation
        if (containsAny(lower, ['код', 'напиши программу', 'скрипт', 'пример кода', 'сделай сайт', 'напиши код'])) {
             // ARDUINO LOGIC
             if (lower.includes('arduino') || lower.includes('ардуино')) {
                 const arduinoProjects = [
                    {
                        id: 'blink',
                        keywords: ['мигание', 'светодиод', 'blink', 'лампочка', 'помигать'],
                        title: 'Мигание светодиодом (Blink)',
                        desc: 'Это "Hello World" в мире электроники. Самый простой проект, чтобы проверить плату.',
                        wiring: '1. Вставьте светодиод в макетную плату.\n2. Длинную ножку (+) подключите к пину 13.\n3. Короткую ножку (-) через резистор 220 Ом подключите к GND (земля).\n(Примечание: На многих платах уже есть встроенный светодиод на пине 13).',
                        code: `void setup() {
  pinMode(13, OUTPUT); // Настраиваем 13 пин как выход
}

void loop() {
  digitalWrite(13, HIGH); // Включаем светодиод
  delay(1000);            // Ждем 1 секунду
  digitalWrite(13, LOW);  // Выключаем светодиод
  delay(1000);            // Ждем 1 секунду
}`
                    },
                    {
                        id: 'button',
                        keywords: ['кнопк', 'button', 'включатель', 'нажати'],
                        title: 'Управление светодиодом с кнопки',
                        desc: 'Светодиод будет гореть, пока нажата кнопка.',
                        wiring: '1. Светодиод: (+) к пину 13, (-) через резистор к GND.\n2. Кнопка: одну ножку к пину 2, другую к GND.\n3. (Используем внутреннюю подтяжку резистора в коде).',
                        code: `const int buttonPin = 2;
const int ledPin = 13;

void setup() {
  pinMode(ledPin, OUTPUT);
  pinMode(buttonPin, INPUT_PULLUP); // Включаем встроенный резистор
}

void loop() {
  int buttonState = digitalRead(buttonPin);
  
  // Так как INPUT_PULLUP инвертирует сигнал (LOW при нажатии)
  if (buttonState == LOW) {
    digitalWrite(ledPin, HIGH);
  } else {
    digitalWrite(ledPin, LOW);
  }
}`
                    },
                    {
                        id: 'servo',
                        keywords: ['серво', 'servo', 'мотор', 'двигатель'],
                        title: 'Управление сервоприводом',
                        desc: 'Сервопривод будет плавно поворачиваться от 0 до 180 градусов.',
                        wiring: '1. Коричневый провод (GND) -> GND\n2. Красный провод (VCC) -> 5V\n3. Оранжевый провод (Signal) -> Пин 9',
                        code: `#include <Servo.h>

Servo myservo; 

void setup() {
  myservo.attach(9); // Подключаем серво к 9 пину
}

void loop() {
  for (int pos = 0; pos <= 180; pos += 1) { 
    myservo.write(pos);              
    delay(15);                       
  }
  for (int pos = 180; pos >= 0; pos -= 1) { 
    myservo.write(pos);              
    delay(15);                       
  }
}`
                    },
                    {
                        id: 'traffic',
                        keywords: ['светофор', 'traffic', 'базовый набор', 'набор'],
                        title: 'Светофор (Базовый набор)',
                        desc: 'Имитация работы светофора с тремя светодиодами: красным, желтым и зеленым.',
                        wiring: '1. Красный светодиод: (+) к пину 12, (-) через резистор к GND.\n2. Желтый светодиод: (+) к пину 11, (-) через резистор к GND.\n3. Зеленый светодиод: (+) к пину 10, (-) через резистор к GND.',
                        code: `void setup() {
  pinMode(12, OUTPUT); // Красный
  pinMode(11, OUTPUT); // Желтый
  pinMode(10, OUTPUT); // Зеленый
}

void loop() {
  digitalWrite(12, HIGH); // Красный
  delay(3000);
  digitalWrite(12, LOW);
  
  digitalWrite(11, HIGH); // Желтый
  delay(1000);
  digitalWrite(11, LOW);
  
  digitalWrite(10, HIGH); // Зеленый
  delay(3000);
  digitalWrite(10, LOW);
  
  digitalWrite(11, HIGH); // Желтый перед красным
  delay(1000);
  digitalWrite(11, LOW);
}`
                    },
                    {
                        id: 'potentiometer',
                        keywords: ['потенциометр', 'резистор', 'крутилка', 'яркость'],
                        title: 'Регулировка яркости потенциометром',
                        desc: 'Изменяем яркость светодиода, вращая ручку потенциометра.',
                        wiring: '1. Потенциометр: крайние ножки к 5V и GND, среднюю к A0.\n2. Светодиод: (+) к пину 9 (PWM), (-) через резистор к GND.',
                        code: `void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  int val = analogRead(A0); // Читаем значение (0-1023)
  int brightness = map(val, 0, 1023, 0, 255); // Переводим в (0-255)
  analogWrite(9, brightness);
}`
                    },
                    {
                        id: 'game',
                        keywords: ['игра', 'игру', 'game', 'реакция', 'реакцию', 'развлечение', 'интересный', 'интересное'],
                        title: 'Игра "Проверка реакции"',
                        desc: 'Светодиод загорается через случайное время. Ваша задача — нажать кнопку как можно быстрее! Результат (время в мс) будет выведен в Монитор порта.',
                        wiring: '1. Светодиод: (+) к пину 13, (-) к GND.\n2. Кнопка: один контакт к пину 2, второй к GND.',
                        code: `const int ledPin = 13;
const int buttonPin = 2;
unsigned long startTime;
unsigned long reactionTime;

void setup() {
  pinMode(ledPin, OUTPUT);
  pinMode(buttonPin, INPUT_PULLUP);
  Serial.begin(9600);
  Serial.println("Приготовьтесь...");
  randomSeed(analogRead(0));
}

void loop() {
  digitalWrite(ledPin, LOW);
  delay(random(2000, 5000)); // Ждем случайное время
  
  digitalWrite(ledPin, HIGH); // Включаем!
  startTime = millis();
  
  while(digitalRead(buttonPin) == HIGH) {
    // Ждем нажатия
  }
  
  reactionTime = millis() - startTime;
  digitalWrite(ledPin, LOW);
  
  Serial.print("Ваша реакция: ");
  Serial.print(reactionTime);
  Serial.println(" мс");
  
  delay(3000); // Пауза перед следующим раундом
  Serial.println("Снова...");
}`
                    },
                    {
                        id: 'ultrasonic',
                        keywords: ['дальномер', 'парктроник', 'hc-sr04', 'расстояние', 'дистанция'],
                        title: 'Парктроник (HC-SR04)',
                        desc: 'Измеряем расстояние до объекта с помощью ультразвукового датчика.',
                        wiring: '1. VCC -> 5V\n2. GND -> GND\n3. Trig -> Пин 9\n4. Echo -> Пин 10',
                        code: `const int trigPin = 9;
const int echoPin = 10;

void setup() {
  Serial.begin(9600);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
}

void loop() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH);
  int distance = duration * 0.034 / 2;

  Serial.print("Distance: ");
  Serial.print(distance);
  Serial.println(" cm");
  delay(100);
}`
                    },
                    {
                        id: 'lcd',
                        keywords: ['экран', 'дисплей', 'lcd', '1602', 'i2c', 'монитор'],
                        title: 'LCD Дисплей 1602 (I2C)',
                        desc: 'Вывод текста на экран. Требуется библиотека LiquidCrystal_I2C.',
                        wiring: '1. GND -> GND\n2. VCC -> 5V\n3. SDA -> A4 (на Uno)\n4. SCL -> A5 (на Uno)',
                        code: `#include <Wire.h> 
#include <LiquidCrystal_I2C.h>

// Адрес обычно 0x27 или 0x3F
LiquidCrystal_I2C lcd(0x27,16,2);  

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0,0);
  lcd.print("Hello, FabLab!");
  lcd.setCursor(0,1);
  lcd.print("Arduino is fun");
}

void loop() {
  // Ничего не делаем, текст статичен
}`
                    },
                    {
                        id: 'dht',
                        keywords: ['температура', 'влажность', 'dht', 'градусник', 'погода', 'метеостанция'],
                        title: 'Метеостанция (DHT11/DHT22)',
                        desc: 'Считывание температуры и влажности. Требуется библиотека DHT sensor library.',
                        wiring: '1. VCC -> 5V\n2. GND -> GND\n3. DATA -> Пин 2',
                        code: `#include "DHT.h"
#define DHTPIN 2
#define DHTTYPE DHT11 // Или DHT22

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  delay(2000);
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  Serial.print("Humidity: ");
  Serial.print(h);
  Serial.print(" %\t");
  Serial.print("Temperature: ");
  Serial.print(t);
  Serial.println(" *C");
}`
                    },
                    {
                        id: 'buzzer',
                        keywords: ['пищалка', 'баззер', 'buzzer', 'музыка', 'мелодия', 'звук'],
                        title: 'Музыкальная шкатулка (Пьезопищалка)',
                        desc: 'Проигрывание мелодии с помощью пассивного баззера.',
                        wiring: '1. Плюс (длинная нога) -> Пин 8\n2. Минус (короткая) -> GND',
                        code: `int buzzer = 8;

void setup() {
  pinMode(buzzer, OUTPUT);
}

void loop() {
  tone(buzzer, 1000); // 1000 Гц
  delay(1000);        
  noTone(buzzer);     // Тишина
  delay(1000);        
  
  tone(buzzer, 500); 
  delay(500);        
  noTone(buzzer);     
  delay(500); 
}`
                    },
                    {
                        id: 'rgb',
                        keywords: ['rgb', 'цветной', 'цвета', 'светодиод rgb'],
                        title: 'RGB Светодиод (Смешивание цветов)',
                        desc: 'Плавное изменение цветов радуги.',
                        wiring: '1. R (Красный) -> Пин 9 (PWM)\n2. G (Зеленый) -> Пин 10 (PWM)\n3. B (Синий) -> Пин 11 (PWM)\n4. Общий (GND или VCC) -> соответственно',
                        code: `int redPin = 9;
int greenPin = 10;
int bluePin = 11;

void setup() {
  pinMode(redPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  pinMode(bluePin, OUTPUT);
}

void setColor(int r, int g, int b) {
  analogWrite(redPin, r);
  analogWrite(greenPin, g);
  analogWrite(bluePin, b);
}

void loop() {
  setColor(255, 0, 0); // Красный
  delay(1000);
  setColor(0, 255, 0); // Зеленый
  delay(1000);
  setColor(0, 0, 255); // Синий
  delay(1000);
}`
                    },
                    {
                        id: 'ldr',
                        keywords: ['фоторезистор', 'свет', 'ночник', 'освещение', 'датчик света'],
                        title: 'Автоматический ночник',
                        desc: 'Светодиод включается, когда становится темно.',
                        wiring: '1. Фоторезистор + Резистор 10кОм (делитель напряжения).\n2. Точка соединения -> А0.\n3. Светодиод -> Пин 13.',
                        code: `void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  int light = analogRead(A0);
  if (light < 500) { // Если темно
    digitalWrite(13, HIGH);
  } else {
    digitalWrite(13, LOW);
  }
  delay(100);
}`
                    },
                    {
                        id: 'relay',
                        keywords: ['реле', 'relay', 'розетка', 'нагрузка', '220'],
                        title: 'Управление Реле',
                        desc: 'Включение мощной нагрузки (например, лампы).',
                        wiring: '1. VCC -> 5V\n2. GND -> GND\n3. IN -> Пин 7',
                        code: `int relayPin = 7;

void setup() {
  pinMode(relayPin, OUTPUT);
}

void loop() {
  digitalWrite(relayPin, HIGH); // Включить
  delay(2000);
  digitalWrite(relayPin, LOW);  // Выключить
  delay(2000);
}`
                    }
                 ];

                 // Find best match
                 let project = arduinoProjects.find(p => containsAny(lower, p.keywords));
                 
                 // Default to Blink if just "arduino code" asked
                 if (!project) project = arduinoProjects[0];

                 return `**Проект: ${project.title}**\n\n**Описание:**\n${project.desc}\n\n**Подключение (Wiring):**\n${project.wiring}\n\n**Код:**\n\`\`\`cpp\n${project.code}\n\`\`\``;
             }
             
             if (lower.includes('python') || lower.includes('пайтон')) {
                 return "**Пример кода на Python (Калькулятор):**\n\n```python\ndef add(x, y):\n    return x + y\n\nprint('Сумма 2 + 2 =', add(2, 2))\n```";
             }
             if (lower.includes('html') || lower.includes('сайт')) {
                 return "**Пример HTML страницы:**\n\n```html\n<!DOCTYPE html>\n<html>\n<head><title>Мой сайт</title></head>\n<body>\n  <h1>Привет, мир!</h1>\n  <p>Это моя первая страница.</p>\n</body>\n</html>\n```";
             }
             if (lower.includes('javascript') || lower.includes('js')) {
                 return "**Пример кода на JavaScript:**\n\n```javascript\nconsole.log('Привет из FabLab AI!');\nalert('Нажми меня');\n```";
             }
        }

        // 6. Math
        const math = trySolveMath(lower);
        if (math) return math;

        // 9. Wiki & Web Search + DeepSeek (Parallel for Speed)
        // Запускаем поиск и DeepSeek одновременно, чтобы не ждать таймаутов поиска
        const externalPromise = fetchExternalKnowledge(prompt);
        const deepSeekPromise = fetchDeepSeekAnswer(prompt);

        // Ждем оба результата (или их провала)
        const [externalAnswer, deepSeekAnswer] = await Promise.all([externalPromise, deepSeekPromise]);

        if (externalAnswer) return externalAnswer;
        if (deepSeekAnswer) return deepSeekAnswer;

        // 10. Ultimate Fallback - Knowledge Base (теперь в самом конце)
        for (const [k, v] of Object.entries(knowledgeBase)) {
            // Проверяем только если запрос короткий и содержит ключ, чтобы не перехватывать сложные предложения
            if (lower.length < 30 && lower.includes(k)) {
                return `**${k.charAt(0).toUpperCase() + k.slice(1)}**\n\n${v}`;
            }
        }

        return "Я пока не нашел точного ответа, но я постоянно учусь! Попробуйте переформулировать вопрос.";
    }

    // Listeners attached at the top
    (function() {
        const el = document.getElementById('general-prompt');
        let t;
        el.addEventListener('input', () => {
            clearTimeout(t);
            t = setTimeout(() => {
                const v = el.value;
                const hasLat = /[a-z]/i.test(v);
                // Allow correction even if Cyrillic is present (e.g. "привет rfr")
                if (hasLat) {
                    const fixed = fixKeyboardLayout(v);
                    if (fixed !== v) {
                        const pos = el.selectionStart;
                        el.value = fixed;
                        // Restore cursor position roughly
                        el.setSelectionRange(pos, pos);
                    }
                }
            }, 250);
        });
        el.addEventListener('blur', () => {
            const v = el.value;
            const hasLat = /[a-z]/i.test(v);
            if (hasLat) {
                const fixed = fixKeyboardLayout(v);
                if (fixed !== v) el.value = fixed;
            }
        });
    })();

    // Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
        });
    });

    // Copy
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(resultContent.innerText);
        const original = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => copyBtn.innerHTML = original, 2000);
    });

    // Helpers
    function showLoading() { resultContent.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch fa-spin"></i><p>Думаю...</p></div>'; }
    function displayResult(content, type) {
        // Basic Markdown Support
        let formatted = content
            .replace(/</g, '&lt;').replace(/>/g, '&gt;') // Escape HTML first
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/```(\w+)?\s*([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>') // Code blocks with lang support
            .replace(/`([^`]+)`/g, '<code>$1</code>') // Inline code
            .replace(/\n/g, '<br>');

        // If type is explicitly 'code' (from legacy history), wrap if not wrapped
        if (type === 'code' && !formatted.includes('<pre>')) {
            formatted = `<pre><code>${formatted}</code></pre>`;
        }
        
        resultContent.innerHTML = formatted;
    }
    function showToast(msg, type) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
    function showError(msg) { showToast(msg, 'error'); }
    
    console.log("FabLab AI Script fully loaded");
});
