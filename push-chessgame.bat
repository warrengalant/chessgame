@echo off
setlocal ENABLEDELAYEDEXPANSION

:: ========================================
::  PUSH TO GitHub (warrengalant/chessgame)
:: ========================================

:: Ensure we are in the repo root (this script should live in repo root)
if not exist .git (
  echo ERROR: .git folder not found. Please run this script from the repository root.
  pause
  exit /b 1
)

:: Determine current branch (fallback to main)
for /f "delims=" %%i in ('git rev-parse --abbrev-ref HEAD 2^>NUL') do set current_branch=%%i
if "%current_branch%"=="" (
  set current_branch=main
  git branch -M main >NUL 2>&1
)

echo Current branch: %current_branch%
echo.

echo Git status:
Git status

echo.
echo Adding all changes...
Git add .
if errorlevel 1 (
  echo ERROR: Failed to add changes
  pause
  exit /b 1
)

:: Prompt for commit message
set /p commit_message="Enter commit message (leave blank to use 'update'): "
if "%commit_message%"=="" set commit_message=update

echo.
echo Committing with message: "%commit_message%"
Git commit -m "%commit_message%"
if errorlevel 1 (
  echo.
  echo No changes to commit or commit failed. Continuing to push anyway...
)

:: Ensure remote 'origin' exists and points to the correct URL
for /f "delims=" %%r in ('git remote 2^>NUL') do set has_remote=%%r
if "%has_remote%"=="" (
  echo.
  echo Adding remote 'origin' -> https://github.com/warrengalant/chessgame.git
  Git remote add origin https://github.com/warrengalant/chessgame.git
) else (
  for /f "delims=" %%u in ('git remote get-url origin 2^>NUL') do set origin_url=%%u
  if /I not "%origin_url%"=="https://github.com/warrengalant/chessgame.git" (
    echo.
    echo Updating remote 'origin' to https://github.com/warrengalant/chessgame.git
    Git remote set-url origin https://github.com/warrengalant/chessgame.git
  )
)

:: Check if upstream is configured
set upstreamExists=0
Git rev-parse --abbrev-ref --symbolic-full-name @{u} >NUL 2>&1 && set upstreamExists=1

echo.
echo Pushing branch %current_branch% to origin...
if %upstreamExists%==1 (
  Git push
) else (
  Git push -u origin %current_branch%
)

if errorlevel 1 (
  echo.
  echo ========================================
  echo   ERROR: PUSH FAILED (likely authentication)
  echo ========================================
  echo.
  echo Fix options:
  echo  1) Easiest: Install GitHub CLI and login (one-time)
  echo     - winget install GitHub.cli
  echo     - gh auth login   ^<-- choose GitHub.com, HTTPS, Login with browser
  echo  2) Or create a Personal Access Token (classic) with 'repo' scope
  echo     - https://github.com/settings/tokens
  echo     - Run this script again; when Git prompts for username/password:
  echo         Username: your GitHub username (warrengalant)
  echo         Password: your token (paste)
  echo.
  pause
  exit /b 1
)

echo.
echo ========================================
echo  SUCCESS! Changes pushed to GitHub
echo  Repo: https://github.com/warrengalant/chessgame
echo  Branch: %current_branch%
echo ========================================

echo.
pause
endlocal
