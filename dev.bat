@echo off
REM start-dev.bat: install deps if needed, allow optional PORT env var, then start

IF "%1"=="" (
  echo Using default PORT (if set in environment or 667)
) ELSE (
  set PORT=%1
  echo Using PORT=%PORT%
)

IF NOT EXIST node_modules (
  echo Installing dependencies...
  npm install
) ELSE (
  echo Dependencies already installed.
)

echo Starting dev proxy...
npm start
pause