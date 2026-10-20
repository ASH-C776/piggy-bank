@echo off
cd /d d:\code\money
set ADMIN_USERNAME=admin
set ADMIN_PASSWORD=admin123
set JWT_SECRET=test-secret-key
set DATA_DIR=d:\code\money\data
set PORT=3000
node server/dist/index.js
