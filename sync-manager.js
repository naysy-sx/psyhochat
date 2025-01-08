class SyncManager {
  constructor() {
    this.db = null;
    this.syncInProgress = false;
    this.supabase = window.supabase;

    if (!this.supabase) {
      console.error('Supabase client not initialized');
      throw new Error('Supabase client not initialized');
    }

    this.initializeDB();
    this.setupMessageSync();
  }

  async initializeDB() {
    this.db = await localforage.createInstance({
      name: 'quote-chat-db',
      storeName: 'messages'
    });
  }

  setupMessageSync() {
    try {
      const channel = this.supabase.channel('messages');

      const subscription = channel
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
          },
          (payload) => {
            console.log('Received new message:', payload);
            if (payload.new) {
              this.handleNewMessage(payload.new);
            }
          }
        )
        .subscribe((status) => {
          console.log('Subscription status:', status);
        });

      console.log('Message sync setup completed');
    } catch (error) {
      console.error('Error setting up message sync:', error);
    }
  }

  async handleNewMessage(message) {
    try {
      const existingMessage = await this.db.getItem(message.id);
      if (!existingMessage) {
        await this.db.setItem(message.id, message);
        window.dispatchEvent(new CustomEvent('newMessage', { detail: message }));
        console.log('New message processed:', message);
      }
    } catch (error) {
      console.error('Error handling new message:', error);
    }
  }

  async saveMessage(message) {
    try {
      // Сначала сохраняем локально
      await this.db.setItem(message.id, message);
      console.log('Message saved locally:', message);

      // Сразу отправляем событие для отображения
      window.dispatchEvent(new CustomEvent('newMessage', { detail: message }));

      // Затем отправляем в Supabase
      const { data, error } = await this.supabase
        .from('messages')
        .insert([{
          id: message.id,
          text: message.text,
          timestamp: message.timestamp,
          userId: message.userId,
          nickname: message.nickname,
          city: message.city,
          gender: message.gender,
          themeId: message.themeId
        }]);

      if (error) {
        console.error('Supabase insert error:', error);
        throw error;
      }

      console.log('Message saved to Supabase:', data);
      return true;
    } catch (error) {
      console.error('Error saving message:', error);
      return false;
    }
  }

  async loadMessages() {
    try {
      console.log('Loading messages from Supabase...');
      const { data: onlineMessages, error } = await this.supabase
        .from('messages')
        .select('*')
        .order('timestamp', { ascending: false });

      if (error) {
        console.error('Supabase select error:', error);
        throw error;
      }

      if (onlineMessages && onlineMessages.length > 0) {
        console.log(`Loaded ${onlineMessages.length} messages from Supabase`);
        // Сохраняем в локальное хранилище
        await Promise.all(
          onlineMessages.map(msg => this.db.setItem(msg.id, msg))
        );
        return onlineMessages;
      }

      // Если онлайн сообщений нет, пробуем загрузить из локального хранилища
      console.log('No online messages, trying local storage...');
      const messages = [];
      await this.db.iterate((value) => {
        messages.push(value);
      });

      const sortedMessages = messages.sort((a, b) => b.timestamp - a.timestamp);
      console.log(`Loaded ${sortedMessages.length} messages from local storage`);
      return sortedMessages;
    } catch (error) {
      console.error('Error loading messages:', error);
      return [];
    }
  }
}

// Делаем класс доступным глобально
window.SyncManager = SyncManager;