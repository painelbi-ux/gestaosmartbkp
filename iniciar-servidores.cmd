@echo off
title Gestor Pedidos - dev (nao feche esta janela)
cd /d "%~dp0"
echo.
echo Portas: API 4000, Vite interno 5180, externos 5173 / 5174 / 5051
echo Acesse por exemplo: http://localhost:5180 ou http://SEU-IP:5051
echo.
npm run dev
pause
