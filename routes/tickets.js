import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { Ticket, User, Chat, Team } from '../models/index.js';

const router = express.Router();

// Get all tickets with optional filters
router.get('/', protect, async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};
    
    // If status is provided, add it to the filter
    if (status) {
      if (status === 'unresolved') {
        // Unresolved only includes open tickets
        filter.status = 'open';
      } else if (status === 'resolved') {
        filter.status = 'resolved';
      }
      // ignore other statuses if not used
    }
    
    if (req.user.role === 'admin') {
      // Admin: Find all teams where the user is an admin
      const adminTeams = await Team.find({
        'members.userId': req.user._id,
        'members.role': 'admin'
      });
      
      // Get array of team IDs
      const teamIds = adminTeams.map(team => team._id);
      
      // Filter tickets by these teams (Admins see all tickets in their teams)
      filter.team = { $in: teamIds };
    } else {
      // Non-Admin: Find the team the user belongs to
      const userTeam = await Team.findOne({
        'members.userId': req.user._id
      });
      
      if (!userTeam) {
        // User is not part of any team
        return res.status(200).json({
          success: true,
          count: 0,
          data: []
        });
      }
      
      // Filter tickets by their team AND assigned to them
      filter.team = userTeam._id;
      filter.assignedTo = req.user._id;
    }
    
    const tickets = await Ticket.find(filter)
      .populate('customer', 'firstName lastName email phone')
      .populate('assignedTo', 'firstName lastName username')
      .populate('team', 'name')
      .sort({ createdAt: -1 });
    
    // For each ticket, fetch its latest chat message
    const ticketsWithLastMessage = await Promise.all(
      tickets.map(async ticket => {
        // Find chat document for this ticket
        const chat = await Chat.findOne({ ticket: ticket._id });
        let lastMessage = null;
        if (chat && chat.messages && chat.messages.length > 0) {
          const msg = chat.messages[chat.messages.length - 1];
          lastMessage = msg.content;
        }
        return {
          ...ticket.toObject(),
          lastMessage
        };
      })
    );
    res.status(200).json({
      success: true,
      count: ticketsWithLastMessage.length,
      data: ticketsWithLastMessage
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get ticket details by ID
router.get('/:id', protect, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('customer', 'firstName lastName email phone')
      .populate('assignedTo', 'firstName lastName username')
      .populate('team', 'name');
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    // Check if user has access to this ticket based on team membership
    let isAuthorized = false;
    if (req.user.role === 'admin') {
      // Admin: Check if they are an admin member of the ticket's team
      isAuthorized = await Team.exists({
        _id: ticket.team,
        'members.userId': req.user._id,
        'members.role': 'admin'
      });
    } else {
      // Non-Admin: Check if they are a member of the ticket's team AND the ticket is assigned to them
      const isTeamMember = await Team.exists({
        _id: ticket.team,
        'members.userId': req.user._id
      });
      // Ensure assignedTo is treated as an array and check if user ID is included
      const isAssigned = Array.isArray(ticket.assignedTo) 
                         ? ticket.assignedTo.some(assignee => assignee._id.toString() === req.user._id.toString())
                         : ticket.assignedTo?.toString() === req.user._id.toString(); // Fallback for single assignment

      isAuthorized = isTeamMember && isAssigned;
    }

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this ticket'
      });
    }
    
    // Get associated chat
    const chat = await Chat.findOne({ ticket: ticket._id })
      .populate('messages.sender', 'firstName lastName username role');
    
    res.status(200).json({
      success: true,
      data: {
        ticket,
        chat: chat || null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Reply to a ticket
router.post('/:id/reply', protect, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    // Check if user has access to this ticket
    if (req.user.role !== 'admin' && 
        ticket.assignedTo.toString() !== req.user._id.toString() &&
        ticket.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this ticket'
      });
    }
    
    // Get or create chat
    let chat = await Chat.findOne({ ticket: ticket._id });
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat for this ticket not found'
      });
    }
    
    // Add message to chat
    chat.messages.push({
      sender: req.user._id,
      content: message,
      timestamp: Date.now(),
      isRead: false
    });
    
    // Update ticket status if it was previously open
    if (ticket.status === 'open') {
      ticket.status = 'in_progress';
      await ticket.save();
    }
    
    await chat.save();
    
    // Populate the sender details for the new message
    const updatedChat = await Chat.findById(chat._id)
      .populate('messages.sender', 'firstName lastName username role');
    
    const newMessage = updatedChat.messages[updatedChat.messages.length - 1];
    
    res.status(200).json({
      success: true,
      data: {
        message: newMessage,
        ticket
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Reassign ticket to different team members
router.put('/:id/reassign', protect, authorize('admin'), async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Check if user exists
    const assignee = await User.findById(userId);
    
    if (!assignee) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Only admin or team member are valid assignees
    if (assignee.role !== 'admin' && assignee.role !== 'team_member') {
      return res.status(400).json({
        success: false,
        message: 'Cannot assign ticket to a customer'
      });
    }
    
    // Find ticket
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    // Commented out owner-only restriction so any admin can reassign tickets
    // // Only admin can reassign tickets
    // if (ticket.admin.toString() !== req.user._id.toString()) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Not authorized to reassign this ticket'
    //   });
    // }
    
    // Update ticket
    ticket.assignedTo = userId;
    await ticket.save();
    
      // Update associated chat: reassign and add system message
    const chat = await Chat.findOne({ ticket: ticket._id });
    if (chat) {
      chat.assignedTo = userId;
      chat.messages.push({
        sender: req.user._id,
        content: `Ticket reassigned to ${assignee.firstName} ${assignee.lastName}`,
        isSystem: true,
        timestamp: Date.now(),
        isRead: true
      });
      await chat.save();
    }
    
    // Populate updated data
    const updatedTicket = await Ticket.findById(req.params.id)
      .populate('customer', 'firstName lastName email phone')
      .populate('assignedTo', 'firstName lastName username')
      .populate('admin', 'firstName lastName username');
    
    res.status(200).json({
      success: true,
      data: updatedTicket
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update ticket status
router.put('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status || !['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required (open, in_progress, resolved, closed)'
      });
    }
    
    // Find ticket
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    
    // Check if user has access to update this ticket
    if (req.user.role !== 'admin' && 
        ticket.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this ticket'
      });
    }
    
    // Update ticket status
    ticket.status = status;
    
    // If status is resolved, set resolved fields
    if (status === 'resolved' || status === 'closed') {
      ticket.isResolved = true;
      ticket.resolvedAt = Date.now();
      ticket.resolvedBy = req.user._id;
      
      if (ticket.createdAt) {
        ticket.resolutionTime = Date.now() - new Date(ticket.createdAt).getTime();
      }
    } else {
      ticket.isResolved = false;
      ticket.resolvedAt = undefined;
      ticket.resolvedBy = undefined;
      ticket.resolutionTime = 0;
    }
    
    await ticket.save();
    
    // Add system message about status change
    const chat = await Chat.findOne({ ticket: ticket._id });
    
    if (chat) {
      chat.messages.push({
        sender: req.user._id,
        content: `Ticket status changed to ${status}`,
        isSystem: true,
        timestamp: Date.now(),
        isRead: true
      });
      
      await chat.save();
    }
    
    // Populate updated data
    const updatedTicket = await Ticket.findById(req.params.id)
      .populate('customer', 'firstName lastName email phone')
      .populate('assignedTo', 'firstName lastName username')
      .populate('admin', 'firstName lastName username')
      .populate('resolvedBy', 'firstName lastName username');
    
    res.status(200).json({
      success: true,
      data: updatedTicket
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get ticket messages history
router.get('/:id/messages', protect, async (req, res) => {
  try {
    const { since } = req.query;
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }
    // Authorization logic
    if (req.user.role === 'admin') {
      const isTeamAdmin = await Team.exists({
        _id: ticket.team,
        'members.userId': req.user._id,
        'members.role': 'admin'
      });
      if (!isTeamAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access messages for this ticket'
        });
      }
    } else {
      // Non-admin users can access messages if they are assigned to this ticket
      const assignedIds = Array.isArray(ticket.assignedTo)
        ? ticket.assignedTo.map(id => id.toString())
        : [ticket.assignedTo?.toString()];
      if (!assignedIds.includes(req.user._id.toString())) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access messages for this ticket'
        });
      }
    }
    const chat = await Chat.findOne({ ticket: ticket._id })
      .populate('messages.sender', 'firstName lastName username role');
    if (!chat) {
      return res.status(200).json({
        success: true,
        data: []
      });
    }
    let messages = chat.messages;
    if (since) {
      const sinceDate = new Date(since);
      messages = messages.filter(msg => new Date(msg.timestamp) > sinceDate);
    }
    res.status(200).json({
      success: true,
      data: messages
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;