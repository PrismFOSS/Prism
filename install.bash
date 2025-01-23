#!/bin/bash

set -e

# Log file
LOG_FILE="installer.log"

# Create or clear the log file
> "$LOG_FILE"

# Function to get the current timestamp
function current_timestamp() {
    echo "$(date '+%Y-%m-%d %H:%M:%S')"
}

# Function to display messages in color and log them
function print_message() {
    local message="$1"
    echo -e "[INFO] $(current_timestamp) - \033[1;32m$message\033[0m" | tee -a "$LOG_FILE"
}

function print_error() {
    local message="$1"
    echo -e "[ERROR] $(current_timestamp) - \033[1;31mERROR: $message\033[0m" | tee -a "$LOG_FILE"
}

# Function to show a spinner while waiting
function show_spinner() {
    local pid=$1
    local delay=0.75
    local spin='/-\|'
    local i=0
    while ps -p $pid > /dev/null; do
        local temp=${spin:i++%${#spin}:1}
        echo -ne "\b$temp"
        sleep $delay
    done
    echo -ne "\b"
}

# ASCII Art Header
cat << "EOF"
__________        .__                       
\______   \_______|__| ______ _____  
 |     ___/\_  __ \  |/  ___//     \ 
 |    |     |  | \/  |\___ \|  Y Y  \
 |____|     |__|  |__/____  >__|_|  /
                          \/      \/                               
EOF

# Check if Prism is already installed
if [ -d "Prism" ]; then
    print_message "Prism is already installed. Skipping installation."
    exit 0
fi

# Start installation
print_message "Welcome to the Prism Installation Script!"
print_message "This script will guide you through the installation process."

# Check if the user is root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run this script as root."
    exit 1
fi

# Install prerequisites
print_message "Installing prerequisites..."
if [[ -f /etc/lsb-release ]]; then
    apt update
    apt install -y redis-server
    systemctl start redis
    systemctl enable redis &
    show_spinner $!
elif [[ -f /etc/redhat-release ]]; then
    dnf install -y epel-release
    dnf install -y redis
    systemctl start redis
    systemctl enable redis &
    show_spinner $!
else
    print_error "Unsupported operating system. Please install Redis manually."
    exit 1
fi

# Install Bun
print_message "Installing Bun..."
curl -fsSL https://bun.sh/install | bash &
show_spinner $!

# Reload shell configuration
source ~/.bashrc

# Install Node.js
print_message "Please install Node.js v18+ manually or follow the instructions at https://nodejs.org."

# Upgrade to Bun Canary
print_message "Upgrading Bun to Canary version..."
bun upgrade --canary &
show_spinner $!

# Clone the repository
print_message "Cloning the Prism repository..."
git clone https://github.com/PrismFOSS/Prism &
show_spinner $!
cd Prism || exit

# Install dependencies
print_message "Installing dependencies..."
bun install &
show_spinner $!

# Create configuration file
print_message "Creating configuration file..."
cp example_config.toml config.toml &
show_spinner $!

# Check if Nginx is installed
if command -v nginx &> /dev/null; then
    print_message "Nginx is already installed. Please configure it manually by checking the README file."
else
    print_message "Nginx is not installed. Please install it and configure it manually by checking the README file."
fi

# Automatically build and start Prism
cd app || exit
print_message "Installing app dependencies..."
npm install &
show_spinner $!
print_message "Building the app..."
npm run build &
show_spinner $!
cd ../ || exit
print_message "Starting Prism..."
bun run app.js &
show_spinner $!

print_message "Installation completed successfully!"
