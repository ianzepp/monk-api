#!/bin/bash
set -e

# Create new session with first pane running claude
tmux new-session -d -s dev -c "$PWD" 'claude'

# Split horizontally to create right column
tmux split-window -h -c "$PWD"

# Split the right pane vertically
tmux select-pane -t 1
tmux split-window -v -c "$PWD"

# Start npm run dev in the top-right pane (pane 1)
tmux send-keys -t 1 'npm run dev' Enter

# Select bottom-right pane (pane 2) for terminal commands
tmux select-pane -t 2

# Attach to the session
tmux attach-session -t dev