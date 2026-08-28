# GitHub Review Checklist

Small Chromium extension for tracking which GitHub pull request review comments you have already fixed.

## Features

- Adds a `Fixed` checkbox to detected review comments.
- Persists state in `chrome.storage.local`.
- Restores state after a page reload and GitHub's dynamic navigation.
- Shows a fixed-comments counter near the PR header.
- Dims comments that are marked as fixed.

## Install for development

Requirements: Chromium/Chrome and Node.js 20+ or Bun.

```bash
bun install
bun run build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the project's `dist` directory. Open or reload a GitHub pull request to use the checklist.

## Development

```bash
bun run build
bun run typecheck
bun run check
```

The extension currently targets review comments that GitHub exposes with a comment ID in `data-comment-id` or an element ID such as `discussion_r123456`.

## Publish to GitHub

```bash
git init
git add .
git commit -m "Initial GitHub review checklist extension"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/github-review-checklist.git
git push -u origin main
```

The `dist` directory is generated during build and is intentionally ignored. GitHub source code and build instructions remain in the repository; users can build the unpacked extension locally.
