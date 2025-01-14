#!/bin/bash
if [ ! -d "env" ]; then
    python3 -m venv env
fi
. env/bin/activate


pip install -r requirements.txt
python3 main.py