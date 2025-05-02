import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { Chat, Ticket, User, Chatbot, Team } from '../models/index.js';
import crypto from 'crypto';

const router = express.Router();

// @route   POST /api/chat/sessions
// @desc    Start a new chat session
// @access  Public
router.post('/sessions', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }
    
    // Create or find customer user
    let customer = await User.findOne({ email });
    
    if (!customer) {
      // Create a new customer
      customer = await User.create({
        firstName: name.split(' ')[0] || name,
        lastName: name.split(' ').slice(1).join(' ') || '',
        email,
        phone: phone || '',
        password: crypto.randomBytes(16).toString('hex'), // Random password
        role: 'customer',
        username: email
      });
    }
    
    // Find AN active admin for initial assignment and chat handling (simplified)
    const primaryAdmin = await User.findOne({ role: 'admin' });
    
    if (!primaryAdmin) {
      return res.status(500).json({
        success: false,
        message: 'No admin available to handle your request'
      });
    }
    
    // Find the primary admin's team
    // Assumption: An admin belongs to at least one team where they are admin.
    // In a more complex setup, you might need logic to choose which team if an admin manages multiple.
    const team = await Team.findOne({ 
      'members.userId': primaryAdmin._id,
      'members.role': 'admin'
    });
    
    if (!team) {
      return res.status(500).json({
        success: false,
        message: 'Primary admin team not found' // Changed message for clarity
      });
    }
    
    // Resume existing unresolved ticket for this customer by email
    const lastTicket = await Ticket.findOne({ customer: customer._id }).sort({ createdAt: -1 });
    if (lastTicket && !lastTicket.isResolved) {
      const existingChat = await Chat.findOne({ ticket: lastTicket._id });
      if (existingChat) {
        return res.status(200).json({
          success: true,
          data: {
            session: existingChat,
            ticket: lastTicket
          }
        });
      }
    }
    
    // Find ALL admins to assign the ticket to
    const allAdmins = await User.find({ role: 'admin' });
    const allAdminIds = allAdmins.map(admin => admin._id);
    
    // Create a new ticket
    const ticket = await Ticket.create({
      customer: customer._id,
      admin: primaryAdmin._id, // Still assign a primary admin (e.g., for reporting)
      assignedTo: allAdminIds, // Assign to ALL admins
      team: team._id,          // Assign to the primary admin's team
      subject: 'New Chat Request',
      description: `Chat initiated by ${name} (${email})`,
      status: 'open'
    });
    
    // Create a new chat session
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    // Get primary admin's chatbot config for missed chat timer
    console.log(`[CHAT CREATION] Looking for config for admin ${primaryAdmin._id}`);
    
    // Get ALL configs and log them for debugging
    const allConfigs = await Chatbot.find({}).lean();
    console.log(`[CHAT CREATION] Found ${allConfigs.length} total configs in database`);
    allConfigs.forEach((cfg, idx) => {
      console.log(`[CHAT CREATION] Config #${idx+1}: admin=${cfg.admin}, timer=${JSON.stringify(cfg.missedChatTimer)}`);
    });
    
    const chatbotConfig = await Chatbot.findOne({ admin: primaryAdmin._id });
    console.log(`[CHAT CREATION] Admin ID: ${primaryAdmin._id}, Found config: ${chatbotConfig ? 'YES' : 'NO'}`);
    
    // Convert hours, minutes, seconds to milliseconds
    let missedChatTimer = 600000; // Default 10 minutes
    
    if (chatbotConfig && chatbotConfig.missedChatTimer) {
      const { hours, minutes, seconds } = chatbotConfig.missedChatTimer;
      console.log(`[CHAT CREATION] Found config with timer: ${JSON.stringify(chatbotConfig.missedChatTimer)}`);
      const calculatedMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
      missedChatTimer = calculatedMs;
      console.log(`[CHAT CREATION] Setting missedChatTimer to ${missedChatTimer}ms (${hours}h:${minutes}m:${seconds}s)`);
    } else {
      console.log(`[CHAT CREATION] No custom timer found, using default ${missedChatTimer}ms`);
    }
    
    const chat = await Chat.create({
      ticket: ticket._id,
      customer: customer._id,
      admin: primaryAdmin._id, // Chat associated with the primary admin
      assignedTo: primaryAdmin._id, // Chat session initially assigned to primary admin
      sessionId,
      missedChatTimer,
      customerInfo: {
        name,
        email,
        phone: phone || ''
      }
    });
    
    res.status(201).json({
      success: true,
      data: {
        session: chat,
        ticket: ticket
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/chat/:sessionId
// @desc    Post a message to a chat session
// @access  Public
router.post('/:sessionId', async (req, res) => {
  try {
    const { message } = req.body;
    const { sessionId } = req.params;
    
    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
    // Find chat session
    const chat = await Chat.findOne({ sessionId })
      .populate('customer')
      .populate('admin')
      .populate('assignedTo');
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found'
      });
    }
    
    // Add message
    chat.messages.push({
      sender: chat.customer._id,
      content: message,
      timestamp: Date.now(),
      isRead: false
    });
    
    // Update the chat's missedChatTimer with the latest config value
    try {
      // Get ALL configs and log them for debugging
      const allConfigs = await Chatbot.find({}).lean();
      console.log(`[CHAT MESSAGE] Found ${allConfigs.length} total configs in database`);
      allConfigs.forEach((cfg, idx) => {
        console.log(`[CHAT MESSAGE] Config #${idx+1}: admin=${cfg.admin}, timer=${JSON.stringify(cfg.missedChatTimer)}`);
      });
      
      // Try to find config by exact admin ID
      const latestConfig = await Chatbot.findOne({ admin: chat.admin });
      console.log(`[CHAT MESSAGE] Checking for config for admin ${chat.admin}: ${latestConfig ? 'FOUND' : 'NOT FOUND'}`);
      
      // If no match by admin, try to get ANY config as fallback
      let configToUse = latestConfig;
      if (!configToUse) {
        configToUse = await Chatbot.findOne();
        console.log(`[CHAT MESSAGE] No config for this admin, using default config: ${configToUse ? 'FOUND' : 'NOT FOUND'}`);
      }
      
      if (configToUse && configToUse.missedChatTimer) {
        console.log(`[CHAT MESSAGE] Using config timer settings: ${JSON.stringify(configToUse.missedChatTimer)}`);
        const { hours, minutes, seconds } = configToUse.missedChatTimer;
        const updatedTimerMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
        chat.missedChatTimer = updatedTimerMs;
        console.log(`[CHAT MESSAGE] Updated missedChatTimer to ${chat.missedChatTimer}ms (${hours}h:${minutes}m:${seconds}s)`);
      } else {
        console.log(`[CHAT MESSAGE] No timer config found, keeping existing value: ${chat.missedChatTimer}ms`);
      }
    } catch (configError) {
      console.error('[CHAT MESSAGE] Error updating missedChatTimer from config:', configError);
      // Continue with existing timer if update fails
    }
    
    await chat.save();
    
    // Update ticket if needed
    const ticket = await Ticket.findById(chat.ticket);
    
    if (ticket && ticket.status === 'resolved') {
      ticket.status = 'open';
      ticket.isResolved = false;
      await ticket.save();
    }
    
    console.log(`[CHAT MESSAGE] Received message from customer in chat ${chat._id}, scheduling missed chat check in ${chat.missedChatTimer}ms`);
    
    // Schedule missed chat check
    setTimeout(async () => {
      try {
        console.log(`[MISSED CHAT] Checking chat ${chat._id} after ${chat.missedChatTimer}ms timeout`);
        // Get latest version of chat
        const updatedChat = await Chat.findById(chat._id);
        
        if (!updatedChat) {
          console.log(`[MISSED CHAT] Chat ${chat._id} no longer exists`);
          return;
        }
        
        // Find last message and check if it's from customer
        const lastMessage = updatedChat.messages[updatedChat.messages.length - 1];
        
        if (!lastMessage) {
          console.log(`[MISSED CHAT] Chat ${chat._id} has no messages`);
          return;
        }
        
        console.log(`[MISSED CHAT] Last message sender: ${lastMessage.sender.toString()}, Customer: ${chat.customer._id.toString()}`);
        
        // If last message is from customer and hasn't been replied to
        if (lastMessage.sender.toString() === chat.customer._id.toString()) {
          // Check if enough time has passed
          const messageTime = new Date(lastMessage.timestamp).getTime();
          const currentTime = Date.now();
          
          console.log(`[MISSED CHAT] Time passed: ${currentTime - messageTime}ms, Timer set to: ${chat.missedChatTimer}ms`);
          
          if (currentTime - messageTime >= chat.missedChatTimer) {
            console.log(`[MISSED CHAT] Marking chat ${chat._id} as missed`);
            // Mark as missed
            updatedChat.isMissed = true;
            updatedChat.missedAt = Date.now();
            
            // Add system message
            updatedChat.messages.push({
              sender: chat.admin._id,
              content: 'Replying to missed chat',
              isSystem: true,
              isMissedChatNotification: true,
              timestamp: Date.now(),
              isRead: true
            });
            
            await updatedChat.save();
            console.log(`[MISSED CHAT] Chat ${chat._id} marked as missed with notification message`);
          } else {
            console.log(`[MISSED CHAT] Not enough time has passed for chat ${chat._id}`);
          }
        } else {
          console.log(`[MISSED CHAT] Last message is not from customer for chat ${chat._id}`);
        }
      } catch (error) {
        console.error('[MISSED CHAT] Error in missed chat timer:', error);
      }
    }, chat.missedChatTimer);
    
    const newMessage = chat.messages[chat.messages.length - 1];
    
    res.status(200).json({
      success: true,
      data: {
        message: newMessage,
        chat: {
          id: chat._id,
          sessionId: chat.sessionId
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/chat/:sessionId/messages
// @desc    Get all messages for a chat session
// @access  Public (uses sessionId)
router.get('/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { since } = req.query; // Get optional 'since' query param
    // Find chat session with ticket info for authorization
    const chat = await Chat.findOne({ sessionId }).populate('ticket');
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found'
      });
    }

    // Fetch full chat with populated messages
    const fullChat = await Chat.findOne({ sessionId })
      .populate('messages.sender', 'firstName lastName username role');
    
    if (!fullChat) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found when fetching messages'
      });
    }
    
    // Filter messages if 'since' is provided
    let messagesToReturn = fullChat.messages;
    if (since) {
      const sinceDate = new Date(since);
      messagesToReturn = messagesToReturn.filter(msg => new Date(msg.timestamp) > sinceDate);
    }

    res.status(200).json({
      success: true,
      data: {
        chatId: fullChat._id,
        sessionId: fullChat.sessionId,
        messages: messagesToReturn // Return potentially filtered messages
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/chat/admin
// @desc    Get all chats for admin
// @access  Private (Admin only)
router.get('/admin', protect, authorize('admin'), async (req, res) => {
  try {
    // Find all teams where the user is an admin
    const adminTeams = await Team.find({
      'members.userId': req.user._id,
      'members.role': 'admin'
    });
    const teamIds = adminTeams.map(team => team._id);

    // Find all tickets belonging to these teams
    const ticketsInAdminTeams = await Ticket.find({ team: { $in: teamIds } }).select('_id');
    const ticketIds = ticketsInAdminTeams.map(ticket => ticket._id);

    // Find all chats linked to these tickets
    const chats = await Chat.find({ ticket: { $in: ticketIds } })
      .populate('customer', 'firstName lastName email phone')
      .populate('assignedTo', 'firstName lastName username') // Keep assignedTo for display
      .populate('admin', 'firstName lastName username') // Keep primary admin for display/context
      .populate({
        path: 'ticket',
        select: 'ticketNumber status isResolved _id' // Ensure _id is selected
      })
      // Removed sender population here, might be too much data for list view
      .sort({ lastActivity: -1 });
    
    // Map to simplified output
    const output = chats.map(chat => {
      // Build display name for customer
      const name = chat.customerInfo?.name 
        || `${chat.customer.firstName} ${chat.customer.lastName}`;
      // Customer email and phone
      const email = chat.customerInfo?.email || chat.customer.email || '';
      const phone = chat.customerInfo?.phone || chat.customer.phone || '';
      // Last user message
      const lastMsgObj = chat.messages && chat.messages.length > 0 
        ? chat.messages[chat.messages.length - 1] : null;
      const message = lastMsgObj ? lastMsgObj.content : '';
      return {
        id: chat.sessionId,
        name,
        email,
        phone,
        message,
        ticket: chat.ticket,
        assignedTo: chat.assignedTo,
        isMissed: chat.isMissed
      };
    });
    
    res.status(200).json({
      success: true,
      count: output.length,
      data: output
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/chat/assigned
// @desc    Get all chats assigned to user
// @access  Private
router.get('/assigned', protect, async (req, res) => {
  try {
    // Find all chats assigned to this user
    const chats = await Chat.find({ assignedTo: req.user._id })
      .populate('customer', 'firstName lastName email phone')
      .populate('admin', 'firstName lastName username')
      .populate({
        path: 'ticket',
        select: 'ticketNumber status isResolved'
      })
      .sort({ lastActivity: -1 });
    
    // Map to same output shape as admin route for consistency
    const output = chats.map(chat => {
      const name = chat.customerInfo?.name
        || `${chat.customer.firstName} ${chat.customer.lastName}`;
      const email = chat.customerInfo?.email || chat.customer.email || '';
      const phone = chat.customerInfo?.phone || chat.customer.phone || '';
      const lastMsgObj = chat.messages && chat.messages.length > 0
        ? chat.messages[chat.messages.length - 1]
        : null;
      const message = lastMsgObj ? lastMsgObj.content : '';
      return {
        id: chat.sessionId,
        name,
        email,
        phone,
        message,
        ticket: chat.ticket,
        assignedTo: chat.assignedTo,
        isMissed: chat.isMissed
      };
    });
    res.status(200).json({
      success: true,
      count: output.length,
      data: output
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;