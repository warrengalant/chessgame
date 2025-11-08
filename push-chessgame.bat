@echo off
setlocal ENABLEDELAYEDEXPANSION

:: ========================================
::  AUTO PUSH (no prompts)
::  Repo: warrengalant/chessgame
::  Version: v2 (auto-commit/empty-commit enabled)
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
git status

echo.
echo Adding all changes...
git add .
if errorlevel 1 (
  echo ERROR: Failed to add changes
  pause
  exit /b 1
)

echo.
set /p commit_message="Enter commit message (describe what you changed): "
if "%commit_message%"=="" set commit_message=update

echo.
echo Committing with message: "%commit_message%"
git commit -m "%commit_message%"
if errorlevel 1 (
  echo.
  echo No changes to commit or commit failed.
  echo.
)

:: Ensure remote 'origin' exists and points to the correct URL
for /f "delims=" %%r in ('git remote 2^>NUL') do set has_remote=%%r
if "%has_remote%"=="" (
  echo.
  echo Adding remote 'origin' -> https://github.com/warrengalant/chessgame.git
  git remote add origin https://github.com/warrengalant/chessgame.git
) else (
  for /f "delims=" %%u in ('git remote get-url origin 2^>NUL') do set origin_url=%%u
  if /I not "%origin_url%"=="https://github.com/warrengalant/chessgame.git" (
    echo.
    echo Updating remote 'origin' to https://github.com/warrengalant/chessgame.git
    git remote set-url origin https://github.com/warrengalant/chessgame.git
  )
)

echo.
echo Pushing current branch (%current_branch%) to PROD repository...
echo Repository: https://github.com/warrengalant/chessgame
echo.
git push origin %current_branch%

if errorlevel 1 (
  echo.
  echo ========================================
  echo   ERROR: PUSH FAILED!
  echo ========================================
  pause
  exit /b 1
)

echo.
echo ========================================
echo  SUCCESS!
echo  Branch: %current_branch%
echo  Remote: origin (PROD)
echo ========================================
echo.
echo Changes pushed to PROD repository
echo Vercel will auto-deploy shortly
echo.
pause

:success
endlocal
exit /b 0
