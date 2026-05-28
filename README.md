# Git Commit & PR Automator

An agentic developer productivity tool built natively using Cursor best practices to automate semantic commit message generation and pull request summaries directly from workspace git diffs.

## 🚀 Key Features (Innovation)
- **Agentic Loop Simulation:** Sequentially reads active git diffs, analyzes code syntax variations, and categorizes changes (feat, fix, refactor).
- **Dual Interface:** Robust CLI output with real-time emoji progress states alongside a premium, warm-neutral Web UI dashboard.
- **Production Grade:** Built using modern ES6 modules and fully covered by zero-dependency native Node.js unit tests.

## 📁 Repository Structure & Context Management
- `.cursorrules`: Strict project-level coding standards and modern ES6 enforcement.
- `AGENTS.md`: Full briefing outlining agent loops, tool structures (Git & Filesystem), and context boundaries.
- `src/autocommit.js`: Core tracking engine parsing active git workspaces.
- `tests/autocommit.test.js`: Native automated testing verifying logic integrity.

## 🛠️ Quick Start
1. Run backend unit tests: `npm run test`
2. Spin up the application server: `npm start`


// testing the agent loop.