import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import { Chat } from '../models/index.js';

const router = express.Router();

// @route   GET /api/analytics/overview
// @desc    Get overview analytics (ticket counts by status, response times, etc)
// @access  Private (Admin and Team Members)
router.get('/overview', protect, authorize('admin', 'team_member'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Create date range filter
    const dateFilter = {};
    if (startDate) {
      dateFilter.createdAt = { $gte: new Date(startDate) };
    }
    if (endDate) {
      dateFilter.createdAt = { ...dateFilter.createdAt, $lte: new Date(endDate) };
    }
    
    // Determine filter based on role and admin status
    let roleFilter;
    if (req.user.role === 'team_member') {
      // Regular team members see only their assigned tickets
      roleFilter = { assignedTo: req.user._id };
    } else {
      // Admin role - check if parent admin or team admin
      const user = await User.findById(req.user.id);
      if (user.adminId) {
        // Team admin should see tickets from parent admin
        roleFilter = { admin: user.adminId };
      } else {
        // Parent admin sees their own tickets
        roleFilter = { admin: req.user.id };
      }
    }
    
    // Build the final query
    const query = {
      ...dateFilter,
      ...roleFilter
    };
    
    // Get tickets by status
    const statusCounts = await Ticket.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Format status counts
    const ticketsByStatus = {
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0
    };
    
    statusCounts.forEach(item => {
      ticketsByStatus[item._id] = item.count;
    });
    
    // Get tickets by priority
    const priorityCounts = await Ticket.aggregate([
      { $match: query },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);
    
    // Format priority counts
    const ticketsByPriority = {
      low: 0,
      medium: 0,
      high: 0,
      urgent: 0
    };
    
    priorityCounts.forEach(item => {
      ticketsByPriority[item._id] = item.count;
    });
    
    // Get average resolution time
    const resolutionData = await Ticket.aggregate([
      { 
        $match: { 
          ...query,
          isResolved: true,
          resolutionTime: { $exists: true, $gt: 0 }
        } 
      },
      { 
        $group: { 
          _id: null, 
          avgResolutionTime: { $avg: '$resolutionTime' },
          minResolutionTime: { $min: '$resolutionTime' },
          maxResolutionTime: { $max: '$resolutionTime' }
        } 
      }
    ]);
    
    const resolutionTimes = resolutionData.length > 0 ? {
      average: Math.round(resolutionData[0].avgResolutionTime / (1000 * 60 * 60)), // Convert to hours
      minimum: Math.round(resolutionData[0].minResolutionTime / (1000 * 60 * 60)),
      maximum: Math.round(resolutionData[0].maxResolutionTime / (1000 * 60 * 60))
    } : {
      average: 0,
      minimum: 0,
      maximum: 0
    };
    
    // Get total ticket count
    const totalTickets = await Ticket.countDocuments(query);
    
    // Get resolved ticket count
    const resolvedTickets = await Ticket.countDocuments({
      ...query,
      isResolved: true
    });
    
    // Calculate resolution rate
    const resolutionRate = totalTickets > 0 ? 
      Math.round((resolvedTickets / totalTickets) * 100) : 0;
    
    res.status(200).json({
      success: true,
      data: {
        totalTickets,
        resolvedTickets,
        resolutionRate,
        ticketsByStatus,
        ticketsByPriority,
        resolutionTimes
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/analytics/team-performance
// @desc    Get performance metrics for team members
// @access  Private (Admin only)
router.get('/team-performance', protect, authorize('admin'), async (req, res) => {
  try {
    // Find team members - for team admins, find members with same parent admin
    const user = await User.findById(req.user.id);
    const adminId = user.adminId || req.user.id; // Use parent admin id or self if parent admin
    
    const teamMembers = await User.find({ 
      adminId: adminId,
      role: 'team_member'
    });
    
    const teamPerformance = [];
    
    // Get stats for each team member
    for (const member of teamMembers) {
      // Get tickets assigned to this team member
      const totalAssigned = await Ticket.countDocuments({
        assignedTo: member._id
      });
      
      // Get resolved tickets
      const resolved = await Ticket.countDocuments({
        assignedTo: member._id,
        isResolved: true
      });
      
      // Calculate resolution rate
      const resolutionRate = totalAssigned > 0 ? 
        Math.round((resolved / totalAssigned) * 100) : 0;
      
      // Get average resolution time
      const resolutionData = await Ticket.aggregate([
        { 
          $match: { 
            assignedTo: member._id,
            isResolved: true,
            resolutionTime: { $exists: true, $gt: 0 }
          } 
        },
        { 
          $group: { 
            _id: null, 
            avgResolutionTime: { $avg: '$resolutionTime' }
          } 
        }
      ]);
      
      const avgResolutionTime = resolutionData.length > 0 ? 
        Math.round(resolutionData[0].avgResolutionTime / (1000 * 60 * 60)) : 0; // Convert to hours
      
      teamPerformance.push({
        id: member._id,
        name: `${member.firstName} ${member.lastName}`,
        email: member.email,
        totalAssigned,
        resolved,
        resolutionRate,
        avgResolutionTime
      });
    }
    
    res.status(200).json({
      success: true,
      data: teamPerformance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/analytics/customer-satisfaction
// @desc    Get customer satisfaction metrics
// @access  Private (Admin only)
router.get('/customer-satisfaction', protect, authorize('admin'), async (req, res) => {
  try {
    // This would typically come from feedback data
    // For now, we'll return placeholder data
    
    res.status(200).json({
      success: true,
      data: {
        averageRating: 4.2,
        totalFeedback: 45,
        ratingDistribution: {
          5: 18,
          4: 20,
          3: 5,
          2: 1,
          1: 1
        },
        recentFeedback: [
          {
            id: 'f1',
            customer: 'John Doe',
            rating: 5,
            comment: 'Issue was resolved very quickly. Excellent service!'
          },
          {
            id: 'f2',
            customer: 'Jane Smith',
            rating: 4,
            comment: 'Good communication throughout the process.'
          },
          {
            id: 'f3',
            customer: 'Bob Johnson',
            rating: 3,
            comment: 'Solution worked but took longer than expected.'
          }
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/analytics/missed-chats
// @desc    Get count of missed chats
// @access  Private (Admin and Team Members)
router.get('/missed-chats', protect, authorize('admin', 'team_member'), async (req, res) => {
  try {
    // Determine filter based on role and admin status
    let filter;
    if (req.user.role === 'team_member') {
      // Regular team members see only their assigned chats
      filter = { assignedTo: req.user._id };
    } else {
      // Admin role - check if parent admin or team admin
      const user = await User.findById(req.user.id);
      if (user.adminId) {
        // Team admin should see chats from parent admin
        filter = { admin: user.adminId };
      } else {
        // Parent admin sees their own chats
        filter = { admin: req.user._id };
      }
    }
    // Count missed chats
    const missedChatsCount = await Chat.countDocuments({ ...filter, isMissed: true });
    // Get total chats count
    const totalChats = await Chat.countDocuments(filter);
    
    const percentage = totalChats > 0 ? (missedChatsCount / totalChats) * 100 : 0;
    
    res.status(200).json({
      success: true,
      data: {
        count: missedChatsCount,
        total: totalChats,
        percentage: percentage.toFixed(2)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/analytics/response-time
// @desc    Get average response time
// @access  Private (Admin and Team Members)
router.get('/response-time', protect, authorize('admin', 'team_member'), async (req, res) => {
  try {
    // Determine filter based on role: team members see assigned chats, admins see all their chats
    let filter;
    if (req.user.role === 'team_member') {
      // Regular team members see only their assigned chats
      filter = { assignedTo: req.user._id };
    } else {
      // Admin role - check if parent admin or team admin
      const user = await User.findById(req.user.id);
      if (user.adminId) {
        // Team admin should see chats from parent admin
        filter = { admin: user.adminId };
      } else {
        // Parent admin sees their own chats
        filter = { admin: req.user._id };
      }
    }
    
    // Get filtered chats with response time data
    const chats = await Chat.find({
      ...filter,
      firstResponseTime: { $exists: true, $ne: null }
    });
    
    if (chats.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          averageResponseTime: 0,
          averageResponseTimeFormatted: '0 mins',
          count: 0
        }
      });
    }
    
    // Calculate average response time
    let totalResponseTime = 0;
    let count = 0;
    
    chats.forEach(chat => {
      if (chat.firstResponseTime) {
        totalResponseTime += chat.firstResponseTime;
        count++;
      }
    });
    
    const averageResponseTime = count > 0 ? totalResponseTime / count : 0;
    
    // Format response time for display
    const minutes = Math.floor(averageResponseTime / 60000);
    const seconds = Math.floor((averageResponseTime % 60000) / 1000);
    
    const averageResponseTimeFormatted = minutes > 0 
      ? `${minutes} min${minutes !== 1 ? 's' : ''} ${seconds} sec${seconds !== 1 ? 's' : ''}`
      : `${seconds} sec${seconds !== 1 ? 's' : ''}`;
    
    res.status(200).json({
      success: true,
      data: {
        averageResponseTime,
        averageResponseTimeFormatted,
        count
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/analytics/tickets-by-status
// @desc    Get ticket counts by status
// @access  Private (Admin only)
router.get('/tickets-by-status', protect, authorize('admin'), async (req, res) => {
  try {
    // Count tickets by status
    const ticketStatusCounts = await Ticket.aggregate([
      { $match: { admin: req.user._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Format for chart data
    const statusData = {
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0
    };
    
    ticketStatusCounts.forEach(status => {
      if (status._id in statusData) {
        statusData[status._id] = status.count;
      }
    });
    
    // Get total count
    const totalTickets = await Ticket.countDocuments({ admin: req.user._id });
    
    // Format for chart data
    const chartData = Object.keys(statusData).map(key => ({
      name: key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: statusData[key],
      percentage: totalTickets > 0 ? ((statusData[key] / totalTickets) * 100).toFixed(2) : 0
    }));
    
    res.status(200).json({
      success: true,
      data: {
        statuses: statusData,
        chart: chartData,
        total: totalTickets
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/analytics/total-chats
// @desc    Get total chats count
// @access  Private (Admin and Team Members)
router.get('/total-chats', protect, authorize('admin', 'team_member'), async (req, res) => {
  try {
    // Get date range parameters
    const { start, end } = req.query;
    const startDate = start ? new Date(start) : new Date(0); // Default to epoch
    const endDate = end ? new Date(end) : new Date(); // Default to now
    
    // Determine filter based on role and admin status
    let filter;
    if (req.user.role === 'team_member') {
      // Regular team members see only their assigned chats
      filter = { assignedTo: req.user._id };
    } else {
      // Admin role - check if parent admin or team admin
      const user = await User.findById(req.user.id);
      if (user.adminId) {
        // Team admin should see chats from parent admin
        filter = { admin: user.adminId };
      } else {
        // Parent admin sees their own chats
        filter = { admin: req.user._id };
      }
    }
    
    // Count total chats
    const totalChats = await Chat.countDocuments({
      ...filter,
      createdAt: { $gte: startDate, $lte: endDate }
    });
    
    // Get chat count by day for timeline
    const chatsByDay = await Chat.aggregate([
      { 
        $match: { 
          ...filter,
          createdAt: { $gte: startDate, $lte: endDate }
        } 
      },
      {
        $group: {
          _id: { 
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } 
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        total: totalChats,
        timeline: chatsByDay.map(day => ({
          date: day._id,
          count: day.count
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router; 