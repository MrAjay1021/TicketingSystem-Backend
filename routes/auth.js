import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { Invitation, Team } from '../models/index.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, token } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    
    // Normalize email to prevent duplicate accounts with different casing
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check if user exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    
    // Special case for first user (no users in system) - no token required
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      if (existingUser) {
        // Edge case - user exists but total count is still 0 (race condition)
        return res.status(400).json({
          success: false,
          message: 'An account with this email already exists'
        });
      }
      
      // First user is always an admin
      const user = await User.create({
        email: normalizedEmail,
        password,
        firstName: firstName || 'Admin',
        lastName: lastName || 'User',
        role: 'admin'
      });
      
      // Create a team for the first user
      const team = await Team.create({
        name: 'My Team',
        admin: user._id,
        members: [{ userId: user._id, role: 'admin', joinedAt: Date.now() }]
      });
      
      const token = user.generateAuthToken();
      
      return res.status(201).json({
        success: true,
        token,
        data: {
          user: {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
          }
        }
      });
    }
    
    // For subsequent users, look up an invitation with the matching email
    const invitation = await Invitation.findOne({
      email: normalizedEmail,
      used: false,
      expiresAt: { $gt: Date.now() }
    });
    
    // No valid invitation found
    if (!invitation) {
      return res.status(400).json({
        success: false,
        message: 'No valid invitation found for this email. Please contact your team admin for an invitation.'
      });
    }
    
    // We found a valid invitation
    
    // If token was provided, validate it matches the invitation
    if (token && token !== invitation.token) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invitation token. Please use the link sent to your email.'
      });
    }
    
    // At this point we have a valid invitation with matching email
    
    if (existingUser) {
      // If user exists but already has password set, they should use login instead
      if (!existingUser.invitationToken) {
        return res.status(400).json({
          success: false,
          message: 'An account with this email already exists. Please log in instead.'
        });
      }
      
      // Complete user setup with provided details
      existingUser.password = password;
      existingUser.firstName = firstName || invitation.firstName || 'Team';
      existingUser.lastName = lastName || invitation.lastName || 'Member';
      existingUser.invitationToken = undefined; // Clear the token
      existingUser.invitationExpires = undefined;
      
      await existingUser.save();
      
      // Mark invitation as used
      invitation.used = true;
      invitation.usedAt = Date.now();
      await invitation.save();
      
      const userToken = existingUser.generateAuthToken();
      
      return res.status(200).json({
        success: true,
        token: userToken,
        data: {
          user: {
            id: existingUser._id,
            email: existingUser.email,
            firstName: existingUser.firstName,
            lastName: existingUser.lastName,
            role: existingUser.role
          },
          message: 'Account setup completed successfully'
        }
      });
    }
    
    // Create a new user based on invitation details
    const newUser = await User.create({
      email: normalizedEmail,
      password,
      firstName: firstName || invitation.firstName || 'Team',
      lastName: lastName || invitation.lastName || 'Member',
      role: invitation.role || 'team_member',
      adminId: invitation.invitedBy
    });
    
    // Mark invitation as used
    invitation.used = true;
    invitation.usedAt = Date.now();
    await invitation.save();
    
    // Add user to team
    const team = await Team.findById(invitation.team);
    if (team) {
      // Check if user is already a team member (should not happen but just in case)
      const isAlreadyMember = team.members.some(
        member => member.userId && member.userId.toString() === newUser._id.toString()
      );
      
      if (!isAlreadyMember) {
        team.members.push({
          userId: newUser._id,
          role: invitation.role === 'admin' ? 'admin' : 'member',
          joinedAt: Date.now()
        });
        
        await team.save();
      }
    }
    
    const userToken = newUser.generateAuthToken();
    
    res.status(201).json({
      success: true,
      token: userToken,
      data: {
        user: {
          id: newUser._id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role
        }
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// First login - set username and get token
router.post('/first-login', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    
    // Check if user exists by email
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'No account with that email'
      });
    }
    
    // Check if password matches
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check if username is already taken by another user
    const existing = await User.findOne({ username });
    if (existing && existing._id.toString() !== user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'That username is already taken'
      });
    }
    
    // Set username and save user
    user.username = username;
    await user.save();
    
    // Update last login
    user.lastLogin = Date.now();
    await user.save({ validateBeforeSave: false });
    
    // Generate token
    const token = user.generateAuthToken();
    
    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// User login
router.post('/login', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    // First try to find user by username
    let user = await User.findOne({ username }).select('+password');
    
    // If user not found by username, check if it's an email login attempt
    if (!user && email) {
      user = await User.findOne({ email }).select('+password');
      
      // If we found a user by email but they don't have a username yet
      if (user && !user.username) {
        // Verify password
        const isMatch = await user.comparePassword(password);
        
        if (!isMatch) {
          return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
          });
        }
        
        // Return special response indicating user needs to set username
        return res.status(202).json({
          success: true,
          needsUsername: true,
          email: user.email
        });
      }
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check if password matches
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Update last login
    user.lastLogin = Date.now();
    await user.save({ validateBeforeSave: false });
    
    // Generate token
    const token = user.generateAuthToken();
    
    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get current user profile
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        role: user.role,
        phone: user.phone
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update user profile
router.put('/me', protect, async (req, res) => {
  // Implementation needed
  res.status(501).json({ success: false, message: 'This route is not implemented' });
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  // Implementation needed
  res.status(501).json({ success: false, message: 'This route is not implemented' });
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  // Implementation needed
  res.status(501).json({ success: false, message: 'This route is not implemented' });
});

// Change password (logged in users)
router.post('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Please provide current, new, and confirm passwords' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New passwords do not match' });
    }

    // Fetch user with password
    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    // Update password - ONLY for the current user
    user.password = newPassword;
    await user.save();

    // Log the password change for security auditing
    console.log(`Password changed for user: ${user._id} (${user.email})`);

    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error in password change:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get invitation details
router.get('/invitation/:token', async (req, res) => {
  // Implementation needed
  res.status(501).json({ success: false, message: 'This route is not implemented' });
});

// Create a team invitation
router.post('/invite', protect, async (req, res) => {
  // Implementation needed
  res.status(501).json({ success: false, message: 'This route is not implemented' });
});

// Resend invitation
router.post('/resend-invite/:id', protect, async (req, res) => {
  // Implementation needed
  res.status(501).json({ success: false, message: 'This route is not implemented' });
});

// Cancel invitation
router.delete('/invitation/:id', protect, async (req, res) => {
  // Implementation needed
  res.status(501).json({ success: false, message: 'This route is not implemented' });
});

export default router;