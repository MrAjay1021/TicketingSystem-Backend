import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const { Schema } = mongoose;

// User account schema definition
const userSchema = new Schema({
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true
    },
    lastName: {
      type: String,
      required: [function() { return this.role !== 'customer'; }, 'Last name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    username: {
      type: String,
      unique: true,
      trim: true
      // Optional until first login
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters long'],
      select: false // Don't include in queries by default
    },
    phone: {
      type: String,
      trim: true
    },
    role: {
      type: String,
      enum: ['admin', 'team_member', 'customer'],
      default: 'admin'
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      // Only team members have an admin
      required: function() { return this.role === 'team_member'; }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    invitationToken: String,
    invitationExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    lastLogin: Date,
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
  
  // Generate full name from first and last name
  userSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
  });
  
  // Get team members for admin users
  userSchema.virtual('teamMembers', {
    ref: 'User',
    localField: '_id',
    foreignField: 'adminId',
    match: { role: 'team_member', isActive: true }
  });
  
  // Hash password before saving
  userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
      const salt = await bcryptjs.genSalt(10);
      this.password = await bcryptjs.hash(this.password, salt);
      next();
    } catch (error) {
      next(error);
    }
  });
  
  // Check if password matches
  userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcryptjs.compare(candidatePassword, this.password);
  };
  
  // Create JWT for authentication
  userSchema.methods.generateAuthToken = function() {
    return jwt.sign(
      { id: this._id, role: this.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
  };
  
  // Generate invitation token
  userSchema.methods.createInvitationToken = function() {
    const invitationToken = crypto.randomBytes(32).toString('hex');
    
    this.invitationToken = crypto
      .createHash('sha256')
      .update(invitationToken)
      .digest('hex');
      
    this.invitationExpires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    
    return invitationToken;
  };
  
  // Add indexes for query performance
  userSchema.index({ adminId: 1 }, { sparse: true });
  userSchema.index({ role: 1 });
  userSchema.index({ username: 1 }, { unique: true, sparse: true });

// Create and export the User model
const User = mongoose.model('User', userSchema);
export default User;