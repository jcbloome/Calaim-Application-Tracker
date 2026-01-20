# CalAIM Tracker - Cursor Rules & Architecture

This folder contains the architectural guidelines and rules for the CalAIM Application Tracker system. These rules ensure consistency, prevent common errors, and maintain code quality across the project.

## 📁 Rule Files

### Core Architecture
- **`caspio-firebase-sync.mdc`** - Data synchronization patterns between Caspio (source of truth) and Firebase (real-time cache)
- **`firebase-admin-patterns.mdc`** - Firebase Admin SDK initialization, authentication, and API patterns

### Development Safety
- **`ssr-client-safety.mdc`** - Server-side rendering safety rules to prevent "window is not defined" errors
- **`component-architecture.mdc`** - React component structure, state management, and UI standards

### Maintenance & Support
- **`troubleshooting-guide.mdc`** - Common issues and their solutions, based on real problems we've solved
- **`rule-audit-system.mdc`** - Automated system to keep rules current (every 8 features)

## 🎯 Purpose

These rules serve as:
1. **Architectural Guardrails** - Prevent breaking existing functionality
2. **Knowledge Preservation** - Document solutions to problems we've already solved
3. **Development Standards** - Ensure consistent code patterns across the project
4. **Onboarding Guide** - Help new developers (including AI assistants) understand the system

## 🚀 How to Use

1. **Before Starting New Features** - Review relevant rule files
2. **During Development** - Follow the patterns and guidelines
3. **When Stuck** - Check the troubleshooting guide first
4. **Code Reviews** - Use checklists from the rule files

## 🔄 Continuous Improvement

These rules are living documents that should be updated as we:
- Solve new problems
- Discover better patterns
- Add new features
- Learn from production issues

### Automated Rule Audits
**Every 8 features**, trigger a rule audit by saying:
> "RULE AUDIT: Scan codebase for new patterns"

This ensures our architectural rules stay current with the evolving codebase.

## 📊 System Overview

```
CalAIM Tracker Architecture:
├── Frontend (Next.js 15 + React + TypeScript)
│   ├── Admin Dashboard
│   ├── Client Notes System
│   ├── Member Management
│   └── Real-time Notifications
├── Backend (Firebase Functions + Node.js)
│   ├── Caspio API Integration
│   ├── Google Drive Migration
│   ├── Email Notifications
│   └── Webhook Handlers
└── Data Layer
    ├── Caspio (Source of Truth)
    ├── Firebase (Real-time Cache)
    └── Google Drive (Document Storage)
```

## 🛡️ Key Principles

1. **Caspio First** - Always write to Caspio API before updating Firebase
2. **SSR Safety** - Guard all browser APIs for server-side rendering
3. **Error Resilience** - Graceful fallbacks and comprehensive error handling
4. **Real-time Updates** - Use Firebase listeners for live data synchronization
5. **Security First** - Proper authentication and role-based access control

---

*Last Updated: January 2026*
*Version: 1.0.0*