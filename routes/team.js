import express from 'express';
import crypto from 'crypto';
import { User, Team, Invitation } from '../models/index.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/teams
// @desc    Get team information (members list)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    // Find the team for this admin or get the team this member belongs to
    let team;
    
    if (req.user.role === 'admin') {
      team = await Team.findOne({ admin: req.user._id })
        .populate('members.userId', 'firstName lastName email username role');
    } else {
      team = await Team.findOne({ 'members.userId': req.user._id })
        .populate('members.userId', 'firstName lastName email username role')
        .populate('admin', 'firstName lastName email username');
    }
    
    if (!team) {
      // If no team exists for this admin, create one
      if (req.user.role === 'admin') {
        team = await Team.create({
          name: `${req.user.firstName}'s Team`,
          admin: req.user._id,
          members: []
        });
      } else {
        return res.status(404).json({
          success: false,
          message: 'You are not part of any team'
        });
      }
    }
    
    res.status(200).json({
      success: true,
      data: team
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/teams/:teamId/members
// @desc    Add a new team member
// @access  Private (Admin only)
router.post('/:teamId/members', protect, authorize('admin'), async (req, res) => {
  try {
    const { email, role, username } = req.body;
    // Derive first and last name from username, ensuring lastName is never empty
    let firstName, lastName;
    
    if (username) {
      const nameParts = username.trim().split(' ');
      firstName = nameParts[0] || 'Team';
      
      // If no last name provided, use a default based on role
      if (nameParts.length > 1) {
        lastName = nameParts.slice(1).join(' ');
      } else {
        lastName = role === 'admin' ? 'Admin' : 'Member';
      }
    } else {
      firstName = 'Team';
      lastName = role === 'admin' ? 'Admin' : 'Member';
    }
    
    if (!email || !role) {
      return res.status(400).json({
        success: false,
        message: 'Email and role are required'
      });
    }
    
    // Normalize email and map role
    const normalizedEmail = email.toLowerCase().trim();
    const backendRole = role === 'admin' ? 'admin' : 'team_member';
    
    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be either admin or member'
      });
    }
    
    // Check if team exists and belongs to this admin
    const team = await Team.findOne({ 
      _id: req.params.teamId,
      admin: req.user._id
    });
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found or you do not have permission'
      });
    }
    
    // Check if email already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    
    if (existingUser) {
      // Check if user is already a team member
      const isAlreadyMember = team.members.some(
        member => member.userId.toString() === existingUser._id.toString()
      );
      
      if (isAlreadyMember) {
        return res.status(400).json({
          success: false,
          message: 'User is already a member of this team'
        });
      }
      
      // Add existing user to team
      team.members.push({
        userId: existingUser._id,
        role: role,
        joinedAt: Date.now()
      });
      
      await team.save();
      
      // Update user's role if needed
      if (existingUser.role !== 'admin' && existingUser.role !== 'team_member') {
        existingUser.role = backendRole;
        existingUser.adminId = req.user._id;
        await existingUser.save();
      }
      
      return res.status(200).json({
        success: true,
        data: team,
        message: 'Existing user added to team'
      });
    }
    
    // Check if there's an existing invitation for this email
    let existingInvitation = await Invitation.findOne({
      email: normalizedEmail,
      team: team._id,
      used: false
    });
    
    // If invitation exists but is expired, delete it and create a new one
    if (existingInvitation && existingInvitation.expiresAt <= Date.now()) {
      await Invitation.deleteOne({ _id: existingInvitation._id });
      existingInvitation = null;
    }
    
    let token;
    let expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    if (existingInvitation) {
      // Update existing invitation
      token = existingInvitation.token;
      existingInvitation.role = backendRole;
      existingInvitation.firstName = firstName;
      existingInvitation.lastName = lastName;
      existingInvitation.expiresAt = expiresAt;
      await existingInvitation.save();
    } else {
      // Create new invitation with 32 bytes of entropy
      token = crypto.randomBytes(32).toString('hex');
      
      await Invitation.create({
        email: normalizedEmail,
        token,
        expiresAt,
        team: team._id,
        role: backendRole,
      firstName,
      lastName,
      invitedBy: req.user._id
    });
    }
    
    // Create a pre-registered user with invitation token
    // Generate temporary password (will be replaced when user completes registration)
    const tempPassword = crypto.randomBytes(10).toString('hex');
    
    // Check if user already exists (to handle race conditions)
    let user = await User.findOne({ email: normalizedEmail });
    
    if (!user) {
      // Create user account with invitation token
      user = await User.create({
        firstName,
        lastName,
        email: normalizedEmail,
        username: normalizedEmail.split('@')[0], // set a unique username from email prefix
        password: tempPassword,
        role: backendRole,
        adminId: req.user._id,
        invitationToken: token,
        invitationExpires: expiresAt
      });
    } else {
      // Update existing user with invitation token
      if (!user.username) {
        user.username = normalizedEmail.split('@')[0]; // backfill username if missing
      }
      user.invitationToken = token;
      user.invitationExpires = expiresAt;
      await user.save();
    }
    
    // Only add the user to the team if they're not already a member
    const isAlreadyTeamMember = team.members.some(m => 
      m.userId.toString() === user._id.toString()
    );
    
    if (!isAlreadyTeamMember) {
    // Add to team
    team.members.push({
      userId: user._id,
      role: role,
      joinedAt: Date.now()
    });
    
    await team.save();
    }
    
    const inviteLink = `${process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://ticketingsystem-frontend.vercel.app' : 'http://localhost:3000')}/register?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;
    
    res.status(201).json({
      success: true,
      data: {
        team,
        invitation: {
          token,
          email: normalizedEmail,
          expiresAt,
          inviteLink
        }
      },
      message: 'Team member invited successfully'
    });
  } catch (error) {
    console.error('Error inviting team member:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   PUT /api/teams/:teamId/members/:userId
// @desc    Update team member role
// @access  Private (Admin only)
router.put('/:teamId/members/:userId', protect, authorize('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!role || !['admin', 'member'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Valid role (admin or member) is required'
      });
    }
    
    // Map frontend 'member' role to 'team_member' for the backend
    const backendRole = role === 'admin' ? 'admin' : 'team_member';
    
    // Check if team exists and belongs to this admin
    const team = await Team.findOne({ 
      _id: req.params.teamId,
      admin: req.user._id
    });
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found or you do not have permission'
      });
    }
    
    // Find member in team
    const memberIndex = team.members.findIndex(
      member => member.userId.toString() === req.params.userId
    );
    
    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in team'
      });
    }
    
    // Update role
    team.members[memberIndex].role = role;
    await team.save();
    
    // If role changed to admin, update user role
    const user = await User.findById(req.params.userId);
    
    if (user) {
      user.role = backendRole;
      await user.save();
    }
    
    res.status(200).json({
      success: true,
      data: team,
      message: 'Member role updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   DELETE /api/teams/:teamId/members/:userId
// @desc    Remove a team member
// @access  Private (Admin only)
router.delete('/:teamId/members/:userId', protect, authorize('admin'), async (req, res) => {
  try {
    // Log received IDs for debugging
    console.log(`Removing member. Team ID: ${req.params.teamId}, User ID: ${req.params.userId}`);
    
    // Clean up the userId parameter (in case it has any prefixes)
    const userId = req.params.userId.replace(/^(user_|member_)/g, '');
    
    // Check if team exists and belongs to this admin or user is admin in the team
    const team = await Team.findOne({ 
      _id: req.params.teamId,
      $or: [
        { admin: req.user._id },
        { 
          'members.userId': req.user._id,
          'members.role': 'admin'
        }
      ]
    });
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found or you do not have permission'
      });
    }
    
    // Find member in team
    const memberIndex = team.members.findIndex(
      member => member.userId.toString() === userId
    );
    
    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in team'
      });
    }
    
    // Cannot remove yourself
    if (team.members[memberIndex].userId.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot remove yourself from the team'
      });
    }
    
    // Remove member from team
    team.members.splice(memberIndex, 1);
    await team.save();

    // Delete the user entirely from the database
    await User.findByIdAndDelete(userId);

    // Return updated team
    res.status(200).json({
      success: true,
      data: team,
      message: 'Member removed (and user record deleted) successfully'
    });
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/teams/:teamId/invite
// @desc    Invite a new user to the team
// @access  Private (Admin only)
router.post('/:teamId/invite', protect, authorize('admin'), async (req, res) => {
  try {
    const { email, role } = req.body;
    
    if (!email || !role) {
      return res.status(400).json({
        success: false,
        message: 'Email and role are required'
      });
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    const backendRole = role === 'admin' ? 'admin' : 'team_member';
    
    if (!['admin', 'team_member'].includes(backendRole)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be either admin or team_member'
      });
    }
    
    // Check if team exists and current user is a team admin
    const team = await Team.findOne({
      _id: req.params.teamId,
      'members.userId': req.user._id,
      'members.role': 'admin'
    });
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found or you do not have admin permissions for this team'
      });
    }
    
    // Check if user is already in the team
    const existingUserInTeam = await User.findOne({ email: normalizedEmail });
    if (existingUserInTeam) {
      const isAlreadyMember = team.members.some(
        member => member.userId.toString() === existingUserInTeam._id.toString()
      );
      
      if (isAlreadyMember) {
        return res.status(400).json({
          success: false,
          message: 'User is already a member of this team'
        });
      }
    }
    
    // Check if there's an existing invitation
    let existingInvitation = await Invitation.findOne({
      email: normalizedEmail,
      team: team._id,
      used: false
    });
    
    // If invitation exists but is expired, delete it and create a new one
    if (existingInvitation && existingInvitation.expiresAt <= Date.now()) {
      await Invitation.deleteOne({ _id: existingInvitation._id });
      existingInvitation = null;
    }
    
    let token, expiresAt;
    
    if (existingInvitation) {
      // Update existing invitation
      token = existingInvitation.token;
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Reset expiration to 7 days
      existingInvitation.role = backendRole;
      existingInvitation.expiresAt = expiresAt;
      await existingInvitation.save();
    } else {
      // Create new invitation token (32 bytes = 256 bits of entropy)
      token = crypto.randomBytes(32).toString('hex');
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      // Create invitation
      await Invitation.create({
        email: normalizedEmail,
        team: team._id,
        invitedBy: req.user._id,
        role: backendRole,
        token,
        expiresAt
      });
    }
    
    // Provide invitation link info 
    const inviteLink = `${process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://ticketingsystem-frontend.vercel.app' : 'http://localhost:3000')}/register?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;
    
    res.status(201).json({
      success: true,
      data: {
        token,
        email: normalizedEmail,
        expiresAt,
        inviteLink
      },
      message: existingInvitation ? 'Invitation updated successfully' : 'Invitation created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   PUT /api/tickets/:id/reassign
// @desc    Reassign ticket to another team member
// @access  Private (Admin only)
router.put('/:id/reassign', protect, authorize('admin'), async (req, res) => {
  try {
    const { userId } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Find the user being assigned to
    const memberToAssign = await User.findById(userId);

    if (!memberToAssign) {
      return res.status(404).json({ success: false, message: 'User to assign not found' });
    }

    // Update assignedTo field
    ticket.assignedTo = [userId];
    ticket.lastActivity = Date.now();

    await ticket.save();

    // Populate necessary fields for response
    const updatedTicket = await Ticket.findById(ticket._id)
      .populate('customer', 'firstName lastName email phone')
      .populate('assignedTo', 'firstName lastName username')
      .populate('team', 'name');

    res.status(200).json({
      success: true,
      data: updatedTicket,
      message: `Ticket reassigned to ${memberToAssign.username}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;