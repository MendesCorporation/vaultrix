# Contributing to Vaultrix

First off, thank you for considering contributing to Vaultrix! It's people like you that make Vaultrix such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* **Use a clear and descriptive title**
* **Describe the exact steps which reproduce the problem**
* **Provide specific examples to demonstrate the steps**
* **Describe the behavior you observed after following the steps**
* **Explain which behavior you expected to see instead and why**
* **Include screenshots and animated GIFs** if possible
* **Include your environment details** (OS, Docker version, browser, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* **Use a clear and descriptive title**
* **Provide a step-by-step description of the suggested enhancement**
* **Provide specific examples to demonstrate the steps**
* **Describe the current behavior** and **explain which behavior you expected to see instead**
* **Explain why this enhancement would be useful**

### Pull Requests

* Fill in the required template
* Do not include issue numbers in the PR title
* Follow the TypeScript/JavaScript styleguide
* Include thoughtfully-worded, well-structured tests
* Document new code
* End all files with a newline

## Development Setup

### Prerequisites

* Node.js 20+
* Docker and Docker Compose
* PostgreSQL 16 (or use Docker)
* Go 1.22+ (for agent development)

### Setting Up Your Development Environment

1. **Fork and clone the repository**:
   ```bash
   git clone https://github.com/your-username/vaultrix.git
   cd vaultrix
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start PostgreSQL**:
   ```bash
   docker run -d \
     --name vaultrix-db \
     -e POSTGRES_USER=vaultrix \
     -e POSTGRES_PASSWORD=vaultrix \
     -e POSTGRES_DB=vaultrix \
     -p 5432:5432 \
     postgres:16-alpine
   ```

5. **Run migrations**:
   ```bash
   npx prisma migrate dev
   ```

6. **Seed the database** (optional):
   ```bash
   node scripts/seed.js
   ```

7. **Start the development server**:
   ```bash
   npm run dev
   ```

### Development Workflow

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit them:
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

3. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

4. Open a Pull Request

### Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

* `feat:` - A new feature
* `fix:` - A bug fix
* `docs:` - Documentation only changes
* `style:` - Changes that do not affect the meaning of the code
* `refactor:` - A code change that neither fixes a bug nor adds a feature
* `perf:` - A code change that improves performance
* `test:` - Adding missing tests or correcting existing tests
* `chore:` - Changes to the build process or auxiliary tools

Examples:
```
feat: add user invitation system
fix: resolve credential encryption issue
docs: update installation instructions
refactor: simplify authentication logic
```

## Styleguides

### TypeScript/JavaScript Styleguide

* Use TypeScript for all new code
* Use functional components with hooks for React
* Use async/await instead of promises when possible
* Use meaningful variable and function names
* Add JSDoc comments for complex functions
* Follow the existing code style (we use Prettier)

### CSS/Styling Styleguide

* Use TailwindCSS utility classes
* Follow the existing component structure
* Use dark mode compatible colors
* Ensure responsive design (mobile-first)

### Git Commit Messages

* Use the present tense ("Add feature" not "Added feature")
* Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
* Limit the first line to 72 characters or less
* Reference issues and pull requests liberally after the first line

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

* Write tests for all new features
* Write tests for bug fixes
* Ensure tests are isolated and don't depend on external state
* Use descriptive test names
* Follow the AAA pattern (Arrange, Act, Assert)

Example:
```typescript
describe('User Authentication', () => {
  it('should successfully login with valid credentials', async () => {
    // Arrange
    const credentials = { email: 'test@example.com', password: 'password123' }
    
    // Act
    const result = await login(credentials)
    
    // Assert
    expect(result.success).toBe(true)
    expect(result.user).toBeDefined()
  })
})
```

## Database Changes

### Creating Migrations

When making changes to the database schema:

1. Update `prisma/schema.prisma`
2. Create a migration:
   ```bash
   npx prisma migrate dev --name descriptive_migration_name
   ```
3. Test the migration thoroughly
4. Include the migration in your PR

### Migration Guidelines

* Use descriptive migration names
* Test migrations both up and down
* Consider data migration if needed
* Document breaking changes

## Documentation

* Update README.md if you change functionality
* Update DOCKER.md for Docker-related changes
* Add JSDoc comments for new functions
* Update API documentation if you add/modify endpoints
* Include examples in documentation

## Project Structure

```
vaultrix/
├── agent/                 # Go monitoring agent
│   ├── main.go           # Agent entry point
│   └── go.mod            # Go dependencies
├── prisma/               # Database schema and migrations
│   ├── schema.prisma     # Prisma schema
│   └── migrations/       # Database migrations
├── public/               # Static assets
├── scripts/              # Utility scripts
│   ├── seed.js          # Database seeding
│   └── entrypoint.sh    # Docker entrypoint
├── src/
│   ├── app/             # Next.js app directory
│   │   ├── (auth)/      # Authentication pages
│   │   ├── (dashboard)/ # Dashboard pages
│   │   └── api/         # API routes
│   ├── components/      # React components
│   │   ├── features/    # Feature-specific components
│   │   ├── layout/      # Layout components
│   │   ├── providers/   # Context providers
│   │   └── ui/          # Reusable UI components
│   └── lib/             # Utility libraries
│       ├── auth/        # Authentication utilities
│       ├── crypto/      # Encryption utilities
│       ├── db/          # Database utilities
│       └── security/    # Security utilities
└── ...
```

## Need Help?

* Check the [documentation](README.md)
* Ask in [GitHub Discussions](https://github.com/yourusername/vaultrix/discussions)
* Open an [issue](https://github.com/yourusername/vaultrix/issues)

## Recognition

Contributors will be recognized in:
* The project README
* Release notes
* Our contributors page

Thank you for contributing to Vaultrix! 🎉
