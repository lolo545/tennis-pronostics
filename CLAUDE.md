# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a tennis prediction/analytics application with a Node.js/Express backend and PostgreSQL database. The system provides REST APIs for tennis data analysis, supporting both ATP and WTA tours with comprehensive ranking and match data.

## Common Commands

### Development
```bash
npm run dev          # Start development server with nodemon
npm start           # Start production server
npm test            # Run Jest tests
npm run lint        # Run ESLint
```

### Database Operations
```bash
npm run migrate:full     # Complete data migration from Access database
npm run migrate:odds     # Migrate odds data specifically
npm run clean:db         # Clean database utilities
npm run db:seed          # Seed database with initial data
```

### Data Synchronization
```bash
npm run sync:now              # Manual data synchronization
npm run sync:rankings         # Sync rankings data
npm run rankings:check        # Check rankings status
npm run sync:incremental     # Incremental sync from Access to PostgreSQL
npm run sync:start-scheduler # Start automatic scheduler (2x daily)
npm run update:match-rankings # Update missing rankings in existing matches
npm run update:match-odds     # Update missing odds in existing matches
npm run update:missing-score-fields # Update missing score details (sets, games, tiebreaks) from score_raw
```

## Architecture Overview

### Backend Structure
- **Entry Point**: `backend/server.js` - Main server with graceful shutdown
- **App Config**: `backend/src/app.js` - Express application setup
- **API Base**: `/api/v1` with Swagger documentation at `/api-docs`
- **Database**: PostgreSQL with Sequelize ORM, comprehensive tennis data model

### Key API Endpoints
- **Rankings**: `/api/v1/rankings/*` - Current/historical ATP/WTA rankings
- **Players**: `/api/v1/players/*` - Player information and match history
- **Health**: `/health`, `/status` - System health checks

### Database Schema Highlights
The database follows a comprehensive tennis data model with:
- **Reference tables**: Countries, court surfaces, tournament types/tiers, rounds
- **Core tables**: Players (unified ATP/WTA), tournaments, matches, rankings
- **Advanced features**: Views for detailed statistics, comprehensive indexing

#### Matches Table Structure
The `matches` table contains detailed score information with these key columns:
- **Score columns**: `score_raw` (original score like "6-4 7-6(5) 6-3")
- **Set statistics**: `sets_winner`, `sets_loser`, `total_sets`
- **Game statistics**: `games_winner`, `games_loser`, `total_games`
- **Match details**: `has_tiebreak`, `tiebreaks_count`, `is_walkover`
- **Rankings**: `winner_ranking`, `winner_points`, `loser_ranking`, `loser_points`
- **Odds**: `winner_odds`, `loser_odds`

### Configuration System
- **Location**: `backend/src/config/config.js`
- **Environment-based**: Development, Production, Test configurations
- **Includes**: API settings, CORS, database connections, security, external APIs

### Migration System
- **Full Migration**: `backend/migrations/full-migrate.js` - Complete Access DB migration
- **Schema Creation**: `backend/migrations/create-schema.sql` - PostgreSQL schema
- **Specialized**: Odds migration and database cleanup utilities

## Development Notes

### Tennis-Specific Features
- Supports multiple court surfaces (Hard, Clay, Grass, Carpet, Indoor Hard)
- Handles ATP/WTA tour separation with unified player database
- Tournament hierarchy: Grand Slam → Masters 1000 → ATP 500/250 → Challengers
- Comprehensive round tracking including qualifying rounds
- Seeding, wildcards, and qualifier status tracking

### Frontend Components
- **Rankings Interface**: `backend/public/rankings/` - Modern web interface
- **Player Stats**: `backend/public/player-stats/` - Player detail pages with Tailwind CSS
- Both use dynamic content loading and responsive design

### Logging
- Winston-based logging system with structured output
- Environment-specific log levels
- Log files stored in `backend/logs/app.log`

### API Features
- Pagination support for large datasets
- Filtering by tour (ATP/WTA), country, year
- Ranking progression tracking between periods
- Rate limiting and comprehensive security headers
- Full Swagger/OpenAPI 3.0 documentation

## Current Architecture Gaps

The codebase uses a direct SQL approach rather than full ORM patterns:
- `src/models/` directory exists but is empty (raw SQL queries used instead)
- `src/services/` directory empty (business logic in route handlers)
- `src/middleware/` directory empty (using built-in middleware)
- `src/cron/` directory empty (scheduled tasks not implemented)

When adding new features, consider whether to continue the current direct SQL approach or implement proper MVC separation.