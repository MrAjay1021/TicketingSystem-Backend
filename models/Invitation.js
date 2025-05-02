import mongoose from 'mongoose';
const { Schema } = mongoose;

// INVITATION SCHEMA
const invitationSchema = new Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  team: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  invitedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'team_member'],
    default: 'team_member'
  },
  token: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  used: {
    type: Boolean,
    default: false
  },
  firstName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
invitationSchema.index({ email: 1, team: 1 }, { unique: true });
invitationSchema.index({ token: 1 }, { unique: true });
invitationSchema.index({ expiresAt: 1 });

// Create and export the Invitation model
const Invitation = mongoose.model('Invitation', invitationSchema);
export default Invitation;