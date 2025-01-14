#!/bin/bash

if [ ! -d ./env ]; then
    python3 -m venv env
fi
. env/bin/activate
pip install -r ./PongAI/requirements.txt
python3 ./PongAI/update_hashes.py
deactivate
rm -rf env