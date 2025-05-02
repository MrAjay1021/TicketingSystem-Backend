import mongoose from 'mongoose';

// Database optimization utilities for common operations

// Cursor pagination for better performance than offset
export async function paginateTickets(query, limit = 10, lastId = null) {
  // Add ID filter for pagination
  if (lastId) {
    query._id = { $lt: new mongoose.Types.ObjectId(lastId) };
  }
  
  // Get one extra record to check for more pages
  const tickets = await mongoose.models.Ticket.find(query)
    .sort({ _id: -1 }) // Newest first
    .limit(limit + 1)
    .lean(); // Plain objects are faster
  
  // Check if more pages exist
  const hasMore = tickets.length > limit;
  
  // Remove extra item
  if (hasMore) {
    tickets.pop();
  }
  
  // Get cursor for next page
  const nextLastId = tickets.length > 0 ? tickets[tickets.length - 1]._id : null;
  
  return {
    tickets,
    hasMore,
    nextLastId
  };
}

// Text search with relevance sorting
export async function searchTickets(searchText, limit = 10) {
  return await mongoose.models.Ticket.find(
    { $text: { $search: searchText } },
    { score: { $meta: 'textScore' } } // Add relevance score
  )
    .sort({ score: { $meta: 'textScore' } }) // Best matches first
    .limit(limit)
    .lean();
}

// Stats calculation with aggregation pipeline
export async function getTicketAnalytics(adminId, startDate, endDate) {
  return await mongoose.models.Ticket.aggregate([
    {
      $match: {
        admin: new mongoose.Types.ObjectId(adminId),
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        totalTickets: { $sum: 1 },
        resolvedTickets: {
          $sum: { $cond: [{ $eq: ['$isResolved', true] }, 1, 0] }
        },
        averageResolutionTime: {
          $avg: {
            $cond: [
              { $eq: ['$isResolved', true] },
              '$resolutionTime',
              null
            ]
          }
        }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
}

// Update many tickets in one database operation
export async function bulkUpdateTickets(ticketIds, updateData) {
  const operations = ticketIds.map(id => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: updateData }
    }
  }));
  
  return await mongoose.models.Ticket.bulkWrite(operations);
}

// Create optimized indexes for common queries
export function createOptimalIndexes() {
  // Add to schema definitions for production
  
  // Fast ticket filtering by admin and status
  mongoose.models.Ticket.collection.createIndex(
    { admin: 1, status: 1, createdAt: -1 },
    { background: true }
  );
  
  // Fast chat lookup by admin and status
  mongoose.models.Chat.collection.createIndex(
    { admin: 1, isMissed: 1, lastActivity: -1 },
    { background: true }
  );
  
  // Fast team member lookup
  mongoose.models.User.collection.createIndex(
    { adminId: 1, role: 1, isActive: 1 },
    { background: true }
  );
  
  console.log('Optimal indexes created');
}

// Store frequently accessed related data directly
export async function denormalizeTicketData(ticketId) {
  const ticket = await mongoose.models.Ticket.findById(ticketId);
  
  if (!ticket) return null;
  
  // Get customer info
  const customer = await mongoose.models.User.findById(ticket.customer)
    .select('firstName lastName email');
  
  // Store directly in ticket for faster access
  ticket.customerName = `${customer.firstName} ${customer.lastName}`;
  ticket.customerEmail = customer.email;
  
  await ticket.save();
  
  return ticket;
}