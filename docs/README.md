# Matnava Documentation Site

This is a simple React documentation site for Matnava, deployed automatically to GitHub Pages.

## Local Development

To work on the documentation site locally:

```bash
# Navigate to the docs directory
cd docs

# Install dependencies
pnpm install

# Start the development server
pnpm run dev

# Build for production
pnpm run build

# Preview the production build
pnpm run preview
```

## Deployment

The site is automatically deployed to GitHub Pages via a GitHub workflow whenever commits are pushed to the `main` branch. The workflow:

1. Installs dependencies using pnpm
2. Builds the React app
3. Deploys to GitHub Pages

The site will be available at: `https://[username].github.io/matnava/`

## Structure

- `src/App.jsx` - Main React component with all the documentation content
- `src/index.css` - Styles with dark/light mode support
- `vite.config.js` - Vite configuration with GitHub Pages base path
- `package.json` - Dependencies and scripts for the React app

## Customization

To update the documentation:

1. Edit `src/App.jsx` to modify content
2. Edit `src/index.css` to modify styling
3. Test locally with `pnpm run dev`
4. Commit and push to trigger automatic deployment 