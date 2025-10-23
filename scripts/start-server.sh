#!/bin/bash

echo "========================================"
echo "   Iniciando Servidor Airplay"
echo "========================================"
echo ""

echo "Instalando dependencias (si es necesario)..."
npm install

echo ""
echo "Iniciando servidor Node.js..."
echo ""
echo "Presiona Ctrl+C para detener el servidor"
echo ""

npm run server:dev
