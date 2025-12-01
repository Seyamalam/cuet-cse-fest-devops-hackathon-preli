# CI/CD & Git Hooks Setup Guide

This document explains the automated testing and deployment pipeline setup.

## Overview

The project includes three layers of automation:

1. **Pre-commit Hooks** - Run before every commit
2. **Pre-push Hooks** - Run before every push
3. **GitHub Actions** - Run on every push and PR

## Pre-Commit Hooks

### What runs
- TypeScript type checking for backend code

### When it runs
```bash
git add .
git commit -m "message"  # ← Hooks run here
```

### Bypass (if needed)
```bash
git commit --no-verify -m "message"  # ⚠️ Not recommended
```

## Pre-Push Hooks

### What runs
1. ✅ Validates all Docker files exist
2. ✅ Type checks backend TypeScript
3. ✅ Validates `.env` file exists
4. ✅ Runs linting

### When it runs
```bash
git push origin main  # ← Hooks run here
```

### Bypass (if needed)
```bash
git push --no-verify origin main  # ⚠️ Not recommended
```

## GitHub Actions CI/CD Pipeline

**Workflow file:** `.github/workflows/ci.yml`

### Triggered on:
- ✅ Push to `main` or `develop` branches
- ✅ Pull requests to `main`

### Jobs (in order):

#### 1. Lint & Type Check
- Setup Node.js 20 with npm cache
- Install backend dependencies (`npm ci`)
- Install gateway dependencies (`npm ci`)
- Run TypeScript type check
- **Failure stops the pipeline**

#### 2. Build Docker Images
- Runs if lint passes
- Sets up Docker Buildx with GitHub Actions cache
- Builds backend image (multi-stage production build)
- Builds gateway image
- Uses `cache-from` and `cache-to` for faster builds

#### 3. Integration Tests
- Runs if build passes
- Creates `.env` file with test credentials
- Starts full production compose stack
- Waits for services to be healthy
- Tests:
  - ✅ Gateway health check
  - ✅ Backend health via gateway
  - ✅ Create product API
  - ✅ Get products API
  - ✅ Security: Backend not directly accessible
- Shows container logs on failure
- Cleans up resources

#### 4. Security Scan
- Runs if build passes
- Uses Trivy vulnerability scanner
- Scans backend filesystem
- Scans gateway filesystem
- Reports CRITICAL and HIGH vulnerabilities

## Setup Instructions

### First Time Setup
```bash
# Install dependencies (automatically sets up Husky)
npm install

# Verify hooks are installed
ls -la .husky/
```

### Making Changes

```bash
# Edit files
echo "changes" >> src/file.ts

# Stage changes
git add src/file.ts

# Commit (pre-commit hooks run)
git commit -m "feat: add feature"

# Push (pre-push hooks run)
git push origin feature-branch
```

### Workflow for Features

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes
# (pre-commit hooks validate on each commit)

# 3. Push changes
git push origin feature/my-feature
# (pre-push hooks validate before push)

# 4. Create Pull Request
# (GitHub Actions CI/CD pipeline runs)

# 5. Merge (after CI passes)
git checkout main
git merge feature/my-feature
git push origin main
# (GitHub Actions deploys on main push)
```

## Common Issues

### Pre-commit hooks fail
```
❌ TypeScript type check failed!

Solution:
cd backend && npm run type-check
# Fix the TypeScript errors
```

### Pre-push hooks fail (missing Docker file)
```
❌ Missing required file: backend/Dockerfile

Solution:
# Create the missing file
```

### Docker image build fails
```
❌ Error: failed to solve

Solution:
# Check Dockerfile syntax locally:
docker build -f backend/Dockerfile backend/
```

### GitHub Actions fails
1. Click "Details" on the failed check
2. Review the error logs
3. Fix locally and push again

## Docker Image Registry

Images are pushed to GitHub Container Registry on main branch:

```bash
# Pull images (after main branch push)
docker pull ghcr.io/YOUR-USERNAME/ecommerce-hackathon:latest-backend
docker pull ghcr.io/YOUR-USERNAME/ecommerce-hackathon:latest-gateway
```

## Monitoring

### View hook execution
```bash
# See hook output during commit
git commit -m "test"

# See hook output during push
git push origin main
```

### View GitHub Actions
1. Go to repository
2. Click "Actions" tab
3. Select workflow run
4. View detailed logs

## Environment Variables

The CI pipeline uses these test values:

| Variable | Value |
|----------|-------|
| `MONGO_INITDB_ROOT_USERNAME` | admin |
| `MONGO_INITDB_ROOT_PASSWORD` | test_password |
| `MONGO_APP_USERNAME` | app_user |
| `MONGO_APP_PASSWORD` | app_password |
| `MONGO_DATABASE` | ecommerce |
| `BACKEND_PORT` | 3847 |
| `GATEWAY_PORT` | 5921 |
| `NODE_ENV` | test |

## Disabling Hooks (Not Recommended!)

If you need to temporarily disable hooks:

```bash
# Disable all hooks
npm run prepare  # Reinstall to re-enable

# Or manually:
chmod -x .husky/pre-commit
chmod -x .husky/pre-push
```

## Best Practices

✅ **DO:**
- Commit frequently (hooks run each time)
- Read hook error messages carefully
- Fix issues locally before pushing
- Use feature branches
- Create PRs for code review

❌ **DON'T:**
- Use `--no-verify` flags
- Push to main without PR approval
- Skip security scans
- Ignore linting errors
- Commit secrets to `.env`

## References

- [Husky Documentation](https://typicode.github.io/husky/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
