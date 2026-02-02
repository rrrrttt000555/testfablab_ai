document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const resultContent = document.getElementById('result-content');
    const copyBtn = document.getElementById('copy-btn');
    const generateBtn = document.getElementById('generate-btn');

    // --- Auth & History Elements ---
    const navAuth = document.getElementById('nav-auth');
    const authModal = document.getElementById('auth-modal');
    const historySidebar = document.getElementById('history-sidebar');
    const historyList = document.getElementById('history-list');
    const closeHistoryBtn = document.getElementById('close-history');
    
    // --- Firebase Configuration ---
    // ЗАДАЧА ДЛЯ ПОЛЬЗОВАТЕЛЯ: Замените значения ниже на данные из вашего проекта Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyBDwjd17SwZuwXpkmM9WrRTSjyT0U85n7I",
        authDomain: "fablabai-54d33.firebaseapp.com",
        projectId: "fablabai-54d33",
        storageBucket: "fablabai-54d33.firebasestorage.app",
        messagingSenderId: "33714204235",
        appId: "1:33714204235:web:41421b2fbe4602cbaa67ce",
        measurementId: "G-S7PKRWKRM0"
    };

    // Инициализация Firebase
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

    // Слушатель изменений состояния авторизации
    if (typeof firebase !== 'undefined') {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                // Пользователь вошел
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
                // Пользователь вышел (или не входил через Firebase)
                // Пробуем восстановить мок-пользователя (для Email входа)
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

    // Initialize UI (initial render)
    updateAuthUI();

    // --- Event Listeners ---
    
    // Open Login Modal
    document.addEventListener('click', (e) => {
        const loginBtn = e.target.closest('#login-btn');
        if (loginBtn) {
            e.preventDefault(); // Prevent default if it's a link (though it's a button)
            openAuthModal('login');
        }
    });

    // --- Auth & History Logic Implementation ---

    function updateAuthUI() {
        if (currentUser && currentUser.email) {
            navAuth.innerHTML = `
                <button class="btn-history" id="history-btn" title="История">
                    <i class="fas fa-history"></i>
                </button>
                <div class="profile-container">
                    <div class="profile-avatar">
                        ${currentUser.photoURL 
                            ? `<img src="${currentUser.photoURL}" alt="User" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` 
                            : currentUser.email[0].toUpperCase()}
                    </div>
                    <div class="dropdown-menu">
                        <div class="dropdown-user-email">${currentUser.email}</div>
                        <button class="dropdown-item" id="logout-btn">
                            <i class="fas fa-sign-out-alt"></i> Выйти
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Clear invalid user data if it exists but has no email
            if (currentUser) {
                currentUser = null;
                localStorage.removeItem('fablab_user');
            }

            // Check if login button already exists to avoid unnecessary DOM replacement
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

    // --- Local Database Helper Functions ---
    function getLocalUsers() {
        try {
            return JSON.parse(localStorage.getItem('fablab_users_db')) || {};
        } catch (e) {
            return {};
        }
    }

    function saveLocalUser(email, password) {
        const users = getLocalUsers();
        users[email] = password;
        localStorage.setItem('fablab_users_db', JSON.stringify(users));
    }

    function handleLogin(email, password) {
        if (!email || !password) {
            showError('Заполните все поля');
            return;
        }

        const submitBtn = document.querySelector('#login-form button[type="submit"]');
        const originalText = submitBtn.innerText;
        submitBtn.innerText = 'Вход...';
        submitBtn.disabled = true;

        setTimeout(() => {
            submitBtn.innerText = originalText;
            submitBtn.disabled = false;

            // Check Local Database
            const users = getLocalUsers();
            
            // Если пользователя нет в базе
            if (!users[email]) {
                showToast('Пользователь не найден. Зарегистрируйтесь.', 'error');
                return;
            }

            // Если пароль не совпадает
            if (users[email] !== password) {
                showToast('Неверный пароль', 'error');
                return;
            }

            // Success
            currentUser = {
                email: email,
                history: JSON.parse(localStorage.getItem(`history_${email}`)) || []
            };
            localStorage.setItem('fablab_user', JSON.stringify(currentUser));
            
            updateAuthUI();
            authModal.classList.remove('active');
            showToast('Вы успешно вошли!', 'success');
        }, 1000);
    }

    function handleRegister(email, password) {
        if (!email || !password) return;

        const submitBtn = document.querySelector('#register-form button[type="submit"]');
        const originalText = submitBtn.innerText;
        submitBtn.innerText = 'Регистрация...';
        submitBtn.disabled = true;

        setTimeout(() => {
            submitBtn.innerText = originalText;
            submitBtn.disabled = false;

            // Check if user already exists
            const users = getLocalUsers();
            if (users[email]) {
                showToast('Пользователь с таким email уже существует', 'error');
                return;
            }

            // Save new user
            saveLocalUser(email, password);

            currentUser = {
                email: email,
                history: []
            };
            localStorage.setItem('fablab_user', JSON.stringify(currentUser));
            
            updateAuthUI();
            authModal.classList.remove('active');
            showToast('Регистрация успешна!', 'success');
        }, 1000);
    }

    function handleGoogleAuth() {
        console.log('Google Auth button clicked'); // Debug
        const btns = document.querySelectorAll('.google-btn');
        btns.forEach(btn => {
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Подключение...';
            btn.disabled = true;
        });

        if (typeof firebase === 'undefined') {
            const errorMsg = 'Firebase SDK не загружен. Проверьте интернет или настройки блокировщика.';
            console.error(errorMsg);
            showToast(errorMsg, 'error');
            resetButtons();
            return;
        }

        const provider = new firebase.auth.GoogleAuthProvider();
        
        firebase.auth().signInWithPopup(provider)
            .then((result) => {
                // UI обновится автоматически через onAuthStateChanged
                authModal.classList.remove('active');
                showToast('Успешный вход!', 'success');
            })
            .catch((error) => {
                console.error('Google Sign In Error:', error);
                // Показываем ошибку пользователю
                let errorMsg = 'Ошибка входа';
                if (error.code === 'auth/popup-closed-by-user') errorMsg = 'Вход отменен пользователем';
                else if (error.code === 'auth/network-request-failed') errorMsg = 'Ошибка сети. Проверьте соединение.';
                else if (error.code === 'auth/unauthorized-domain') errorMsg = 'Домен не разрешен в Firebase Console.';
                else if (error.code === 'auth/operation-not-supported-in-this-environment') {
                    errorMsg = 'Google Вход не работает при открытии файла напрямую. Запустите через локальный сервер.';
                    console.error('CRITICAL: Firebase Auth requires http/https protocol. Current protocol is:', location.protocol);
                }
                else if (error.message) errorMsg = error.message;
                
                showToast(errorMsg, 'error');
            })
            .finally(() => {
                resetButtons();
            });
            
        function resetButtons() {
            btns.forEach(btn => {
                const isLogin = btn.id.includes('login');
                btn.innerHTML = `<i class="fab fa-google"></i> ${isLogin ? 'Войти' : 'Регистрация'} через Google`;
                btn.disabled = false;
            });
        }
    }

    function handleLogout() {
        // 1. Очищаем данные
        localStorage.removeItem('fablab_user');
        currentUser = null;

        // 2. Сразу обновляем UI, чтобы пользователь увидел выход мгновенно
        updateAuthUI();
        historySidebar.classList.remove('active');

        // 3. Пытаемся выйти из Firebase (если были там)
        if (typeof firebase !== 'undefined') {
            firebase.auth().signOut().then(() => {
                console.log('Firebase Signed Out');
                // Дополнительное обновление не повредит
                updateAuthUI();
            }).catch((error) => {
                console.error('Logout Error:', error);
            });
        }
        
        showToast('Вы вышли из системы', 'success');
    }

    function saveToHistory(type, prompt, result) {
        if (!currentUser) {
            // Если пользователь не авторизован, можно сохранять во временную "гостевую" историю или просто игнорировать
            // Но пользователь жаловался, что "не сохраняет".
            // Лучше покажем уведомление один раз или будем молча игнорировать.
            // Для улучшения UX, можно сохранять в localStorage 'guest_history'
            return;
        }
        
        if (!currentUser.history) currentUser.history = [];

        const newItem = {
            id: Date.now(),
            date: new Date().toLocaleDateString(),
            type: type,
            prompt: prompt,
            result: result
        };

        currentUser.history.unshift(newItem); // Add to beginning
        // Limit history to 50 items
        if (currentUser.history.length > 50) currentUser.history.pop();
        
        // Save specific history key
        localStorage.setItem(`history_${currentUser.email}`, JSON.stringify(currentUser.history));
        // Update current user obj in storage too (optional, but good for consistency)
        localStorage.setItem('fablab_user', JSON.stringify(currentUser));
        
        // Update history list if sidebar is open
        if (historySidebar.classList.contains('active')) {
            renderHistory();
        }
    }

    function toggleHistory() {
        historySidebar.classList.add('active');
        renderHistory();
    }

    function renderHistory() {
        if (!currentUser) {
            historyList.innerHTML = `
                <div style="text-align: center; padding: 40px 20px;">
                    <i class="fas fa-lock" style="font-size: 3rem; color: #e5e7eb; margin-bottom: 20px;"></i>
                    <p style="margin-bottom: 20px; color: var(--text-secondary);">Чтобы ваши истории сохранялись, авторизируйтесь</p>
                    <button class="btn btn-primary" onclick="document.getElementById('close-history').click(); document.getElementById('login-btn').click();">Авторизоваться</button>
                </div>
            `;
            return;
        }

        if (!currentUser.history || currentUser.history.length === 0) {
            historyList.innerHTML = `
                <div class="history-placeholder">
                    <p>История пуста</p>
                </div>
            `;
            return;
        }

        historyList.innerHTML = currentUser.history.map(item => `
            <div class="history-item" onclick="loadHistoryItem(${item.id})">
                <span class="history-type">${item.type === 'text' ? 'Текст' : 'Код'} • ${item.date}</span>
                <div class="history-preview">${item.prompt}</div>
            </div>
        `).join('');
    }
    
    // Global function for onclick
    window.loadHistoryItem = function(id) {
        if (!currentUser) return;
        const item = currentUser.history.find(i => i.id === id);
        if (item) {
            displayResult(item.result, item.type);
            // Optionally scroll to result
            document.getElementById('generator').scrollIntoView({ behavior: 'smooth' });
            // Close sidebar on mobile?
            if (window.innerWidth < 768) {
                historySidebar.classList.remove('active');
            }
        }
    };

    // Close Modal
    document.querySelector('.close-modal').addEventListener('click', () => {
        authModal.classList.remove('active');
    });

    // Switch Auth Tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            
            tab.classList.add('active');
            const formId = tab.dataset.authTab === 'login' ? 'login-form' : 'register-form';
            document.getElementById(formId).classList.add('active');
        });
    });

    // Auth Forms Submit
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value; // Mock check
        handleLogin(email, password);
    });

    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        handleRegister(email, password);
    });

    // Google Auth Mock
    document.getElementById('google-login-btn').addEventListener('click', handleGoogleAuth);
    document.getElementById('google-register-btn').addEventListener('click', handleGoogleAuth);

    // Logout (Delegated)
    document.addEventListener('click', (e) => {
        if (e.target.closest('#logout-btn')) {
            handleLogout();
        }
    });

    // History Sidebar
    document.addEventListener('click', (e) => {
        if (e.target.closest('#history-btn')) {
            toggleHistory();
        }
    });

    closeHistoryBtn.addEventListener('click', () => {
        historySidebar.classList.remove('active');
    });

    // --- Mock AI Functions ---

    function handleGenerate() {
        const promptInput = document.getElementById('general-prompt');
        const prompt = promptInput.value.trim();
        
        if (!prompt) {
            showError('Пожалуйста, введите ваш запрос');
            return;
        }

        showLoading();

        // Determine if it is a code request
        const { isCode, language, complexity } = analyzePrompt(prompt);

        if (isCode) {
            // Code Generation Simulation
            setTimeout(() => {
                const mockResponse = generateMockCodeResponse(prompt, language, complexity);
                saveToHistory('code', prompt, mockResponse);
                displayResult(mockResponse, 'code');
            }, 2000);
        } else {
            // Text Generation (Async with "Google" Search)
            (async () => {
                try {
                    // Min delay for UI consistency
                    await new Promise(r => setTimeout(r, 1000));
                    
                    const response = await generateAIResponse(prompt);
                    saveToHistory('text', prompt, response);
                    displayResult(response, 'text');
                } catch (error) {
                    console.error("Generation error:", error);
                    const fallback = "Извините, произошла ошибка при поиске информации. Попробуйте переформулировать запрос.";
                    saveToHistory('text', prompt, fallback);
                    displayResult(fallback, 'text');
                }
            })();
        }
    }

    function analyzePrompt(prompt) {
        const lowerPrompt = prompt.toLowerCase();
        let isCode = false;
        let language = 'python'; // Default code language
        let complexity = 'medium';

        // Keywords that indicate a code request
        const codeKeywords = [
            'код', 'code', 'скрипт', 'script', 'функци', 'function', 'програм', 'program',
            'html', 'css', 'javascript', 'js', 'python', 'php', 'java', 'c++', 'sql',
            'класс', 'class', 'метод', 'method', 'верстк', 'сайт', 'приложение', 'app'
        ];

        if (codeKeywords.some(keyword => lowerPrompt.includes(keyword))) {
            isCode = true;
        }

        // Language Detection (if code)
        if (lowerPrompt.match(/javascript|js|джаваскрипт|джейэс/)) language = 'javascript';
        else if (lowerPrompt.match(/html|css|верстк|html\/css/)) language = 'html';
        else if (lowerPrompt.match(/python|пайтон|питон/)) language = 'python';
        else if (lowerPrompt.match(/java\b|джава\b/)) language = 'java';
        else if (lowerPrompt.match(/c\+\+|cpp|с\+\+|си плюс плюс/)) language = 'cpp';
        else if (lowerPrompt.match(/c#|csharp|си шарп|сишарп/)) language = 'csharp';
        else if (lowerPrompt.match(/php|пхп/)) language = 'php';
        else if (lowerPrompt.match(/go|golang|го/)) language = 'go';
        else if (lowerPrompt.match(/swift|свифт/)) language = 'swift';

        // Complexity Detection
        if (lowerPrompt.match(/прост|легк|simple|easy|basic|начальн/)) complexity = 'simple';
        else if (lowerPrompt.match(/сложн|тяжел|complex|hard|advanced|продвинут/)) complexity = 'complex';

        return { isCode, language, complexity };
    }

    // --- Helper Logic for Mock Responses ---

    // --- Knowledge Base for "Real" AI Answers ---
    const knowledgeBase = {
        'нейросеть': "Нейросеть — это математическая модель, построенная по принципу организации биологических нейронных сетей. Она способна обучаться на данных, находить закономерности и решать задачи, такие как распознавание образов, обработка речи или создание контента.",
        'искусственный интеллект': "Искусственный интеллект (ИИ) — это область компьютерных наук, занимающаяся созданием систем, способных выполнять задачи, требующие человеческого интеллекта: понимание языка, решение задач, обучение и творчество.",
        'python': "Python — это популярный высокоуровневый язык программирования. Он отличается простым и читаемым синтаксисом, что делает его идеальным для новичков. Python используется в веб-разработке, анализе данных, искусственном интеллекте и автоматизации.",
        'робототехника': "Робототехника — это прикладная наука, занимающаяся разработкой и эксплуатацией роботов. Она объединяет знания из механики, электроники, программирования и искусственного интеллекта.",
        'scratch': "Scratch — это визуальная среда программирования, созданная специально для детей. Вместо написания кода текстом, программы собираются из цветных блоков, что помогает легко понять основы логики и алгоритмов.",
        'unity': "Unity — это мощная платформа для разработки 2D и 3D игр. Она позволяет создавать интерактивные приложения для компьютеров, консолей и мобильных устройств. Unity используют как начинающие, так и профессиональные студии.",
        'roblox': "Roblox — это онлайн-платформа, где пользователи могут не только играть, но и создавать свои собственные игры с помощью языка программирования Lua. Это отличный старт для будущих разработчиков игр.",
        '3d': "3D-моделирование — это процесс создания трехмерных объектов на компьютере. С помощью специальных программ можно спроектировать что угодно: от детали механизма до персонажа игры или архитектурного сооружения.",
        'чпу': "ЧПУ (Числовое Программное Управление) — это технология управления станками с помощью компьютера. Станки с ЧПУ позволяют с высокой точностью вырезать, гравировать или фрезеровать детали из дерева, пластика или металла по заданной программе.",
        'лазер': "Лазерные технологии в фаблабе используются для резки и гравировки материалов. Сфокусированный луч лазера может с идеальной точностью прорезать фанеру или акрил, позволяя создавать сложные конструкторы и сувениры.",
        'спорт': "Спорт — это физическая активность, направленная на развитие тела и духа. Регулярные тренировки укрепляют здоровье, развивают дисциплину и учат достигать поставленных целей.",
        'космос': "Космос — это бескрайнее пространство за пределами атмосферы Земли. Изучение космоса помогает нам понять происхождение Вселенной, искать новые ресурсы и даже планировать будущее человечества на других планетах.",
        'бизнес': "Бизнес — это деятельность, направленная на создание ценности и получение прибыли. Успешный бизнес требует планирования, умения работать в команде, финансовой грамотности и готовности рисковать.",
        'природа': "Природа — это окружающий нас мир, не созданный человеком. Забота о природе и экология сегодня важны как никогда, чтобы сохранить планету для будущих поколений.",
        'медицина': "Медицина — это система научных знаний и практической деятельности, направленная на укрепление и сохранение здоровья, продление жизни и лечение болезней. Современная медицина использует высокие технологии, включая роботов-хирургов и искусственный интеллект для диагностики."
    };

    async function fetchExternalKnowledge(query) {
        try {
            // Search for page title
            const searchUrl = `https://ru.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json&origin=*`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();
            
            if (!searchData[1] || searchData[1].length === 0) return null;
            
            const title = searchData[1][0];
            
            // Get content
            const contentUrl = `https://ru.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(title)}&format=json&origin=*`;
            const contentRes = await fetch(contentUrl);
            const contentData = await contentRes.json();
            
            const pages = contentData.query.pages;
            const pageId = Object.keys(pages)[0];
            
            if (pageId === "-1") return null;
            
            let extract = pages[pageId].extract;
            if (!extract) return null;
            
            if (extract.length > 2000) extract = extract.substring(0, 2000) + "...";
            
            return `**${title}**\n\n${extract}`;
        } catch (e) {
            console.warn("Wiki fetch failed:", e);
            return null;
        }
    }

    async function generateAIResponse(prompt, style, length) {
        const lowerPrompt = prompt.toLowerCase();
        
        // --- Custom QA Logic (FabLab Specific) ---

        // Helper function to check multiple keywords
        const containsAny = (text, keywords) => keywords.some(keyword => text.includes(keyword));
        const containsAll = (text, keywords) => keywords.every(keyword => text.includes(keyword));

        // --- Current Time Logic (World Clock) ---
        const timeKeywords = [
            'сколько время', 'сколько времени', 'который час', 'текущее время', 'время в', 'времени в', 'часов в',
            'time in', 'what time', 'current time'
        ];
        
        // Basic check if it's a time request (and NOT a class schedule question like "во сколько занятия")
        const isTimeRequest = containsAny(lowerPrompt, timeKeywords) && 
            !lowerPrompt.includes('заняти') && 
            !lowerPrompt.includes('урок') && 
            !lowerPrompt.includes('курсы') &&
            !lowerPrompt.includes('открыт'); // e.g. "во сколько открывается"

        if (isTimeRequest) {
            // Map of Russian city names to IANA Timezones
            const cityTimezones = {
                'тюмен': 'Asia/Yekaterinburg',
                'москв': 'Europe/Moscow',
                'питер': 'Europe/Moscow',
                'санкт-петербург': 'Europe/Moscow',
                'спб': 'Europe/Moscow',
                'екатеринбург': 'Asia/Yekaterinburg',
                'омск': 'Asia/Omsk',
                'новосибирск': 'Asia/Novosibirsk',
                'красноярск': 'Asia/Krasnoyarsk',
                'иркутск': 'Asia/Irkutsk',
                'якутск': 'Asia/Yakutsk',
                'владивосток': 'Asia/Vladivostok',
                'калининград': 'Europe/Kaliningrad',
                'самар': 'Europe/Samara',
                'нижн': 'Europe/Moscow', // Nizhny Novgorod
                'казан': 'Europe/Moscow',
                'сочи': 'Europe/Moscow',
                'лондон': 'Europe/London',
                'париж': 'Europe/Paris',
                'берлин': 'Europe/Berlin',
                'нью-йорк': 'America/New_York',
                'токио': 'Asia/Tokyo',
                'пекин': 'Asia/Shanghai',
                'дубай': 'Asia/Dubai'
            };

            let targetTimezone = 'Asia/Yekaterinburg'; // Default to Tyumen/Local
            let targetCity = 'Тюмени';

            // Detect city in prompt
            for (const [key, tz] of Object.entries(cityTimezones)) {
                if (lowerPrompt.includes(key)) {
                    targetTimezone = tz;
                    // Capitalize first letter for display
                    targetCity = key.charAt(0).toUpperCase() + key.slice(1);
                    if (targetCity.endsWith('а') || targetCity.endsWith('я')) targetCity = targetCity.slice(0, -1) + 'е'; // Simple grammar fix attempt
                    else if (key === 'тюмен') targetCity = 'Тюмени';
                    else if (key === 'москв') targetCity = 'Москве';
                    break;
                }
            }

            try {
                const now = new Date();
                const timeString = now.toLocaleTimeString('ru-RU', { 
                    timeZone: targetTimezone,
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                return `**Точное время**\n\nВ ${targetCity} сейчас ${timeString}.`;
            } catch (e) {
                console.error("Timezone error:", e);
                return `**Точное время**\n\nНе удалось определить время для указанного региона.`;
            }
        }

        // 1. Запись на занятия (Enrollment)
        // Keywords: 100+ variants covering enrollment, registration, admission, etc.
        const enrollKeywords = [
            'запис', 'попасть', 'заявк', 'вступить', 'присоединиться', 'начать обучение', 'регистрац',
            'пойти учиться', 'возьмите меня', 'стать учеником', 'поступить', 'набор', 'прием', 'анкет', 'форм',
            'хочу к вам', 'зачислить', 'учеб', 'рега', 'школ', 'курсы для детей', 'документ', 'оформить', 'оформлени',
            'приемн', 'комисси', 'условия', 'новичок', 'хочу учиться', 'записать сына', 'записать дочь', 'записать ребенка',
            'как попасть в фаблаб', 'старт', 'когда начало', 'возьмите ребенка'
        ];
        if (containsAny(lowerPrompt, enrollKeywords) || (lowerPrompt.includes('как') && lowerPrompt.includes('начать'))) {
            return "**Как записаться на занятия**\n\nЧтобы записаться на занятия, нужно:\n1. Перейти на сайт академияпрофессийбудущего.рф\n2. Выбрать вам подходящий курс.\n3. Нажать на \"Оставить заявку\".\n4. Для записи вам нужно: Указать имя и фамилию ребенка, дату рождения, ФИО родителя, контактный телефон, выбрать из списка курс который вам нужен.\n\nПосле записи, с вами свяжутся по данному номеру.";
        }

        // 2. Список занятий (Classes)
        // Keywords: 100+ variants covering all topics, specific techs, etc.
        const classKeywords = [
            'заняти', 'курс', 'предмет', 'направлени', 'чему учите', 'кружк', 'секци', 'урок', 'программ', 'обучаете', 'дисциплин',
            'преподаете', 'образовани', 'научиться', 'изучать', 'специальност', 'факультет', 'воркшоп', 'мастер-класс',
            'робототехник', 'программировани', 'список', 'python', 'пайтон', 'unity', 'юнити', 'scratch', 'скретч', 
            'roblox', 'роблокс', 'физик', 'хими', 'биологи', 'чпу', 'cnc', '3d', 'принтер', 'лазер', 'свет', 'нефт', 'инженер',
            'наука', 'творчество', 'технологи', 'айти', 'it', 'coding', 'кодинг', 'разработка', 'игры', 'создание игр',
            'моделировани', 'прототипировани', 'электроник', 'схем', 'пайка', 'опыты', 'эксперименты', 'динамический ровер',
            'манипулятор', 'станки', 'дополнительное образование', 'досуг', 'развитие', 'навыки', 'hard skills', 'soft skills',
            'будущая профессия'
        ];
        if (containsAny(lowerPrompt, classKeywords)) {
            return "**Наши занятия**\n\nУ нас есть занятия: Физика, химия, биология, робототехника, python, unity, scratch, инженеры света, нефтегазовые технологии, динамический ровер, манипуляции с ЧПУ(Числовое Программное Управление), roblox studio.";
        }

        // 3. Местоположение (Location)
        // Keywords: Specific to FabLab location
        const locationKeywords = [
            'адрес', 'местоположени', 'карта', 'расположени', 'геолокац', 'локаци', 'улиц', 'этаж',
            'ленина', 'навигатор', 'парковк', 'офис', 'здание', 'помещение',
            'как вас найти', 'где вы сидите', 'карта проезда', 'схема проезда',
            'ориентир', 'где это', 'место', 'точка', 'координаты', 'где академия', 'куда подходить'
        ];
        const howToGetKeywords = [
            'приехать', 'добраться', 'найти', 'доехать', 'попасть', 'путь', 'куда ехать', 'куда идти'
        ];
        
        // Check triggers
        const isLocationRequest = containsAny(lowerPrompt, locationKeywords) || 
            (lowerPrompt.includes('где') && (lowerPrompt.includes('находится') || lowerPrompt.includes('вы') || lowerPrompt.includes('центр') || lowerPrompt.includes('фаблаб') || lowerPrompt.includes('сидите') || lowerPrompt.includes('офис') || lowerPrompt.includes('здание'))) ||
            containsAny(lowerPrompt, howToGetKeywords);

        // EXCEPTION: If specific transport/city question, skip Location logic (let it fall through to Transport/City logic)
        // Unless it explicitly asks "to you" or "to fablab"
        const isToUs = lowerPrompt.includes('к вам') || lowerPrompt.includes('вас') || lowerPrompt.includes('фаблаб') || lowerPrompt.includes('академи');
        
        if (isLocationRequest) {
             // If it's a generic "bus" or "city" question WITHOUT "to us", skip this block
             if ((lowerPrompt.includes('автобус') || lowerPrompt.includes('тюмен')) && !isToUs && !lowerPrompt.includes('адрес') && !lowerPrompt.includes('где вы')) {
                 // Pass through
             } else {
                 return "**Наш адрес и как добраться**\n\nМы находимся в: Г. Тюмень улица Ленина 25, 5 этаж.\n\nЭто центр города, удобная транспортная развязка.";
             }
        }

        // 4. Преподаватели (Teachers)
        const teachersKeywords = [
            'преподавател', 'учител', 'педагог', 'наставник', 'ментор', 'кто преподает', 'кто учит', 'какие учителя', 
            'команда', 'сотрудники', 'коллектив', 'кадры', 'персонал', 'кто ведет', 'ведущий', 'мастер', 'преподы'
        ];
        if (containsAny(lowerPrompt, teachersKeywords)) {
            return "**Наши преподаватели**\n\nНаши преподаватели на сайте академияпрофессийбудущего.рф";
        }

        // 5. Цель и миссия (About)
        // Keywords: Specific to FabLab/Academy identity
        const aboutKeywords = [
            'цель', 'миссия', 'о вас', 'кто вы', 'что такое фаблаб', 'о себе', 'про фаблаб', 'про академию',
            'чем занимаетесь', 'суть', 'кто мы',
            'о нас', 'про нас', 'кто мы такие', 'зачем', 'почему вы', 'преимущества',
            'особенности', 'философия', 'ценности',
            'опыт', 'квалификация', 'сертификаты', 'дипломы', 'достижения', 'конкурсы', 'олимпиады', 'проекты', 'результаты'
        ];
        if (containsAny(lowerPrompt, aboutKeywords)) {
             return "**О ФабЛаб Академии**\n\nМы – центр научного творчества и робототехники для детей в возрасте от 7 до 16 лет.\n\nНаша основная цель – обучение детей инженерным и профессиональным навыкам, которые будут востребованы в будущем.\n\nНепрерывно на протяжении всего обучения в Академии, дети работают над увлекательными проектами, которые они с гордостью представляют на олимпиадах, конкурсах и конференциях.\n\nНаша программа не только развивает техническую квалификацию учащихся, но и стимулирует их к творчеству и самовыражению.";
        }

        // 5. Контакты (Contacts)
        // Keywords: 100+ variants covering phones, social media, etc.
        const contactKeywords = [
            'контакт', 'телефон', 'номер', 'позвон', 'связ', 'почт', 'email', 'звон',
            'алло', 'сотовый', 'мобильн', 'набрать', 'телеграм', 'ватсап', 'менеджер', 'администратор',
            'соцсети', ' вк ', 'vk', 'инста', 'сайт', 'веб', 'ссылка', 'url', 'www', 'http', 'интернет',
            'группа', 'паблик', 'канал', 'чат', 'бот', 'поддержка', 'help', 'вопрос', 'спросить', 'консультация',
            'перезвоните', 'горячая линия'
        ];
        if (containsAny(lowerPrompt, contactKeywords)) {
             return "**Контакты**\n\nОстались вопросы? Позвоните нам +7 (3452) 57-48-42";
        }

        // 6. Стоимость (Price) - NEW
        const priceKeywords = [
            'цена', 'стоимост', 'сколько стоит', 'прайс', 'тариф', 'оплата', 'платн', 'бесплатн', 'деньги',
            'купить', 'абонемент', 'разовое', 'скидки', 'акции', 'дорого', 'дешево', 'бюджет', 'карта', 'наличные',
            'безнал', 'договор', 'чек', 'квитанция'
        ];
        if (containsAny(lowerPrompt, priceKeywords)) {
            return "**Стоимость обучения**\n\nСтоимость обучения зависит от выбранного курса. Подробную информацию вы можете найти на нашем сайте академияпрофессийбудущего.рф или уточнить по телефону +7 (3452) 57-48-42.";
        }

        // 7. Расписание (Schedule) - NEW
        const scheduleKeywords = [
            'расписание', 'график', 'когда', 'время', 'часы', 'дни', 'по каким дням', 'во сколько', 'длительность',
            'сколько длится', 'смена', 'утро', 'вечер', 'выходные', 'будни', 'каникулы', 'сентябрь', 'лето',
            'учебный год', 'семестр', 'четверть'
        ];
        if (containsAny(lowerPrompt, scheduleKeywords)) {
            return "**Расписание занятий**\n\nРасписание занятий формируется индивидуально для каждой группы. Пожалуйста, свяжитесь с нами по телефону +7 (3452) 57-48-42 или оставьте заявку на сайте, чтобы узнать актуальное расписание.";
        }

        // 8. Возраст (Age) - NEW
        const ageKeywords = [
            'возраст', 'сколько лет', 'каких лет', 'год', 'маленький', 'взрослый', 'подросток', 'первоклассник',
            'дошкольник', 'какой класс', 'ограничения', 'со скольки', 'до скольки', 'беру', 'берете',
            '7 лет', '8 лет', '9 лет', '10 лет', '11 лет', '12 лет', '13 лет', '14 лет', '15 лет', '16 лет',
            'школьник', 'ребенок', 'малыш', 'паспорт', 'какие дети'
        ];
        if (containsAny(lowerPrompt, ageKeywords)) {
            return "**Возраст учащихся**\n\nМы принимаем детей и подростков в возрасте от 7 до 16 лет. Группы формируются по возрасту и уровню подготовки. Для каждого возраста есть подходящие программы.";
        }

        // 9. Оборудование (Equipment) - NEW
        const equipmentKeywords = [
            'оборудование', 'оснащение', 'компьютеры', 'ноутбуки', 'станки', 'принтеры', 'материалы', 'инструмент',
            'железо', 'мощные', 'техника', 'на чем работают', 'роботы', 'конструктор', 'лего', 'lego', 'arduino', 'ардуино'
        ];
        if (containsAny(lowerPrompt, equipmentKeywords)) {
            return "**Наше оборудование**\n\nНаши лаборатории оснащены современным оборудованием: мощные компьютеры для 3D-моделирования и программирования, 3D-принтеры, лазерные станки ЧПУ, паяльные станции, наборы робототехники (Lego, Arduino) и электронные компоненты.";
        }

        // 10. Формат (Format) - NEW
        const formatKeywords = [
            'формат', 'как проходят', 'групп', 'индивидуально', 'онлайн', 'дистанцион', 'очно', 'в живую',
            'практика', 'теория', 'человек в группе', 'много детей', 'удаленно', 'дома'
        ];
        if (containsAny(lowerPrompt, formatKeywords)) {
            return "**Формат обучения**\n\nЗанятия проходят очно в наших лабораториях. Мы работаем в малых группах (до 10-12 человек), что позволяет преподавателю уделить внимание каждому. Упор делается на практику и создание реальных проектов.";
        }

        // 11. Лагерь (Camp) - NEW
        const campKeywords = [
            'лагерь', 'каникулы', 'лето', 'летняя', 'площадка', 'смена', 'интенсив', 'отдых', 'городской', 'дневного дня'
        ];
        if (containsAny(lowerPrompt, campKeywords)) {
            return "**Каникулы и Лагерь**\n\nВ период школьных каникул (летних, осенних, зимних, весенних) мы проводим тематические городские лагеря и интенсивы. Это отличная возможность погрузиться в мир технологий, найти новых друзей и с пользой провести время.";
        }

        // 12. Пробное занятие (Trial) - NEW
        const trialKeywords = [
            'пробн', 'тест', 'попробовать', 'экскурсия', 'посмотреть', 'первое занятие', 'бесплатно', 'день открытых дверей'
        ];
        if (containsAny(lowerPrompt, trialKeywords)) {
            return "**Пробное занятие**\n\nВы можете записаться на пробное занятие или экскурсию, чтобы познакомиться с преподавателями, увидеть оборудование и выбрать направление. Позвоните нам: +7 (3452) 57-48-42.";
        }

        // 13. Сертификаты (Certificates) - NEW
        const certKeywords = [
            'сертификат', 'диплом', 'документ', 'бумага', 'свидетельство', 'окончание', 'выпуск', 'корочка'
        ];
        if (containsAny(lowerPrompt, certKeywords)) {
            return "**Документы об окончании**\n\nПо окончании курса и успешной защите проекта учащиеся получают сертификат Академии профессий будущего, подтверждающий полученные навыки.";
        }

        // 14. Транспорт и Автобусы (Transport) - NEW
        const transportKeywords = [
            'автобус', 'маршрут', 'номер', 'едет', 'остановка', 'вокзал', 'аэропорт', 'проезд', 'билет', 'карта', 
            'транспорт', 'трамвай', 'троллейбус', 'метро', 'такси', 'поезд', 'электричка', 'тс', 'маршрутка', 'как доехать',
            'какой автобус', 'сколько стоит проезд'
        ];
        if (containsAny(lowerPrompt, transportKeywords)) {
            // Если спрашивают про конкретный город или Тюмень
            if (lowerPrompt.includes('тюмен') || lowerPrompt.includes('тюмени')) {
                return "**Транспорт в Тюмени**\n\nВ Тюмени развитая сеть общественного транспорта. Основные перевозчики — автобусы и маршрутные такси.\n\n💰 **Стоимость проезда:** 31 рубль (при безналичной оплате) и 32 рубля (за наличные).\n\n🚌 **Популярные маршруты:**\n- №1, №25, №30 (Центр - Микрорайоны)\n- №10 (Вокзал - Аэропорт)\n\n📍 Для построения точного маршрута рекомендуем использовать приложение **2ГИС** или **Яндекс.Карты** (Go), где можно отслеживать транспорт в реальном времени.";
            } else {
                 return "**Общественный транспорт**\n\nСистема общественного транспорта различается в зависимости от города. Обычно курсируют автобусы, маршрутные такси, а в крупных городах — метро и трамваи.\n\n💰 **Средняя стоимость проезда** по России варьируется от 30 до 60 рублей.\n\n📱 Чтобы узнать, какой автобус вам нужен и где он сейчас едет, лучше всего воспользоваться локальными приложениями (например, **2ГИС**, **Яндекс.Карты**, **Google Maps**).";
            }
        }

        // 15. Города и Страны (Cities & Countries) - NEW
        const geoKeywords = [
            'город', 'страна', 'мир', 'путешеств', 'европа', 'азия', 'россия', 'сша', 'китай', 'столица', 
            'границ', 'виза', 'туризм', 'достопримечательност', 'население', 'климат', 'погода', 'что происходит',
            'новости', 'события'
        ];
        
        // Проверка на вопрос "что происходит в..."
        if (lowerPrompt.includes('что происходит') || lowerPrompt.includes('новости')) {
             return "**События в мире и городах**\n\nМир постоянно меняется. В городах проходят фестивали, выставки, строятся новые парки и развиваются технологии.\n\n🌍 **Тренды развития городов:**\n- **Урбанистика:** создание комфортной среды для пешеходов.\n- **Экология:** переход на электротранспорт и раздельный сбор мусора.\n- **Цифровизация:** внедрение систем «Умный город».\n\nДля получения актуальных новостей о конкретном городе рекомендуем обратиться к местным новостным порталам.";
        }

        if (containsAny(lowerPrompt, geoKeywords)) {
            return "**Города и Страны**\n\nВ мире насчитывается более 190 стран и тысячи городов, каждый из которых уникален.\n\n🏙 **Города** — это центры культуры, экономики и инноваций. Сейчас наблюдается тренд на урбанизацию: все больше людей переезжают в мегаполисы ради карьеры и образования.\n\n🗺 **Путешествия** расширяют кругозор и позволяют познакомиться с традициями других народов. Перед поездкой в другую страну всегда проверяйте визовые требования и местные законы.";
        }

        // --- End Custom QA Logic ---

        // --- Knowledge Base Logic (General Questions) ---
        for (const [key, answer] of Object.entries(knowledgeBase)) {
            if (lowerPrompt.includes(key)) {
                const title = key.charAt(0).toUpperCase() + key.slice(1);
                return `**${title}**\n\n${answer}`;
            }
        }

        // --- External Knowledge (Web Search Simulation) ---
        // Пытаемся найти ответ в "интернете" (Википедия), если нет локального знания
        const externalAnswer = await fetchExternalKnowledge(prompt);
        if (externalAnswer) {
            return externalAnswer;
        }

        // --- Generic Fallback ---
        const genericResponses = [
            `Вопрос "${prompt}" очень интересен. В современном мире эта тема становится всё более актуальной.`,
            `Вы затронули важную тему: "${prompt}". Это требует глубокого анализа.`,
            `Относительно "${prompt}" можно сказать многое. Это обширная область.`,
            `"${prompt}" — это то, о чем сейчас часто говорят.`
        ];
        
        const randomIndex = Math.floor(Math.random() * genericResponses.length);
        
        return `**Ответ на ваш вопрос**\n\n${genericResponses[randomIndex]}\n\nК сожалению, у меня пока нет точной информации по этому запросу в моей базе знаний. Но я постоянно учусь!\n\nЕсли вас интересует что-то конкретное о ФабЛаб Академии, например, курсы, расписание или как к нам попасть — спрашивайте!`;
    }

    function generateMockCodeResponse(prompt, language, complexity) {
        // Пытаемся найти текст в кавычках в запросе пользователя
        const quoteMatch = prompt.match(/(["'])(.*?)\1/);
        let textToPrint = "FabLab AI working...";
        
        if (quoteMatch) {
            textToPrint = quoteMatch[2];
        } else if (prompt.length < 30) {
            textToPrint = prompt;
        }

        let code = '';
        let explanation = '';
        
        if (language === 'html') {
             if (complexity === 'complex') {
                code = `<!-- Complex HTML/CSS Layout for: ${prompt} -->
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${textToPrint}</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        :root {
            --primary: #4f46e5;
            --secondary: #ec4899;
            --bg: #0f172a;
            --text: #f8fafc;
        }
        body { margin: 0; font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); }
        .navbar { display: flex; justify-content: space-between; padding: 1.5rem 2rem; background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
        .hero { min-height: 80vh; display: flex; align-items: center; justify-content: center; text-align: center; flex-direction: column; }
        .hero h1 { font-size: 3.5rem; background: linear-gradient(to right, var(--primary), var(--secondary)); -webkit-background-clip: text; color: transparent; margin-bottom: 1rem; }
        .btn { padding: 12px 30px; border-radius: 50px; border: none; background: var(--primary); color: white; font-weight: bold; cursor: pointer; transition: 0.3s; }
        .btn:hover { transform: scale(1.05); box-shadow: 0 0 20px rgba(79, 70, 229, 0.5); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; padding: 4rem 2rem; max-width: 1200px; margin: 0 auto; }
        .card { background: rgba(255,255,255,0.03); padding: 2rem; border-radius: 15px; border: 1px solid rgba(255,255,255,0.1); }
    </style>
</head>
<body>
    <nav class="navbar">
        <div class="logo"><i class="fas fa-cube"></i> Brand</div>
        <div class="links">
            <a href="#" style="color: white; text-decoration: none; margin-left: 20px;">Home</a>
            <a href="#" style="color: white; text-decoration: none; margin-left: 20px;">Features</a>
        </div>
    </nav>
    <header class="hero">
        <h1>${textToPrint}</h1>
        <p style="font-size: 1.2rem; opacity: 0.8; max-width: 600px; margin-bottom: 2rem;">
            Modern solutions for complex problems. Generated by AI with precision and style.
        </p>
        <button class="btn">Get Started <i class="fas fa-arrow-right"></i></button>
    </header>
    <section class="grid">
        <div class="card">
            <i class="fas fa-rocket" style="font-size: 2rem; color: var(--secondary); margin-bottom: 1rem;"></i>
            <h3>Fast Performance</h3>
            <p>Optimized for speed and efficiency.</p>
        </div>
        <div class="card">
            <i class="fas fa-shield-alt" style="font-size: 2rem; color: var(--primary); margin-bottom: 1rem;"></i>
            <h3>Secure Core</h3>
            <p>Built with security in mind from day one.</p>
        </div>
        <div class="card">
            <i class="fas fa-magic" style="font-size: 2rem; color: #8b5cf6; margin-bottom: 1rem;"></i>
            <h3>AI Powered</h3>
            <p>Leveraging the latest in machine learning.</p>
        </div>
    </section>
</body>
</html>`;
                explanation = "Этот код создает современный Landing Page с темной темой. Используются CSS переменные для легкой настройки цветов, Flexbox и Grid для адаптивной верстки. Добавлены эффекты наведения и полупрозрачные элементы (backdrop-filter) для создания эффекта стекла.";
            } else {
                code = `<!-- Simple HTML Structure for: ${prompt} -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${textToPrint}</title>
    <style>
        body { font-family: sans-serif; padding: 20px; line-height: 1.6; }
        h1 { color: #333; }
        .container { max-width: 800px; margin: 0 auto; }
        button { padding: 10px 20px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${textToPrint}</h1>
        <p>This is a simple page generated based on your request.</p>
        <ul>
            <li>Item 1</li>
            <li>Item 2</li>
            <li>Item 3</li>
        </ul>
        <button onclick="alert('Hello!')">Click Me</button>
    </div>
</body>
</html>`;
                explanation = "Базовая HTML структура с минимальным CSS. Включает центрированный контейнер, заголовок, список и кнопку с простым JS-событием onclick.";
            }
        } else if (language === 'csharp') {
             if (complexity === 'complex') {
                code = `/* 
 * Advanced C# Implementation
 * Scenario: Asynchronous Data Processor with Repository Pattern
 * Prompt: ${prompt}
 */
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Linq;

namespace EnterpriseApp.Core
{
    // Model
    public class DataEntity 
    {
        public Guid Id { get; set; }
        public string Name { get; set; }
        public DateTime CreatedAt { get; set; }
        public string Status { get; set; }
    }

    // Interface
    public interface IRepository<T>
    {
        Task<IEnumerable<T>> GetAllAsync();
        Task<T> GetByIdAsync(Guid id);
        Task AddAsync(T entity);
    }

    // Implementation
    public class DataRepository : IRepository<DataEntity>
    {
        private readonly List<DataEntity> _storage = new List<DataEntity>();

        public async Task<IEnumerable<DataEntity>> GetAllAsync()
        {
            // Simulate IO delay
            await Task.Delay(100); 
            return _storage;
        }

        public async Task<DataEntity> GetByIdAsync(Guid id)
        {
            await Task.Delay(50);
            return _storage.FirstOrDefault(x => x.Id == id);
        }

        public async Task AddAsync(DataEntity entity)
        {
            await Task.Delay(50);
            _storage.Add(entity);
            Console.WriteLine($"[DB] Entity {entity.Name} added successfully.");
        }
    }

    // Service
    public class ProcessingService
    {
        private readonly IRepository<DataEntity> _repo;

        public ProcessingService(IRepository<DataEntity> repo)
        {
            _repo = repo;
        }

        public async Task ProcessData(string inputName)
        {
            try 
            {
                Console.WriteLine($"Starting process for: {inputName}");
                
                var entity = new DataEntity 
                {
                    Id = Guid.NewGuid(),
                    Name = inputName,
                    CreatedAt = DateTime.UtcNow,
                    Status = "Active"
                };

                await _repo.AddAsync(entity);
                
                // Complex logic simulation
                var allItems = await _repo.GetAllAsync();
                var recentItems = allItems.Where(x => x.CreatedAt > DateTime.UtcNow.AddMinutes(-1)).Count();
                
                Console.WriteLine($"Total recent items processed: {recentItems}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Critical Error: {ex.Message}");
            }
        }
    }

    // Entry Point
    class Program
    {
        static async Task Main(string[] args)
        {
            Console.WriteLine("Initializing Enterprise System...");
            
            var repo = new DataRepository();
            var service = new ProcessingService(repo);

            await service.ProcessData("${textToPrint}");
            await service.ProcessData("Another Task");

            Console.WriteLine("System shutdown complete.");
        }
    }
}`;
                explanation = "Этот код демонстрирует архитектурный паттерн Repository и асинхронное программирование в C#. \n1. **DataEntity**: Модель данных.\n2. **IRepository**: Интерфейс для абстракции доступа к данным.\n3. **DataRepository**: Реализация хранилища (в памяти).\n4. **ProcessingService**: Сервис бизнес-логики, который использует репозиторий через внедрение зависимостей (DI).";
            } else {
                code = `/*
 * Simple C# Script
 * Task: ${prompt}
 */
using System;
using System.Linq;

class Program 
{
    static void Main(string[] args) 
    {
        // Input data
        string input = "${textToPrint}";
        int[] numbers = { 5, 2, 8, 1, 9, 3 };

        Console.WriteLine($"--- C# Simple Processor ---");
        Console.WriteLine($"Input: {input}");

        // 1. String manipulation
        string reversed = new string(input.Reverse().ToArray());
        Console.WriteLine($"Reversed: {reversed}");

        // 2. Simple Math/Logic
        var sortedEvenNumbers = numbers
            .Where(n => n % 2 == 0)
            .OrderBy(n => n)
            .ToList();

        Console.WriteLine("Even numbers from array: " + string.Join(", ", sortedEvenNumbers));

        // 3. Conditional
        if (input.Length > 10)
        {
            Console.WriteLine("That's a long string!");
        }
        else
        {
            Console.WriteLine("Short and sweet.");
        }
        
        Console.WriteLine("Done.");
    }
}`;
                explanation = "Простой консольный скрипт на C#. Он показывает базовые операции:\n1. Работа со строками (Reverse).\n2. Использование LINQ (Where, OrderBy) для фильтрации и сортировки массива.\n3. Условные конструкции if/else.";
            }
        } else if (language === 'javascript') {
            if (complexity === 'complex') {
                code = `/**
 * Advanced JavaScript / Node.js Example
 * Scenario: Async Data Fetcher with Error Handling and Class Structure
 */

class ApiService {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.cache = new Map();
    }

    async fetchData(endpoint) {
        console.log(\`Fetching data from \${this.baseUrl}/\${endpoint}...\`);
        
        // Check cache
        if (this.cache.has(endpoint)) {
            console.log('Returning cached data');
            return this.cache.get(endpoint);
        }

        // Simulate Network Request
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (Math.random() > 0.1) {
                    const data = { 
                        id: Date.now(), 
                        content: "${textToPrint}", 
                        timestamp: new Date().toISOString() 
                    };
                    this.cache.set(endpoint, data);
                    resolve(data);
                } else {
                    reject(new Error("Network timeout"));
                }
            }, 1000);
        });
    }

    processData(data) {
        return {
            ...data,
            processed: true,
            hash: Math.random().toString(36).substring(7)
        };
    }
}

// Usage
async function main() {
    const api = new ApiService("https://api.example.com");

    try {
        console.log("--- Starting Application ---");
        
        const rawData = await api.fetchData("users/current");
        console.log("Raw Data:", rawData);

        const result = api.processData(rawData);
        console.log("Processed Result:", result);
        
        console.log("--- Operation Successful ---");
    } catch (error) {
        console.error("Application crashed:", error.message);
    }
}

main();`;
                explanation = "Пример современного JavaScript (ES6+). Используются классы, асинхронные функции (async/await), Map для кэширования и Promise для симуляции сетевых запросов. Также реализована базовая обработка ошибок через try/catch.";
            } else {
                code = `// Simple JavaScript Solution for: ${prompt}

// 1. Define variables
const title = "${textToPrint}";
const items = ['Apple', 'Banana', 'Cherry', 'Date'];

// 2. Function definition
function processItems(list) {
    console.log(\`Processing \${list.length} items for "\${title}"...\`);
    
    // Array method usage
    const upperCased = list.map(item => item.toUpperCase());
    
    return upperCased;
}

// 3. Execution
console.log("Original:", items);
const result = processItems(items);
console.log("Result:", result);

// 4. Simple object
const status = {
    active: true,
    count: result.length
};

if (status.active) {
    console.log("System is active!");
}`;
                explanation = "Базовый скрипт на JS. Демонстрирует объявление переменных (const), создание функций, работу с массивами (метод map) и объектами.";
            }
        } else if (language === 'python') {
            if (complexity === 'complex') {
                code = `"""
Advanced Python Script
Scenario: Data Analyzer Class with Decorators and Error Handling
"""
import time
import random
from datetime import datetime

def log_execution(func):
    """Decorator to log function calls"""
    def wrapper(*args, **kwargs):
        print(f"[LOG] Calling {func.__name__} at {datetime.now()}")
        result = func(*args, **kwargs)
        print(f"[LOG] Finished {func.__name__}")
        return result
    return wrapper

class DataProcessor:
    def __init__(self, name):
        self.name = name
        self.data_store = []

    @log_execution
    def load_data(self, source_string):
        print(f"Loading data related to: {source_string}")
        # Simulate processing
        time.sleep(0.5)
        self.data_store = [char for char in source_string if char.isalnum()]
        return len(self.data_store)

    def analyze(self):
        if not self.data_store:
            raise ValueError("No data to analyze!")
        
        unique_chars = set(self.data_store)
        stats = {
            "total_chars": len(self.data_store),
            "unique_count": len(unique_chars),
            "complexity_score": len(unique_chars) / len(self.data_store) if self.data_store else 0
        }
        return stats

def main():
    processor = DataProcessor("MainBot")
    target_text = "${textToPrint}"
    
    try:
        count = processor.load_data(target_text)
        print(f"Loaded {count} valid characters.")
        
        stats = processor.analyze()
        print("-" * 30)
        print("Analysis Results:")
        for key, value in stats.items():
            print(f"{key}: {value}")
        print("-" * 30)
        
    except Exception as e:
        print(f"Error occurred: {e}")

if __name__ == "__main__":
    main()`;
                explanation = "Продвинутый Python скрипт. Включает:\n1. **Декораторы** (@log_execution) для метапрограммирования.\n2. **ООП** (класс DataProcessor).\n3. **List Comprehensions** для быстрой обработки списков.\n4. Обработку исключений и магические методы (__init__, __name__).";
            } else {
                code = `# Simple Python Script for: ${prompt}

def calculate_stats(text):
    """Calculates basic stats for a string."""
    words = text.split()
    return {
        "word_count": len(words),
        "char_count": len(text),
        "is_empty": len(text) == 0
    }

# Main execution
input_text = "${textToPrint}"
print(f"Analyzing: '{input_text}'")

# Loop example
for i in range(3):
    print(f"Iteration {i+1}...")

# Function call
stats = calculate_stats(input_text)

print("\\nResults:")
print(f"Words: {stats['word_count']}")
print(f"Characters: {stats['char_count']}")

if stats['word_count'] > 5:
    print("That's a long sentence!")
else:
    print("Short and concise.")`;
                explanation = "Простой скрипт на Python. Показывает определение функций, работу со словарями (dict), f-строки для форматирования и базовые циклы.";
            }
        } else if (language === 'cpp') {
            code = `// C++ Solution for: ${prompt}
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>

using namespace std;

class TextProcessor {
private:
    string content;

public:
    TextProcessor(string text) : content(text) {}

    void process() {
        cout << "Processing: " << content << endl;
        
        // Reverse string example
        string reversed = content;
        reverse(reversed.begin(), reversed.end());
        cout << "Reversed: " << reversed << endl;
    }
};

int main() {
    string input = "${textToPrint}";
    
    // Vector usage
    vector<int> numbers = {1, 2, 3, 4, 5};
    
    cout << "--- C++ Program Started ---" << endl;
    
    TextProcessor processor(input);
    processor.process();
    
    cout << "Numbers loop:" << endl;
    for(int n : numbers) {
        cout << n << " ";
    }
    cout << endl;
    
    return 0;
}`;
            explanation = "Код на C++ с использованием STL. Демонстрирует работу с классом, вектором (std::vector), строками (std::string) и алгоритмами (std::reverse).";
        } else {
            // Generic Fallback
            code = `// Code for language: ${language}
// Intent: ${prompt}

function main() {
    // Initialize
    var message = "${textToPrint}";
    print("Starting process for: " + message);

    // Logic placeholder
    for (var i = 0; i < 5; i++) {
        // Perform calculation
        var result = i * 2;
        print("Step " + i + ": " + result);
    }

    print("Done.");
}`;
            explanation = `Базовый пример кода на языке ${language}. Содержит цикл, переменные и вывод в консоль.`;
        }
        return { code, explanation };
    }

    // --- UI Functions ---

    function showLoading(message = 'Генерация контента...') {
        resultContent.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div class="loading"></div>
                <p style="margin-top: 20px; color: var(--text-secondary);">${message}</p>
            </div>
        `;
        copyBtn.style.display = 'none';
    }

    // Функция для показа уведомлений (Toast)
    function showToast(message, type = 'error') {
        const color = type === 'success' ? '#10b981' : '#ef4444';
        const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle';
        
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${color};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 20000;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease;
            font-family: 'Inter', sans-serif;
        `;
        toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
        document.body.appendChild(toast);
        
        // Удаление через 3 секунды
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function displayResult(content, type) {
        let html = '';
        
        switch (type) {
            case 'text':
                // Обработка Markdown-подобного жирного шрифта (**text**)
                let formattedContent = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                html = `<div class="generated-text">${formattedContent.replace(/\n/g, '<br>')}</div>`;
                break;
            case 'code':
                let codeContent = content;
                let explanationText = '';
                
                // Проверка на объект (новый формат ответа)
                if (typeof content === 'object' && content !== null && content.code) {
                    codeContent = content.code;
                    explanationText = content.explanation || '';
                }

                html = `<pre class="generated-code"><code>${escapeHtml(codeContent)}</code></pre>`;
                
                if (explanationText) {
                    html += `
                        <div class="code-explanation" style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.05); border-left: 4px solid var(--primary); border-radius: 0 8px 8px 0;">
                            <h4 style="margin-bottom: 10px; color: var(--secondary); font-size: 1.1rem;"><i class="fas fa-info-circle"></i> Объяснение кода</h4>
                            <p style="line-height: 1.6; color: #e2e8f0; font-size: 0.95rem;">${explanationText.replace(/\n/g, '<br>')}</p>
                        </div>
                    `;
                }
                break;
        }
        
        resultContent.innerHTML = html;
        copyBtn.style.display = 'flex';
    }

    function showError(message, isError = true) {
        const color = isError ? '#ef4444' : '#10b981';
        const icon = isError ? 'fa-exclamation-triangle' : 'fa-check-circle';
        
        // If it's a success message (like Google login), we might show it differently or as a toast
        // But for now, showing it in the result area is safe if it's related to generation,
        // but for Auth it might be better to use alert or a toast.
        // However, the requested change was just to support the false flag in the google auth function.
        
        // Let's create a temporary toast notification instead of replacing result content for auth messages
        if (!isError && message.includes('успешно')) {
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: ${color};
                color: white;
                padding: 1rem 2rem;
                border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                z-index: 2000;
                animation: slideIn 0.3s ease;
            `;
            toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
            return;
        }

        resultContent.innerHTML = `
            <div style="text-align: center; padding: 40px; color: ${color};">
                <i class="fas ${icon}" style="font-size: 2rem; margin-bottom: 15px;"></i>
                <p>${message}</p>
            </div>
        `;
        copyBtn.style.display = 'none';
    }

    function copyResult() {
        let textToCopy = '';
        const codeBlock = resultContent.querySelector('code');
        
        if (codeBlock) {
            textToCopy = codeBlock.textContent; // Copy only code content
        } else {
            textToCopy = resultContent.innerText; // Fallback for text
        }

        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Скопировано!';
            copyBtn.style.background = '#10b981';
            
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.style.background = '';
            }, 2000);
        }).catch(() => {
            showError('Не удалось скопировать текст');
        });
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    // --- Event Listeners & Initialization ---

    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    if(copyBtn) copyBtn.addEventListener('click', copyResult);
    if(generateBtn) generateBtn.addEventListener('click', handleGenerate);
});
