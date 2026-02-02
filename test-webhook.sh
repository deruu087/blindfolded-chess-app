#!/bin/bash

# Quick test script for local webhook
# Usage: ./test-webhook.sh your-email@example.com

EMAIL=${1:-"test@example.com"}

echo "🧪 Testing webhook with email: $EMAIL"
echo ""

curl -X POST http://localhost:3002 \
  -H "Content-Type: application/json" \
  -d "{
    \"event\": \"payment.completed\",
    \"order_id\": \"test_order_$(date +%s)\",
    \"customer\": {
      \"email\": \"$EMAIL\"
    },
    \"amount\": 3.52,
    \"currency\": \"EUR\",
    \"status\": \"completed\"
  }"

echo ""
echo ""
echo "✅ Test completed! Check the server logs and Supabase tables."

