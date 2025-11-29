#!/bin/bash

# Install Python and pip
apt-get update
apt-get install -y python3 python3-pip

# Install yt-dlp
pip3 install yt-dlp

# Install instaloader
pip3 install instaloader

# Install Node.js dependencies
npm install