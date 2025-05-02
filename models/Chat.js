import mongoose from 'mongoose';
const { Schema } = mongoose;

// CHAT SCHEMA

const messageSchema = new Schema({
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    isSystem: {
      type: Boolean,
      default: false
    },
    isMissedChatNotification: {
      type: Boolean,
      default: false
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    isRead: {
      type: Boolean,
      default: false
    },
    readAt: Date
  });
  
  const chatSchema = new Schema({
    ticket: {
      type: Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    sessionId: {
      type: String,
      required: true,
      unique: true
    },
    admin: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: function() {
        return this.admin;
      }
    },
    messages: [messageSchema],
    isMissed: {
      type: Boolean,
      default: false
    },
    missedAt: Date,
    missedChatTimer: {
      type: Number, // Time in milliseconds
      default: 600000 // Default 10 minutes
    },
    firstResponseTime: Number, // Time in milliseconds between first customer message and first response
    lastActivity: {
      type: Date,
      default: Date.now
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    customerInfo: {
      name: String,
      email: String,
      phone: String
    }
  }, {
    timestamps: true
  });
  
  // Update lastActivity when new messages are added
  chatSchema.pre('save', function(next) {
    if (this.isModified('messages')) {
      this.lastActivity = Date.now();
      
      // Calculate first response time if this is the first response from team
      const customerMessages = this.messages.filter(m => 
        m.sender.toString() === this.customer.toString()
      );
      
      const teamResponses = this.messages.filter(m => 
        m.sender.toString() !== this.customer.toString() && !m.isSystem
      );
      
      if (customerMessages.length > 0 && teamResponses.length === 1 && 
          this.isModified('messages.' + (this.messages.length - 1))) {
        const firstCustomerMsg = customerMessages[0];
        const firstResponse = teamResponses[0];
        
        this.firstResponseTime = firstResponse.timestamp - firstCustomerMsg.timestamp;
      }
    }
    next();
  });
  
  // Indexes
  chatSchema.index({ ticket: 1 });
  chatSchema.index({ customer: 1 });
  chatSchema.index({ admin: 1 });
  chatSchema.index({ assignedTo: 1 });
  chatSchema.index({ isMissed: 1 });
  chatSchema.index({ lastActivity: 1 });
  chatSchema.index({ createdAt: 1 });
  chatSchema.index({ sessionId: 1 }, { unique: true });
  chatSchema.index({ 'messages.content': 'text' }); // Text search on messages

// Create and export the Chat model
const Chat = mongoose.model('Chat', chatSchema);
export default Chat;