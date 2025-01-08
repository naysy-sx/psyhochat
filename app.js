function getStartOfDay() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}



class QuoteApp {
    constructor() {
        this.quotes = null;
        this.currentUser = null;
        this.syncManager = null;
        this.quoteSchedule = null;
        this.nextQuoteTime = null;
    }

    async initializeApp() {
        try {
            // Сначала проверяем и очищаем кэш Service Worker при необходимости
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            }

            this.syncManager = new window.SyncManager();
            await this.initializeServiceWorker();
            await this.loadQuotes();
            await this.initializeUser();
            await this.loadAndShowRandomNicknames();

            this.setupUIHandlers();
            this.setupMessageListener();

            this.renderCurrentQuote();
            this.updateUIState();

            // Загружаем сообщения независимо от статуса авторизации
            await this.loadAndDisplayMessages();

            // Показываем чат по умолчанию
            const chatContainer = document.getElementById('chatContainer');
            if (chatContainer) {
                chatContainer.style.display = 'block';
                const toggleButton = document.getElementById('toggleChat');
                if (toggleButton) {
                    toggleButton.textContent = 'Скрыть чат';
                }
            }
            this.showQuoteSchedule();
        } catch (error) {
            console.error('Ошибка инициализации блять:', error);
            this.showError('Ты чёто нажал(а) и всё сломал!');
            throw error;
        }
    }

    async initializeServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('ServiceWorker успещно зареган в скоупе: ', registration.scope);
                return registration;
            } catch (error) {
                console.error('Регистрация ServiceWorker не прошла: ', error);
                throw error;
            }
        }
        return null;
    }

    async loadQuotes() {
        try {
            const response = await fetch('quotes.json');
            if (!response.ok) {
                throw new Error('Не смог загрузить цитаты');
            }
            this.quotes = await response.json();
        } catch (error) {
            console.error('Ошибка при загрузке цитат:', error);
            throw error;
        }
    }

    async initializeUser() {
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
        }
    }

    setupUIHandlers() {
        // Обработчик отправки сообщений
        const sendButton = document.getElementById('sendMessage');
        if (sendButton) {
            sendButton.addEventListener('click', () => this.handleMessageSubmit());
        }

        // Обработчик ввода сообщения
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            // Обработка Enter и Shift+Enter
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (e.shiftKey) {
                        // Shift+Enter - просто переносим строку
                        return;
                    } else {
                        // Enter без Shift - отправляем сообщение
                        e.preventDefault();
                        this.handleMessageSubmit();
                    }
                }
            });

            // Ограничение длины сообщения
            messageInput.addEventListener('input', () => {
                if (messageInput.value.length > 300) {
                    messageInput.value = messageInput.value.slice(0, 300);
                }
            });
        }

        // Обработчик переключения чата
        const toggleChatBtn = document.getElementById('toggleChat');
        if (toggleChatBtn) {
            toggleChatBtn.addEventListener('click', () => {
                const chatContainer = document.getElementById('chatContainer');
                const isVisible = chatContainer.style.display === 'block';
                this.showChat(!isVisible);
            });
        }

        // Обработчик эмодзи
        const emojiToggle = document.getElementById('emojiToggle');
        const emojiPanel = document.getElementById('emojiPanel');
        if (emojiToggle && emojiPanel) {
            emojiToggle.addEventListener('click', () => {
                emojiPanel.style.display = emojiPanel.style.display === 'none' ? 'grid' : 'none';
            });
        }

        // Обработчики эмодзи-кнопок
        const emojiButtons = document.querySelectorAll('.emoji-button');
        emojiButtons.forEach(button => {
            button.addEventListener('click', () => {
                if (messageInput) {
                    messageInput.value += button.textContent;
                    emojiPanel.style.display = 'none';
                    messageInput.focus(); // Возвращаем фокус на поле ввода
                }
            });
        });

        // Обработчик формы регистрации
        const registrationForm = document.querySelector('.registration-form');
        if (registrationForm) {
            registrationForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleRegistration();
            });
        }
        // выход
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', () => {
                if (confirm('Уверены что хотите этого?')) {
                    this.handleLogout();
                }
            });
        }

    }

    async handleRegistration() {
        const nickname = document.getElementById('nickname').value.trim();
        const gender = document.getElementById('gender').value;
        const city = document.getElementById('city').value.trim();
        const captcha = document.getElementById('captcha').value.trim();

        if (!this.validateRegistration(nickname, captcha)) {
            return;
        }

        const user = {
            id: crypto.randomUUID(),
            nickname,
            gender,
            city: city || null,
            registrationDate: new Date().toISOString()
        };

        try {
            localStorage.setItem('currentUser', JSON.stringify(user));
            this.currentUser = user;
            this.updateUIState();
            this.showError('Регистрация успешна!', 'success');
        } catch (error) {
            console.error('Ошибка регистрации:', error);
            this.showError('Ошибка при регистрации');
        }
    }

    handleLogout() {
        // Удаляем данные пользователя
        localStorage.removeItem('currentUser');
        this.currentUser = null;

        // Очищаем поле ввода
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.value = '';
        }

        // Обновляем UI
        this.updateUIState();

        // Перезагружаем сообщения чтобы обновить классы 'own' у сообщений
        this.loadAndDisplayMessages();
    }

    validateRegistration(nickname, captcha) {
        if (!nickname || nickname.length > 60) {
            this.showError('Никнейм должен содержать от 1 до 60 символов');
            return false;
        }

        if (captcha !== '5') {
            this.showError('Неверный ответ на проверочный вопрос');
            return false;
        }

        return true;
    }

    updateUIState() {
        const chatContainer = document.getElementById('chatContainer');
        const messageInputContainer = document.getElementById('messageInputContainer');
        const registrationInChatContainer = document.getElementById('registrationInChatContainer');
        const toggleChatBtn = document.getElementById('toggleChat');

        // Кнопка переключения чата всегда видима
        if (toggleChatBtn) toggleChatBtn.style.display = 'inline-flex';

        if (this.currentUser) {
            // Пользователь авторизован
            if (registrationInChatContainer) registrationInChatContainer.style.display = 'none';
            if (messageInputContainer) messageInputContainer.style.display = 'block';
        } else {
            // Пользователь не авторизован
            if (messageInputContainer) messageInputContainer.style.display = 'none';
            if (registrationInChatContainer) registrationInChatContainer.style.display = 'block';
        }
    }

    setupMessageListener() {
        window.addEventListener('newMessage', (event) => {
            this.appendMessage(event.detail);
        });
    }

    async loadAndDisplayMessages() {
        try {
            console.log('Starting to load messages...');
            const messages = await this.syncManager.loadMessages();
            console.log('Loaded messages:', messages);

            const messagesContainer = document.getElementById('messagesContainer');
            if (!messagesContainer) {
                console.error('Messages container not found!');
                return;
            }

            // Очищаем контейнер
            messagesContainer.innerHTML = '';

            if (!messages || messages.length === 0) {
                console.log('No messages to display');
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'message system-message';
                emptyMessage.innerHTML = `
                    <div class="message-content">
                        <p>Пока нет сообщений. Будьте первым, кто начнет обсуждение!</p>
                    </div>
                `;
                messagesContainer.appendChild(emptyMessage);
                return;
            }

            // Сортируем сообщения по времени (новые сверху)
            const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp);;

            // Ограничиваем количество отображаемых сообщений
            const recentMessages = sortedMessages.slice(-50);

            console.log('Показываем сообщения:', recentMessages.length);

            // Отображаем сообщения
            recentMessages.forEach(message => this.appendMessage(message));

            // Добавляем приглашение к регистрации для неавторизованных пользователей
            if (!this.currentUser) {
                const inviteMessage = document.createElement('div');
                inviteMessage.className = 'message system-message';
                inviteMessage.innerHTML = `
                    <div class="message-content">
                        <p>Присоединяйтесь к обсуждению темы!</p>
                    </div>
                `;
                messagesContainer.insertBefore(inviteMessage, messagesContainer.firstChild);
            }

            // Прокручиваем к последнему сообщению
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

        } catch (error) {
            console.error('Error loading messages:', error);
            this.showError('Ошибка при загрузке сообщений');
        }
    }

    appendMessage(message) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.userId === this.currentUser?.id ? 'own' : ''}`;

        const formattedTime = new Date(message.timestamp).toLocaleString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit'
        });

        let userInfo = this.escapeHtml(message.nickname);

        // Добавляем пол и город, если они есть
        const additionalInfo = [];
        if (message.gender) {
            const genderDisplay = message.gender === 'male' ? '▼' : '▲';
            additionalInfo.push(genderDisplay);
        }
        if (message.city) {
            additionalInfo.push(this.escapeHtml(message.city));
        }

        if (additionalInfo.length > 0) {
            userInfo += ` (${additionalInfo.join(', ')})`;
        }

        const messageHtml = `
            <div class="message-header">
                <span class="message-author">${userInfo}</span>
                <span class="message-time">${formattedTime}</span>
            </div>
            <div class="message-content">
                ${this.escapeHtml(message.text)}
            </div>
        `;

        messageElement.innerHTML = messageHtml;
        messagesContainer.appendChild(messageElement);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async handleMessageSubmit() {
        if (!this.currentUser) {
            this.showError('Пожалуйста, зарегистрируйтесь');
            return;
        }

        const messageInput = document.getElementById('messageInput');
        if (!messageInput) return;

        const text = messageInput.value.trim();
        if (!this.validateMessage(text)) {
            return;
        }

        const message = {
            id: crypto.randomUUID(),
            text,
            timestamp: Date.now(),
            userId: this.currentUser.id,
            nickname: this.currentUser.nickname,
            city: this.currentUser.city,      // Добавили город
            gender: this.currentUser.gender,   // Добавили пол
            themeId: this.getCurrentThemeId()
        };

        try {
            await this.syncManager.saveMessage(message);
            messageInput.value = '';
            this.disableMessageInput(60);
        } catch (error) {
            console.error('Error sending message:', error);
            this.showError('Ошибка при отправке сообщения');
        }
    }

    getCurrentThemeId() {
        return this.quotes && this.quotes.parts && this.quotes.parts[0] ? this.quotes.parts[0].id : null;
    }

    validateMessage(text) {
        if (!text) {
            this.showError('Сообщение не может быть пустым');
            return false;
        }

        if (text.length > 300) {
            this.showError('Сообщение не может превышать 300 символов');
            return false;
        }

        return true;
    }
    getCurrentQuote() {
        if (!this.quotes || !this.quotes.parts) {
            return null;
        }

        // Собираем все возможные цитаты из всех полей каждой темы
        const allQuotes = this.quotes.parts.flatMap(part => {
            const quotes = [];
            const content = part.content;

            // Собираем одиночные текстовые поля
            if (content.statement) quotes.push({ text: content.statement, type: 'statement' });
            if (content.problem) quotes.push({ text: content.problem, type: 'problem' });
            if (content.consequences) quotes.push({ text: content.consequences, type: 'consequences' });
            if (content.preservation) quotes.push({ text: content.preservation, type: 'preservation' });
            if (content.self_damage) quotes.push({ text: content.self_damage, type: 'self_damage' });
            if (content.external_damage) quotes.push({ text: content.external_damage, type: 'external_damage' });

            // Собираем массивы цитат
            if (content.quotes) {
                content.quotes.forEach(quote => quotes.push({ text: quote, type: 'quote' }));
            }
            if (content.questions) {
                content.questions.forEach(q => quotes.push({ text: q, type: 'question' }));
            }
            if (content.conclusions) {
                content.conclusions.forEach(c => quotes.push({ text: c, type: 'conclusion' }));
            }

            return quotes.map(q => ({
                theme: part.theme,
                quote: q.text,
                type: q.type,
                themeId: part.id
            }));
        });

        const dayStart = getStartOfDay();
        const totalQuotes = allQuotes.length;
        const minutesInDay = 24 * 60;
        const minutesPerQuote = Math.floor(minutesInDay / totalQuotes);

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const quoteIndex = Math.floor(currentMinutes / minutesPerQuote);

        const shuffledQuotes = [...allQuotes];
        const seed = dayStart;
        for (let i = shuffledQuotes.length - 1; i > 0; i--) {
            const j = (seed + i) % (i + 1);
            [shuffledQuotes[i], shuffledQuotes[j]] = [shuffledQuotes[j], shuffledQuotes[i]];
        }

        return shuffledQuotes[quoteIndex % totalQuotes];
    }
    renderCurrentQuote() {
        const quoteContainer = document.getElementById('quoteContainer');
        if (!quoteContainer) return;

        const currentQuote = this.getCurrentQuote();
        if (!currentQuote) {
            quoteContainer.innerHTML = '<p>Цитаты недоступны</p>';
            return;
        }

        quoteContainer.innerHTML = `
            <h2>${this.escapeHtml(currentQuote.theme)}</h2>
            <blockquote>${this.escapeHtml(currentQuote.quote)}</blockquote>
        `;

        // Планируем следующее обновление
        this.scheduleNextQuoteUpdate();
    }

    showChat(visible) {
        const chatContainer = document.getElementById('chatContainer');
        const toggleButton = document.getElementById('toggleChat');

        if (chatContainer && toggleButton) {
            chatContainer.style.display = visible ? 'block' : 'none';
            toggleButton.textContent = visible ? 'Скрыть чат' : 'Показать чат';
        }
    }

    disableMessageInput(seconds) {
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendMessage');
        if (!messageInput || !sendButton) return;

        messageInput.disabled = true;
        sendButton.disabled = true;

        let remaining = seconds;
        const timer = setInterval(() => {
            sendButton.textContent = `Отправить (${remaining}с)`;
            remaining--;

            if (remaining < 0) {
                clearInterval(timer);
                messageInput.disabled = false;
                sendButton.disabled = false;
                sendButton.textContent = 'Отправить';
            }
        }, 1000);
    }

    showError(message, type = 'error') {
        const errorContainer = document.getElementById('errorContainer');
        if (!errorContainer) return;

        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
        errorContainer.className = `error-container ${type}`;

        setTimeout(() => {
            errorContainer.style.display = 'none';
        }, 3000);
    }

    scheduleNextQuoteUpdate() {
        if (this.quoteUpdateTimer) {
            clearTimeout(this.quoteUpdateTimer);
        }

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const totalQuotes = this.quotes.parts.reduce((acc, part) =>
            acc + (part.content.quotes ? part.content.quotes.length : 0), 0);
        const minutesPerQuote = Math.floor(24 * 60 / totalQuotes);

        // Вычисляем время до следующей смены цитаты
        const nextChangeMinutes = Math.ceil(currentMinutes / minutesPerQuote) * minutesPerQuote;
        const msUntilNext = (nextChangeMinutes - currentMinutes) * 60 * 1000 - now.getSeconds() * 1000;

        this.quoteUpdateTimer = setTimeout(() => {
            this.renderCurrentQuote();
        }, msUntilNext);
    }


    showQuoteSchedule() {
        if (!this.quotes || !this.quotes.parts) {
            console.log('Цитаты не загружены');
            return;
        }

        // Собираем ВСЕ текстовые поля из каждой темы
        const allQuotes = this.quotes.parts.flatMap(part => {
            const quotes = [];
            const content = part.content;

            // Собираем одиночные текстовые поля
            if (content.statement) quotes.push({ text: content.statement, type: 'statement' });
            if (content.problem) quotes.push({ text: content.problem, type: 'problem' });
            if (content.consequences) quotes.push({ text: content.consequences, type: 'consequences' });
            if (content.preservation) quotes.push({ text: content.preservation, type: 'preservation' });
            if (content.self_damage) quotes.push({ text: content.self_damage, type: 'self_damage' });
            if (content.external_damage) quotes.push({ text: content.external_damage, type: 'external_damage' });

            // Собираем массивы цитат
            if (content.quotes) {
                content.quotes.forEach(quote => quotes.push({ text: quote, type: 'quote' }));
            }
            if (content.questions) {
                content.questions.forEach(q => quotes.push({ text: q, type: 'question' }));
            }
            if (content.conclusions) {
                content.conclusions.forEach(c => quotes.push({ text: c, type: 'conclusion' }));
            }

            // Возвращаем все цитаты с информацией о теме
            return quotes.map(q => ({
                theme: part.theme,
                quote: q.text,
                type: q.type
            }));
        });

        const totalQuotes = allQuotes.length;
        const minutesInDay = 24 * 60;
        const minutesPerQuote = Math.floor(minutesInDay / totalQuotes);
        const dayStart = getStartOfDay();

        // Создаем расписание на сутки
        const schedule = [];
        const shuffledQuotes = [...allQuotes];

        // Перемешиваем на основе текущей даты
        const seed = dayStart;
        for (let i = shuffledQuotes.length - 1; i > 0; i--) {
            const j = (seed + i) % (i + 1);
            [shuffledQuotes[i], shuffledQuotes[j]] = [shuffledQuotes[j], shuffledQuotes[i]];
        }

        // Создаем расписание с точным временем для каждой цитаты
        shuffledQuotes.forEach((quote, index) => {
            const minuteOfDay = index * minutesPerQuote;
            const hour = Math.floor(minuteOfDay / 60);
            const minute = minuteOfDay % 60;

            schedule.push({
                time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
                theme: quote.theme,
                type: quote.type,
                quote: quote.quote.substring(0, 50) + '...'
            });
        });

        console.log(`\n📚 Статистика на ${new Date().toLocaleDateString()}:`);
        console.log(`- Всего цитат: ${totalQuotes}`);
        console.log(`- Интервал между цитатами: ${minutesPerQuote} минут`);
        console.log(`- Смен за сутки: ${totalQuotes}`);
        console.log('\n📅 Расписание цитат:');
        console.table(schedule);

        const currentQuote = this.getCurrentQuote();
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const minutesUntilNext = minutesPerQuote - (currentMinutes % minutesPerQuote);

        console.log(
            `\n🕒 Текущая тема: "${currentQuote.theme}"\n` +
            `⏳ Следующая смена через: ${minutesUntilNext} мин.`
        );
    }

    async loadAndShowRandomNicknames() {
        try {
            // Загружаем файл с никнеймами
            const response = await fetch('nicknames.json');
            if (!response.ok) {
                throw new Error('Не удалось загрузить список никнеймов');
            }
            const data = await response.json();

            // Получаем все индексы
            const indices = Array.from({ length: data.nicknames.length }, (_, i) => i);

            // Перемешиваем массив индексов
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }

            // Берем первые 5 индексов с большим разбросом
            const selectedIndices = [];
            const step = Math.floor(indices.length / 5);
            for (let i = 0; i < 5; i++) {
                selectedIndices.push(indices[i * step]);
            }

            // Получаем выбранные никнеймы
            const selectedNicknames = selectedIndices.map(index => data.nicknames[index]);

            // Отображаем никнеймы
            const suggestionsList = document.getElementById('nicknameSuggestions');
            if (suggestionsList) {
                suggestionsList.innerHTML = selectedNicknames
                    .map(item => `<li><a href="#" class="nickname-suggestion">${item.nickname}</a></li>`)
                    .join('');

                // Добавляем обработчики для каждой ссылки
                const links = suggestionsList.querySelectorAll('.nickname-suggestion');
                links.forEach(link => {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        const nicknameInput = document.getElementById('nickname');
                        if (nicknameInput) {
                            nicknameInput.value = link.textContent;
                        }
                    });
                });
            }
        } catch (error) {
            console.error('Ошибка при загрузке никнеймов:', error);
        }
    }


}

// Start the application when the DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        window.app = new QuoteApp();
        await window.app.initializeApp(); // Инициализируем приложение после создания экземпляра
    } catch (error) {
        console.error('Ошибка инициализации:', error);
    }
});