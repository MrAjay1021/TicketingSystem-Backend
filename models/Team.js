import mongoose from 'mongoose';
const { Schema } = mongoose;

// TEAM SCHEMA
const teamSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Team name is required'],
    trim: true
  },
  admin: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
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

// Add indexes
teamSchema.index({ admin: 1 });
teamSchema.index({ 'members.userId': 1 });

// Create and export the Team model
const Team = mongoose.model('Team', teamSchema);
export default Team; 