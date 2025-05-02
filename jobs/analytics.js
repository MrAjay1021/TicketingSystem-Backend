import cron from 'node-cron';
import User from '../models/User.js';
import Ticket from '../models/Ticket.js';
import Chat from '../models/Chat.js';
import Analytics from '../models/Analytics.js';

// Collect and store daily stats for one admin
async function aggregateAnalyticsForAdmin(adminId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find today's ticket activity
    const tickets = await Ticket.find({
      admin: adminId,
      $or: [
        { createdAt: { $gte: today } },
        { updatedAt: { $gte: today } }
      ]
    });
    
    // Find today's chat activity
    const chats = await Chat.find({
      admin: adminId,
      lastActivity: { $gte: today }
    });
    
    // Count resolved tickets from today
    const resolvedTickets = tickets.filter(ticket => 
      ticket.isResolved && ticket.resolvedAt >= today
    );
    
    // Count missed chat opportunities
    const missedChats = chats.filter(chat => chat.isMissed);
    
    // Calculate average first response time
    let totalResponseTime = 0;
    let responseCount = 0;
    
    for (const chat of chats) {
      if (chat.firstResponseTime && chat.lastActivity >= today) {
        totalResponseTime += chat.firstResponseTime;
        responseCount++;
      }
    }
    
    const averageResponseTime = responseCount > 0 ? 
      totalResponseTime / responseCount : 0;
    
    // Calculate how fast tickets are resolved
    let totalResolutionTime = 0;
    
    for (const ticket of resolvedTickets) {
      totalResolutionTime += ticket.resolutionTime;
    }
    
    const averageResolutionTime = resolvedTickets.length > 0 ? 
      totalResolutionTime / resolvedTickets.length : 0;
    
    // Get team member list
    const teamMembers = await User.find({
      adminId,
      role: 'team_member'
    });
    
    // Track individual team member performance
    const teamPerformance = [];
    
    for (const member of teamMembers) {
      const memberResolvedTickets = resolvedTickets.filter(
        ticket => ticket.resolvedBy && ticket.resolvedBy.toString() === member._id.toString()
      );
      
      const memberChats = chats.filter(
        chat => chat.assignedTo.toString() === member._id.toString()
      );
      
      let memberResponseTime = 0;
      let memberResponseCount = 0;
      
      for (const chat of memberChats) {
        if (chat.firstResponseTime && chat.lastActivity >= today) {
          memberResponseTime += chat.firstResponseTime;
          memberResponseCount++;
        }
      }
      
      const memberAverageResponseTime = memberResponseCount > 0 ? 
        memberResponseTime / memberResponseCount : 0;
      
      teamPerformance.push({
        teamMember: member._id,
        resolvedTickets: memberResolvedTickets.length,
        averageResponseTime: memberAverageResponseTime
      });
    }
    
    // Save analytics to database
    await Analytics.findOneAndUpdate(
      { admin: adminId, date: today },
      {
        admin: adminId,
        date: today,
        metrics: {
          totalChats: chats.length,
          missedChats: missedChats.length,
          resolvedTickets: resolvedTickets.length,
          unresolvedTickets: tickets.length - resolvedTickets.length,
          averageResponseTime,
          averageResolutionTime
        },
        teamPerformance
      },
      { upsert: true, new: true }
    );
    
    console.log(`Analytics aggregated for admin ${adminId}`);
    return true;
  } catch (error) {
    console.error(`Error aggregating analytics for admin ${adminId}:`, error);
    return false;
  }
}

// Run analytics for all admins in the system
export async function aggregateAnalyticsForAllAdmins() {
  try {
    const admins = await User.find({ role: 'admin' });
    
    console.log(`Running analytics aggregation for ${admins.length} admins`);
    
    const results = await Promise.all(
      admins.map(admin => aggregateAnalyticsForAdmin(admin._id))
    );
    
    const successCount = results.filter(result => result).length;
    console.log(`Analytics aggregation completed: ${successCount}/${admins.length} successful`);
    
    return {
      success: true,
      totalAdmins: admins.length,
      successfulAggregations: successCount
    };
  } catch (error) {
    console.error('Error in analytics aggregation job:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Create daily metrics at midnight
export function scheduleAnalyticsJob() {
  // Run at midnight (00:00) every day
  cron.schedule('0 0 * * *', async () => {
    console.log('Running scheduled analytics aggregation job');
    await aggregateAnalyticsForAllAdmins();
  });
  
  console.log('Analytics aggregation job scheduled');
}