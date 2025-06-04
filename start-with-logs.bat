@echo off
echo Starting Expo with error logging...
echo Log file: expo-errors.log
echo Press Ctrl+C to stop and view error summary

:: Clear previous log
echo. > expo-errors.log
echo === EXPO ERROR LOG === >> expo-errors.log
echo Started at %date% %time% >> expo-errors.log
echo. >> expo-errors.log

:: Start expo and filter important errors
npx expo start --clear 2>&1 | findstr /i "error firebase warn cannot null undefined" >> expo-errors.log

echo.
echo === ERROR SUMMARY ===
echo Check expo-errors.log for detailed errors
type expo-errors.log | findstr /i "🚨 error" | find /c "error"
echo errors found.

pause 