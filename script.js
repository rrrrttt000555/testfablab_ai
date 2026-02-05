document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const resultContent = document.getElementById('result-content');
    const copyBtn = document.getElementById('copy-btn');
    const generateBtn = document.getElementById('generate-btn');

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
        const prompt = document.getElementById('general-prompt').value.trim();
        if (!prompt) { showError('Введите запрос'); return; }
        showLoading();
        
        try {
            await new Promise(r => setTimeout(r, 1000)); // Thinking delay
            const res = await generateAIResponse(prompt);
            
            // Determine type for history based on content
            const isCodeResponse = res.includes('```') || res.includes('void setup') || res.includes('def ');
            
            saveToHistory(isCodeResponse ? 'code' : 'text', prompt, res);
            displayResult(res, 'text');
        } catch (e) {
            console.error(e);
            displayResult("Ошибка генерации.", 'text');
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

    async function fetchExternalKnowledge(query) {
        // 1. Try Wikipedia first (Best for definitions and "What is" questions)
        try {
            // Extract keywords for better Wiki search
            // Remove common verbs/prepositions and "creative" requests
            const cleanQuery = query.replace(/^(напиши|расскажи|сочини|кто|что|как|где|почему|зачем|статью|про|о|в|сгенерируй|идеи|придумай|дай|мне|для)\s+/gi, '').trim();
            
            if (cleanQuery.length > 2) {
                const searchUrl = `https://ru.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleanQuery)}&limit=1&namespace=0&format=json&origin=*`;
                const searchRes = await fetch(searchUrl);
                const searchData = await searchRes.json();
                
                if (searchData[1] && searchData[1].length > 0) {
                    const title = searchData[1][0];
                    const contentUrl = `https://ru.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(title)}&format=json&origin=*`;
                    const contentRes = await fetch(contentUrl);
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
        } catch (e) { console.warn("Wiki failed", e); }

        // 2. Try DuckDuckGo via Proxy (For everything else)
        try {
            if (query.length < 4) return null; // Skip very short queries
            
            console.log("Attempting Web Search for:", query);
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query))}`;
            const res = await fetch(proxyUrl);
            const data = await res.json();
            
            if (data.contents) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.contents, 'text/html');
                const snippets = doc.querySelectorAll('.result__snippet');
                
                if (snippets && snippets.length > 0) {
                    let combined = "";
                    // Take top 3 results
                    for (let i = 0; i < Math.min(3, snippets.length); i++) {
                        const text = snippets[i].innerText.trim();
                        if (text) combined += `• ${text}\n\n`;
                    }
                    if (combined) {
                        return `**Нашел в интернете:**\n\n${combined}`;
                    }
                }
            }
        } catch (e) { console.warn("Web search failed", e); }

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

    async function generateAIResponse(prompt) {
        const lower = prompt.toLowerCase();
        const containsAny = (text, keys) => keys.some(k => text.includes(k));

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
            { k: ['погода', 'какая погода'], a: "Я живу в цифровом мире, тут всегда ясно! А за окном лучше проверить самому." },
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

        // 7. Definitions
        for (const [k, v] of Object.entries(knowledgeBase)) {
            if (lower.includes(k)) return `**${k.charAt(0).toUpperCase() + k.slice(1)}**\n\n${v}`;
        }

        // 8. Wiki & Web Search (Universal Fallback)
        // Always try to find an answer if nothing else matched
        const externalAnswer = await fetchExternalKnowledge(prompt);
        if (externalAnswer) return externalAnswer;

        // 9. Ultimate Fallback
        return "Я пока не нашел точного ответа, но я постоянно учусь! Попробуйте переформулировать вопрос.";
    }

    document.getElementById('generate-btn').addEventListener('click', handleGenerate);
    document.getElementById('general-prompt').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleGenerate(); });

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
});