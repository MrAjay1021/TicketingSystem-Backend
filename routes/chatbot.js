import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { User, Ticket, Chat, Chatbot } from '../models/index.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// @route   POST /api/bot/message
// @desc    Process a message through the chatbot
// @access  Private
router.post('/message', protect, async (req, res) => {
  try {
    const { message, ticketId } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
    // Simple response logic - in a real app this would connect to an AI service
    const botResponse = {
      text: `Thanks for your message: "${message}". Our team will get back to you soon.`,
      timestamp: new Date(),
      isBot: true
    };
    
    // If a ticket ID is provided, add this interaction to the chat history
    if (ticketId) {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }
      
      // Add the bot response to the chat
      await Chat.findOneAndUpdate(
        { ticket: ticketId },
        { 
          $push: { 
            messages: {
              sender: null, // Null sender indicates bot
              content: botResponse.text,
              isBot: true
            } 
          } 
        }
      );
    }
    
    res.status(200).json({
      success: true,
      response: botResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/chatbot/suggestions
// @desc    Get ticket resolution suggestions
// @access  Private (Admin and Team Members only)
router.get('/suggestions/:ticketId', protect, authorize('admin', 'team_member'), async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.ticketId)
      .populate('customer', 'firstName lastName email');
      
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    // Get chat history for context
    const chat = await Chat.findOne({ ticket: ticket._id });
    
    // Generate suggestions based on ticket and chat
    // This would typically integrate with an AI service
    const suggestions = [
      {
        text: `Consider checking if ${ticket.customer.firstName} has the latest version of the software.`,
        confidence: 0.85
      },
      {
        text: "Ask for more details about the exact steps to reproduce the issue.",
        confidence: 0.72
      },
      {
        text: "Offer a screen sharing session to diagnose the problem faster.",
        confidence: 0.65
      }
    ];
    
    res.status(200).json({
      success: true,
      suggestions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/chatbot/feedback
// @desc    Submit feedback on chatbot responses
// @access  Private
router.post('/feedback', protect, async (req, res) => {
  try {
    const { responseId, helpful, comments } = req.body;
    
    if (!responseId) {
      return res.status(400).json({
        success: false,
        message: 'Response ID is required'
      });
    }
    
    // In a real app, this would store feedback for improving the chatbot
    // Here we'll just acknowledge the feedback
    
    res.status(200).json({
      success: true,
      message: 'Feedback received, thank you!',
      data: {
        responseId,
        helpful,
        comments
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/bot/config
// @desc    Get chatbot configuration
// @access  Public
router.get('/config', async (req, res) => {
  try {
    console.log('[BOT CONFIG] Getting chatbot configuration');
    
    // Extract admin ID from authorization header if present
    let requestedAdminId = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // If user is logged in, get user details
        if (decoded.id) {
          const user = await User.findById(decoded.id);
          if (user) {
            // For team admins, use their parent admin's ID
            requestedAdminId = user.role === 'admin' && user.adminId ? user.adminId : user._id;
            console.log(`[BOT CONFIG] User authenticated, effective admin ID: ${requestedAdminId}`);
          }
        }
      } catch (error) {
        console.log('[BOT CONFIG] Token verification failed:', error.message);
      }
    }
    
    // Get ALL configs and log them for debugging
    const allConfigs = await Chatbot.find({}).lean();
    console.log(`[BOT CONFIG] Found ${allConfigs.length} total configs in database`);
    allConfigs.forEach((cfg, idx) => {
      console.log(`[BOT CONFIG] Config #${idx+1}: admin=${cfg.admin}, timer=${JSON.stringify(cfg.missedChatTimer)}`);
    });
    
    // Try to find config for the authenticated admin first
    let config = null;
    if (requestedAdminId) {
      config = await Chatbot.findOne({ admin: requestedAdminId });
      console.log(`[BOT CONFIG] Searched for config with admin ${requestedAdminId}: ${config ? 'FOUND' : 'NOT FOUND'}`);
    }
    
    // Fallback to any config if no admin-specific one found
    if (!config) {
      config = await Chatbot.findOne();
      console.log(`[BOT CONFIG] Using fallback config: ${config ? 'FOUND' : 'NOT FOUND'}`);
    }
    
    // If still no config found, return 404
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Chatbot configuration not found.'
      });
    }
    
    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/bot/config
// @desc    Update chatbot configuration
// @access  Private (Admin only)
router.post('/config', protect, authorize('admin'), async (req, res) => {
  try {
    const { 
      welcomeMessage, 
      headerColor, 
      backgroundColor, 
      missedChatTimer,
      promptMessages,
      introductionForm
    } = req.body;
    
    console.log('[BOT CONFIG] Received config update request:');
    console.log('[BOT CONFIG] missedChatTimer:', JSON.stringify(missedChatTimer));
    console.log(`[BOT CONFIG] User ID (admin): ${req.user._id}`);
    
    // Get ALL configs and log them for debugging
    const allConfigs = await Chatbot.find({}).lean();
    console.log(`[BOT CONFIG] Found ${allConfigs.length} total configs in database`);
    allConfigs.forEach((cfg, idx) => {
      console.log(`[BOT CONFIG] Config #${idx+1}: admin=${cfg.admin}, timer=${JSON.stringify(cfg.missedChatTimer)}`);
    });
    
    // Determine the correct admin ID to use
    const user = await User.findById(req.user._id);
    const adminId = user.adminId || req.user._id; // Use parent admin ID if team admin, otherwise use own ID
    console.log(`[BOT CONFIG] Effective admin ID: ${adminId}`);
    
    // Find config for THIS admin
    let config = await Chatbot.findOne({ admin: adminId });
    console.log(`[BOT CONFIG] Found existing config for current admin: ${config ? 'YES' : 'NO'}`);
    if (config) {
      console.log(`[BOT CONFIG] Config admin: ${config.admin}`);
    }
    
    if (!config) {
      // Create new config with provided data
      console.log(`[BOT CONFIG] Creating new config for admin: ${adminId}`);
      
      config = await Chatbot.create({
        admin: adminId,
        welcomeMessage: welcomeMessage || 'How can I help you? Ask me anything!',
        headerColor: headerColor || '#334758',
        backgroundColor: backgroundColor || '#EEEEEE',
        missedChatTimer: missedChatTimer || {
          hours: 0,
          minutes: 10,
          seconds: 0
        },
        promptMessages: promptMessages || [],
        introductionForm: introductionForm || {
          enabled: true,
          fields: [
            { name: 'name', required: true, label: 'Name' },
            { name: 'email', required: true, label: 'Email' },
            { name: 'phone', required: false, label: 'Phone' }
          ],
          submitButtonText: 'Start Chat'
        }
      });
    } else {
      // Update existing config
      if (welcomeMessage !== undefined) config.welcomeMessage = welcomeMessage;
      if (headerColor !== undefined) config.headerColor = headerColor;
      if (backgroundColor !== undefined) config.backgroundColor = backgroundColor;
      
      if (missedChatTimer !== undefined) {
        const oldTimer = { ...config.missedChatTimer };
        config.missedChatTimer = {
          hours: missedChatTimer.hours ?? 0,
          minutes: missedChatTimer.minutes ?? 0,
          seconds: missedChatTimer.seconds ?? 0
        };
        console.log('[BOT CONFIG] Updating timer:');
        console.log(`[BOT CONFIG] Old timer: ${JSON.stringify(oldTimer)}`);
        console.log(`[BOT CONFIG] New timer: ${JSON.stringify(config.missedChatTimer)}`);
      }
      
      if (promptMessages !== undefined) config.promptMessages = promptMessages;
      
      if (introductionForm !== undefined) {
        config.introductionForm = {
          enabled: introductionForm.enabled !== undefined ? introductionForm.enabled : true,
          fields: introductionForm.fields || [
            { name: 'name', required: true, label: 'Name' },
            { name: 'email', required: true, label: 'Email' },
            { name: 'phone', required: false, label: 'Phone' }
          ],
          submitButtonText: introductionForm.submitButtonText || 'Start Chat'
        };
      }
      
      await config.save();
      console.log('[BOT CONFIG] Configuration saved successfully');
    }
    
    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router; 