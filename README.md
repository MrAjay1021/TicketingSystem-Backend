# Ticketing System

A comprehensive ticket management and customer support web application built with the MERN stack (MongoDB, Express, React, Node.js).

## Overview

This ticketing system provides a complete solution for customer support teams to manage tickets, conduct Near real-time chats, configure chatbots, and 
analyze performance metrics. The application consists of a React frontend and a Node.js/Express backend with MongoDB as the database.

## Technology Stack

- **Node.js** - JavaScript runtime
- **Express** - Web application framework
- **MongoDB** - NoSQL database
- **Mongoose** - MongoDB object modeling
- **JWT** - JSON Web Tokens for authentication
- **bcrypt** - Password hashing


## API Endpoints

### Authentication
- **POST /api/auth/register** - Register a new user
- **POST /api/auth/login** - Authenticate user and get token
- **GET /api/auth/profile** - Get current user profile
- **PUT /api/auth/profile** - Update user profile

### Tickets
- **GET /api/tickets** - Get all tickets
- **POST /api/tickets** - Create a new ticket
- **GET /api/tickets/:id** - Get ticket by ID
- **PUT /api/tickets/:id** - Update ticket
- **DELETE /api/tickets/:id** - Delete ticket

### Teams
- **GET /api/teams** - Get all teams
- **POST /api/teams** - Create a new team
- **GET /api/teams/:id** - Get team by ID
- **PUT /api/teams/:id** - Update team
- **DELETE /api/teams/:id** - Delete team

### Chat
- **GET /api/chat** - Get all chats
- **POST /api/chat** - Create a new chat
- **GET /api/chat/:id** - Get chat by ID
- **PUT /api/chat/:id** - Update chat

### Chatbot
- **GET /api/bot** - Get chatbot configuration
- **POST /api/bot** - Update chatbot configuration
- **POST /api/bot/message** - Send message to chatbot

### Analytics
- **GET /api/analytics/tickets** - Get ticket analytics
- **GET /api/analytics/members** - Get members performance
- **GET /api/analytics/teams** - Get team performance

- ## Data Models

### User
- Authentication and profile information for customers, members, and admins

### Ticket
- Support tickets with status and assignment information

### Chat
- Near real-time chat messages associated with tickets

### Team
- Support teams with assigned members

### Invitation
- Team invitation system for adding new members

### Chatbot
- For Query Response configuration

### Analytics
- Aggregated performance data

## Demo Credentials

- **username**: admin1
- **Password**: qwer1234
