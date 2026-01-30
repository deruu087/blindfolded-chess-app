#!/bin/bash
# Script to push webhook changes to GitHub

cd "/Users/dbolocan/Desktop/web-dev/main blindfold chess"

echo "=== Checking git status ==="
git status --short

echo ""
echo "=== Adding api/dodo-webhook.js ==="
git add api/dodo-webhook.js

echo ""
echo "=== Committing changes ==="
git commit -m "Fix webhook to extract email from nested data.customer.email structure"

echo ""
echo "=== Pushing to GitHub ==="
git push origin main

echo ""
echo "=== Done! ==="
git log --oneline -1

