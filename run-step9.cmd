@echo off
cd /d "%~dp0"
echo BidVerdict step 9 %date% %time% > step9-output.txt
call npm test >> step9-output.txt 2>&1
call npm run run -- --all --profile all >> step9-output.txt 2>&1
echo ===== done ===== >> step9-output.txt
echo Finished. Tell Claude: Done
pause
