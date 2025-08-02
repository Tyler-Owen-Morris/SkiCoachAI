# Ski Coach AI Assistant

## Overview
This is a full-stack web application designed as an AI-powered assistant for ski coaches to manage and track skier progress through voice notes. The application allows coaches to add skiers, record voice notes about their performance, and generate AI-powered summaries of their progress. Built with a React frontend, Express.js backend, and PostgreSQL database, it integrates OpenAI's Whisper for transcription and GPT-4o for intelligent summaries.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Components**: shadcn/ui component library built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query (React Query) for server state management with custom query client
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation schemas
- **Mobile-First Design**: Progressive Web App (PWA) capabilities with responsive design optimized for mobile devices

### Backend Architecture
- **Framework**: Express.js with TypeScript running on Node.js
- **Database ORM**: Drizzle ORM with PostgreSQL as the database
- **Authentication**: Replit Auth integration with session-based authentication using express-session
- **File Upload**: Multer for handling audio file uploads
- **API Design**: RESTful API endpoints with proper error handling and logging middleware

### Database Schema
- **Users Table**: Stores coach profiles with Replit Auth integration
- **Skiers Table**: Contains skier information (name, level, age, initial notes) linked to coaches
- **Notes Table**: Voice transcriptions and manual notes for each skier
- **Summaries Table**: AI-generated summaries of skier progress
- **Sessions Table**: Required for Replit Auth session storage

### Authentication & Authorization
- **Replit Auth**: OAuth-based authentication system with automatic user provisioning
- **Session Management**: PostgreSQL-backed session storage with 7-day TTL
- **Authorization**: Route-level protection ensuring coaches can only access their own data

### AI Integration Strategy
- **Voice Transcription**: OpenAI Whisper API for converting audio recordings to text
- **Content Summarization**: GPT-4o model for generating coaching summaries from accumulated notes
- **Error Handling**: Robust fallback mechanisms for AI service failures
- **Cost Optimization**: Uses GPT-4o instead of older models for better efficiency

## External Dependencies

### Core Infrastructure
- **Database**: PostgreSQL via Neon serverless (configured for connection pooling)
- **Authentication**: Replit Auth system for user management
- **Build Tools**: Vite for frontend bundling with React plugin and runtime error overlay

### AI Services
- **OpenAI API**: 
  - Whisper-1 model for audio transcription
  - GPT-4o model for text summarization
  - Configured with proper error handling and retry logic

### UI/UX Libraries
- **Component System**: Radix UI primitives for accessibility
- **Styling**: Tailwind CSS with custom design tokens
- **Icons**: Lucide React icon library
- **Date Handling**: date-fns for time formatting and manipulation

### Development & Deployment
- **TypeScript**: Full-stack type safety with shared schemas
- **Database Migrations**: Drizzle Kit for schema management
- **Session Storage**: connect-pg-simple for PostgreSQL session persistence
- **Environment Configuration**: dotenv-based configuration management

### Mobile & PWA Features
- **Service Worker**: Offline capability and caching strategies
- **Web App Manifest**: Native app-like experience on mobile devices
- **Speech Recognition**: Browser-based speech recognition with fallback support
- **Responsive Design**: Mobile-first approach with touch-optimized interfaces