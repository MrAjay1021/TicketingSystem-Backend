(function() {
  // Configuration
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ticketingsystem-backend.onrender.com';
  const POLL_INTERVAL = 5000; // 5 seconds
  
  // Widget state
  let widgetState = {
    isOpen: false,
    adminId: null,
    customization: null,
    customer: {
      name: '',
      email: '',
      phone: ''
    },
    chat: null,
    messages: [],
    lastPollTime: 0
  };
  
  // Create widget container
  function createWidget(adminId) {
    widgetState.adminId = adminId;
    
    // Create widget container
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'hubly-chat-widget-container';
    widgetContainer.style.position = 'fixed';
    widgetContainer.style.bottom = '20px';
    widgetContainer.style.right = '20px';
    widgetContainer.style.zIndex = '9999';
    widgetContainer.style.fontFamily = 'Arial, sans-serif';
    
    document.body.appendChild(widgetContainer);
    
    // Load customization
    loadCustomization(adminId).then(() => {
      renderWidget();
    });
  }
  
  // Load customization from API
  async function loadCustomization(adminId) {
    try {
      const response = await fetch(`${API_URL}/api/chatbot/customization/${adminId}`);
      const data = await response.json();
      
      if (data.success) {
        widgetState.customization = data.customization;
      } else {
        console.error('Failed to load chatbot customization:', data.message);
        // Use default customization
        widgetState.customization = {
          headerColor: '#334758',
          backgroundColor: '#EEEEEE',
          welcomeMessage: '👋 Want to chat? I\'m here to help you find your way.',
          promptMessages: ['How can I help you?', 'Ask me anything!'],
          introductionForm: {
            enabled: true,
            fields: [
              { name: 'name', required: true, label: 'Your name' },
              { name: 'email', required: true, label: 'Your Email' },
              { name: 'phone', required: false, label: 'Your Phone' }
            ],
            submitButtonText: 'Thank You!'
          }
        };
      }
    } catch (error) {
      console.error('Error loading chatbot customization:', error);
      // Use default customization
      widgetState.customization = {
        headerColor: '#334758',
        backgroundColor: '#EEEEEE',
        welcomeMessage: '👋 Want to chat? I\'m here to help you find your way.',
        promptMessages: ['How can I help you?', 'Ask me anything!'],
        introductionForm: {
          enabled: true,
          fields: [
            { name: 'name', required: true, label: 'Your name' },
            { name: 'email', required: true, label: 'Your Email' },
            { name: 'phone', required: false, label: 'Your Phone' }
          ],
          submitButtonText: 'Thank You!'
        }
      };
    }
  }
  
  // Render the widget
  function renderWidget() {
    const container = document.getElementById('hubly-chat-widget-container');
    
    if (!container) return;
    
    // Clear container
    container.innerHTML = '';
    
    if (widgetState.isOpen) {
      renderChatWindow(container);
    } else {
      renderChatButton(container);
    }
  }
  
  // Render chat button
  function renderChatButton(container) {
    const button = document.createElement('button');
    button.id = 'hubly-chat-button';
    button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    button.style.width = '60px';
    button.style.height = '60px';
    button.style.borderRadius = '50%';
    button.style.backgroundColor = widgetState.customization?.headerColor || '#334758';
    button.style.color = '#fff';
    button.style.border = 'none';
    button.style.cursor = 'pointer';
    button.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    
    button.addEventListener('click', () => {
      widgetState.isOpen = true;
      renderWidget();
    });
    
    container.appendChild(button);
  }
  
  // Render chat window
  function renderChatWindow(container) {
    const chatWindow = document.createElement('div');
    chatWindow.id = 'hubly-chat-window';
    chatWindow.style.width = '350px';
    chatWindow.style.height = '500px';
    chatWindow.style.backgroundColor = '#fff';
    chatWindow.style.borderRadius = '10px';
    chatWindow.style.overflow = 'hidden';
    chatWindow.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    chatWindow.style.display = 'flex';
    chatWindow.style.flexDirection = 'column';
    
    // Chat header
    const header = document.createElement('div');
    header.style.backgroundColor = widgetState.customization?.headerColor || '#334758';
    header.style.color = '#fff';
    header.style.padding = '15px';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    const title = document.createElement('div');
    title.textContent = 'Chat with us';
    title.style.fontWeight = 'bold';
    
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.color = '#fff';
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    
    closeButton.addEventListener('click', () => {
      widgetState.isOpen = false;
      renderWidget();
    });
    
    header.appendChild(title);
    header.appendChild(closeButton);
    
    // Chat content
    const content = document.createElement('div');
    content.style.flex = '1';
    content.style.overflowY = 'auto';
    content.style.padding = '15px';
    content.style.backgroundColor = widgetState.customization?.backgroundColor || '#EEEEEE';
    
    // Render appropriate content based on state
    if (!widgetState.customer.name && widgetState.customization?.introductionForm?.enabled) {
      renderIntroductionForm(content);
    } else if (!widgetState.chat) {
      renderWelcomeMessage(content);
    } else {
      renderChatMessages(content);
    }
    
    // Chat input
    const inputContainer = document.createElement('div');
    inputContainer.style.borderTop = '1px solid #eee';
    inputContainer.style.padding = '15px';
    inputContainer.style.display = 'flex';
    
    if (widgetState.chat) {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Type a message...';
      input.style.flex = '1';
      input.style.padding = '10px';
      input.style.border = '1px solid #ddd';
      input.style.borderRadius = '4px';
      input.style.marginRight = '10px';
      
      const sendButton = document.createElement('button');
      sendButton.textContent = 'Send';
      sendButton.style.backgroundColor = widgetState.customization?.headerColor || '#334758';
      sendButton.style.color = '#fff';
      sendButton.style.border = 'none';
      sendButton.style.borderRadius = '4px';
      sendButton.style.padding = '10px 15px';
      sendButton.style.cursor = 'pointer';
      
      sendButton.addEventListener('click', () => {
        if (input.value.trim()) {
          sendMessage(input.value);
          input.value = '';
        }
      });
      
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          sendMessage(input.value);
          input.value = '';
        }
      });
      
      inputContainer.appendChild(input);
      inputContainer.appendChild(sendButton);
    }
    
    chatWindow.appendChild(header);
    chatWindow.appendChild(content);
    chatWindow.appendChild(inputContainer);
    
    container.appendChild(chatWindow);
    
    // Start polling for messages if we have an active chat
    if (widgetState.chat) {
      startPolling();
    }
  }
  
  // Render introduction form
  function renderIntroductionForm(container) {
    const form = document.createElement('form');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '15px';
    
    const fields = widgetState.customization?.introductionForm?.fields || [];
    
    fields.forEach(field => {
      const label = document.createElement('label');
      label.textContent = field.label || field.name;
      label.style.fontWeight = 'bold';
      label.style.marginBottom = '5px';
      
      const input = document.createElement('input');
      input.type = field.name === 'email' ? 'email' : 'text';
      input.name = field.name;
      input.required = field.required;
      input.style.padding = '10px';
      input.style.border = '1px solid #ddd';
      input.style.borderRadius = '4px';
      
      const fieldContainer = document.createElement('div');
      fieldContainer.style.display = 'flex';
      fieldContainer.style.flexDirection = 'column';
      
      fieldContainer.appendChild(label);
      fieldContainer.appendChild(input);
      
      form.appendChild(fieldContainer);
    });
    
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.textContent = widgetState.customization?.introductionForm?.submitButtonText || 'Start Chat';
    submitButton.style.backgroundColor = widgetState.customization?.headerColor || '#334758';
    submitButton.style.color = '#fff';
    submitButton.style.border = 'none';
    submitButton.style.borderRadius = '4px';
    submitButton.style.padding = '10px 15px';
    submitButton.style.cursor = 'pointer';
    submitButton.style.marginTop = '10px';
    
    form.appendChild(submitButton);
    
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Collect form data
      const formData = new FormData(form);
      
      widgetState.customer = {
        name: formData.get('name') || '',
        email: formData.get('email') || '',
        phone: formData.get('phone') || ''
      };
      
      // Create chat
      createChat();
    });
    
    container.appendChild(form);
  }
  
  // Render welcome message
  function renderWelcomeMessage(container) {
    const welcomeContainer = document.createElement('div');
    
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'hubly-chat-message hubly-chat-message-bot';
    welcomeMessage.textContent = widgetState.customization?.welcomeMessage || 'Welcome! How can I help you today?';
    welcomeMessage.style.backgroundColor = '#fff';
    welcomeMessage.style.padding = '10px 15px';
    welcomeMessage.style.borderRadius = '10px';
    welcomeMessage.style.marginBottom = '10px';
    welcomeMessage.style.maxWidth = '80%';
    welcomeMessage.style.alignSelf = 'flex-start';
    
    welcomeContainer.appendChild(welcomeMessage);
    
    // Add prompt buttons
    const promptMessages = widgetState.customization?.promptMessages || [];
    
    if (promptMessages.length > 0) {
      const promptsContainer = document.createElement('div');
      promptsContainer.style.display = 'flex';
      promptsContainer.style.flexDirection = 'column';
      promptsContainer.style.gap = '10px';
      promptsContainer.style.marginTop = '15px';
      
      promptMessages.forEach(prompt => {
        const promptButton = document.createElement('button');
        promptButton.textContent = prompt;
        promptButton.style.backgroundColor = '#fff';
        promptButton.style.border = '1px solid #ddd';
        promptButton.style.borderRadius = '4px';
        promptButton.style.padding = '10px 15px';
        promptButton.style.cursor = 'pointer';
        promptButton.style.textAlign = 'left';
        
        promptButton.addEventListener('click', () => {
          createChat(prompt);
        });
        
        promptsContainer.appendChild(promptButton);
      });
      
      welcomeContainer.appendChild(promptsContainer);
    }
    
    container.appendChild(welcomeContainer);
  }
  
  // Render chat messages
  function renderChatMessages(container) {
    container.innerHTML = '';
    
    widgetState.messages.forEach(message => {
      const messageElement = document.createElement('div');
      messageElement.className = `hubly-chat-message ${message.isCustomer ? 'hubly-chat-message-customer' : 'hubly-chat-message-bot'}`;
      messageElement.textContent = message.content;
      messageElement.style.backgroundColor = message.isCustomer ? widgetState.customization?.headerColor || '#334758' : '#fff';
      messageElement.style.color = message.isCustomer ? '#fff' : '#000';
      messageElement.style.padding = '10px 15px';
      messageElement.style.borderRadius = '10px';
      messageElement.style.marginBottom = '10px';
      messageElement.style.maxWidth = '80%';
      messageElement.style.alignSelf = message.isCustomer ? 'flex-end' : 'flex-start';
      messageElement.style.wordBreak = 'break-word';
      
      const timestamp = document.createElement('div');
      timestamp.className = 'hubly-chat-timestamp';
      timestamp.textContent = formatTime(message.timestamp);
      timestamp.style.fontSize = '10px';
      timestamp.style.marginTop = '5px';
      timestamp.style.opacity = '0.7';
      
      messageElement.appendChild(timestamp);
      
      container.appendChild(messageElement);
    });
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }
  
  // Create a new chat
  async function createChat(initialMessage = '') {
    try {
      const response = await fetch(`${API_URL}/api/chatbot/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          adminId: widgetState.adminId,
          customer: widgetState.customer,
          initialMessage
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        widgetState.chat = data.chat;
        widgetState.messages = data.chat.messages.map(msg => ({
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          isCustomer: msg.isCustomer
        }));
        
        renderWidget();
      } else {
        console.error('Failed to create chat:', data.message);
      }
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  }
  
  // Send a message
  async function sendMessage(content) {
    if (!widgetState.chat) return;
    
    // Optimistically add message to UI
    widgetState.messages.push({
      content,
      timestamp: new Date(),
      isCustomer: true
    });
    
    renderWidget();
    
    try {
      const response = await fetch(`${API_URL}/api/chatbot/chats/${widgetState.chat.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content
        })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        console.error('Failed to send message:', data.message);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }
  
  // Start polling for new messages
  function startPolling() {
    if (!widgetState.chat) return;
    
    // Set last poll time if not set
    if (!widgetState.lastPollTime) {
      widgetState.lastPollTime = Date.now();
    }
    
    // Poll for new messages
    pollMessages();
    
    // Set up interval for polling
    setInterval(pollMessages, POLL_INTERVAL);
  }
  
  // Poll for new messages
  async function pollMessages() {
    if (!widgetState.chat) return;
    
    try {
      const response = await fetch(`${API_URL}/api/chatbot/chats/${widgetState.chat.id}/messages?since=${widgetState.lastPollTime}`);
      const data = await response.json();
      
      if (data.success && data.messages.length > 0) {
        // Add new messages
        const newMessages = data.messages.map(msg => ({
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          isCustomer: msg.isCustomer
        }));
        
        widgetState.messages = [...widgetState.messages, ...newMessages];
        widgetState.lastPollTime = Date.now();
        
        renderWidget();
      }
    } catch (error) {
      console.error('Error polling messages:', error);
    }
  }
  
  // Format timestamp
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  // Expose the widget to the global scope
  window.HublyChat = {
    init: function(adminId) {
      createWidget(adminId);
    }
  };
})();