import mongoose from 'mongoose';
const { Schema } = mongoose;

// Support ticket data structure
const ticketSchema = new Schema({
  ticketNumber: {
    type: String,
    unique: true,
    required: true
  },
  customer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: [Schema.Types.ObjectId],
    ref: 'User',
  },
  admin: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  team: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['technical', 'billing', 'feature_request', 'general', 'other'],
    default: 'general'
  },
  subject: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  isResolved: {
    type: Boolean,
    default: false
  },
  resolvedAt: Date,
  resolvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  resolutionTime: {
    type: Number, // Time in milliseconds
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate ticket ID like "2023-00001"
ticketSchema.pre('validate', async function(next) {
  if (this.isNew) {
    const year = new Date().getFullYear();
    const count = await mongoose.models.Ticket.countDocuments();
    this.ticketNumber = `${year}-${(count + 1).toString().padStart(5, '0')}`;
  }
  next();
});

// Link chats to this ticket
ticketSchema.virtual('chats', {
  ref: 'Chat',
  localField: '_id',
  foreignField: 'ticket'
});

// Speed up common queries with indexes
ticketSchema.index({ customer: 1 });
ticketSchema.index({ assignedTo: 1 });
ticketSchema.index({ admin: 1 });
ticketSchema.index({ team: 1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ isResolved: 1 });
ticketSchema.index({ createdAt: 1 });
ticketSchema.index({ category: 1, priority: 1 });
ticketSchema.index({ subject: 'text', description: 'text' }); // For text search

// Create and export the Ticket model
const Ticket = mongoose.model('Ticket', ticketSchema);
export default Ticket;