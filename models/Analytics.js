import mongoose from 'mongoose';
const { Schema } = mongoose;

// ANALYTICS SCHEMA

const analyticsSchema = new Schema({
    admin: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    date: {
      type: Date,
      default: Date.now,
      required: true
    },
    metrics: {
      totalChats: {
        type: Number,
        default: 0
      },
      missedChats: {
        type: Number,
        default: 0
      },
      resolvedTickets: {
        type: Number,
        default: 0
      },
      unresolvedTickets: {
        type: Number,
        default: 0
      },
      averageResponseTime: {
        type: Number, // In milliseconds
        default: 0
      },
      averageResolutionTime: {
        type: Number, // In milliseconds
        default: 0
      }
    },
    teamPerformance: [{
      teamMember: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      resolvedTickets: {
        type: Number,
        default: 0
      },
      averageResponseTime: {
        type: Number,
        default: 0
      }
    }]
  }, {
    timestamps: true
  });
  
  // Compound index for unique daily analytics per admin
  analyticsSchema.index({ admin: 1, date: 1 }, { unique: true });

// Create and export the Analytics model
const Analytics = mongoose.model('Analytics', analyticsSchema);
export default Analytics;