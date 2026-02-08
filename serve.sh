#!/bin/bash
cd "$(dirname "$0")"
echo "🎨 Jaspion Design Studio running at http://localhost:3847"
python3 -m http.server 3847
