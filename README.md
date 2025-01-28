# Quick Start Guide

## ⚠️ Important Note
This is a demo version of the project. The authentication service has limited functionality.

## Prerequisites
- Google Chrome (recommended browser)
- Docker and Docker Compose
- Make

## Setup Instructions

### 1. Environment Configuration
A basic `.env` file is provided with the project. No additional configuration is required for the demo version.

### 2. Build and Launch
```bash
# Clone the repository
git clone [repository-url]

# Navigate to project directory
cd [project-name]

# Build and start all services
make all
```

### 3. Access the Application
Once the services are running, open Google Chrome and navigate to:
```
https://localhost:5173
```

## Troubleshooting
If you encounter any issues during setup, please check:
- Docker daemon is running
- Port 5173 is not in use
- All required dependencies are installed


# CLI Client Usage

## Setup and Execution
```bash
# Navigate to CLI client directory
cd CLI_client

# Run the client
sh script_cli.sh
```

## Terminating the Client
To exit the CLI client, press `CTRL + C`
