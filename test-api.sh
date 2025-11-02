#!/bin/bash

# Test script for Mensa Rating API
# Make sure the server is running before executing this script

BASE_URL="http://localhost:3000/api"

echo "========================================="
echo "Testing Mensa Rating API"
echo "========================================="
echo ""

echo "1. Testing /api endpoint..."
curl -s "$BASE_URL" | python3 -m json.tool
echo ""
echo ""

echo "2. Testing /api/health..."
curl -s "$BASE_URL/health" | python3 -m json.tool
echo ""
echo ""

echo "3. Testing /api/meals/locations..."
curl -s "$BASE_URL/meals/locations" | python3 -m json.tool
echo ""
echo ""

echo "4. Testing /api/meals/today?location=studierendenhaus..."
curl -s "$BASE_URL/meals/today?location=studierendenhaus" | python3 -m json.tool
echo ""
echo ""

echo "========================================="
echo "API Tests Complete"
echo "========================================="
